import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';

function setup() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  const e = new NibGliderEngine(s, () => {});
  return { s, e, cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); } };
}

function guides(layer) {
  return layer.children.filter((item) => !!item.guide);
}

function nearPoint(point, x, y) {
  assert.ok(Math.abs(point.x - x) < 1e-6, `x ${point.x} ~= ${x}`);
  assert.ok(Math.abs(point.y - y) < 1e-6, `y ${point.y} ~= ${y}`);
}

/** Draw one plain rect diagonal from (10,10) to (110,60) and deposit it. */
function drawRect(e, s) {
  e.mousePt = new s.Point(10, 10);
  e.rectDiagonalKC();
  e.pointer.onMouseMove({ point: new s.Point(110, 60) });
  e.rectDiagonalKC();
}

test('repeat off deposits the single drawn shape', () => {
  const { s, e, cleanup } = setup();
  try {
    assert.equal(e.isRepeatEnabled, false);
    drawRect(e, s);
    assert.ok(e.contentItems().length > 0);
    assert.equal(guides(s.project.activeLayer).length, 0);
  } finally { cleanup(); }
});

test('repeat 2x2 on cell centers deposits four copies in one undo step', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatEnabled(true);
    e.setRepeatRows(2);
    e.setRepeatCols(2);
    e.mousePt = new s.Point(10, 10);
    e.rectDiagonalKC();
    e.pointer.onMouseMove({ point: new s.Point(110, 60) });
    // Three guide clones join the live frame during the draw.
    assert.equal(guides(s.project.activeLayer).length, 3);
    e.rectDiagonalKC();
    const repeated = e.contentItems();
    assert.equal(guides(s.project.activeLayer).length, 0);
    // Base item plus one copy per nonzero offset: (160,35), (60,85), (160,85).
    assert.equal(repeated.length, 4);
    nearPoint(repeated[0].bounds.center, 60, 35);
    nearPoint(repeated[1].bounds.center, 160, 35);
    nearPoint(repeated[2].bounds.center, 60, 85);
    nearPoint(repeated[3].bounds.center, 160, 85);
    assert.equal(e.canUndo(), true);
    e.undo();
    assert.equal(e.contentItems().length, 0);
  } finally { cleanup(); }
});

test('repeat on intersections spreads copies across the lattice', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatEnabled(true);
    e.setRepeatRows(1);
    e.setRepeatCols(1);
    e.setRepeatAnchor('intersection');
    drawRect(e, s);
    // Base plus all four lattice crossings; none coincide with the center.
    assert.equal(e.contentItems().length, 5);
    e.undo();
    assert.equal(e.contentItems().length, 0);
  } finally { cleanup(); }
});

test('family scope off skips previews and copies', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatEnabled(true);
    e.setRepeatRectKeys(false);
    e.mousePt = new s.Point(10, 10);
    e.rectDiagonalKC();
    e.pointer.onMouseMove({ point: new s.Point(110, 60) });
    assert.equal(guides(s.project.activeLayer).length, 0);
    e.rectDiagonalKC();
    assert.equal(e.contentItems().length, 1);
  } finally { cleanup(); }
});

test('cancel drops repeat preview clones without history', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatEnabled(true);
    e.mousePt = new s.Point(10, 10);
    e.rectDiagonalKC();
    e.pointer.onMouseMove({ point: new s.Point(110, 60) });
    assert.ok(guides(s.project.activeLayer).length > 0);
    e.cancelCurrentDrawingOperation();
    assert.equal(s.project.activeLayer.children.length, 0);
    assert.equal(e.canUndo(), false);
  } finally { cleanup(); }
});

test('live digit keys adjust rows and cols during a draw', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatEnabled(true);
    e.mousePt = new s.Point(10, 10);
    e.rectDiagonalKC();
    e.pointer.onMouseMove({ point: new s.Point(110, 60) });
    const bindings = e.keyboard.liveBindings();
    const rowsDown = bindings.find((b) => b.id === 'repeat-rows-down');
    const colsUp = bindings.find((b) => b.id === 'repeat-cols-up');
    assert.ok(rowsDown && colsUp);
    assert.equal(rowsDown.match({ code: 'Digit1' }), true);
    assert.equal(rowsDown.match({ code: 'Digit2' }), false);
    assert.equal(rowsDown.applies(), true);
    rowsDown.apply({ code: 'Digit1' });
    assert.equal(e.repeatRows, 1);
    colsUp.apply({ code: 'Digit4' });
    assert.equal(e.repeatCols, 3);
    e.cancelCurrentDrawingOperation();
    // Disabled repeat no longer claims the digit slots.
    e.setRepeatEnabled(false);
    assert.equal(rowsDown.applies(), false);
  } finally { cleanup(); }
});

test('repeat row and column setters clamp to 1..12', () => {
  const { e, cleanup } = setup();
  try {
    e.setRepeatRows(99);
    assert.equal(e.repeatRows, 12);
    e.setRepeatCols(0);
    assert.equal(e.repeatCols, 12 - 11);
    e.setRepeatAnchor('sideways');
    assert.equal(e.repeatAnchor, 'cell-center');
    e.setRepeatDirection('diagonal');
    assert.equal(e.repeatDirection, 'both');
  } finally { cleanup(); }
});
