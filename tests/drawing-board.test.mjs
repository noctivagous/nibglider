import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { DrawingBoard, defaultBoardSizePt, MAX_BOARD_SIZE_PT } from '../src/engine/document/DrawingBoard.ts';
import { pointsPerUnit } from '../src/engine/document/MeasurementUnits.ts';

function store(seed = {}) {
  const mem = new Map(Object.entries(seed));
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => { mem.set(key, value); },
    removeItem: (key) => { mem.delete(key); },
    key: (index) => [...mem.keys()][index] ?? null,
    get length() { return mem.size; },
  };
}

function openEngine(shared) {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {}, shared);
  return { scope, engine, cleanup: () => scope.project.remove() };
}

test('english default is 3ft x 3ft, si default is 1m x 1m', () => {
  const english = defaultBoardSizePt('english');
  assert.equal(english.widthPt, 3 * pointsPerUnit('ft'));
  assert.equal(english.heightPt, 3 * pointsPerUnit('ft'));
  const si = defaultBoardSizePt('si');
  assert.equal(si.widthPt, pointsPerUnit('m'));
  assert.equal(si.heightPt, pointsPerUnit('m'));
  const board = new DrawingBoard();
  assert.equal(board.width, english.widthPt);
  assert.equal(board.height, english.heightPt);
});

test('rect is centered on the project origin', () => {
  const board = new DrawingBoard();
  board.setSizePt(200, 100);
  assert.deepEqual(board.rect(), { x: -100, y: -50, width: 200, height: 100 });
});

test('setSize converts units through points', () => {
  const board = new DrawingBoard();
  board.setSize(1, 2, 'm');
  assert.equal(board.width, pointsPerUnit('m'));
  assert.equal(board.height, 2 * pointsPerUnit('m'));
  board.setSize(3, 3, 'ft');
  assert.equal(board.width, 3 * pointsPerUnit('ft'));
});

test('non-positive and non-finite sizes throw', () => {
  const board = new DrawingBoard();
  assert.throws(() => board.setSizePt(0, 10), /positive/);
  assert.throws(() => board.setSizePt(10, -1), /positive/);
  assert.throws(() => board.setSizePt(NaN, 10), /finite/);
  assert.throws(() => board.setSizePt(10, Infinity), /finite/);
  assert.throws(() => board.setSize(1, 1, 'furlong'), /Unsupported length unit/);
});

test('oversized boards clamp to the maximum', () => {
  const board = new DrawingBoard();
  board.setSizePt(1e12, 10);
  assert.equal(board.width, MAX_BOARD_SIZE_PT);
});

test('reset restores the system default', () => {
  const board = new DrawingBoard();
  board.setSizePt(200, 100);
  board.reset('si');
  assert.equal(board.width, pointsPerUnit('m'));
  board.reset();
  assert.equal(board.width, 3 * pointsPerUnit('ft'));
});

test('engine exposes the board and ignores invalid sizes', () => {
  const shared = store();
  const { engine, cleanup } = openEngine(shared);
  try {
    const rect = engine.drawingBoardRect();
    assert.equal(rect.width, 3 * pointsPerUnit('ft'));
    assert.equal(rect.x, -rect.width / 2);
    engine.setDrawingBoardSize(1, 1, 'm');
    assert.equal(engine.drawingBoardRect().width, pointsPerUnit('m'));
    assert.doesNotThrow(() => {
      engine.setDrawingBoardSize(0, 1, 'm');
      engine.setDrawingBoardSizePt(NaN, 10);
      engine.setDrawingBoardSize(1, 1, 'furlong');
    });
    assert.equal(engine.drawingBoardRect().width, pointsPerUnit('m'));
    engine.resetDrawingBoard('english');
    assert.equal(engine.drawingBoardRect().width, 3 * pointsPerUnit('ft'));
  } finally { cleanup(); }
});

test('board size persists through reload', () => {
  const shared = store();
  const first = openEngine(shared);
  try {
    first.engine.setDrawingBoardSize(2, 2, 'm');
  } finally { first.cleanup(); }
  const second = openEngine(shared);
  try {
    assert.equal(second.engine.drawingBoardRect().width, 2 * pointsPerUnit('m'));
    assert.equal(second.engine.drawingBoardRect().height, 2 * pointsPerUnit('m'));
  } finally { second.cleanup(); }
});

test('page rect is null until the user sets page dimensions', () => {
  const shared = store();
  const { engine, cleanup } = openEngine(shared);
  try {
    assert.equal(engine.pageRect(), null);
  } finally { cleanup(); }
});

test('user page paints centered on top of the board, never as content', () => {
  const shared = store();
  const { engine, cleanup } = openEngine(shared);
  try {
    engine.setPageDimensions(800, 600, 'pt');
    const page = engine.pageRect();
    assert.deepEqual(page, { x: -400, y: -300, width: 800, height: 600 });
    assert.ok(engine.pageOutline);
    assert.equal(engine.pageOutline.guide, true);
    // Same workspace layer, above the board shape.
    assert.equal(engine.pageOutline.layer, engine.boardLayer);
    assert.ok(engine.pageOutline.index > engine.boardOutline.index);
    assert.equal(engine.documentStats().objectCount, 0);
  } finally { cleanup(); }
});

test('workspace repaint keeps the content layer active with a selection', () => {
  const shared = store();
  const { scope, engine, cleanup } = openEngine(shared);
  try {
    const rect = new scope.Path.Rectangle({ from: [0, 0], to: [40, 40] });
    engine.addItemToSelection(rect);
    const active = scope.project.activeLayer;
    engine.drawWorkspace();
    assert.equal(scope.project.activeLayer, active);
    engine.setPageDimensions(800, 600, 'pt');
    assert.equal(scope.project.activeLayer, active);
  } finally { cleanup(); }
});

test('board outline paints on a guide layer, never as content', () => {
  const shared = store();
  const { engine, cleanup } = openEngine(shared);
  try {
    engine.drawBoard();
    assert.ok(engine.boardOutline);
    assert.equal(engine.boardOutline.guide, true);
    assert.equal(engine.boardLayer.guide, true);
    assert.equal(engine.documentStats().objectCount, 0);
  } finally { cleanup(); }
});
