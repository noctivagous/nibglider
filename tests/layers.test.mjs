import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import {
  buildLayerListing, moveLayer, nextLayerName, stepOrderedIds,
} from '../src/engine/document/layerModel.ts';
import { LayerManager } from '../src/engine/document/LayerManager.ts';
import {
  encodeSceneDocument, decodeSceneItems, readSceneLayers, SCENE_VERSION,
} from '../src/engine/document/SceneIO.ts';
import { NibGliderEngine } from '../src/engine/engine.ts';

// --- pure layer model ----------------------------------------------------

test('moveLayer steps a layer up and down, stopping at the ends', () => {
  const records = [
    { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' },
  ];
  assert.deepEqual(moveLayer(records, 'a', 'up').map((r) => r.id), ['b', 'a', 'c']);
  assert.deepEqual(moveLayer(records, 'c', 'down').map((r) => r.id), ['a', 'c', 'b']);
  assert.deepEqual(moveLayer(records, 'c', 'up').map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(moveLayer(records, 'a', 'down').map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(moveLayer(records, 'missing', 'up').map((r) => r.id), ['a', 'b', 'c']);
  assert.equal(nextLayerName(records), 'Layer 4');
});

test('stepOrderedIds moves a set one step without crossing its members', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(stepOrderedIds(ids, new Set(['b']), 'forward'), ['a', 'c', 'b', 'd', 'e']);
  assert.deepEqual(stepOrderedIds(ids, new Set(['d']), 'backward'), ['a', 'b', 'd', 'c', 'e']);
  assert.deepEqual(stepOrderedIds(ids, new Set(['b', 'd']), 'forward'), ['a', 'c', 'b', 'e', 'd']);
  assert.deepEqual(stepOrderedIds(ids, new Set(['e']), 'forward'), ids);
  assert.deepEqual(stepOrderedIds(ids, new Set(['a']), 'backward'), ids);
  assert.deepEqual(stepOrderedIds(ids, new Set(['b', 'c']), 'backward'), ['b', 'c', 'a', 'd', 'e']);
});

test('buildLayerListing auto-names by kind in document order and flips for display', () => {
  const listing = buildLayerListing([
    {
      record: { id: 'l1', name: 'Base' },
      objects: [
        { key: '1', kindLabel: 'Path', visible: true, locked: false, opacity: 1 },
        { key: '2', name: 'Hero', kindLabel: 'Path', visible: true, locked: false, opacity: 0.5 },
        {
          key: '3', kindLabel: 'Group', visible: true, locked: true, opacity: 1,
          children: [{ key: '4', kindLabel: 'Text', visible: true, locked: false, opacity: 1 }],
        },
      ],
    },
    {
      record: { id: 'l2', name: 'Top' },
      objects: [{ key: '5', kindLabel: 'Path', visible: false, locked: false, opacity: 1 }],
    },
  ]);
  assert.deepEqual(listing.map((l) => l.record.id), ['l2', 'l1'], 'layers display top-first');
  const base = listing.find((l) => l.record.id === 'l1');
  const names = base.rows.map((r) => `${r.name}@${r.depth}`);
  assert.ok(names.includes('Hero@0'));
  assert.ok(names.includes('Path 1@0'), 'first unnamed path in document order is Path 1');
  assert.ok(names.includes('Group 1@0'));
  assert.ok(names.includes('Text 1@1'), 'group child is depth 1');
  const hero = base.rows.find((r) => r.name === 'Hero');
  assert.equal(hero.autoNamed, false);
  assert.equal(hero.opacity, 0.5);
  const top = listing.find((l) => l.record.id === 'l2');
  assert.equal(top.rows[0].name, 'Path 3', 'path counting continues across layers');
  assert.equal(top.rows[0].visible, false);
});

// --- LayerManager against a real Paper scope ------------------------------

function scopeWithProject() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  return s;
}

test('LayerManager adopts the project layer, then creates/renames/moves/deletes layers', () => {
  const s = scopeWithProject();
  try {
    const manager = new LayerManager(s);
    assert.equal(manager.listLayers().length, 1);
    assert.equal(manager.listLayers()[0].name, 'Layer 1');
    const second = manager.createLayer();
    assert.equal(second.name, 'Layer 2');
    assert.deepEqual(manager.listLayers().map((r) => r.name), ['Layer 1', 'Layer 2']);
    assert.equal(manager.activeLayerId, second.id);
    assert.equal(s.project.activeLayer.name, 'Layer 2');
    assert.equal(manager.renameLayer(second.id, 'Artwork'), true);
    assert.equal(manager.listLayers()[1].name, 'Artwork');
    assert.equal(manager.setActiveLayer(manager.listLayers()[0].id), true);
    // Draw order follows the paper stack: put a rect in Layer 1, switch up.
    const firstId = manager.listLayers()[0].id;
    assert.equal(manager.moveLayerRecord(second.id, 'down'), true);
    assert.deepEqual(manager.listLayers().map((r) => r.id), [second.id, firstId]);
    // Deleting the last layer is refused; deleting one of two works.
    const removed = manager.deleteLayer(second.id);
    assert.ok(Array.isArray(removed));
    assert.equal(manager.listLayers().length, 1);
    assert.equal(manager.deleteLayer(firstId), null);
  } finally { s.project.remove(); }
});

test('scene v2 round-trips items grouped by layer and keeps v1 readable', () => {
  const s = scopeWithProject();
  try {
    const manager = new LayerManager(s);
    const layer1 = manager.listLayers()[0];
    const rect = new s.Path.Rectangle(new s.Point(10, 10), new s.Size(40, 30));
    manager.activeLayer.addChild(rect);
    const layer2 = manager.createLayer('Top');
    const circle = new s.Path.Circle(new s.Point(100, 100), 20);
    manager.activeLayer.addChild(circle);
    const json = encodeSceneDocument(
      [
        { item: rect, layerId: layer1.id },
        { item: circle, layerId: layer2.id },
      ],
      manager.listLayers(),
      null,
      layer2.id,
    );
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, SCENE_VERSION);
    assert.equal(parsed.version, 2);
    assert.deepEqual(readSceneLayers(json).map((l) => l.name), ['Layer 1', 'Top']);

    const s2 = scopeWithProject();
    try {
      const placed = decodeSceneItems(s2.project, json);
      assert.equal(placed.length, 2);
      const layers = s2.project.layers.filter((l) => l.children.length > 0);
      assert.equal(layers.length, 2, 'items land in two separate layers');
      const names = layers.map((l) => l.name).sort();
      assert.deepEqual(names, ['Layer 1', 'Top']);
      const m2 = new LayerManager(s2);
      m2.syncWithProject(readSceneLayers(json));
      assert.deepEqual(m2.listLayers().map((r) => r.name), ['Layer 1', 'Top']);
    } finally { s2.project.remove(); }

    // v1: flat items decode onto the active layer.
    const v1 = JSON.stringify({
      format: 'nibglider-scene', version: 1,
      items: [JSON.parse(rect.exportJSON())],
    });
    const s3 = scopeWithProject();
    try {
      const placedV1 = decodeSceneItems(s3.project, v1);
      assert.equal(placedV1.length, 1);
      assert.equal(placedV1[0].layer, s3.project.activeLayer);
      assert.deepEqual(readSceneLayers(v1), []);
    } finally { s3.project.remove(); }
  } finally { s.project.remove(); }
});

