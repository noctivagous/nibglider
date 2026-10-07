import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  createExportFrame,
  exportPngSize,
  frameMatchesArtwork,
  resolveExportBoxes,
  splitFrameBoxes,
  validateExportFrame,
  ExportFrameValidationError,
} from '../src/engine/model/NGExportFrame.ts';
import { frameArtwork } from '../src/engine/scene/exportFrames.ts';
import { resizedBounds } from '../src/engine/scene/exportFrameHandles.ts';
import { pointsToUnit, unitToPoints } from '../src/engine/document/MeasurementUnits.ts';
import { commandById, KEY_CAPS } from '../src/engine/input/keymap.ts';
import { parseInCanvasXML, resolveInCanvasPlacement } from '../src/ui/inCanvasGui.ts';

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

test('T key no longer owns the export frame', () => {
  assert.equal(commandById('rect-export-frame'), undefined);
  const t = KEY_CAPS.find((cap) => cap.id === 'KeyT');
  assert.ok(t);
  assert.equal(t.commandId, undefined);
});

test('Rect Keys Export Frame shape routes rect-key drags to frame deposit', () => {
  const { s, e, cleanup } = engine();
  try {
    e.setRectangleInnerShapeType('exportFrame');
    e.mousePt = new s.Point(50, 60);
    e.rectDiagonalKC();
    assert.equal(e.shapeType, 'rectangle_export_frame');
    e.pointer.onMouseMove({ point: new s.Point(150, 140) });
    e.rectDiagonalKC();
    assert.equal(e.isDrawingShape, false);
    assert.equal(e.listExportFrames().length, 1);
    assert.deepEqual(e.listExportFrames()[0].rect, { x: 50, y: 60, width: 100, height: 80 });
    assert.equal(e.undoLabel(), 'Deposit export frame');
    // A second rect key finishes an in-progress frame drag too.
    e.mousePt = new s.Point(10, 10);
    e.rectCenterlineKC();
    assert.equal(e.shapeType, 'rectangle_export_frame');
    e.pointer.onMouseMove({ point: new s.Point(60, 50) });
    e.rectTwoEdgesKC();
    assert.equal(e.isDrawingShape, false);
    assert.equal(e.listExportFrames().length, 2);
  } finally { cleanup(); }
});

test('ordinary rect shapes still deposit drawable shapes', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.setRectangleInnerShapeType('rectangle');
    e.mousePt = new s.Point(50, 60);
    e.rectDiagonalKC();
    e.pointer.onMouseMove({ point: new s.Point(150, 140) });
    e.rectDiagonalKC();
    assert.equal(e.listExportFrames().length, 0);
    assert.ok(layer.children.length > 0);
  } finally { cleanup(); }
});

test('resizedBounds anchors at the opposite corner or edge', () => {
  const anchor = { x: 10, y: 20, width: 100, height: 80 };
  assert.deepEqual(resizedBounds('se', anchor, { x: 160, y: 150 }), { x: 10, y: 20, width: 150, height: 130 });
  assert.deepEqual(resizedBounds('nw', anchor, { x: 0, y: 0 }), { x: 0, y: 0, width: 110, height: 100 });
  assert.deepEqual(resizedBounds('e', anchor, { x: 200, y: 999 }), { x: 10, y: 20, width: 190, height: 80 });
  assert.deepEqual(resizedBounds('n', anchor, { x: 999, y: 5 }), { x: 10, y: 5, width: 100, height: 95 });
  // Dragging past the anchor clamps at the minimum size instead of inverting.
  const clamped = resizedBounds('sw', anchor, { x: 500, y: 500 });
  assert.equal(clamped.width, 1);
  assert.equal(clamped.height, 480);
});

