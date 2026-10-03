import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { SceneRepository } from '../src/engine/scene/SceneRepository.ts';
import { SelectionManager } from '../src/engine/scene/SelectionManager.ts';
import { DrawableRenderer } from '../src/engine/scene/DrawableRenderer.ts';
import { NibGliderEngine } from '../src/engine/engine.ts';

function setup() {
  const scope = new paper.PaperScope(); scope.setup(new scope.Size(400, 300));
  const overlays = { gridLayer: null, cursors: [], previews: [] };
  const scene = new SceneRepository(scope, () => overlays);
  const commands = [];
  const selection = new SelectionManager(scene, (command) => commands.push(command),
    (original, clone) => scene.retainClone(original, clone, (item) => item));
  const rect = (x) => new scope.Path.Rectangle({ from: [x, 10], to: [x + 30, 40] });
  return { scope, scene, selection, commands, overlays, rect,
    cleanup: () => scope.project.remove() };
}

test('scene repository filters overlays, restores content order, and maps retained drawable roots', () => {
  const { scene, overlays, rect, cleanup } = setup();
  try {
    const first = rect(10); const second = rect(80);
    const preview = rect(150); overlays.previews.push(preview);
    assert.deepEqual(scene.contentItems(), [first, second]);
    assert.equal(scene.isNonContentItem({ getClassName: () => 'HitResult', item: preview }), true);
    assert.equal(scene.isInScene(first), true);
    first.remove(); assert.equal(scene.isInScene(first), false);
    scene.insertContentAt(first, second); assert.deepEqual(scene.contentItems(), [first, second]);
    const id = scene.retain(first);
    assert.equal(scene.drawableIdOf(first), id);
    const model = scene.getRetainedPathDrawable(id);
    assert.equal(model.id, id); assert.equal(model.source.mode, 'bezier');
    first.remove(); assert.equal(scene.drawableIdOf(first), null);
    assert.equal(scene.getRetainedPathDrawable(id), null);
    scene.insertContentAt(first, second); assert.equal(scene.getRetainedPathDrawable(id).id, id);
    scene.pruneRecords(); assert.equal(scene.records.size, 1);
  } finally { cleanup(); }
});

test('model renderer registers current drawable identity with scene repository', () => {
  const { scope, scene, cleanup } = setup();
  try {
    const model = { id: 'drawable-a', kind: 'path', layerId: 'active',
      source: { id: 'source-a', mode: 'bezier', fillRule: 'nonzero', contours: [{ closed: false, segments: [
        { point: { x: 0, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } },
        { point: { x: 20, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } },
      ] }] },
      transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      opacity: 1, visible: true, locked: false };
    const renderer = new DrawableRenderer(scope, { layerForId: () => scene.layer, scene });
    const first = renderer.render(model);
    assert.equal(scene.drawableIdOf(first), model.id);
    assert.deepEqual(scene.drawableOf(model.id), model);
    scene.drawableOf(model.id).source.contours[0].segments[0].point.x = 999;
    assert.deepEqual(scene.drawableOf(model.id), model);
    const second = renderer.render({ ...model, transform: { ...model.transform, tx: 30 } });
    assert.equal(scene.drawableIdOf(first), null);
    assert.equal(scene.drawableIdOf(second), model.id);
    assert.equal(scene.drawableOf(model.id).transform.tx, 30);
    renderer.remove(model.id);
    assert.equal(scene.drawableOf(model.id), null);
  } finally { cleanup(); }
});

