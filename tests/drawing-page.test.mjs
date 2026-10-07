import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  createDrawingPage,
  drawingPageRect,
  pageCornerBrackets,
  pageEdgeTicks,
  snapPageToGrid,
} from '../src/engine/document/DrawingPage.ts';
import { defaultGridSpacingPt, pointsPerUnit } from '../src/engine/document/MeasurementUnits.ts';
import { computeRulerTicks, labeledMajors, pageFrameTracks, rulerSource } from '../src/engine/document/pageRuler.ts';

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

test('ruler placement defaults to viewer edges and persists', () => {
  const shared = store();
  const first = openEngine(shared);
  try {
    assert.equal(first.engine.rulerPlacement, 'viewer');
    first.engine.setRulerPlacement('page');
    assert.equal(first.engine.rulerPlacement, 'page');
    assert.doesNotThrow(() => first.engine.setRulerPlacement('ceiling'));
    assert.equal(first.engine.rulerPlacement, 'page');
  } finally { first.cleanup(); }
  const second = openEngine(shared);
  try {
    assert.equal(second.engine.rulerPlacement, 'page');
  } finally { second.cleanup(); }
});

test('page-frame tracks hug the page screen rect', () => {
  const tracks = pageFrameTracks(
    { centerX: 0, centerY: 0, viewWidth: 800, viewHeight: 600 },
    { x: -400, y: -300, width: 800, height: 600 },
    { width: 800, height: 600 },
    22,
  );
  assert.deepEqual(tracks.top, { left: 0, top: -22, width: 800 });
  assert.deepEqual(tracks.left, { left: -22, top: 0, height: 600 });
  assert.deepEqual(tracks.corner, { left: -22, top: -22 });
  // Panned view shifts the frame with the page.
  const moved = pageFrameTracks(
    { centerX: 100, centerY: 0, viewWidth: 800, viewHeight: 600 },
    { x: -400, y: -300, width: 800, height: 600 },
    { width: 800, height: 600 },
    22,
  );
  assert.equal(moved.top.left, -100);
  assert.equal(moved.corner.left, -122);
});

test('ruler source falls back past the page', () => {
  const artwork = { x: -100, y: -50, width: 200, height: 100 };
  const withPage = rulerSource({ x: 0, y: 0, width: 10, height: 10 }, 'inch', artwork, 'pt');
  assert.deepEqual(withPage, { rect: { x: 0, y: 0, width: 10, height: 10 }, unit: 'inch' });
  const withoutPage = rulerSource(null, 'inch', artwork, 'pt');
  assert.deepEqual(withoutPage, { rect: artwork, unit: 'pt' });
});

test('off-grid edges still land majors on grid lines', () => {
  const ticks = computeRulerTicks(100, 18, 'inch', 10);
  const majors = ticks.filter((t) => t.major);
  assert.deepEqual(majors.map((t) => t.offsetPt), [8, 26, 44, 62, 80, 98]);
  assert.equal(majors[0].label, '0.25');
  assert.deepEqual(labeledMajors(100, 18, 16, 1, 10), [8, 26, 44, 62, 80, 98]);
  // Phase zero keeps the historical on-grid behavior.
  assert.deepEqual(labeledMajors(72, 18, 16, 1), [0, 18, 36, 54, 72]);
});

test('labeled majors stride with zoom', () => {
  // Dense majors all label; sparse ones thin out.
  assert.deepEqual(labeledMajors(72, 18, 16, 1), [0, 18, 36, 54, 72]);
  assert.deepEqual(labeledMajors(144, 18, 64, 1), [0, 72, 144]);
});

test('ruler guides default off, toggle, and persist', () => {
  const shared = store();
  const first = openEngine(shared);
  try {
    assert.equal(first.engine.rulerGuides, false);
    first.engine.setRulerGuides(true);
    assert.equal(first.engine.rulerGuides, true);
  } finally { first.cleanup(); }
  const second = openEngine(shared);
  try {
    assert.equal(second.engine.rulerGuides, true);
  } finally { second.cleanup(); }
});

