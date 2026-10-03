import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { SceneRepository } from '../src/engine/scene/SceneRepository.ts';
import { SelectionManager } from '../src/engine/scene/SelectionManager.ts';
import { DrawableRenderer } from '../src/engine/scene/DrawableRenderer.ts';
import { HistoryManager } from '../src/engine/history/HistoryManager.ts';
import { TransformManager } from '../src/engine/history/TransformManager.ts';

function setup() {
  const scope = new paper.PaperScope(); scope.setup(new scope.Size(400, 300));
  const scene = new SceneRepository(scope, () => ({ gridLayer: null, cursors: [], previews: [] }));
  let selection;
  let changes = 0;
  const history = new HistoryManager(scene, () => selection, () => changes++);
  selection = new SelectionManager(scene, history, (original, clone) => scene.retainClone(original, clone, (item) => item));
  const transforms = new TransformManager(scene, selection, history);
  return { scope, scene, history, selection, transforms,
    changes: () => changes, cleanup: () => scope.project.remove() };
}

test('drag records one completed move while pointer updates remain outside history', () => {
  const { scope, history, selection, transforms, changes, cleanup } = setup();
  try {
    const item = new scope.Path.Rectangle({ from: [0, 0], to: [20, 20] });
    selection.add(item);
    const original = item.position.clone();
    transforms.beginDrag();
    transforms.moveSelectionBy(new scope.Point(5, 0));
    transforms.moveSelectionBy(new scope.Point(7, 0));
    transforms.moveSelectionBy(new scope.Point(3, 0));
    assert.equal(history.canUndo(), false);
    assert.equal(changes(), 0);
    transforms.commitDrag();
    assert.equal(history.undoLabel(), 'Move');
    assert.equal(changes(), 1);
    history.undo(); assert.ok(item.position.getDistance(original) < 1e-9);
    history.redo(); assert.equal(item.position.x, original.x + 15);
    transforms.nudge(1, 0); transforms.nudge(1, 0);
    assert.equal(history.undoLabel(), 'Move');
    history.undo(); assert.equal(item.position.x, original.x + 15);
  } finally { cleanup(); }
});

test('keyboard scale and rotation each form undoable transform intents', () => {
  const { scope, history, selection, transforms, cleanup } = setup();
  try {
    const item = new scope.Path.Rectangle({ from: [10, 10], to: [30, 30] });
    selection.add(item);
    const original = item.bounds.clone();
    transforms.scale(2);
    assert.equal(history.undoLabel(), 'Scale');
    assert.ok(Math.abs(item.bounds.width - 40) < 1e-9);
    history.undo(); assert.ok(Math.abs(item.bounds.width - original.width) < 1e-9);
    history.redo(); assert.ok(Math.abs(item.bounds.width - 40) < 1e-9);
    transforms.rotate(90);
    assert.equal(history.undoLabel(), 'Rotate');
    history.undo(); assert.ok(Math.abs(item.bounds.width - 40) < 1e-8);
    history.undo(); assert.ok(Math.abs(item.bounds.width - original.width) < 1e-8);
  } finally { cleanup(); }
});

test('model command restores plain drawable state before rebuilding derived Paper items', () => {
  const { scope, scene, history, cleanup } = setup();
  try {
    const drawable = (end) => ({ id: 'model-path', kind: 'path', layerId: 'active',
      source: { id: 'source-path', mode: 'bezier', fillRule: 'nonzero', contours: [{ closed: false, segments: [
        { point: { x: 0, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } },
        { point: { x: end, y: 0 }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } },
      ] }] }, transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      opacity: 1, visible: true, locked: false });
    const before = drawable(20); const after = drawable(40);
    const models = new Map([[after.id, structuredClone(after)]]);
    const renderer = new DrawableRenderer(scope, { layerForId: () => scene.layer, scene });
    renderer.render(after);
    const events = [];
    const host = {
      upsertModel(model) { events.push('model'); models.set(model.id, model); },
      removeModel(id) { events.push('remove'); models.delete(id); renderer.remove(id); },
      renderFromModel(id) {
        events.push('render');
        assert.equal(models.get(id).id, id);
        renderer.render(models.get(id));
      },
    };
    history.recordModelChange('Edit path', [before], [after], host);
    history.undo();
    assert.deepEqual(events, ['model', 'render']);
    assert.equal(renderer.getItem(after.id).lastSegment.point.x, 20);
    events.length = 0;
    history.redo();
    assert.deepEqual(events, ['model', 'render']);
    assert.equal(renderer.getItem(after.id).lastSegment.point.x, 40);
    assert.equal(scene.drawableOf(after.id).source.contours[0].segments[1].point.x, 40);
  } finally { cleanup(); }
});