test('handle-resize gesture resizes the selected frame with undo', () => {
  const { s, e, cleanup } = engine();
  // Paper rescales bounds with float noise; compare rounded.
  const rounded = (rect) => ({
    x: Math.round(rect.x), y: Math.round(rect.y),
    width: Math.round(rect.width), height: Math.round(rect.height),
  });
  try {
    e.depositExportFrame({ x: 10, y: 20, width: 100, height: 80 });
    const id = e.listExportFrames()[0].id;
    assert.equal(e.frameHandleAt({ x: 110, y: 100 }), 'se');
    assert.equal(e.frameHandleAt({ x: 400, y: 400 }), null);
    e.beginFrameResize('se');
    assert.equal(e.isFrameResizing(), true);
    e.resizeFrameTo(new s.Point(160, 150));
    assert.deepEqual(rounded(e.listExportFrames()[0].rect), { x: 10, y: 20, width: 150, height: 130 });
    e.endFrameResize();
    assert.equal(e.isFrameResizing(), false);
    assert.equal(e.undoLabel(), 'Resize export frame');
    e.undo();
    assert.deepEqual(rounded(e.listExportFrames()[0].rect), { x: 10, y: 20, width: 100, height: 80 });
    e.redo();
    assert.deepEqual(rounded(e.listExportFrames()[0].rect), { x: 10, y: 20, width: 150, height: 130 });
    assert.equal(Math.round(e.getExportFrame(id)?.rect.width ?? 0), 150);
  } finally { cleanup(); }
});

test('no handles without exactly one selected frame', () => {
  const { e, cleanup } = engine();
  try {
    assert.equal(e.frameHandleAt({ x: 0, y: 0 }), null);
    e.depositExportFrame({ x: 0, y: 0, width: 50, height: 50 });
    e.depositExportFrame({ x: 200, y: 200, width: 50, height: 50 });
    assert.equal(e.selectedExportFrame(), null);
    assert.equal(e.frameHandleAt({ x: 250, y: 250 }), null);
    e.beginFrameResize('se');
    assert.equal(e.isFrameResizing(), false);
  } finally { cleanup(); }
});

test('setExportFrameSize resizes about the center with undo', () => {
  const { e, cleanup } = engine();
  try {
    e.depositExportFrame({ x: 10, y: 20, width: 100, height: 80 });
    const id = e.listExportFrames()[0].id;
    assert.equal(e.setExportFrameSize(id, 200, 160), true);
    assert.deepEqual(e.listExportFrames()[0].rect, { x: -40, y: -20, width: 200, height: 160 });
    assert.equal(e.setExportFrameSize(id, 0, 10), false);
    assert.equal(e.setExportFrameSize(id, NaN, 10), false);
    assert.equal(e.setExportFrameSize('missing', 10, 10), false);
    e.undo();
    assert.deepEqual(e.listExportFrames()[0].rect, { x: 10, y: 20, width: 100, height: 80 });
  } finally { cleanup(); }
});

test('frame format accepts svg and png, and png sizes scale at 96dpi', () => {
  const frame = createExportFrame({ x: 0, y: 0, width: 72, height: 36 });
  assert.doesNotThrow(() => validateExportFrame({ ...frame, format: 'png' }));
  assert.throws(() => validateExportFrame({ ...frame, format: 'pdf' }), ExportFrameValidationError);
  assert.deepEqual(exportPngSize({ x: 0, y: 0, width: 72, height: 36 }, 1), { width: 96, height: 48 });
  assert.deepEqual(exportPngSize({ x: 0, y: 0, width: 72, height: 36 }, 2), { width: 192, height: 96 });
  const { e, cleanup } = engine();
  try {
    e.depositExportFrame({ x: 0, y: 0, width: 72, height: 36 });
    const id = e.listExportFrames()[0].id;
    assert.equal(e.updateExportFrame(id, { format: 'png' }), true);
    assert.equal(e.getExportFrame(id)?.format, 'png');
  } finally { cleanup(); }
});

