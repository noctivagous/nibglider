import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { isSceneJson, SCENE_FORMAT, stripSvgClips } from '../src/engine/document/SceneIO.ts';

function engine() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  const e = new NibGliderEngine(s, () => {});
  return {
    s, e, layer: s.project.activeLayer,
    cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); },
  };
}

function depositCircle(s, e) {
  e.mousePt = new s.Point(120, 90);
  e.circleInnerShapeType = 'circle';
  e.circleKC('radius');
  e.pointer.onMouseMove({ point: new s.Point(170, 90) });
  e.endPathOrShape();
}

function hasClipMask(item) {
  if (!item) return false;
  if (item.clipMask) return true;
  return (item.children ?? []).some(hasClipMask);
}

test('exportScene writes Paper JSON without selection, and replaceScene reloads it unselected', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    depositCircle(s, e);
    assert.equal(e.hasContent(), true);
    const drawn = layer.children[0];
    e.addItemToSelection(drawn);
    assert.equal(e.selectedItems.length, 1);

    const json = e.exportScene();
    assert.equal(isSceneJson(json), true);
    assert.ok(json.includes(SCENE_FORMAT));
    assert.equal(json.includes('"selected":true'), false);
    assert.equal(e.selectedItems.length, 1, 'export must not clear the live selection');

    const undoLabel = e.undoLabel();
    e.clearOutSelection();
    const ok = e.replaceScene('Open Untitled', json, { history: false });
    assert.equal(ok, true);
    assert.equal(e.hasContent(), true);
    assert.equal(e.selectedItems.length, 0);
    assert.equal(e.undoLabel(), undoLabel, 'startup restore must not record history');
    const content = layer.children.filter((item) => item.visible !== false);
    assert.ok(content.length >= 1);
    const art = content[0];
    assert.ok(art.bounds.width < 200, 'restored bounds must be the artwork, not the view');
    assert.ok(art.bounds.height < 200);
    assert.equal(hasClipMask(art), false);
  } finally { cleanup(); }
});

test('stripSvgClips removes a viewBox clip-mask and leaves artwork', () => {
  const { s, cleanup } = engine();
  try {
    const clip = new s.Shape.Rectangle(new s.Rectangle(0, 0, 800, 600));
    clip.clipMask = true;
    const path = new s.Path.Circle(new s.Point(40, 40), 12);
    const group = new s.Group([clip, path]);
    stripSvgClips(group);
    assert.equal(group.children.length, 1);
    assert.equal(group.children[0], path);
    assert.equal(hasClipMask(group), false);
    assert.ok(group.bounds.width < 100);
  } finally { cleanup(); }
});

test('replaceScene rejects unknown payloads and accepts JSON', () => {
  const { e, cleanup } = engine();
  try {
    assert.equal(e.replaceScene('Open', 'not a document'), false);
  } finally { cleanup(); }
});
