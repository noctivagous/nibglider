import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { DrawableCatalog } from '../src/engine/document/DrawableCatalog.ts';
import { SceneRepository } from '../src/engine/scene/SceneRepository.ts';
import { DrawableRenderer } from '../src/engine/scene/DrawableRenderer.ts';
import { SceneSynchronizer } from '../src/engine/scene/SceneSynchronizer.ts';

const identity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const path = (id, end = 20) => ({
  id, kind: 'path', layerId: 'layer-1',
  source: {
    id: `source-${id}`, mode: 'bezier', fillRule: 'nonzero',
    contours: [{ closed: false, segments: [
      { point: { x: 0, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } },
      { point: { x: end, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } },
    ] }],
  },
  transform: { ...identity }, opacity: 1, visible: true, locked: false,
});
const square = (x, y, size) => ({
  closed: true,
  segments: [[x, y], [x + size, y], [x + size, y + size], [x, y + size]].map(([px, py]) => ({
    point: { x: px, y: py }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 },
  })),
});
const compound = (id) => ({
  id, kind: 'path', layerId: 'layer-1',
  source: {
    id: `source-${id}`, mode: 'bezier', fillRule: 'evenodd',
    contours: [square(0, 0, 100), square(25, 25, 50)],
  },
  transform: { ...identity }, opacity: 1, visible: true, locked: false,
});
const layerOrder = (scene) => scene.contentItems().map((item) => item.data.drawableId);

function setup() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 300));
  const scene = new SceneRepository(scope, () => ({ gridLayer: null, cursors: [], previews: [] }));
  const catalog = new DrawableCatalog();
  let renderer;
  scene.attachCatalog({
    catalog,
    resolvePage: () => 'page-1',
    currentItemOf: (id) => renderer?.getItem(id),
  });
  renderer = new DrawableRenderer(scope, { layerForId: () => scene.layer, scene });
  const synchronizer = new SceneSynchronizer(catalog, renderer);
  return { scope, scene, catalog, renderer, synchronizer, cleanup: () => scope.project.remove() };
}

test('rebuild renders catalog entries and tags every derived item', () => {
  const { scene, catalog, renderer, synchronizer, cleanup } = setup();
  try {
    catalog.upsert('page-1', path('a'));
    catalog.upsert('page-1', compound('b'));
    const single = synchronizer.rebuildDrawable('a');
    const hole = synchronizer.rebuildDrawable('b');
    assert.equal(scene.drawableIdOf(single), 'a');
    assert.equal(renderer.drawableIdOf(single), 'a');
    assert.equal(hole.className, 'CompoundPath');
    assert.equal(hole.children.length, 2);
    for (const child of hole.children) {
      assert.equal(child.data.drawableId, 'b');
      assert.equal(renderer.drawableIdOf(child), 'b');
      assert.equal(scene.drawableIdOf(child), 'b');
    }
    assert.equal(synchronizer.rebuildDrawable('unknown'), null);
  } finally { cleanup(); }
});

test('rebuild never requires the original Paper content item', () => {
  const { scope, scene, catalog, renderer, synchronizer, cleanup } = setup();
  try {
    catalog.upsert('page-1', path('a', 40));
    const first = synchronizer.rebuildDrawable('a');
    assert.equal(first.lastSegment.point.x, 40);
    first.remove();
    assert.equal(scene.drawableIdOf(first), null);
    const rebuilt = synchronizer.rebuildDrawable('a');
    assert.notEqual(rebuilt, first);
    assert.equal(rebuilt.parent, scope.project.activeLayer);
    assert.equal(rebuilt.lastSegment.point.x, 40);
    assert.equal(scene.drawableIdOf(rebuilt), 'a');
    assert.equal(renderer.getItem('a'), rebuilt);
  } finally { cleanup(); }
});

test('a single rebuild preserves stacking order', () => {
  const { scene, catalog, synchronizer, cleanup } = setup();
  try {
    catalog.upsert('page-1', path('a'));
    catalog.upsert('page-1', path('b'));
    catalog.upsert('page-1', path('c'));
    synchronizer.rebuildPage('page-1');
    assert.deepEqual(layerOrder(scene), ['a', 'b', 'c']);
    catalog.upsert('page-1', path('b', 90));
    synchronizer.rebuildDrawable('b');
    assert.deepEqual(layerOrder(scene), ['a', 'b', 'c']);
    assert.equal(scene.contentItems()[1].lastSegment.point.x, 90);
  } finally { cleanup(); }
});

test('page rebuild converges the layer to catalog order and drops stale items', () => {
  const { scene, catalog, renderer, synchronizer, cleanup } = setup();
  try {
    catalog.upsert('page-1', path('a'));
    catalog.upsert('page-1', path('b'));
    catalog.upsert('page-1', path('c'));
    synchronizer.rebuildPage('page-1');
    catalog.replaceAll('page-1', [path('c'), path('a')]);
    synchronizer.rebuildPage('page-1');
    assert.deepEqual(layerOrder(scene), ['c', 'a']);
    assert.equal(renderer.getItem('b'), undefined);
    assert.equal(catalog.has('b'), false);
  } finally { cleanup(); }
});

test('removeDrawable drops the derived item but keeps catalog data', () => {
  const { scene, catalog, renderer, synchronizer, cleanup } = setup();
  try {
    catalog.upsert('page-1', path('a'));
    const item = synchronizer.rebuildDrawable('a');
    synchronizer.removeDrawable('a');
    assert.equal(renderer.getItem('a'), undefined);
    assert.deepEqual(scene.contentItems(), []);
    assert.equal(scene.drawableIdOf(item), null);
    assert.deepEqual(catalog.get('a'), path('a'));
    assert.deepEqual(scene.drawableOf('a'), path('a'));
  } finally { cleanup(); }
});

test('pages rebuild independently', () => {
  const { scene, catalog, renderer, synchronizer, cleanup } = setup();
  try {
    catalog.upsert('page-1', path('a'));
    catalog.upsert('page-2', path('b'));
    synchronizer.rebuildPage('page-1');
    assert.ok(renderer.getItem('a'));
    assert.equal(renderer.getItem('b'), undefined);
    synchronizer.rebuildPage('page-2');
    assert.ok(renderer.getItem('b'));
    catalog.remove('a');
    synchronizer.rebuildPage('page-1');
    assert.equal(renderer.getItem('a'), undefined);
    assert.ok(renderer.getItem('b'));
    assert.equal(renderer.getItem('b').parent, scene.layer);
  } finally { cleanup(); }
});
