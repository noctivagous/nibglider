// Slice 20 panel completion: layer presentation state gates the
// listing, history entries + click-to-jump, Exclude (XOR) combine,
// Arrange quarter-turns, path-op availability, and settings-backed
// filter parameters.
import test from 'node:test';
import assert from 'node:assert/strict';

import paper from 'paper';

const { NibGliderEngine } = await import('../src/engine/engine.ts');
const { snapshotEngineSettings, applyEngineSettings } = await import('../src/engine/engineSettings.ts');

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  return { scope, engine: new NibGliderEngine(scope, () => {}) };
}

function depositCircle(scope, engine, x, y, r = 40) {
  engine.mousePt = new scope.Point(x, y);
  engine.circleInnerShapeType = 'circle';
  engine.circleKC('radius');
  engine.pointer.onMouseMove({ point: new scope.Point(x + r, y) });
  engine.endPathOrShape();
  return engine.selectedItems[0];
}

test('layer visibility, lock and opacity gate the object listing', () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine, 100, 100);
  const layerId = engine.listLayers()[0].id;
  let listing = engine.objectListing();
  assert.equal(listing[0].rows[0].visible, true);
  assert.equal(listing[0].rows[0].locked, false);
  engine.setLayerVisible(layerId, false);
  engine.setLayerLocked(layerId, true);
  engine.setLayerOpacity(layerId, 0.5);
  listing = engine.objectListing();
  assert.equal(listing[0].rows[0].visible, false, 'hidden layer hides its objects in the listing');
  assert.equal(listing[0].rows[0].locked, true, 'locked layer locks its objects in the listing');
  assert.equal(listing[0].rows[0].opacity, 0.5, 'layer opacity multiplies into the row');
  const record = engine.listLayers()[0];
  assert.equal(record.visible, false);
  assert.equal(record.locked, true);
  assert.equal(record.opacity, 0.5);
});

test('history entries list labels in order and jump walks undo/redo', () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine, 100, 100);
  depositCircle(scope, engine, 300, 100);
  const entries = engine.historyEntries();
  assert.equal(entries.position, entries.labels.length);
  assert.ok(entries.labels.length >= 2);
  const itemsBefore = engine.allContentItems().length;
  engine.jumpToHistoryPosition(0);
  assert.equal(engine.historyEntries().position, 0);
  assert.equal(engine.allContentItems().length, 0, 'jumped to the start: canvas empty');
  engine.jumpToHistoryPosition(entries.labels.length);
  assert.equal(engine.allContentItems().length, itemsBefore, 'jumped back to the end');
});

test('exclude combine keeps the non-overlapping parts (XOR)', () => {
  const { scope, engine } = makeEngine();
  const base = new scope.Path.Rectangle({ from: [0, 0], to: [120, 80], fillColor: 'black' });
  const tool = new scope.Path.Rectangle({ from: [40, 20], to: [160, 100], fillColor: 'red' });
  engine.addItemToSelection(base);
  engine.addItemToSelection(tool);
  assert.equal(engine.canCombineSelection(), true);
  engine.combineSelection('exclude');
  assert.equal(engine.lastCombineNote, '');
  const results = engine.allContentItems();
  assert.equal(results.length, 1);
  // XOR area = A + B - 2*overlap = 9600 + 9600 - 2*4800 = 9600.
  const area = Math.abs(results[0].area);
  assert.ok(Math.abs(area - 9600) < 1, `xor area ${area} ≈ 9600`);
});

test('rotateSelectionBy turns the selection a quarter turn as one undo step', () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine, 100, 100, 30);
  engine.addItemToSelection(engine.allContentItems()[0]);
  const before = engine.historyEntries().labels.length;
  engine.rotateSelectionBy(90);
  assert.equal(engine.historyEntries().labels.length, before + 1, 'exactly one history entry');
  engine.undo();
});

test('pathOpAvailability reflects the selection', () => {
  const { scope, engine } = makeEngine();
  let ops = engine.pathOpAvailability();
  assert.deepEqual(ops, { noise: false, simplify: false, fit: false, hull: false, strokeOutline: false });
  depositCircle(scope, engine, 100, 100, 30);
  engine.addItemToSelection(engine.allContentItems()[0]);
  ops = engine.pathOpAvailability();
  assert.equal(ops.noise, true);
  assert.equal(ops.simplify, true);
  assert.equal(ops.fit, true);
  assert.equal(ops.hull, true);
});

test('filter parameters persist through engine settings', () => {
  const { engine } = makeEngine();
  engine.setFilterBlurRadius(6);
  engine.setFilterBrightness(-40);
  engine.setFilterContrastPct(150);
  const snapshot = snapshotEngineSettings(engine);
  const fresh = makeEngine();
  applyEngineSettings(fresh.engine, snapshot);
  assert.equal(fresh.engine.filterBlurRadius, 6);
  assert.equal(fresh.engine.filterBrightness, -40);
  assert.equal(fresh.engine.filterContrastPct, 150);
});

test('paste in place lands at the copied source position (Slice 21)', async () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine, 100, 100, 30);
  const original = engine.allContentItems()[0];
  const center = { x: original.bounds.center.x, y: original.bounds.center.y };
  engine.addItemToSelection(original);
  assert.equal(engine.copySelection(), true);
  const pasted = await engine.pasteInPlaceFromClipboard();
  assert.equal(pasted, true);
  const items = engine.allContentItems();
  assert.equal(items.length, 2);
  const copy = items.find((item) => item !== original);
  assert.ok(Math.abs(copy.bounds.center.x - center.x) < 1, 'same x as the source');
  assert.ok(Math.abs(copy.bounds.center.y - center.y) < 1, 'same y as the source');
});

test('lock and hide act on the selection (Slice 21)', () => {
  const { scope, engine } = makeEngine();
  depositCircle(scope, engine, 100, 100, 30);
  const item = engine.allContentItems()[0];
  engine.addItemToSelection(item);
  engine.lockSelection();
  assert.equal(item.locked, true);
  engine.hideSelection();
  assert.equal(item.visible, false);
  assert.equal(engine.selectedItems.length, 0, 'hiding clears the selection');
});