test('document settings window defines page presentation and rulers', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseWindowXML } = await import('../src/engine/../ui/windowXML.ts');
  const xml = readFileSync(new URL('../src/ui/windows/document-settings.xml', import.meta.url), 'utf8');
  const parsed = parseWindowXML(xml);
  assert.ok('spec' in parsed);
  const page = parsed.spec.sections.find((s) => s.id === 'page');
  assert.equal(page?.title, 'Page');
  assert.deepEqual(page.controls.map((c) => c.key), ['pageFill', 'pageSideTicks']);
  const rulers = parsed.spec.sections.find((s) => s.id === 'rulers');
  assert.ok(rulers);
  const keys = rulers.controls.map((c) => c.key).sort();
  assert.deepEqual(keys, ['rulerGuides', 'rulerPlacement']);
  // Size tab leads with the shared size editor; page sections follow.
  assert.deepEqual(parsed.spec.tabs.map((t) => t.id), ['size', 'page']);
  assert.deepEqual(parsed.spec.tabs[0].sectionIds, ['size-content']);
  assert.deepEqual(parsed.spec.tabs[1].sectionIds, ['page', 'rulers']);
  const sizeContent = parsed.spec.sections.find((s) => s.id === 'size-content');
  assert.deepEqual(sizeContent.controls, [{ kind: 'custom', id: 'document-size' }]);
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

test('pt documents snap pages to the 20pt grid', () => {
  const { engine, cleanup } = openEngine();
  try {
    engine.applyPageSpec(800, 600, 'pt');
    assert.equal(engine.gridSpacing, 20);
    assert.deepEqual([engine.pageRect().width, engine.pageRect().height], [800, 600]);
    engine.applyPageSpec(810, 605, 'pt');
    assert.deepEqual([engine.pageRect().width, engine.pageRect().height], [800, 600]);
  } finally { cleanup(); }
});

test('page corners are stroked brackets without a fill', () => {
  const { engine, cleanup } = openEngine();
  try {
    engine.setPageDimensions(800, 600, 'pt');
    const page = engine.pageRect();
    const marks = engine.pageOutline;
    assert.equal(marks.children.length, 4);
    assert.equal(marks.data.isPage, true);
    const bounds = marks.bounds;
    assert.ok(Math.abs(bounds.x - page.x) < 0.01);
    assert.ok(Math.abs(bounds.y - page.y) < 0.01);
    assert.ok(Math.abs(bounds.width - page.width) < 0.01);
    assert.ok(Math.abs(bounds.height - page.height) < 0.01);
    for (const bracket of marks.children) {
      assert.equal(bracket.data.pageRole, 'bracket');
      assert.equal(bracket.fillColor, null);
      assert.equal(bracket.closed, false);
      assert.equal(bracket.segments.length, 3);
      assert.ok(bracket.strokeColor);
      assert.ok(bracket.strokeWidth > 0);
    }
    const arms = pageCornerBrackets(page);
    assert.equal(arms.length, 4);
    assert.ok(arms[0][0].x > page.x && arms[0][0].x < page.x + page.width / 2);
  } finally { cleanup(); }
});