// --- Engine level: layers, listing, step order ----------------------------

function engine() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  const e = new NibGliderEngine(s, () => {});
  return { s, e, cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); } };
}

function depositCircle(s, e, x = 120) {
  e.mousePt = new s.Point(x, 90);
  e.circleInnerShapeType = 'circle';
  e.circleKC('radius');
  e.pointer.onMouseMove({ point: new s.Point(x + 50, 90) });
  e.endPathOrShape();
}

test('engine: objects list per layer, panel setters apply, hidden persists in save', () => {
  const { s, e, cleanup } = engine();
  try {
    depositCircle(s, e);
    const layer2 = e.createLayer('Second');
    assert.equal(e.activeLayerId(), layer2.id);
    depositCircle(s, e, 300);
    assert.equal(e.listLayers().length, 2);
    const listing = e.objectListing();
    assert.equal(listing.length, 2);
    const total = listing.reduce((n, l) => n + l.rows.length, 0);
    assert.equal(total, 2);
    const topLayer = listing.find((l) => l.record.id === layer2.id);
    assert.equal(topLayer.rows.length, 1);
    const key = topLayer.rows[0].key;
    // Panel setters land on the live item.
    assert.equal(e.setObjectOpacityByKey(key, 0.4), true);
    assert.equal(e.setObjectLockedByKey(key, true), true);
    // Locked objects remain selectable from the list.
    assert.equal(e.selectObjectByKey(key), true);
    assert.equal(e.selectedItems.length, 1);
    assert.equal(e.renameObjectByKey(key, 'Moon'), true);
    const after = e.objectListing().find((l) => l.record.id === layer2.id);
    assert.equal(after.rows[0].name, 'Moon');
    assert.equal(after.rows[0].locked, true);
    assert.ok(Math.abs(after.rows[0].opacity - 0.4) < 1e-9);
    assert.equal(e.setObjectVisibleByKey(key, false), true);
    // Save keeps the hidden object, tagged to its layer.
    const saved = e.exportScene();
    assert.deepEqual(readSceneLayers(saved).map((l) => l.name), ['Layer 1', 'Second']);
    const ok = e.replaceScene('Open', saved, { history: false });
    assert.equal(ok, true);
    assert.equal(e.listLayers().length, 2);
    const relisted = e.objectListing();
    assert.equal(relisted.reduce((n, l) => n + l.rows.length, 0), 2);
    const moonLayer = relisted.find((l) => l.record.name === 'Second');
    assert.equal(moonLayer.rows[0].name, 'Moon');
    assert.equal(moonLayer.rows[0].visible, false, 'hidden state survives save/open');
    assert.equal(moonLayer.rows[0].locked, true, 'locked state survives save/open');
  } finally { cleanup(); }
});

test('engine: bring forward / send backward step the selection one place', () => {
  const { s, e, cleanup } = engine();
  try {
    depositCircle(s, e, 100);
    depositCircle(s, e, 200);
    depositCircle(s, e, 300);
    const layer = s.project.activeLayer;
    const order = () => layer.children
      .filter((item) => !e.isNonContentItem?.(item))
      .map((item) => Math.round(item.bounds.center.x));
    const before = order();
    assert.equal(before.length, 3);
    const bottom = layer.children.find((item) => Math.round(item.bounds.center.x) === before[0]);
    e.clearOutSelection();
    e.addItemToSelection(bottom);
    e.bringSelectionForward();
    const stepped = order();
    assert.deepEqual(stepped, [before[1], before[0], before[2]], 'bottom object moves up one step');
    e.bringSelectionForward();
    assert.deepEqual(order(), [before[1], before[2], before[0]]);
    e.bringSelectionForward();
    assert.deepEqual(order(), [before[1], before[2], before[0]], 'forward at the top is a no-op');
    e.sendSelectionBackward();
    assert.deepEqual(order(), [before[1], before[0], before[2]]);
    e.undo();
    assert.deepEqual(order(), [before[1], before[2], before[0]], 'step reorder is one undo entry');
  } finally { cleanup(); }
});
