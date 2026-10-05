import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  createExportFrame,
  frameMatchesArtwork,
  resolveExportBoxes,
  splitFrameBoxes,
  validateExportFrame,
  ExportFrameValidationError,
} from '../src/engine/model/NGExportFrame.ts';
import { frameArtwork } from '../src/engine/scene/exportFrames.ts';
import { parseInCanvasXML } from '../src/ui/inCanvasGui.ts';

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

test('export-frame records validate strictly and resolve a default full-frame box', () => {
  const frame = createExportFrame({ x: 10, y: 20, width: 100, height: 80 });
  assert.deepEqual(resolveExportBoxes(frame), [{ x: 10, y: 20, width: 100, height: 80 }]);
  assert.throws(() => validateExportFrame({ ...frame, sceneItem: {} }), ExportFrameValidationError);
  assert.throws(() => validateExportFrame({ ...frame, boxes: [{ x: 0, y: 0, width: 2, height: 1 }] }), ExportFrameValidationError);
  assert.throws(() => validateExportFrame({ ...frame, scale: 0 }), ExportFrameValidationError);
  assert.throws(() => validateExportFrame({ ...frame, background: 'red' }), ExportFrameValidationError);
  assert.doesNotThrow(() => validateExportFrame({ ...frame, background: '#ffffff' }));
});

test('splitFrameBoxes tiles the unit frame without gaps', () => {
  assert.deepEqual(splitFrameBoxes(1), [{ x: 0, y: 0, width: 1, height: 1 }]);
  const boxes = splitFrameBoxes(4);
  assert.equal(boxes.length, 4);
  const area = boxes.reduce((sum, b) => sum + b.width * b.height, 0);
  assert.equal(area, 1);
  const frame = { ...createExportFrame({ x: 0, y: 0, width: 200, height: 100 }), boxes };
  const resolved = resolveExportBoxes(frame);
  assert.equal(resolved.length, 4);
  assert.ok(resolved.every((b) => b.width === 100 && b.height === 50));
  assert.throws(() => splitFrameBoxes(0), ExportFrameValidationError);
});

test('frame matching covers contained and intersecting artwork, never disjoint', () => {
  const frame = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(frameMatchesArtwork(frame, { x: 10, y: 10, width: 20, height: 20 }), true);
  assert.equal(frameMatchesArtwork(frame, { x: 90, y: 90, width: 50, height: 50 }), true);
  assert.equal(frameMatchesArtwork(frame, { x: 200, y: 200, width: 10, height: 10 }), false);
  assert.equal(frameMatchesArtwork(frame, { x: 100, y: 0, width: 10, height: 10 }), false);
});

test('deposit, select, update, and delete manage the frame lifecycle with undo', () => {
  const { e, layer, cleanup } = engine();
  try {
    assert.equal(e.depositExportFrame({ x: 0, y: 0, width: 0, height: 10 }), null);
    const placed = e.depositExportFrame({ x: 10, y: 10, width: 100, height: 80 });
    assert.ok(placed);
    assert.equal(e.listExportFrames().length, 1);
    assert.equal(e.selectedExportFrame()?.id, e.listExportFrames()[0].id);
    const id = e.listExportFrames()[0].id;
    assert.equal(e.updateExportFrame(id, { name: '' }), false);
    assert.equal(e.updateExportFrame(id, { name: 'Icons', scale: 2 }), true);
    assert.equal(e.getExportFrame(id)?.name, 'Icons');
    assert.equal(e.updateExportFrame('missing', { name: 'x' }), false);
    e.undo();
    assert.equal(e.listExportFrames().length, 0);
    e.redo();
    assert.equal(e.listExportFrames().length, 1);
    assert.equal(e.deleteExportFrame(id), true);
    assert.equal(e.listExportFrames().length, 0);
    assert.equal(layer.children.length, 0);
  } finally { cleanup(); }
});