test('page fill and side ticks follow document settings and persist', () => {
  const shared = store();
  const first = openEngine(shared);
  try {
    assert.equal(first.engine.pageFill, false);
    assert.equal(first.engine.pageSideTicks, false);
    first.engine.setPageDimensions(800, 600, 'pt');
    first.engine.setPageFill(true);
    first.engine.setPageSideTicks(true);
    const marks = first.engine.pageOutline;
    const fill = marks.children.find((child) => child.data.pageRole === 'fill');
    const brackets = marks.children.filter((child) => child.data.pageRole === 'bracket');
    const ticks = marks.children.filter((child) => child.data.pageRole === 'tick');
    assert.ok(fill);
    assert.equal(fill.strokeColor, null);
    assert.ok(fill.fillColor.red < 0.5);
    assert.equal(brackets.length, 4);
    assert.ok(ticks.length > 8);
    assert.ok(ticks.every((tick) => tick.segments.length === 2 && tick.fillColor === null));
    const page = first.engine.pageRect();
    const top = ticks.find((tick) => Math.abs(tick.segments[0].point.y - page.y) < 0.01
      && Math.abs(tick.segments[0].point.x - page.x) < 0.01);
    assert.ok(top);
    assert.ok(top.segments[1].point.y > page.y);
    const edge = pageEdgeTicks(
      page,
      [{ offsetPt: 0, major: true }, { offsetPt: page.width, major: false }],
      [],
      10,
      6,
    );
    assert.equal(edge.length, 4);
    assert.equal(edge[0].points[1].y - edge[0].points[0].y, 10);
  } finally { first.cleanup(); }
  const second = openEngine(shared);
  try {
    assert.equal(second.engine.pageFill, true);
    assert.equal(second.engine.pageSideTicks, true);
    second.engine.setPageDimensions(800, 600, 'pt');
    const roles = second.engine.pageOutline.children.map((child) => child.data.pageRole);
    assert.ok(roles.includes('fill'));
    assert.ok(roles.includes('tick'));
  } finally { second.cleanup(); }
});

test('grid dots cover the page rect', () => {
  const { engine, cleanup } = openEngine();
  try {
    engine.setGridEnabled(true);
    engine.applyPageSpec(612, 792, 'inch');
    const page = engine.pageRect();
    let inside = 0;
    for (const dot of [...engine.gridLayer.children]) {
      const p = dot.position;
      if (p.x >= page.x && p.x <= page.x + page.width && p.y >= page.y && p.y <= page.y + page.height) {
        inside += 1;
      }
    }
    assert.ok(inside > 0);
  } finally { cleanup(); }
});

test('new document centers the page', () => {
  const { scope, engine, cleanup } = openEngine();
  try {
    const far = new scope.Path.Rectangle({ from: [5000, 5000], to: [5100, 5100] });
    engine.addItemToSelection(far);
    engine.applyPageSpec(612, 792, 'inch');
    engine.newDocument();
    assert.ok(Math.abs(scope.view.center.x) < 1e-6);
    assert.ok(Math.abs(scope.view.center.y) < 1e-6);
  } finally { cleanup(); }
});

test('user page paints centered on a guide layer, never as content', () => {
  const shared = store();
  const { engine, cleanup } = openEngine(shared);
  try {
    engine.setPageDimensions(800, 600, 'pt');
    const page = engine.pageRect();
    assert.deepEqual(page, { x: -400, y: -300, width: 800, height: 600 });
    assert.ok(engine.pageOutline);
    assert.equal(engine.pageOutline.guide, true);
    assert.equal(engine.pageOutline.layer, engine.pageLayer);
    assert.equal(engine.pageLayer.guide, true);
    assert.equal(engine.documentStats().objectCount, 0);
  } finally { cleanup(); }
});

test('page repaint keeps the content layer active with a selection', () => {
  const shared = store();
  const { scope, engine, cleanup } = openEngine(shared);
  try {
    const rect = new scope.Path.Rectangle({ from: [0, 0], to: [40, 40] });
    engine.addItemToSelection(rect);
    const active = scope.project.activeLayer;
    engine.drawPage();
    assert.equal(scope.project.activeLayer, active);
    engine.setPageDimensions(800, 600, 'pt');
    assert.equal(scope.project.activeLayer, active);
  } finally { cleanup(); }
});

test('grid stays above the page sheet through pan and repaint', () => {
  const { engine, cleanup } = openEngine();
  try {
    engine.setGridEnabled(true);
    engine.setPageDimensions(800, 600, 'pt');
    const above = () => engine.pageLayer.index < engine.gridLayer.index;
    assert.ok(above());
    engine.scrollViewTo(200, 150);
    assert.ok(above());
    engine.setGridSpacing(20);
    assert.ok(above());
  } finally { cleanup(); }
});

test('document holds a second page with its own layer mapping', () => {
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
