// Native document files (Slice 3): the .nibglider envelope —
// build/parse/migrate/validate, engine round trips (layers,
// retained Bézier sources, catalog model), legacy scene bodies stay
// openable, gallery bodies wrap for export, and the SVG round trip
// keeps geometry and paint (with the clip-mask artefact stripped).
import test from 'node:test';
import assert from 'node:assert/strict';

import paper from 'paper';

const {
  NATIVE_FORMAT, NATIVE_VERSION, buildNativeDocument, serializeNativeDocument,
  parseNativeDocument, isNativeDocumentText, wrapSceneAsNativeDocument, nativeFileName,
} = await import('../src/engine/document/NativeDocument.ts');
const { NibGliderEngine } = await import('../src/engine/engine.ts');
const { memoryGallery, saveDocument, getDocument } = await import('../src/ui/DocumentGallery.ts');
const { stripSvgClips, encodeSceneItems } = await import('../src/engine/document/SceneIO.ts');
const { adoptImportedArtwork } = await import('../src/engine/document/vectorArtwork.ts');

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  return { scope, engine: new NibGliderEngine(scope, () => {}) };
}

function depositCircle(scope, engine, x = 120, y = 90, r = 50) {
  engine.mousePt = new scope.Point(x, y);
  engine.circleInnerShapeType = 'circle';
  engine.circleKC('radius');
  engine.pointer.onMouseMove({ point: new scope.Point(x + r, y) });
  engine.endPathOrShape();
}

test('native envelope: build, serialize, parse round trip', () => {
  const doc = buildNativeDocument({
    name: 'Poster',
    savedAt: '2026-11-10T12:00:00.000Z',
    layers: [{ id: 'paper-layer-2', name: 'Layer 1' }],
    activeLayerId: 'paper-layer-2',
    drawables: [],
    retainedPaths: [],
    page: { widthPt: 612, heightPt: 792, orientation: 'portrait', unit: 'pt' },
    view: { centerX: 10, centerY: 20, zoom: 1.5 },
    scene: '{"format":"nibglider-scene","version":2,"items":[]}',
  });
  const text = serializeNativeDocument(doc);
  assert.equal(isNativeDocumentText(text), true);
  assert.equal(isNativeDocumentText('{"format":"nibglider-scene"}'), false);
  const parsed = parseNativeDocument(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.doc, doc);
  assert.equal(nativeFileName('My Poster'), 'My Poster.nibglider');
  assert.equal(nativeFileName('a/b:c'), 'a-b-c.nibglider');
});

test('parse rejects junk, newer versions, and invalid drawables', () => {
  assert.equal(parseNativeDocument('not json').ok, false);
  assert.equal(parseNativeDocument('{"format":"other","version":1}').ok, false);
  const newer = parseNativeDocument(JSON.stringify({
    format: NATIVE_FORMAT, version: NATIVE_VERSION + 1, scene: '{"format":"nibglider-scene","version":2,"items":[]}',
  }));
  assert.equal(newer.ok, false);
  assert.match(newer.error, /newer NibGlider/);
  const badDrawable = parseNativeDocument(JSON.stringify({
    format: NATIVE_FORMAT, version: 1, name: 'X', scene: '{"format":"nibglider-scene","version":2,"items":[]}',
    drawables: [{ id: 'd1', kind: 'path' }],
  }));
  assert.equal(badDrawable.ok, false);
  assert.match(badDrawable.error, /invalid drawable/);
  const noScene = parseNativeDocument(JSON.stringify({ format: NATIVE_FORMAT, version: 1, name: 'X' }));
  assert.equal(noScene.ok, false);
});