test('frame export crops to the box viewBox and never clips live artwork', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    depositCircle(s, e);
    const art = layer.children[0];
    const before = art.bounds.clone();
    e.depositExportFrame({ x: 100, y: 70, width: 60, height: 60 });
    const id = e.listExportFrames()[0].id;
    assert.equal(e.exportFrameArtworkCount(id), 1);
    assert.deepEqual(e.exportFrameBoxes(id), [{ x: 100, y: 70, width: 60, height: 60 }]);
    assert.equal(e.setExportFrameBoxCount(id, 2), true);
    assert.deepEqual(e.exportFrameBoxes(id), [
      { x: 100, y: 70, width: 30, height: 60 },
      { x: 130, y: 70, width: 30, height: 60 },
    ]);
    // The SVG serializer needs DOM (like exportSceneSVG): null headless,
    // one cropped SVG per box in the browser. Either way the live scene
    // must come back intact, with frames unhidden and selection kept.
    const selectedBefore = e.selectedItems.length;
    const exported = e.exportFrameSVG(id);
    assert.ok(exported === null || (exported.length === 2
      && exported.every((entry) => entry.svg.includes('viewBox='))));
    if (exported) assert.ok(exported[0].svg.includes('viewBox="100 70 30 60"'));
    // Live artwork is untouched: still present, same bounds, no clip mask.
    assert.equal(layer.children.includes(art), true);
    assert.deepEqual([art.bounds.x, art.bounds.y, art.bounds.width, art.bounds.height],
      [before.x, before.y, before.width, before.height]);
    const hasClip = (item) => item.clipMask || (item.children ?? []).some(hasClip);
    assert.equal(hasClip(art), false);
    assert.notEqual(e.exportFrameItems()[0].visible, false);
    assert.equal(e.selectedItems.length, selectedBefore);
    assert.equal(e.exportFrameBoxes('missing'), null);
    assert.equal(e.exportFrameSVG('missing'), null);
  } finally { cleanup(); }
});

test('frameArtwork excludes frames and disjoint artwork', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    depositCircle(s, e);
    e.depositExportFrame({ x: 0, y: 0, width: 10, height: 10 });
    e.clearOutSelection();
    e.depositExportFrame({ x: 100, y: 70, width: 60, height: 60 });
    const frames = e.listExportFrames();
    assert.equal(frames.length, 2);
    assert.equal(frameArtwork(frames[0], [...layer.children]).length, 0);
    assert.equal(frameArtwork(frames[1], [...layer.children]).length, 1);
  } finally { cleanup(); }
});

test('frames persist through native save and reload as frames', () => {
  const { e, cleanup } = engine();
  try {
    e.depositExportFrame({ x: 10, y: 10, width: 100, height: 80 }, { name: 'Icons' });
    const id = e.listExportFrames()[0].id;
    e.setExportFrameBoxCount(id, 2);
    const json = e.exportScene();
    assert.ok(e.replaceScene('Open', json, { history: false }));
    const restored = e.listExportFrames();
    assert.equal(restored.length, 1);
    assert.equal(restored[0].name, 'Icons');
    assert.equal(restored[0].boxes.length, 2);
    assert.equal(e.exportFrameBoxes(restored[0].id)?.length, 2);
  } finally { cleanup(); }
});

test('rect-key T drag deposits a frame on second press', () => {
  const { s, e, cleanup } = engine();
  try {
    e.mousePt = new s.Point(50, 60);
    e.exportFrameKC();
    assert.equal(e.shapeType, 'rectangle_export_frame');
    e.pointer.onMouseMove({ point: new s.Point(150, 140) });
    e.exportFrameKC();
    assert.equal(e.isDrawingShape, false);
    assert.equal(e.listExportFrames().length, 1);
    assert.deepEqual(e.listExportFrames()[0].rect, { x: 50, y: 60, width: 100, height: 80 });
    assert.equal(e.undoLabel(), 'Deposit export frame');
  } finally { cleanup(); }
});

test('export-frame XML defines inline controls plus a popover, and rejects bad definitions', () => {
  const xml = readFileSync(new URL('../src/ui/inCanvas/exportFrame.xml', import.meta.url), 'utf8');
  const parsed = parseInCanvasXML(xml);
  assert.ok(!('error' in parsed));
  if ('error' in parsed) return;
  assert.equal(parsed.spec.id, 'exportFrame');
  const kinds = parsed.spec.controls.map((c) => c.kind);
  assert.ok(kinds.includes('export'));
  assert.ok(kinds.includes('popover'));
  const popover = parsed.spec.controls.find((c) => c.kind === 'popover');
  assert.ok(popover && popover.controls.length >= 1);
  assert.ok('error' in parseInCanvasXML('<window id="x"><toggle key="a" /></window>'));
  assert.ok('error' in parseInCanvasXML('<inCanvas id="x"><mystery /></inCanvas>'));
  assert.ok('error' in parseInCanvasXML(
    '<inCanvas id="x"><popoverButton label="More"><popoverButton label="Inner"><toggle key="a" /></popoverButton></popoverButton></inCanvas>'));
});
