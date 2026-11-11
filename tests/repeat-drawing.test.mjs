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

// --- Slice 10 (revised): live symmetry, descriptor records, outcomes ---

function sortedCenters(e) {
  return e.contentItems()
    .map((item) => `${Math.round(item.bounds.center.x)},${Math.round(item.bounds.center.y)}`)
    .sort();
}

function armLive(e) {
  e.setRepeatEnabled(true);
  e.setLiveSymmetryArmed(true);
}

test('live polar deposit matches the apply path, in one undo step', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatFamily('polar');
    e.setRepeatSymmetryCount(4);
    armLive(e);
    drawRect(e, s);
    const liveCenters = sortedCenters(e);
    assert.equal(e.contentItems().length, 4, 'source + 3 rotated copies');
    // The source carries the retained descriptor record.
    e.addItemToSelection(e.contentItems()[0]);
    const record = e.selectionReplication();
    e.undo();
    assert.equal(e.contentItems().length, 0, 'one undo removes the whole deposit');
    // Apply path on the same geometry, same panel state (grid fan-out off).
    e.setLiveSymmetryArmed(false);
    e.setRepeatRows(1);
    e.setRepeatCols(1);
    drawRect(e, s);
    const source = e.contentItems()[0];
    e.addItemToSelection(source);
    assert.equal(e.applySymmetryRepeat(), 3);
    assert.deepEqual(sortedCenters(e), liveCenters, 'live and apply agree');
    assert.ok(record, 'live deposit stored a record');
    assert.equal(record.version, 2);
    assert.equal(record.spec.family, 'polar');
  } finally { cleanup(); }
});

test('live wallpaper p4 deposit matches the apply path', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatFamily('wallpaper');
    e.setRepeatWallpaperGroup('p4');
    e.setRepeatRows(1);
    e.setRepeatCols(1);
    armLive(e);
    drawRect(e, s);
    assert.equal(e.contentItems().length, 4, 'source + 3 quarter-turn copies');
    const liveCenters = sortedCenters(e);
    e.undo();
    assert.equal(e.contentItems().length, 0);
    e.setLiveSymmetryArmed(false);
    drawRect(e, s);
    e.addItemToSelection(e.contentItems()[0]);
    assert.equal(e.applySymmetryRepeat(), 3);
    assert.deepEqual(sortedCenters(e), liveCenters, 'live and apply agree for p4');
  } finally { cleanup(); }
});

test('live frieze glide deposit matches the apply path', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatFamily('frieze');
    e.setRepeatFriezeGroup('p11g');
    e.setRepeatSymmetryCount(3);
    armLive(e);
    drawRect(e, s);
    const liveCenters = sortedCenters(e);
    assert.equal(e.contentItems().length, 6, 'source + 5 glide/half-turn copies');
    e.undo();
    e.setLiveSymmetryArmed(false);
    e.setRepeatRows(1);
    e.setRepeatCols(1);
    drawRect(e, s);
    e.addItemToSelection(e.contentItems()[0]);
    assert.equal(e.applySymmetryRepeat(), 5);
    assert.deepEqual(sortedCenters(e), liveCenters, 'live and apply agree for p11g');
  } finally { cleanup(); }
});

test('whorl outcome deposits a spiral of copies live', () => {
  const { s, e, cleanup } = setup();
  try {
    e.applyRepeatOutcome('whorl');
    assert.equal(e.repeatFamily, 'polar');
    assert.equal(e.repeatOutcomeName, 'whorl');
    armLive(e);
    drawRect(e, s);
    const items = e.contentItems();
    assert.equal(items.length, 24, 'source + 23 spiral copies');
    const centre = items[0].bounds.center;
    const d1 = Math.hypot(items[1].bounds.center.x - centre.x, items[1].bounds.center.y - centre.y);
    const d2 = Math.hypot(items[2].bounds.center.x - centre.x, items[2].bounds.center.y - centre.y);
    assert.ok(Math.abs(d1 - 8) < 1e-6, `first copy steps out by the arithmetic start+step (${d1})`);
    assert.ok(Math.abs(d2 - 16) < 1e-6, `second copy radius 16 (${d2})`);
    e.addItemToSelection(items[0]);
    const record = e.selectionReplication();
    assert.ok(record, 'the whorl source keeps its descriptor record');
    assert.equal(record.spec.outcome, 'whorl');
    assert.equal(record.spec.mode, 'degrees');
    assert.equal(record.spec.progressions[0].kind, 'arithmetic');
    e.undo();
    assert.equal(e.contentItems().length, 0);
  } finally { cleanup(); }
});