test('dimension units round-trip through the measurement table', () => {
  assert.equal(pointsToUnit(72, 'inch'), 1);
  assert.equal(unitToPoints(1, 'inch'), 72);
  assert.ok(Math.abs(unitToPoints(pointsToUnit(100, 'mm'), 'mm') - 100) < 1e-9);
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
  const fields = parsed.spec.controls.filter((c) => c.kind === 'field').map((c) => c.key);
  assert.ok(fields.includes('width'));
  assert.ok(fields.includes('height'));
  const selects = Object.fromEntries(
    parsed.spec.controls.filter((c) => c.kind === 'select').map((c) => [c.key, c.options.map((o) => o.value)]),
  );
  assert.ok((selects.unit ?? []).includes('inch'));
  assert.ok((selects.unit ?? []).includes('mm'));
  assert.deepEqual(selects.format, ['svg', 'png']);
  const popover = parsed.spec.controls.find((c) => c.kind === 'popover');
  assert.ok(popover && popover.controls.length >= 1);
  assert.deepEqual(parsed.spec.sections.map((s) => s.side), ['top', 'right']);
  assert.equal(parsed.spec.sections[0].label, 'Frame');
  assert.equal(parsed.spec.sections[1].label, 'Export');
  assert.ok('error' in parseInCanvasXML('<window id="x"><toggle key="a" /></window>'));
  assert.ok('error' in parseInCanvasXML('<inCanvas id="x"><mystery /></inCanvas>'));
  assert.ok('error' in parseInCanvasXML(
    '<inCanvas id="x"><popoverButton label="More"><popoverButton label="Inner"><toggle key="a" /></popoverButton></popoverButton></inCanvas>'));
});

test('in-canvas edge sections validate sides and reject bad nesting', () => {
  const ok = parseInCanvasXML(
    '<inCanvas id="x"><edge side="left"><toggle key="a" /></edge><edge side="bottom" label="Base"><toggle key="b" /></edge></inCanvas>');
  assert.ok(!('error' in ok));
  if ('error' in ok) return;
  assert.deepEqual(ok.spec.sections.map((s) => [s.side, s.label]), [['left', 'Left edge'], ['bottom', 'Base']]);
  assert.deepEqual(ok.spec.controls.map((c) => c.key), ['a', 'b']);
  assert.ok('error' in parseInCanvasXML('<inCanvas id="x"><edge><toggle key="a" /></edge></inCanvas>'));
  assert.ok('error' in parseInCanvasXML('<inCanvas id="x"><edge side="up"><toggle key="a" /></edge></inCanvas>'));
  assert.ok('error' in parseInCanvasXML('<inCanvas id="x"><edge side="top"></edge></inCanvas>'));
  assert.ok('error' in parseInCanvasXML(
    '<inCanvas id="x"><edge side="top"><edge side="right"><toggle key="a" /></edge></edge></inCanvas>'));
  assert.ok('error' in parseInCanvasXML(
    '<inCanvas id="x"><popoverButton label="M"><edge side="top"><toggle key="a" /></edge></popoverButton></inCanvas>'));
});

test('bare in-canvas controls fold into an implied top section', () => {
  const parsed = parseInCanvasXML('<inCanvas id="x"><toggle key="a" /><toggle key="b" /></inCanvas>');
  assert.ok(!('error' in parsed));
  if ('error' in parsed) return;
  assert.deepEqual(parsed.spec.sections.map((s) => s.side), ['top']);
  assert.equal(parsed.spec.sections[0].label, 'Top edge');
  assert.deepEqual(parsed.spec.controls.map((c) => c.key), ['a', 'b']);
});

test('in-canvas placement overflows trailing controls to the widget mirror', () => {
  const xml = readFileSync(new URL('../src/ui/inCanvas/exportFrame.xml', import.meta.url), 'utf8');
  const parsed = parseInCanvasXML(xml);
  assert.ok(!('error' in parsed));
  if ('error' in parsed) return;
  const placement = resolveInCanvasPlacement(parsed.spec);
  assert.deepEqual(placement.edge.map((s) => s.side), ['top', 'right']);
  assert.equal(placement.edge[0].controls.length, 4);
  assert.deepEqual(placement.edge[1].controls.map((c) => c.kind), ['select', 'field', 'export']);
  assert.equal(placement.widget.length, 1);
  assert.equal(placement.widget[0].side, 'right');
  assert.equal(placement.widget[0].label, 'Export');
  assert.deepEqual(placement.widget[0].controls.map((c) => c.kind), ['popover']);
  const roomy = resolveInCanvasPlacement(parsed.spec, { top: 8, right: 8, bottom: 8, left: 8 });
  assert.equal(roomy.widget.length, 0);
  assert.equal(roomy.edge.flatMap((s) => s.controls).length, parsed.spec.controls.length);
});