test('migration: a v0 draft (no version, no model sections) opens at the current version', () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine);
  const scene = engine.exportScene();
  const v0 = JSON.stringify({ format: NATIVE_FORMAT, name: 'Draft', scene });
  const parsed = parseNativeDocument(v0);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.doc.version, NATIVE_VERSION);
  assert.equal(parsed.doc.name, 'Draft');
  assert.deepEqual(parsed.doc.drawables, []);
  assert.ok(parsed.doc.layers.length >= 1, 'layers recovered from the scene');
  const { engine: engine2 } = makeEngine();
  const opened = engine2.openNativeDocumentText(v0);
  assert.equal(opened.ok, true);
  assert.equal(engine2.hasContent(), true);
  assert.equal(engine2.currentFileName, 'Draft');
});

test('v5 display settings round trip through the engine; v4 files keep current values', () => {
  const { engine } = makeEngine();
  engine.setGridEnabled(true);
  engine.setGridType('diamond');
  engine.setGridSpacing(36);
  engine.setGridSubdivisions(4);
  engine.setGridStyle('lines');
  engine.setGridColor('#ff8800');
  engine.setGridOpacity(0.25);
  engine.setPageFill(true);
  engine.setPageFillColor('#112233');
  engine.setPageSideTicks(true);
  const text = engine.exportNativeDocument('Display');
  const parsed = parseNativeDocument(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.doc.version, 6);
  assert.deepEqual(parsed.doc.display, {
    gridEnabled: true, gridType: 'diamond', gridSpacing: 36, gridSubdivisions: 4,
    gridStyle: 'lines', gridColor: '#ff8800', gridOpacity: 0.25,
    pageFill: true, pageFillColor: '#112233', pageSideTicks: true,
  });
  const { engine: fresh } = makeEngine();
  assert.equal(fresh.openNativeDocumentText(text).ok, true);
  assert.equal(fresh.isGridEnabled, true);
  assert.equal(fresh.gridType, 'diamond');
  assert.equal(fresh.gridSpacing, 36);
  assert.equal(fresh.gridSubdivisions, 4);
  assert.equal(fresh.gridStyle, 'lines');
  assert.equal(fresh.gridColor, '#ff8800');
  assert.equal(fresh.gridOpacity, 0.25);
  assert.equal(fresh.pageFill, true);
  assert.equal(fresh.pageFillColor, '#112233');
  assert.equal(fresh.pageSideTicks, true);
  // A v4 body (no display section) opens without touching display state.
  const v4 = JSON.parse(text);
  v4.version = 4;
  delete v4.display;
  const { engine: legacy } = makeEngine();
  legacy.setGridSpacing(99);
  assert.equal(legacy.openNativeDocumentText(JSON.stringify(v4)).ok, true);
  assert.equal(legacy.gridSpacing, 99, 'no display section: current values kept');
});

test('engine round trip: layers, active layer, and artwork survive a file', () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine, 100, 100, 40);
  engine.createLayer();
  depositCircle(scope, engine, 300, 200, 30);
  const layerNames = engine.listLayers().map((l) => l.name);
  assert.deepEqual(layerNames, ['Layer 1', 'Layer 2']);
  const text = engine.exportNativeDocument('Two Layers');
  assert.ok(text.length > 0);
  const parsed = parseNativeDocument(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.doc.layers.map((l) => l.name), ['Layer 1', 'Layer 2']);

  const { engine: engine2 } = makeEngine();
  const opened = engine2.openNativeDocumentText(text);
  assert.equal(opened.ok, true);
  assert.equal(opened.name, 'Two Layers');
  assert.deepEqual(engine2.listLayers().map((l) => l.name), ['Layer 1', 'Layer 2']);
  assert.equal(engine2.activeLayerId(), engine2.listLayers()[1].id, 'saved active layer restored');
  const listing = engine2.objectListing();
  assert.equal(listing.reduce((n, l) => n + l.rows.length, 0), 2, 'both circles present');
  assert.equal(engine2.isDocumentDirty(), false, 'freshly opened file is clean');
  assert.equal(engine2.currentFileName, 'Two Layers');
});