test('live along-stroke deposit follows the selected guide path', () => {
  const { s, e, cleanup } = setup();
  try {
    const layer = s.project.activeLayer;
    const guide = new s.Path.Line(new s.Point(0, 100), new s.Point(300, 100));
    layer.addChild(guide);
    e.addItemToSelection(guide);
    e.setRepeatFamily('alongStroke');
    e.setRepeatStationMode('division');
    e.setRepeatSymmetryCount(3);
    armLive(e);
    drawRect(e, s);
    const items = e.contentItems();
    assert.equal(items.length, 5, 'guide + source + 3 station copies');
    // Stations follow the sampled guide (within a few units of the
    // exact thirds of the 300-long path).
    const copyCenters = items.slice(2).map((item) => item.bounds.center);
    for (const expectedX of [0, 100, 200]) {
      assert.ok(
        copyCenters.some((c) => Math.abs(c.x - expectedX) <= 4 && Math.abs(c.y - 100) <= 1),
        `a copy sits at the station near x=${expectedX}`,
      );
    }
    e.undo();
    assert.equal(e.contentItems().length, 1, 'undo removes the draw, the guide stays');
  } finally { cleanup(); }
});

test('live normals deposit reflects the drawing across the guide tangents', () => {
  const { s, e, cleanup } = setup();
  try {
    const layer = s.project.activeLayer;
    const guide = new s.Path({
      segments: [new s.Point(0, 100), new s.Point(100, 100), new s.Point(100, 200)],
      strokeColor: 'black',
    });
    layer.addChild(guide);
    e.addItemToSelection(guide);
    e.setRepeatFamily('normals');
    e.setRepeatSymmetryCount(3);
    armLive(e);
    drawRect(e, s);
    const items = e.contentItems();
    assert.equal(items.length, 5, 'guide + source + 3 reflected copies');
    const centers = items.slice(2).map((item) => `${Math.round(item.bounds.center.x)},${Math.round(item.bounds.center.y)}`).sort();
    // Source centre (60,35): reflected across y=100 -> (60,165); across x=100 -> (140,35).
    assert.ok(centers.includes('60,165'), `copies include the y=100 reflection (${centers})`);
    assert.ok(centers.includes('140,35'), `copies include the x=100 reflection (${centers})`);
  } finally { cleanup(); }
});

test('regenerate after a parameter change replaces copies instead of duplicating', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatFamily('polar');
    e.setRepeatSymmetryCount(4);
    drawRect(e, s);
    const source = e.contentItems()[0];
    e.addItemToSelection(source);
    assert.equal(e.applySymmetryRepeat(), 3);
    assert.equal(e.contentItems().length, 4);
    assert.equal(e.selectionReplication()?.spec.count, 4);
    e.setRepeatSymmetryCount(6);
    assert.equal(e.regenerateReplication(), 5);
    assert.equal(e.contentItems().length, 6, 'copies replaced: source + 5, not source + 3 + 5');
    assert.equal(e.selectionReplication()?.spec.count, 6, 'stored descriptor updated');
    e.undo();
    assert.equal(e.contentItems().length, 4, 'one undo restores the pre-regenerate set');
  } finally { cleanup(); }
});

test('expand detaches the record and keeps the copies as ordinary items', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatFamily('polar');
    e.setRepeatSymmetryCount(4);
    drawRect(e, s);
    const source = e.contentItems()[0];
    e.addItemToSelection(source);
    assert.equal(e.applySymmetryRepeat(), 3);
    assert.ok(e.selectionReplication());
    assert.equal(e.expandReplication(), 1);
    assert.equal(e.selectionReplication(), null);
    assert.equal(e.contentItems().length, 4, 'copies stay');
    assert.equal(e.regenerateReplication(), 0, 'nothing left to regenerate');
  } finally { cleanup(); }
});

test('the stored descriptor survives a native document round trip', () => {
  const { s, e, cleanup } = setup();
  try {
    e.setRepeatFamily('polar');
    e.setRepeatSymmetryCount(4);
    drawRect(e, s);
    const source = e.contentItems()[0];
    e.addItemToSelection(source);
    assert.equal(e.applySymmetryRepeat(), 3);
    const text = e.exportNativeDocument('Repeat Record');
    assert.ok(text.includes('replication'), 'native file carries the descriptor record');
    const { e: e2, cleanup: cleanup2 } = setup();
    try {
      assert.equal(e2.openNativeDocumentText(text).ok, true);
      const loaded = e2.contentItems().find((item) => item.data?.replication);
      assert.ok(loaded, 'record restored onto the loaded source');
      e2.addItemToSelection(loaded);
      const record = e2.selectionReplication();
      assert.equal(record.version, 2);
      assert.equal(record.spec.family, 'polar');
      assert.equal(record.spec.count, 4);
      // And it can regenerate in the loaded document.
      assert.equal(e2.regenerateReplication(), 3);
    } finally { cleanup2(); }
  } finally { cleanup(); }
});