test('selection intents preserve membership, order, nested group identity, and undo/redo', () => {
  const { scope, scene, selection, commands, rect, cleanup } = setup();
  try {
    const a = rect(10); const b = rect(80); const c = rect(150);
    selection.add(a); selection.add(b); selection.add(b);
    assert.deepEqual(selection.selectedItems, [a, b]);
    assert.equal(selection.group(), true);
    const group = selection.selectedItems[0];
    assert.equal(group.data.isUserGroup, true);
    assert.equal(selection.topUserGroupOf(a), group);
    assert.deepEqual(selection.topLevelSelected(), [group]);
    commands.at(-1).undo();
    assert.deepEqual(selection.selectedItems, [a, b]);
    assert.deepEqual(scene.contentItems(), [a, b, c]);
    commands.at(-1).redo();
    assert.deepEqual(selection.selectedItems, [group]);
    assert.equal(selection.ungroup(), true);
    assert.deepEqual(selection.selectedItems, [a, b]);
    commands.at(-1).undo(); assert.deepEqual(selection.selectedItems, [group]);
    commands.at(-1).redo(); assert.deepEqual(selection.selectedItems, [a, b]);
    selection.restore([a]);
    const id = scene.retain(a);
    assert.equal(selection.duplicate(), true);
    const copy = selection.selectedItems[0];
    assert.notEqual(copy.data.drawableId, id);
    assert.equal(scene.drawableIdOf(copy), copy.data.drawableId);
    commands.at(-1).undo(); assert.deepEqual(selection.selectedItems, [a]);
    assert.equal(scene.getRetainedPathDrawable(copy.data.drawableId), null);
    commands.at(-1).redo(); assert.deepEqual(selection.selectedItems, [copy]);
    assert.equal(scene.getRetainedPathDrawable(copy.data.drawableId).id, copy.data.drawableId);
    assert.equal(selection.bringToFront(), true);
    assert.equal(scene.contentItems().at(-1), copy);
    commands.at(-1).undo(); assert.deepEqual(selection.selectedItems, [copy]);
    commands.at(-1).redo(); assert.equal(scene.contentItems().at(-1), copy);
    assert.equal(selection.sendToBack(), true);
    assert.equal(scene.contentItems()[0], copy);
    commands.at(-1).undo(); assert.equal(scene.contentItems().at(-1), copy);
    selection.clear(); assert.equal(selection.hasSelection, false);
    assert.equal(copy.selected, false);
    assert.equal(scope.project.activeLayer.children.includes(copy), true);
  } finally { cleanup(); }
});

test('duplicating a group gives its retained path child an independent source identity', () => {
  const { scene, selection, commands, rect, cleanup } = setup();
  try {
    const path = rect(10); const other = rect(80);
    const originalId = scene.retain(path);
    selection.add(path); selection.add(other);
    assert.equal(selection.group(), true);
    assert.equal(selection.duplicate(), true);
    const groupCopy = selection.selectedItems[0];
    const pathCopy = groupCopy.children[0];
    const copyId = scene.drawableIdOf(pathCopy);
    assert.ok(copyId); assert.notEqual(copyId, originalId);
    assert.notEqual(scene.getRetainedPathDrawable(copyId).source.id,
      scene.getRetainedPathDrawable(originalId).source.id);
    commands.at(-1).undo(); assert.equal(scene.getRetainedPathDrawable(copyId), null);
    commands.at(-1).redo(); assert.equal(scene.drawableIdOf(pathCopy), copyId);
    assert.equal(scene.drawableIdOf(groupCopy), null);
  } finally { cleanup(); }
});

test('engine operations delegate scene and selection intents without changing command behavior', () => {
  const scope = new paper.PaperScope(); scope.setup(new scope.Size(400, 300));
  const engine = new NibGliderEngine(scope, () => {});
  try {
    const a = new scope.Path.Rectangle({ from: [0, 0], to: [30, 30] });
    const b = new scope.Path.Rectangle({ from: [50, 0], to: [80, 30] });
    engine.addItemToSelection(a); engine.addItemToSelection(b);
    assert.equal(engine.canGroupSelection(), true);
    engine.groupSelection(); assert.equal(engine.selectedItems.length, 1);
    engine.undo(); assert.deepEqual(engine.selectedItems, [a, b]);
    engine.redo(); assert.equal(engine.selectedItems[0].data.isUserGroup, true);
    engine.ungroupSelected(); assert.deepEqual(engine.selectedItems, [a, b]);
    engine.undo(); assert.equal(engine.selectedItems[0].data.isUserGroup, true);
  } finally { scope.project.remove(); }
});