test('retained Bézier sources survive the native round trip', () => {
  const { scope, engine } = makeEngine();
  const layer = scope.project.activeLayer;
  const base = new scope.Path.Rectangle({ from: [0, 0], to: [120, 80], fillColor: 'black' });
  const tool = new scope.Path.Rectangle({ from: [40, 20], to: [160, 100], fillColor: 'red' });
  layer.addChild(base); layer.addChild(tool);
  engine.addItemToSelection(base);
  engine.addItemToSelection(tool);
  engine.combineSelection('union');
  const result = layer.children.find((c) => c.data?.drawableId);
  assert.ok(result, 'combine result carries a retained id');
  const id = result.data.drawableId;
  const before = engine.getRetainedPathDrawable(id);
  assert.ok(before);
  const text = engine.exportNativeDocument('Union');
  const parsed = parseNativeDocument(text);
  assert.equal(parsed.doc.retainedPaths.length, 1);
  assert.equal(parsed.doc.retainedPaths[0].id, id);

  const { engine: engine2 } = makeEngine();
  assert.equal(engine2.openNativeDocumentText(text).ok, true);
  const after = engine2.getRetainedPathDrawable(id);
  assert.ok(after, 'retained source restored against the loaded item');
  assert.deepEqual(after.source, before.source);
});

test('legacy scene bodies open through the unified opener', () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine);
  const v2 = engine.exportScene();
  const parsed = JSON.parse(v2);
  const v1 = JSON.stringify({ format: 'nibglider-scene', version: 1, items: parsed.layers[0].items });
  const { engine: engine2 } = makeEngine();
  assert.equal(engine2.openDocumentText(v1, 'old.json'), true);
  assert.equal(engine2.hasContent(), true);
  assert.equal(engine2.currentFileName, 'old');
  const { engine: engine3 } = makeEngine();
  assert.equal(engine3.openDocumentText(v2, 'new.json'), true);
  assert.equal(engine3.hasContent(), true);
  assert.equal(engine3.openDocumentText('{"hello":1}', 'nope.json'), false);
});

test('gallery bodies wrap into native files without opening them', async () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine);
  const db = memoryGallery();
  const savedId = await saveDocument(db, 'Gallery Poster', engine.exportScene());
  const doc = await getDocument(db, savedId);
  const wrapped = wrapSceneAsNativeDocument(doc.name, doc.svg, new Date(doc.updatedAt).toISOString());
  assert.ok(wrapped);
  const parsed = parseNativeDocument(serializeNativeDocument(wrapped));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.doc.name, 'Gallery Poster');
  const { engine: engine2 } = makeEngine();
  assert.equal(engine2.openNativeDocumentText(serializeNativeDocument(wrapped)).ok, true);
  assert.equal(engine2.hasContent(), true);
  // A legacy SVG body is not wrappable; the caller exports it as SVG.
  assert.equal(wrapSceneAsNativeDocument('Svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>', ''), null);
});

