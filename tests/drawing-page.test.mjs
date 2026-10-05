import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  createDrawingPage,
  drawingPageRect,
  snapPageToGrid,
} from '../src/engine/document/DrawingPage.ts';
import { defaultGridSpacingPt, pointsPerUnit } from '../src/engine/document/MeasurementUnits.ts';
import { computeRulerTicks } from '../src/engine/document/pageRuler.ts';

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
  const engine = new NibGliderEngine(scope, () => {}, shared ?? store());
  return { scope, engine, cleanup: () => scope.project.remove() };
}

test('drawing page record centers on the origin with orientation', () => {
  const page = createDrawingPage('page-1', 612, 792, 'inch');
  assert.equal(page.id, 'page-1');
  assert.equal(page.orientation, 'portrait');
  assert.deepEqual(drawingPageRect(page), { x: -306, y: -396, width: 612, height: 792 });
  assert.equal(createDrawingPage('p', 100, 100, 'pt').orientation, 'square');
  assert.equal(createDrawingPage('p', 200, 100, 'pt').orientation, 'landscape');
});

test('page dimensions snap to twice the grid spacing', () => {
  // US Letter is already exact on a quarter-inch grid.
  assert.deepEqual(snapPageToGrid(612, 792, 18), { widthPt: 612, heightPt: 792 });
  // Arbitrary sizes round to the nearest 2*spacing multiple.
  assert.deepEqual(snapPageToGrid(800, 600, 18), { widthPt: 792, heightPt: 612 });
  // Degenerate spacing leaves dimensions alone.
  assert.deepEqual(snapPageToGrid(800, 600, 0), { widthPt: 800, heightPt: 600 });
  assert.throws(() => snapPageToGrid(0, 100, 18), /positive/);
});

test('grid spacing defaults follow the document unit', () => {
  assert.equal(defaultGridSpacingPt('inch'), 18);
  assert.equal(defaultGridSpacingPt('ft'), 18);
  assert.equal(defaultGridSpacingPt('mm'), 10 * pointsPerUnit('mm'));
  assert.equal(defaultGridSpacingPt('cm'), 10 * pointsPerUnit('mm'));
  assert.equal(defaultGridSpacingPt('m'), 10 * pointsPerUnit('mm'));
  assert.equal(defaultGridSpacingPt('pt'), 20);
  assert.equal(defaultGridSpacingPt('pica'), 20);
});

test('ruler ticks land on grid lines with unit labels', () => {
  const ticks = computeRulerTicks(72, 18, 'inch');
  const majors = ticks.filter((t) => t.major);
  assert.deepEqual(majors.map((t) => t.offsetPt), [0, 18, 36, 54, 72]);
  assert.deepEqual(majors.map((t) => t.label), ['0', '0.25', '0.5', '0.75', '1']);
  const minors = ticks.filter((t) => !t.major);
  assert.ok(minors.length > 0);
  assert.ok(minors.every((t) => t.label === null));
  assert.ok(ticks.every((t, i, all) => i === 0 || t.offsetPt > all[i - 1].offsetPt));
});

test('engine drawingPage is null until dimensions are set', () => {
  const { engine, cleanup } = openEngine();
  try {
    assert.equal(engine.drawingPage, null);
    assert.equal(engine.pageRect(), null);
  } finally { cleanup(); }
});

test('new inch document gets a quarter-inch grid and a snapped page', () => {
  const { engine, cleanup } = openEngine();
  try {
    engine.applyPageSpec(8.5 * 72, 11 * 72, 'inch');
    assert.equal(engine.gridSpacing, 18);
    assert.deepEqual([engine.pageRect().width, engine.pageRect().height], [612, 792]);
    assert.equal(engine.drawingPage?.id, 'page-1');
    assert.equal(engine.drawingPage?.unit, 'inch');
  } finally { cleanup(); }
});

test('grid spacing setter validates and persists', () => {
  const shared = store();
  const first = openEngine(shared);
  try {
    first.engine.setGridSpacing(18);
    assert.equal(first.engine.gridSpacing, 18);
    assert.doesNotThrow(() => {
      first.engine.setGridSpacing(0);
      first.engine.setGridSpacing(NaN);
    });
    assert.equal(first.engine.gridSpacing, 18);
  } finally { first.cleanup(); }
  const second = openEngine(shared);
  try {
    assert.equal(second.engine.gridSpacing, 18);
  } finally { second.cleanup(); }
});

test('page claims its content layer without stealing activation', () => {
  const { scope, engine, cleanup } = openEngine();
  try {
    const rect = new scope.Path.Rectangle({ from: [0, 0], to: [40, 40] });
    engine.addItemToSelection(rect);
    const active = scope.project.activeLayer;
    engine.applyPageSpec(612, 792, 'inch');
    assert.equal(scope.project.activeLayer, active);
    assert.equal(engine.drawingPage?.layerId, `paper-layer-${active.id}`);
  } finally { cleanup(); }
});

test('board holds a second page with its own layer mapping', () => {
  const { scope, engine, cleanup } = openEngine();
  try {
    engine.applyPageSpec(612, 792, 'inch');
    const firstId = engine.drawingPage?.layerId;
    assert.ok(firstId);
    const second = engine.addDrawingPage(400, 300, 'pt');
    assert.equal(engine.drawingPages.length, 2);
    assert.equal(engine.drawingPage?.id, second.id);
    engine.setActiveDrawingPage('page-1');
    assert.equal(engine.drawingPage?.id, 'page-1');
    assert.equal(engine.drawingPage?.layerId, firstId);
    assert.doesNotThrow(() => engine.setActiveDrawingPage('nope'));
    assert.equal(scope.project.activeLayer.guide, false);
  } finally { cleanup(); }
});