test('SVG round trip: imported artwork keeps geometry and paint through a scene re-save', () => {
  // Paper's SVG serializer/parser need a DOM, so neither runs in this
  // harness (the repo's export tests note the same limit). What runs
  // for real here is the engine's post-import pipeline — the exact
  // functions ingestSvg applies (stripSvgClips, then
  // adoptImportedArtwork) — over items shaped like an import of
  // representative exported markup: a viewBox clip group wrapping a
  // filled/stroked rect and a filled circle.
  const { scope, engine } = makeEngine();
  const group = new scope.Group();
  const clip = new scope.Path.Rectangle(new scope.Rectangle(0, 0, 400, 300));
  clip.clipMask = true;
  const rect = new scope.Path.Rectangle(new scope.Rectangle(10, 20, 120, 80));
  rect.fillColor = new scope.Color('#3366cc');
  rect.strokeColor = new scope.Color('#111111');
  rect.strokeWidth = 3;
  const circle = new scope.Path.Circle(new scope.Point(250, 150), 40);
  circle.fillColor = new scope.Color('#ff0000');
  group.addChildren([clip, rect, circle]);
  stripSvgClips(group);
  assert.equal(group.children.includes(clip), false, 'clip artefact stripped');
  const adopted = adoptImportedArtwork(scope, group) ?? group;
  scope.project.activeLayer.addChild(adopted);
  const pathsOf = (e) => e.allContentItems().flatMap(function walk(i) {
    return i.className === 'Path' ? [i] : (i.children ?? []).flatMap(walk);
  });
  const describe = (paths) => paths.map((p) => ({
    x: Math.round(p.bounds.x), y: Math.round(p.bounds.y),
    w: Math.round(p.bounds.width), h: Math.round(p.bounds.height),
    fill: p.fillColor ? p.fillColor.toCSS('hex') : null,
    stroke: p.strokeColor ? p.strokeColor.toCSS('hex') : null,
  })).sort((a, b) => a.x - b.x);
  const before = describe(pathsOf(engine));
  assert.equal(before.length, 2);
  assert.equal(before[0].fill, '#3366cc');
  assert.equal(before[0].stroke, '#111111');
  assert.equal(before[1].fill, '#ff0000');
  const scene = engine.exportScene();
  const { engine: engine2 } = makeEngine();
  assert.equal(engine2.replaceScene('Reopen', scene), true);
  assert.deepEqual(describe(pathsOf(engine2)), before, 'geometry and paint identical after re-save');
});

test('stripSvgClips removes imported clip masks recursively', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 400));
  const group = new scope.Group();
  const mask = new scope.Path.Rectangle(new scope.Rectangle(0, 0, 50, 50));
  mask.clipMask = true;
  const art = new scope.Path.Circle(new scope.Point(25, 25), 20);
  group.addChildren([mask, art]);
  scope.project.activeLayer.addChild(group);
  stripSvgClips(group);
  assert.equal(group.children.includes(mask), false, 'clip-mask child removed');
  assert.equal(group.children.includes(art), true, 'artwork kept');
  const json = encodeSceneItems([group]);
  assert.equal(typeof json, 'string');
});

test('v6: layer state and document palette round trip; v5 files migrate with defaults', () => {
  const { engine } = makeEngine();
  const layerId = engine.listLayers()[0].id;
  engine.setLayerVisible(layerId, false);
  engine.setLayerLocked(layerId, true);
  engine.setLayerOpacity(layerId, 0.4);
  engine.setDocumentPalette(['#ff0000', '#00ff00']);
  const text = engine.exportNativeDocument('Stateful');
  const parsed = parseNativeDocument(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.doc.version, 6);
  assert.deepEqual(parsed.doc.palette, ['#ff0000', '#00ff00']);
  const layer = parsed.doc.layers[0];
  assert.equal(layer.visible, false);
  assert.equal(layer.locked, true);
  assert.equal(layer.opacity, 0.4);

  const fresh = makeEngine();
  assert.equal(fresh.engine.openNativeDocumentText(text).ok, true);
  const restored = fresh.engine.listLayers()[0];
  assert.equal(restored.visible, false);
  assert.equal(restored.locked, true);
  assert.equal(restored.opacity, 0.4);
  assert.deepEqual(fresh.engine.documentPalette, ['#ff0000', '#00ff00']);
  assert.equal(fresh.engine.paletteFromDocument, true);

  // A v5 body migrates: palette null, layer state absent (defaults).
  const v5 = JSON.parse(text);
  v5.version = 5;
  delete v5.palette;
  delete v5.layers[0].visible;
  delete v5.layers[0].locked;
  delete v5.layers[0].opacity;
  for (const page of v5.pages) {
    delete page.layers[0].visible;
    delete page.layers[0].locked;
    delete page.layers[0].opacity;
  }
  const migrated = parseNativeDocument(JSON.stringify(v5));
  assert.equal(migrated.ok, true);
  assert.equal(migrated.doc.version, 6);
  assert.equal(migrated.doc.palette, null);
  assert.equal(migrated.doc.layers[0].visible, undefined);
});
