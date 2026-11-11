import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { sampleBSpline, distance } from '../src/engine/geometry/splineInterpolation.ts';
import { bowPeakPoints, expandCompositePoints, resolveCompositePath } from '../src/engine/geometry/compositeExpansion.ts';
import { sampleCircleThrough3 } from '../src/engine/geometry/splineInterpolation.ts';
import { DEFAULT_BOWED_PARAMS } from '../src/engine/model/NGPath.ts';
import { PathDrawingSession } from '../src/engine/drawing/PathDrawingSession.ts';
import { PathTool } from '../src/engine/drawing/PathTool.ts';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { serializeDrawable, deserializeDrawable, validatePath } from '../src/engine/model/serialization.ts';
import { resolveKeyboardLayout, resolveKeyVariants } from '../src/engine/input/KeyboardLayoutResolver.ts';
import {
  KEYBOARD_LAYOUTS, KEY_COMMANDS, KEY_VARIANTS, KEY_VARIANTS_BY_LAYOUT, KEY_CAPS, capsForLayout,
  commandById, keyboardLayoutById, keyVariantsForLayout,
} from '../src/engine/input/keymap.ts';

const activeLayout = (state) => state.activeLayoutId ?? 'base';
const layoutLabel = (state) => keyboardLayoutById(state.activeLayoutId).label;
import { BASE_MODIFIERS } from '../src/engine/input/ModifierStateTracker.ts';

const savedRequest = globalThis.requestAnimationFrame;
const savedCancel = globalThis.cancelAnimationFrame;
let nextFrame = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
after(() => { globalThis.requestAnimationFrame = savedRequest; globalThis.cancelAnimationFrame = savedCancel; });
function tick() { const work = [...frames.values()]; frames.clear(); work.forEach((callback) => callback()); }
function scope() { const s = new paper.PaperScope(); s.setup(new s.Size(800, 600)); return s; }
function engine() {
  const s = scope(); const e = new NibGliderEngine(s, () => {});
  e.setPathDrawingMode('ngComposite'); e.depositPointMode = 0;
  return { s, e, layer: s.project.activeLayer, cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); } };
}
const point = (id, x, y, kind = 'bSpline', outgoing) => ({ id, x, y, kind, ...(outgoing ? { outgoing: { kind: outgoing } } : {}) });
const path = (points, closed = false) => ({ id: 'fixture', mode: 'ngComposite', points, closed });
function draw(e, s, closed = false) {
  e.mousePt = new s.Point(10, 10); e.polyLineKC();
  e.mousePt = new s.Point(140, 10); e.polyLineKC();
  e.mousePt = new s.Point(140, 140);
  e.pointer.onMouseMove({ point: e.mousePt });
  if (closed) e.completeShapeWithSpline(); else e.endPathOrShape();
}
function distinct(geometry) {
  const points = geometry.segments.map((s) => s.point);
  for (let i = 1; i < points.length; i++) assert.ok(distance(points[i - 1], points[i]) > 1e-9);
  if (geometry.closed && points.length > 1) assert.ok(distance(points[0], points[points.length - 1]) > 1e-9);
  assert.ok(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
}

test('clamped splines interpolate endpoints, preserve repeated-control cusps, and adapt sample density', () => {
  const controls = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  const samples = sampleBSpline(controls);
  assert.deepEqual(samples[0], controls[0]); assert.deepEqual(samples.at(-1), controls.at(-1));
  const corner = samples.findIndex((p) => distance(p, controls[1]) < 1e-9);
  assert.ok(corner > 0 && corner < samples.length - 1);
  assert.equal(samples[corner - 1].y, 0); assert.equal(samples[corner + 1].x, 100);
  const smooth = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: -100 }, { x: 100, y: 0 }];
  const coarse = sampleBSpline(smooth, false, { tolerance: 2 });
  const fine = sampleBSpline(smooth, false, { tolerance: 0.1 });
  assert.ok(fine.length > coarse.length);
  assert.throws(() => sampleBSpline(smooth, false, { tolerance: 0 }));
});

test('expansion uses one spline control, three hard controls, and two radius-free rounded controls', () => {
  const source = path([point('a', 0, 0), point('b', 100, 0, 'hardCorner'), point('c', 100, 100, 'roundedCorner')]);
  const before = structuredClone(source);
  const commands = expandCompositePoints(source);
  const controls = commands[0].points;
  assert.equal(controls.filter((p) => p.x === 0 && p.y === 0).length, 1);
  assert.equal(controls.filter((p) => p.x === 100 && p.y === 0).length, 3);
  assert.equal(controls.filter((p) => p.x === 100 && p.y === 100).length, 2);
  assert.deepEqual(source, before);
});

test('explicit lines stay exact and closed sharp paths have no redundant seam or zero-length segments', () => {
  const source = path([point('a', 0, 0, 'hardCorner', 'line'), point('b', 100, 0, 'hardCorner', 'line'), point('c', 100, 100, 'hardCorner', 'line')], true);
  const geometry = resolveCompositePath(source);
  assert.deepEqual(geometry.segments.map((s) => s.point), [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  distinct(geometry);
});

test('rounded radius produces tangent arc endpoints, clamps long trims, and supports bevel/B-spline rounding', () => {
  for (const rounding of ['arc', 'bevel', 'bSpline']) {
    const corner = { ...point('b', 100, 0, 'roundedCorner', 'line'), corner: { rounding, radius: 12 } };
    const source = path([point('a', 0, 0, 'hardCorner', 'line'), corner, point('c', 100, 100, 'hardCorner', 'line')]);
    const geometry = resolveCompositePath(source, { tolerance: 0.1 });
    const points = geometry.segments.map((s) => s.point);
    assert.ok(points.some((p) => distance(p, { x: 88, y: 0 }) < 1e-8));
    assert.ok(points.some((p) => distance(p, { x: 100, y: 12 }) < 1e-8));
    assert.equal(corner.corner.radius, 12);
    distinct(geometry);
    corner.corner.radius = 1000;
    const commands = expandCompositePoints(source);
    assert.ok(commands.some((c) => c.kind === 'line' && distance(c.to, { x: 50, y: 0 }) < 1e-8));
  }
});

test('periodic curves close smoothly and repeated/coincident input produces finite distinct output', () => {
  const source = path([point('a', 0, 0), point('b', 100, 0), point('c', 100, 100), point('d', 0, 100)], true);
  const geometry = resolveCompositePath(source, { tolerance: 0.05 });
  assert.equal(expandCompositePoints(source)[0].closed, true);
  assert.ok(geometry.segments.length > 8); distinct(geometry);
  const samples = sampleBSpline(Array.from({ length: 6 }, () => ({ x: 10, y: 20 })));
  assert.deepEqual(samples, [{ x: 10, y: 20 }]);
});

test('semantic session commits/retypes prior point, retains trailing identity, and eliminates a duplicate final point', () => {
  const session = new PathDrawingSession('session', { x: 0, y: 0 }, 'bSpline');
  const firstTrailing = session.trailingPointId;
  session.move({ x: 100, y: 0 });
  assert.equal(session.trailingPointId, firstTrailing);
  session.commit('hardCorner', { x: 100, y: 0 });
  assert.deepEqual(session.snapBase, { x: 100, y: 0 });
  const snapshot = session.snapshot();
  assert.equal(snapshot.points[0].kind, 'hardCorner');
  assert.equal(snapshot.points.length, 2);
  snapshot.points[0].x = 999;
  assert.equal(session.origin.x, 0);
  session.commit('roundedCorner', { x: 100, y: 100 });
  session.setCornerRadius(20);
  assert.equal(session.snapshot().points[1].corner.radius, 20);
  session.move({ x: 0, y: 0 });
  assert.equal(session.snapshot(true).points.length, 3);
});

test('live scale/rotation changes semantic data, keeps origin stable, and rejects invalid input', () => {
  const session = new PathDrawingSession('session', { x: 10, y: 10 }, 'roundedCorner');
  session.commit('roundedCorner', { x: 110, y: 10 });
  session.move({ x: 110, y: 110 });
  session.scale(2); session.rotate(90);
  assert.deepEqual(session.origin, { x: 10, y: 10 });
  const source = session.snapshot();
  assert.ok(distance(source.points[1], { x: 10, y: 210 }) < 1e-8);
  assert.equal(source.points[0].corner.radius, 24);
  assert.throws(() => session.move({ x: NaN, y: 0 }));
  assert.throws(() => session.scale(0));
});

test('preview coalesces pointer updates into one frame, supports stamp without ending, and cancels frames/items', () => {
  const s = scope(); let renders = 0;
  const tool = new PathTool(s, (item) => { renders++; if (!item.parent) s.project.activeLayer.addChild(item); });
  try {
    const before = frames.size;
    tool.point('bSpline', { x: 0, y: 0 });
    for (let i = 1; i <= 20; i++) tool.move({ x: i * 5, y: i * 2 });
    assert.equal(frames.size, before + 1);
    assert.equal(renders, 0); tick(); assert.equal(renders, 1);
    const stamped = tool.stamp(false);
    assert.ok(stamped); assert.equal(tool.active, true);
    assert.equal(stamped.item.parent, null);
    const final = tool.finish(false);
    assert.ok(final); assert.equal(tool.active, false);
    assert.equal(s.project.activeLayer.children.length, 0);
    tool.point('hardCorner', { x: 0, y: 0 }); tool.cancel();
    tick(); assert.equal(s.project.activeLayer.children.length, 0);
  } finally { tool.cancel(); s.project.remove(); }
});

test('engine deposit and undo/redo restore scene plus serializable composite identity in one step', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    draw(e, s);
    assert.equal(layer.children.length, 1); assert.equal(e.isDrawingPath, false);
    const item = layer.children[0]; const id = item.data.drawableId;
    const retained = e.getRetainedPathDrawable(id);
    assert.equal(retained.source.mode, 'ngComposite');
    assert.deepEqual(deserializeDrawable(serializeDrawable(retained)), retained);
    assert.equal(e.undoLabel(), 'Deposit composite path');
    e.undo(); assert.equal(layer.children.length, 0); assert.equal(e.canUndo(), false);
    assert.equal(e.getRetainedPathDrawable(id), null);
    e.redo(); assert.equal(layer.children.length, 1);
    assert.deepEqual(e.getRetainedPathDrawable(id), retained);
    assert.equal(e.canRedo(), false);
  } finally { cleanup(); }
});

test('explicit close and own-start auto-close retain closed semantic paths with no duplicate seam', () => {
  for (const ownStart of [false, true]) {
    const { s, e, layer, cleanup } = engine();
    try {
      if (!ownStart) draw(e, s, true);
      else {
        e.depositPointMode = 1;
        e.mousePt = new s.Point(10, 10); e.polyLineKC();
        e.mousePt = new s.Point(140, 10); e.polyLineKC();
        e.mousePt = new s.Point(140, 140); e.polyLineKC();
        e.pointer.onMouseMove({ point: new s.Point(12, 12) });
        e.endPathOrShape();
      }
      assert.equal(layer.children.length, 1);
      const item = layer.children[0];
      const model = e.getRetainedPathDrawable(item.data.drawableId);
      assert.equal(item.closed, true); assert.equal(model.source.closed, true);
      assert.equal(model.source.points.length, 3);
      distinct(resolveCompositePath(model.source));
      e.undo(); assert.equal(layer.children.length, 0);
      e.redo(); assert.equal(layer.children.length, 1);
    } finally { cleanup(); }
  }
});

test('engine pointer snapping reaches semantic trailing coordinates and frame previews are excluded from selection/history', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.isGridEnabled = true; e.isGridSnappingEnabled = true; e.gridSpacing = 20;
    e.mousePt = new s.Point(0, 0); e.splinePointKC();
    e.pointer.onMouseMove({ point: new s.Point(43, 58) });
    tick();
    assert.equal(layer.children.length, 1);
    assert.equal(layer.children[0].data.isPathPreview, true);
    assert.equal(e.canUndo(), false);
    e.pointer.hitTestUnderCursor(); assert.equal(e.selectedItems.length, 0);
    e.endPathOrShape();
    const model = e.getRetainedPathDrawable(layer.children[0].data.drawableId);
    assert.deepEqual({ x: model.source.points.at(-1).x, y: model.source.points.at(-1).y }, { x: 40, y: 60 });
  } finally { cleanup(); }
});

test('cancel and detach discard preview/session without a deposit or pending frame', () => {
  for (const operation of ['cancelCurrentDrawingOperation', 'detach']) {
    const { s, e, layer, cleanup } = engine();
    try {
      e.mousePt = new s.Point(10, 10); e.splinePointKC(); tick();
      e.mousePt = new s.Point(100, 100); e.compositePathTool.move(e.mousePt);
      e[operation](); tick();
      assert.equal(layer.children.length, 0); assert.equal(e.path, null);
      assert.equal(e.isDrawingPath, false); assert.equal(e.canUndo(), false);
    } finally { cleanup(); }
  }
});

test('stamp keeps session alive, owns a fresh identity, and has its own undo step', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.mousePt = new s.Point(10, 10); e.polyLineKC();
    e.mousePt = new s.Point(140, 10); e.compositePathTool.move(e.mousePt);
    e.stampCurrentPreview();
    assert.equal(e.isDrawingPath, true); assert.equal(e.undoLabel(), 'Stamp');
    const first = layer.children.find((item) => !item.data.isPathPreview);
    e.mousePt = new s.Point(140, 140); e.compositePathTool.move(e.mousePt); e.endPathOrShape();
    assert.equal(layer.children.length, 2);
    assert.notEqual(layer.children[1].data.drawableId, first.data.drawableId);
    e.undo(); assert.equal(layer.children.length, 1);
    e.undo(); assert.equal(layer.children.length, 0);
    e.redo(); e.redo(); assert.equal(layer.children.length, 2);
  } finally { cleanup(); }
});

test('endpoint join deliberately lowers to Bézier and undo restores the untouched operand', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const target = new s.Path({ segments: [[0, 0], [100, 0]], strokeColor: 'black' });
    const original = target.segments.map((seg) => ({ x: seg.point.x, y: seg.point.y }));
    e.depositPointMode = 1;
    e.mousePt = new s.Point(200, 100); e.polyLineKC();
    e.mousePt = new s.Point(100, 0); e.compositePathTool.move(e.mousePt); e.endPathOrShape();
    assert.equal(layer.children.length, 1); assert.equal(target.parent, null);
    const result = layer.children[0];
    assert.equal(e.getRetainedPathDrawable(result.data.drawableId).source.mode, 'bezier');
    e.undo(); assert.equal(layer.children[0], target);
    assert.deepEqual(target.segments.map((seg) => ({ x: seg.point.x, y: seg.point.y })), original);
    e.redo(); assert.equal(layer.children[0], result);
  } finally { cleanup(); }
});

test('joining either drawing endpoint to either curved target endpoint preserves target handles', () => {
  for (const atStart of [false, true]) for (const drawingEnd of [false, true]) {
    const { s, e, layer, cleanup } = engine();
    try {
      const target = new s.Path({ segments: [
        new s.Segment([0, 0], [0, 0], [20, 40]),
        new s.Segment([100, 0], [-20, 40], [0, 0]),
      ], strokeColor: 'black' });
      const joint = new s.Point(atStart ? 0 : 100, 0);
      const free = new s.Point(200, 100);
      e.depositPointMode = 1;
      e.mousePt = drawingEnd ? free : joint; e.polyLineKC();
      e.mousePt = drawingEnd ? joint : free;
      e.compositePathTool.move(e.mousePt); e.endPathOrShape();
      const result = layer.children[0];
      const first = result.segments.find((seg) => seg.point.equals(new s.Point(0, 0)));
      const last = result.segments.find((seg) => seg.point.equals(new s.Point(100, 0)));
      assert.deepEqual([first.handleOut.x, first.handleOut.y], [20, 40]);
      assert.deepEqual([last.handleIn.x, last.handleIn.y], [-20, 40]);
      e.undo(); assert.equal(layer.children[0], target);
      assert.deepEqual([target.firstSegment.handleOut.x, target.firstSegment.handleOut.y], [20, 40]);
      assert.deepEqual([target.lastSegment.handleIn.x, target.lastSegment.handleIn.y], [-20, 40]);
      e.redo(); assert.equal(layer.children[0], result);
    } finally { cleanup(); }
  }
});

test('union and subtract lower boolean results, retain compound holes, and restore operand/source on undo', () => {
  for (const mode of ['union', 'subtract']) {
    const { s, e, layer, cleanup } = engine();
    try {
      const target = new s.Path.Rectangle({ from: [0, 0], to: [200, 200], fillColor: 'black' });
      e.combineMode = mode; draw(e, s, true);
      assert.equal(layer.children.length, 1); assert.equal(target.parent, null);
      const result = layer.children[0]; const id = result.data.drawableId;
      const model = e.getRetainedPathDrawable(id);
      assert.equal(model.source.mode, 'bezier');
      assert.deepEqual(deserializeDrawable(serializeDrawable(model)), model);
      if (mode === 'subtract') {
        assert.equal(result.className, 'CompoundPath');
        assert.equal(model.source.contours.length, 2);
        assert.equal(result.contains(new s.Point(100, 50)), false);
        assert.equal(result.contains(new s.Point(180, 180)), true);
      }
      e.undo(); assert.equal(layer.children[0], target);
      assert.equal(e.getRetainedPathDrawable(id), null);
      e.redo(); assert.equal(layer.children[0], result);
      assert.deepEqual(e.getRetainedPathDrawable(id), model);
    } finally { cleanup(); }
  }
});

test('transformed paths snap in project coordinates and scene transforms preserve source intent', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    draw(e, s);
    const item = layer.children[0]; const id = item.data.drawableId;
    const source = e.getRetainedPathDrawable(id).source;
    item.translate(new s.Point(100, 50));
    assert.deepEqual(e.getRetainedPathDrawable(id).source, source);
    const target = item.localToGlobal(item.firstSegment.point);
    e.isPointSnappingEnabled = true;
    e.mousePt = new s.Point(target.x + 3, target.y + 2);
    e.applyPointSnapping(e.mousePt);
    assert.ok(e.mousePt.getDistance(target) < 1e-9);
    e.isPointSnappingEnabled = false; e.isPathSnappingEnabled = true;
    const middle = item.localToGlobal(item.curves[0].getPointAt(item.curves[0].length / 2));
    e.mousePt = new s.Point(middle.x, middle.y + 2);
    e.applyPathSnapping(e.mousePt);
    assert.ok(e.mousePt.getDistance(middle) < 1e-9);
    item.segments[1].point.x += 20;
    assert.equal(e.getRetainedPathDrawable(id).source.mode, 'bezier');
    item.segments[1].point.x -= 20;
    assert.equal(e.getRetainedPathDrawable(id).source.mode, 'ngComposite');
  } finally { cleanup(); }
});

test('zoom changes preview density, while final geometry is stable and long spline runs remain finite', () => {
  const s = scope();
  const tool = new PathTool(s, (item) => { if (!item.parent) s.project.activeLayer.addChild(item); });
  try {
    tool.point('bSpline', { x: 0, y: 0 });
    tool.point('bSpline', { x: 50, y: 150 });
    tool.point('bSpline', { x: 120, y: -100 });
    tool.move({ x: 200, y: 0 });
    s.view.zoom = 0.5; tick(); const coarse = tool.preview.segments.length;
    const final = tool.stamp(false).item.pathData;
    s.view.zoom = 4; tool.move({ x: 200, y: 0 }); tick();
    assert.ok(tool.preview.segments.length > coarse);
    assert.equal(tool.stamp(false).item.pathData, final);
    const controls = Array.from({ length: 1000 }, (_, i) => ({ x: i * 2, y: 20 * Math.sin(i / 10) }));
    const samples = sampleBSpline(controls);
    assert.ok(samples.length >= 998); assert.ok(samples.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  } finally { tool.cancel(); s.project.remove(); }
});

test('duplicate and selection stamp give retained paths independent identities across full undo/redo', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    draw(e, s);
    const original = layer.children[0]; e.addItemToSelection(original); e.duplicateSelection();
    const copy = e.selectedItems[0]; const copyId = copy.data.drawableId;
    assert.notEqual(copyId, original.data.drawableId);
    assert.equal(e.getRetainedPathDrawable(copyId).source.mode, 'ngComposite');
    e.stampItems([copy]); const stamped = layer.children.at(-1); const stampId = stamped.data.drawableId;
    assert.notEqual(stampId, copyId); assert.ok(e.getRetainedPathDrawable(stampId));
    e.undo(); e.undo(); e.undo(); assert.equal(layer.children.length, 0);
    e.redo(); e.redo(); e.redo();
    assert.equal(layer.children.length, 3);
    assert.ok(e.getRetainedPathDrawable(copyId)); assert.ok(e.getRetainedPathDrawable(stampId));
  } finally { cleanup(); }
});

test('keymap exposes rounded points only for composite mode and keeps legacy tension commands distinct', () => {
  const { s, e, cleanup } = engine();
  try {
    let layout = resolveKeyboardLayout(BASE_MODIFIERS, 'other', e.getKeyState());
    assert.equal(layout.find((cap) => cap.id === 'KeyH').commandId, 'rounded-point');
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    e.setPathDrawingMode('legacy'); assert.equal(e.pathDrawingMode, 'ngComposite');
    layout = resolveKeyboardLayout(BASE_MODIFIERS, 'other', e.getKeyState());
    // The spline board keeps the session keys live while drawing.
    assert.equal(layout.find((cap) => cap.id === 'KeyB').commandId, 'bowed-point');
    assert.equal(layout.find((cap) => cap.id === 'KeyB').available, true);
    e.cancelCurrentDrawingOperation(); e.setPathDrawingMode('legacy');
    layout = resolveKeyboardLayout(BASE_MODIFIERS, 'other', e.getKeyState());
    assert.equal(layout.find((cap) => cap.id === 'KeyH').available, false);
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    assert.equal(e.path.data.isPathPreview, undefined);
  } finally { cleanup(); }
});

test('spline layout swaps in while a composite session is live and restores after', () => {
  const { s, e, cleanup } = engine();
  const press = (code, k) => ({
    code, key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
    target: null, getModifierState: () => false, preventDefault: () => {},
  });
  try {
    // Legacy idle: the base board, byte-identical to today's board.
    e.setPathDrawingMode('legacy');
    assert.equal(activeLayout(e.getKeyState()), 'base');
    assert.equal(layoutLabel(e.getKeyState()), 'Base');
    assert.deepEqual(
      resolveKeyVariants('KeyG', BASE_MODIFIERS, e.getKeyState()).map((v) => v.commandId),
      ['spline-point'],
    );
    // A live composite session swaps to the spline layout even in legacy mode.
    e.mousePt = new s.Point(10, 10);
    e.compositePathTool.point('hardCorner', { x: 10, y: 10 });
    const live = e.getKeyState();
    assert.equal(live.activeLayoutId, 'spline');
    assert.equal(activeLayout(live), 'spline');
    assert.equal(layoutLabel(live), 'Spline');
    const caps = resolveKeyboardLayout(BASE_MODIFIERS, 'other', live);
    assert.equal(caps.find((cap) => cap.id === 'KeyG').commandId, 'spline-point');
    assert.equal(caps.find((cap) => cap.id === 'KeyF').commandId, 'sharp-point');
    // Typing suppresses every layout.
    assert.deepEqual(resolveKeyVariants('KeyG', BASE_MODIFIERS, { ...live, isTypingText: true }), []);
    // Cancel ends the driven session and restores the base board.
    e.compositePathTool.cancel();
    assert.equal(activeLayout(e.getKeyState()), 'base');
    // Physical dispatch through the controller deposits on the spline board...
    e.setPathDrawingMode('ngComposite');
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    e.mousePt = new s.Point(140, 10);
    e.handleKeyDown(press('KeyG', 'g'));
    assert.equal(e.getKeyState().activeLayoutId, 'spline');
    // ...and End finishes the session (the composite-mode board stays spline).
    e.handleKeyDown(press('KeyA', 'a'));
    assert.equal(e.isDrawingPath, false);
    assert.equal(activeLayout(e.getKeyState()), 'spline');
    // The cancel path ends sessions too.
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    assert.equal(activeLayout(e.getKeyState()), 'spline');
    e.handleKeyDown(press('KeyQ', 'q'));
    assert.equal(activeLayout(e.getKeyState()), 'spline');
    // Resolving through the other layout never mutates a live session.
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    resolveKeyboardLayout(BASE_MODIFIERS, 'other', { ...e.getKeyState(), activeLayoutId: 'base' });
    resolveKeyVariants('KeyG', BASE_MODIFIERS, { ...e.getKeyState(), activeLayoutId: 'base' });
    assert.equal(e.isDrawingPath, true);
    assert.equal(activeLayout(e.getKeyState()), 'spline');
  } finally { cleanup(); }
});

const bowedPoint = (id, x, y, corner, bow) => ({
  id, x, y, kind: corner, outgoing: { kind: 'bowedLine', bow: { ...DEFAULT_BOWED_PARAMS, ...bow } },
});
const arcPath = (pts, closed = false) => ({ id: 'arc-fixture', mode: 'ngComposite', points: pts, closed });

test('bowed peaks offset to the facing side and flip with facing', () => {
  const chord = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const peakA = bowPeakPoints(...chord, { ...DEFAULT_BOWED_PARAMS, facing: 'A' });
  const peakB = bowPeakPoints(...chord, { ...DEFAULT_BOWED_PARAMS, facing: 'B' });
  assert.equal(peakA.length, 1);
  // Default 10% of a 100pt chord, A faces -90deg (below), B +90deg (above).
  assert.deepEqual(peakA[0], { x: 50, y: -10 });
  assert.deepEqual(peakB[0], { x: 50, y: 10 });
  for (const facing of ['A', 'B']) {
    const source = path([bowedPoint('p1', 0, 0, 'hardCorner', { facing }), point('p2', 100, 0)]);
    const geometry = resolveCompositePath(source);
    const extreme = facing === 'A'
      ? Math.min(...geometry.segments.map((s) => s.point.y))
      : Math.max(...geometry.segments.map((s) => s.point.y));
    // The peak resolves as an exact quadratic through the peak point,
    // so the run reaches the full 10% amplitude, not halfway.
    assert.ok(Math.abs(extreme) > 3, `facing ${facing} bows off the chord`);
    assert.ok(Math.abs(Math.abs(extreme) - 10) < 1, `facing ${facing} peaks near 10pt`);
    distinct(geometry);
  }
});

test('bowed amplitude honors percent versus absolute units', () => {
  const percent = bowPeakPoints({ x: 0, y: 0 }, { x: 200, y: 0 }, { ...DEFAULT_BOWED_PARAMS, amplitude: 10 });
  const absolute = bowPeakPoints({ x: 0, y: 0 }, { x: 200, y: 0 }, { ...DEFAULT_BOWED_PARAMS, amplitude: 10, amplitudeIsPercent: false });
  assert.equal(Math.abs(percent[0].y), 20);
  assert.equal(Math.abs(absolute[0].y), 10);
  // Peak base tracks peakLocation x multiplier along the chord.
  const shifted = bowPeakPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, { ...DEFAULT_BOWED_PARAMS, peakLocation: 0.25, peakLocationMultiplier: 2 });
  assert.deepEqual(shifted[0], { x: 50, y: -10 });
});

test('dual peaks straddle and cornered apexes repeat the peak', () => {
  const chord = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const base = { ...DEFAULT_BOWED_PARAMS, dualDistance: 0.4 };
  assert.equal(bowPeakPoints(...chord, base).length, 2);
  assert.equal(bowPeakPoints(...chord, { ...base, corneredApex: 'rounded' }).length, 4);
  assert.equal(bowPeakPoints(...chord, { ...base, corneredApex: 'hard' }).length, 6);
  assert.equal(bowPeakPoints(...chord, { ...DEFAULT_BOWED_PARAMS, corneredApex: 'hard' }).length, 3);
  const [low, high] = bowPeakPoints(...chord, base);
  assert.ok(low.x < 50 && high.x > 50);
  assert.equal(low.x + high.x, 100);
  assert.equal(low.y, high.y);
  // Structure survives expansion: the dual peaks resolve as two exact
  // quadratics (cubics) through both peaks with the saddle between them.
  const source = path([bowedPoint('p1', 0, 0, 'hardCorner', { dualDistance: 0.4 }), point('p2', 100, 0)]);
  const cubics = expandCompositePoints(source).filter((c) => c.kind === 'cubic');
  assert.equal(cubics.length, 2);
  assert.deepEqual(cubics[0].from, { x: 0, y: 0 });
  assert.deepEqual(cubics[1].to, { x: 100, y: 0 });
  const dualGeometry = resolveCompositePath(source);
  distinct(dualGeometry);
  const dualLow = Math.min(...dualGeometry.segments.map((s) => s.point.y));
  // The chained saddle dips just past the peaks; depth must clearly
  // clear the chord while staying bounded.
  assert.ok(dualLow < -9 && dualLow > -13, `dual peaks reach depth (got ${dualLow})`);
});

test('three-point arcs stay on their circle; collinear triples fall back to a line', () => {
  const arc = sampleCircleThrough3({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 });
  assert.ok(arc.length > 2);
  for (const p of arc) {
    assert.ok(Math.abs(Math.hypot(p.x - 1, p.y) - 1) < 0.3, `off-circle: ${p.x},${p.y}`);
  }
  assert.deepEqual(arc[0], { x: 0, y: 0 });
  assert.deepEqual(arc.at(-1), { x: 2, y: 0 });
  const flat = sampleCircleThrough3({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 });
  assert.ok(flat.every((p) => Math.abs(p.y) < 1e-6));
  assert.ok(flat.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  // Arc pair inside a path: circle through (prev, start, end), endpoints exact.
  // Hand-derived circle for (0,0), (100,0), (200,100): center (50,150).
  const source = arcPath([
    point('p1', 0, 0, 'hardCorner'),
    { id: 'p2', x: 100, y: 0, kind: 'arcByThreeStart', outgoing: { kind: 'arc' } },
    { id: 'p3', x: 200, y: 100, kind: 'arcByThreeEnd', outgoing: { kind: 'line' } },
    point('p4', 300, 100, 'hardCorner', 'line'),
  ]);
  const commands = expandCompositePoints(source);
  const arcCubics = commands.filter((c) => c.kind === 'cubic');
  assert.ok(arcCubics.length > 0, 'the arc resolves as cubics');
  assert.ok(distance(arcCubics[0].from, { x: 0, y: 0 }) < 1e-9, 'the arc opens at the anchor');
  const radius = Math.hypot(50, 150);
  const geometry = resolveCompositePath(source);
  distinct(geometry);
  assert.deepEqual(geometry.segments[0].point, { x: 0, y: 0 });
  // Every resolved sample sits on the hand-derived circle, so the sweep
  // took the short side through the start point, not the long way around.
  for (const seg of geometry.segments) {
    if (seg.point.x <= 200) {
      assert.ok(Math.abs(Math.hypot(seg.point.x - 50, seg.point.y - 150) - radius) < 1, `off-circle: ${seg.point.x},${seg.point.y}`);
    }
  }
});

test('arc-mode bows resolve onto their circle', () => {
  const source = path([bowedPoint('p1', 0, 0, 'hardCorner', { isArc: true }), point('p2', 100, 0)]);
  const commands = expandCompositePoints(source);
  assert.ok(commands.some((c) => c.kind === 'cubic'), 'the arc-mode bow resolves as cubics');
  // Hand-derived circle for (0,0), (50,-10), (100,0): center (50,120), R 130.
  const radius = 130;
  const geometry = resolveCompositePath(source);
  distinct(geometry);
  for (const seg of geometry.segments) {
    assert.ok(Math.abs(Math.hypot(seg.point.x - 50, seg.point.y - 120) - radius) < 1, `off-circle: ${seg.point.x},${seg.point.y}`);
  }
});

test('degenerate bowed chords and unfinished arcs stay finite', () => {
  assert.deepEqual(bowPeakPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, { ...DEFAULT_BOWED_PARAMS }), [{ x: 5, y: 5 }]);
  const coincident = path([bowedPoint('p1', 5, 5, 'hardCorner', {}), point('p2', 5, 5)]);
  assert.doesNotThrow(() => resolveCompositePath(coincident));
  // A raw unpaired start never validates: only session snapshots resolve.
  assert.throws(() => resolveCompositePath(arcPath([
    point('p1', 0, 0, 'hardCorner'),
    { id: 'p2', x: 60, y: 0, kind: 'arcByThreeStart', outgoing: { kind: 'arc' } },
  ])));
  // A live session completes its open arc at snapshot, so the deposit
  // validates and the arc stays on its circle.
  const live = new PathDrawingSession('live-arc', { x: 0, y: 0 }, 'hardCorner');
  live.commit('hardCorner', { x: 30, y: -20 });
  live.commitArcThrough({ x: 60, y: 0 });
  live.commit('hardCorner', { x: 90, y: 0 });
  const open = resolveCompositePath(live.snapshot());
  distinct(open);
  // Hand-derived circle through (0,0), (30,-20), (60,0): center (30,12.5), R 32.5.
  // Samples past the arc's end are the inherited rubber endpoint, not the arc.
  for (const seg of open.segments) {
    if (seg.point.x > 60) continue;
    assert.ok(Math.abs(Math.hypot(seg.point.x - 30, seg.point.y - 12.5) - 32.5) < 1,
      `off-circle: ${seg.point.x},${seg.point.y}`);
  }
});

test('bowed and arc segments work across closed seams and keep target trims', () => {
  // Bow on the seam segment (last -> first) into a rounded target:
  // the segment lands on the post-trim entry.
  const seam = arcPath([
    { id: 'p1', x: 0, y: 0, kind: 'roundedCorner', corner: { rounding: 'arc', radius: 10 }, outgoing: { kind: 'bSpline' } },
    point('p2', 100, 0, 'hardCorner'),
    bowedPoint('p3', 100, 100, 'hardCorner', { facing: 'B', amplitude: 20, amplitudeIsPercent: false }),
  ], true);
  const seamCubics = expandCompositePoints(seam).filter((c) => c.kind === 'cubic');
  assert.ok(seamCubics.length > 0, 'the seam bow resolves as cubics');
  // Target entry is the post-trim point, not the raw corner.
  const seamTo = seamCubics[0].to;
  assert.ok(distance(seamTo, { x: 0, y: 0 }) > 1e-6);
  assert.ok(distance(seamTo, { x: 0, y: 0 }) < 150);
  const closedBow = resolveCompositePath(seam);
  assert.equal(closedBow.closed, true);
  distinct(closedBow);
  // Arc across the seam: start last, end first.
  const seamArc = arcPath([
    { id: 'p1', x: 0, y: 100, kind: 'arcByThreeEnd', outgoing: { kind: 'line' } },
    point('p2', 0, 0, 'hardCorner'),
    point('p3', 100, 0, 'hardCorner'),
    { id: 'p4', x: 100, y: 100, kind: 'arcByThreeStart', outgoing: { kind: 'arc' } },
  ], true);
  const seamArcCubics = expandCompositePoints(seamArc).filter((c) => c.kind === 'cubic');
  assert.ok(seamArcCubics.length > 0, 'the seam arc resolves as cubics');
  assert.deepEqual(seamArcCubics.at(-1).to, { x: 0, y: 100 });
  const closedArc = resolveCompositePath(seamArc);
  assert.equal(closedArc.closed, true);
  distinct(closedArc);
  // An arc triple touching the seam resolves as cubics, never strands.
  const lineIntoArc = arcPath([
    point('p1', 0, 0, 'hardCorner', 'line'),
    { id: 'p2', x: 100, y: 0, kind: 'arcByThreeStart', outgoing: { kind: 'arc' } },
    { id: 'p3', x: 100, y: 100, kind: 'arcByThreeEnd', outgoing: { kind: 'line' } },
    point('p4', 0, 100),
  ], true);
  assert.ok(expandCompositePoints(lineIntoArc).some((c) => c.kind === 'cubic'));
  distinct(resolveCompositePath(lineIntoArc));
});

const press = (code, k) => ({
  code, key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
  target: null, getModifierState: () => false, preventDefault: () => {},
});
const at = (e, s, x, y) => { e.mousePt = new s.Point(x, y); };

test('spline layout follows composite mode; the choice pins it in legacy mode', () => {
  const { s, e, cleanup } = engine();
  try {
    // Composite mode drives the spline board while idle.
    assert.equal(activeLayout(e.getKeyState()), 'spline');
    e.setPathDrawingMode('legacy');
    assert.equal(activeLayout(e.getKeyState()), 'base');
    e.setKeyboardLayoutChoice('spline');
    assert.equal(activeLayout(e.getKeyState()), 'spline');
    e.setKeyboardLayoutChoice('auto');
    // A live composite session drives it regardless of mode.
    e.setPathDrawingMode('ngComposite');
    at(e, s, 10, 10); e.splinePointKC();
    assert.equal(activeLayout(e.getKeyState()), 'spline');
    assert.equal(layoutLabel(e.getKeyState()), 'Spline');
    e.handleKeyDown(press('KeyA', 'a'));
    assert.equal(activeLayout(e.getKeyState()), 'spline');
    e.setPathDrawingMode('legacy');
    assert.equal(activeLayout(e.getKeyState()), 'base');
  } finally { cleanup(); }
});

test('spline board carries the session keys and keeps End on A', () => {
  const { s, e, cleanup } = engine();
  try {
    at(e, s, 10, 10); e.splinePointKC();
    const live = e.getKeyState();
    assert.equal(activeLayout(live), 'spline');
    const ids = (code, mods = BASE_MODIFIERS) => resolveKeyVariants(code, mods, live).map((v) => v.commandId);
    const shift = { ...BASE_MODIFIERS, shift: true };
    assert.deepEqual(ids('KeyB'), ['bowed-point']);
    assert.deepEqual(ids('KeyB', shift), ['bowed-point-flip']);
    assert.deepEqual(ids('Period'), ['arc-three-point']);
    assert.deepEqual(ids('Backslash'), ['switch-rounding']);
    assert.deepEqual(ids('KeyZ'), ['erase-last-point']);
    assert.deepEqual(ids('KeyF'), ['sharp-point']);
    assert.deepEqual(ids('KeyG'), ['spline-point']);
    assert.deepEqual(ids('KeyH'), ['rounded-point']);
    assert.deepEqual(ids('KeyE'), ['finish-e']);
    assert.deepEqual(ids('KeyA'), ['finish-a']);
    assert.deepEqual(ids('KeyQ'), ['cancel']);
    const caps = resolveKeyboardLayout(BASE_MODIFIERS, 'other', live);
    assert.equal(caps.find((cap) => cap.id === 'KeyB').commandId, 'bowed-point');
    assert.equal(caps.find((cap) => cap.id === 'Period').commandId, 'arc-three-point');
    assert.equal(caps.find((cap) => cap.id === 'Backslash').commandId, 'switch-rounding');
  } finally { cleanup(); }
});

test('bowed keys deposit bowed points and finish end-to-end', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    at(e, s, 10, 10); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 40, 10); e.handleKeyDown(press('KeyB', 'b'));
    at(e, s, 70, 10); e.handleKeyDown({ ...press('KeyB', 'B'), shiftKey: true });
    const source = e.compositePathTool.stamp(false).source;
    // Each bowed deposit retypes the previous cursor: the sharp start
    // becomes the facing-A bow, the next cursor the facing-B bow, and
    // the moved rubber trails behind them as a fresh spline point.
    assert.deepEqual(source.points.map((p) => p.kind), ['bowedLine', 'bowedLine', 'bSpline']);
    assert.deepEqual(source.points.map((p) => p.outgoing.kind), ['bowedLine', 'bowedLine', 'bSpline']);
    assert.equal(source.points[0].outgoing.bow.facing, 'A');
    assert.equal(source.points[1].outgoing.bow.facing, 'B');
    assert.deepEqual(
      source.points.map((p) => [p.x, p.y]),
      [[10, 10], [40, 10], [70, 10]],
    );
    at(e, s, 70, 10); e.handleKeyDown(press('KeyA', 'a'));
    assert.equal(e.isDrawingPath, false);
    const placed = layer.children.find((item) => !item.data.isPathPreview);
    assert.ok(placed);
    assert.equal(e.canUndo(), true);
    e.undo();
    assert.equal(layer.children.filter((item) => !item.data.isPathPreview).length, 0);
  } finally { cleanup(); }
});

test('arc key starts an arc and stamping completes it', () => {
  const { s, e, cleanup } = engine();
  try {
    at(e, s, 80, 80); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 100, 80); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 140, 120); e.handleKeyDown(press('Period', '.'));
    assert.equal(e.isDrawingPath, true);
    // Stamping completes the open arc at the snapshot: the through
    // point pairs with an end on the cursor.
    let source = e.compositePathTool.stamp(false).source;
    let kinds = source.points.map((p) => p.kind);
    const start = kinds.indexOf('arcByThreeStart');
    assert.ok(start >= 0 && kinds[start + 1] === 'arcByThreeEnd');
    assert.deepEqual(source.points.map((p) => [p.x, p.y]), [[80, 80], [100, 80], [140, 120]]);
    assert.doesNotThrow(() => validatePath(source));
    // The session stays live with the arc closed: a second arc key
    // completes it at the new cursor, and drawing continues past it.
    at(e, s, 200, 140); e.handleKeyDown(press('Period', '.'));
    at(e, s, 220, 140); e.handleKeyDown(press('KeyF', 'f'));
    source = e.compositePathTool.stamp(false).source;
    kinds = source.points.map((p) => p.kind);
    assert.deepEqual(kinds, ['hardCorner', 'arcByThreeStart', 'arcByThreeEnd', 'hardCorner', 'bSpline']);
    assert.doesNotThrow(() => validatePath(source));
    // A further arc starts behind the completed pair and also validates.
    at(e, s, 240, 140); e.handleKeyDown(press('Period', '.'));
    source = e.compositePathTool.stamp(false).source;
    {
      const kinds = source.points.map((p) => p.kind);
      const starts = kinds.map((k, i) => (k === 'arcByThreeStart' ? i : -1)).filter((i) => i >= 0);
      assert.equal(starts.length, 2);
      for (const atStart of starts) assert.equal(kinds[atStart + 1], 'arcByThreeEnd');
      assert.doesNotThrow(() => validatePath(source));
      distinct(resolveCompositePath(source));
    }
  } finally { cleanup(); }
});

test('finish completes an open arc and deposits it', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    at(e, s, 10, 10); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 20, 10); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 30, 10); e.handleKeyDown(press('Period', '.'));
    at(e, s, 30, 10); e.handleKeyDown(press('KeyA', 'a'));
    assert.equal(e.isDrawingPath, false);
    const placed = layer.children.find((item) => !item.data.isPathPreview);
    assert.ok(placed);
    const model = e.getRetainedPathDrawable(placed.data.drawableId);
    const kinds = model.source.points.map((p) => p.kind);
    assert.deepEqual(kinds, ['hardCorner', 'arcByThreeStart', 'arcByThreeEnd']);
    assert.doesNotThrow(() => validatePath(model.source));
  } finally { cleanup(); }
  const { s: s2, e: e2, layer: layer2, cleanup: cleanup2 } = engine();
  try {
    at(e2, s2, 10, 10); e2.handleKeyDown(press('Period', '.'));
    at(e2, s2, 10, 10); e2.handleKeyDown(press('KeyA', 'a'));
    assert.equal(e2.isDrawingPath, false);
    assert.equal(layer2.children.filter((item) => !item.data.isPathPreview).length, 0);
  } finally { cleanup2(); }
});

test('erase-last removes points, dissolves arc ends, and no-ops at the first point', () => {
  const { s, e, cleanup } = engine();
  try {
    at(e, s, 10, 10); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 20, 10); e.handleKeyDown(press('KeyG', 'g'));
    at(e, s, 30, 10); e.handleKeyDown(press('KeyH', 'h'));
    // First erase drops the pending rubber duplicate; deposits stand.
    e.handleKeyDown(press('KeyZ', 'z'));
    let source = e.compositePathTool.stamp(false).source;
    assert.deepEqual(source.points.map((p) => p.kind), ['bSpline', 'roundedCorner', 'roundedCorner']);
    assert.equal(e.isDrawingPath, true);
    // Second erase removes the last deposit.
    e.handleKeyDown(press('KeyZ', 'z'));
    assert.equal(e.isDrawingPath, true);
    source = e.compositePathTool.stamp(false).source;
    assert.deepEqual(source.points.map((p) => p.kind), ['bSpline', 'bSpline']);
    // At the first point there is nothing to erase: the initial
    // point itself is never removed.
    e.handleKeyDown(press('KeyZ', 'z'));
    assert.equal(e.isDrawingPath, true);
    source = e.compositePathTool.stamp(false).source;
    assert.deepEqual(source.points.map((p) => p.kind), ['bSpline', 'bSpline']);
    // Arc pair, then erase the pending end: the pair stands and validates.
    at(e, s, 80, 10); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 90, 10); e.handleKeyDown(press('Period', '.'));
    at(e, s, 100, 10); e.handleKeyDown(press('Period', '.'));
    e.handleKeyDown(press('KeyZ', 'z'));
    source = e.compositePathTool.stamp(false).source;
    assert.deepEqual(
      source.points.map((p) => p.kind),
      ['hardCorner', 'arcByThreeStart', 'arcByThreeEnd', 'bSpline'],
    );
    assert.deepEqual(
      source.points.map((p) => [p.x, p.y]),
      [[10, 10], [80, 10], [90, 10], [100, 10]],
    );
    assert.doesNotThrow(() => validatePath(source));
    // Erasing the end itself abandons the arc back to a spline point.
    e.handleKeyDown(press('KeyZ', 'z'));
    source = e.compositePathTool.stamp(false).source;
    assert.ok(!source.points.some((p) => p.kind === 'arcByThreeStart' || p.kind === 'arcByThreeEnd'));
    assert.doesNotThrow(() => validatePath(source));
  } finally { cleanup(); }
});

test('switch-rounding cycles arc, spline, bevel for new deposits only', () => {
  const { s, e, cleanup } = engine();
  try {
    at(e, s, 10, 10); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 20, 10); e.handleKeyDown(press('KeyH', 'h'));
    e.handleKeyDown(press('Backslash', '\\'));
    at(e, s, 30, 10); e.handleKeyDown(press('KeyH', 'h'));
    e.handleKeyDown(press('Backslash', '\\'));
    at(e, s, 40, 10); e.handleKeyDown(press('KeyH', 'h'));
    const source = e.compositePathTool.stamp(false).source;
    const roundings = source.points.filter((p) => p.kind === 'roundedCorner').map((p) => p.corner.rounding);
    assert.deepEqual(roundings, ['arc', 'bSpline', 'bevel']);
    // A fresh deposit takes the current mode: the live rubber carries no
    // rounding, so the next H stamps the switched mode.
    e.handleKeyDown(press('Backslash', '\\'));
    at(e, s, 50, 10); e.handleKeyDown(press('KeyH', 'h'));
    const again = e.compositePathTool.stamp(false).source;
    const kept = again.points.filter((p) => p.kind === 'roundedCorner').map((p) => p.corner.rounding);
    assert.deepEqual(kept, ['arc', 'bSpline', 'bevel', 'arc']);
  } finally { cleanup(); }
});

test('rounded commits stamp the session rounding mode when committed', () => {
  // Session level: a commit retypes the previous point with the current
  // mode — the deposit takes the mode live at commit time.
  const session = new PathDrawingSession('mode', { x: 0, y: 0 }, 'roundedCorner');
  assert.equal(session.snapshot().points[0].corner.rounding, 'arc');
  session.cycleRounding();
  session.commit('roundedCorner', { x: 100, y: 0 });
  let snap = session.snapshot();
  assert.equal(snap.points[0].corner.rounding, 'bSpline');
  session.commit('roundedCorner', { x: 200, y: 0 });
  snap = session.snapshot();
  assert.equal(snap.points[1].corner.rounding, 'bSpline');
});

test('same-family retypes keep bows; cross-family retypes clear them', () => {
  const { s, e, cleanup } = engine();
  try {
    // A bowed deposit, an erase that drops the rubber duplicate, then a
    // sharp commit retypes the bow itself: the corner kind lands and the
    // stamped bow stays.
    at(e, s, 10, 10); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 20, 10); e.handleKeyDown(press('KeyB', 'b'));
    e.handleKeyDown(press('KeyZ', 'z'));
    at(e, s, 20, 10); e.handleKeyDown(press('KeyF', 'f'));
    const source = e.compositePathTool.stamp(false).source;
    assert.equal(source.points[0].kind, 'hardCorner');
    assert.equal(source.points[0].outgoing.kind, 'bowedLine');
    assert.equal(source.points[0].outgoing.bow.facing, 'A');
    const { s: s2, e: e2, cleanup: cleanup2 } = engine();
    try {
      // A spline commit over the same bow clears it instead.
      at(e2, s2, 10, 10); e2.handleKeyDown(press('KeyF', 'f'));
      at(e2, s2, 20, 10); e2.handleKeyDown(press('KeyB', 'b'));
      e2.handleKeyDown(press('KeyZ', 'z'));
      at(e2, s2, 20, 10); e2.handleKeyDown(press('KeyG', 'g'));
      const source2 = e2.compositePathTool.stamp(false).source;
      assert.equal(source2.points[0].kind, 'bSpline');
      assert.equal(source2.points[0].outgoing.kind, 'bSpline');
    } finally { cleanup2(); }
  } finally { cleanup(); }
});

test('bow amplitude scales absolutely but stays relative for percents', () => {
  const session = new PathDrawingSession('scale', { x: 0, y: 0 }, 'hardCorner');
  session.setBowParams({ amplitude: 20, amplitudeIsPercent: false });
  session.commitBowed({ x: 100, y: 0 }, 'left');
  session.setBowParams({ amplitude: 10, amplitudeIsPercent: true });
  session.commitBowed({ x: 200, y: 0 }, 'right');
  session.scale(2);
  const snap = session.snapshot();
  assert.equal(snap.points[0].outgoing.bow.amplitude, 40);
  assert.equal(snap.points[1].outgoing.bow.amplitude, 10);
  session.rotate(90);
  assert.equal(session.snapshot().points[0].outgoing.bow.amplitude, 40);
  assert.equal(session.snapshot().points[0].outgoing.bow.facing, 'A');
});

test('bowed deposits stamp independent param copies', () => {
  const { s, e, cleanup } = engine();
  try {
    at(e, s, 10, 10); e.handleKeyDown(press('KeyF', 'f'));
    at(e, s, 20, 10); e.handleKeyDown(press('KeyB', 'b'));
    at(e, s, 30, 10); e.handleKeyDown({ ...press('KeyB', 'B'), shiftKey: true });
    const source = e.compositePathTool.stamp(false).source;
    const bows = source.points.map((p) => p.outgoing.bow).filter(Boolean);
    assert.equal(bows.length, 2);
    assert.notEqual(bows[0], bows[1]);
    assert.deepEqual(bows[0].facing, 'A');
    assert.deepEqual(bows[1].facing, 'B');
  } finally { cleanup(); }
});

test('every FM key builds one semantic path', () => {
  const { s, e, cleanup } = engine();
  try {
    const keys = [
      ['KeyF', 'f', 10, false], ['KeyG', 'g', 20, false], ['KeyH', 'h', 30, false],
      ['KeyB', 'b', 40, false], ['KeyB', 'B', 50, true],
      ['Period', '.', 60, false], ['KeyF', 'f', 70, false],
    ];
    for (const [code, key, x, shift] of keys) {
      at(e, s, x, 10);
      e.handleKeyDown(shift ? { ...press(code, key), shiftKey: true } : press(code, key));
    }
    const source = e.compositePathTool.stamp(false).source;
    // Key-click convention: a commit's kind lands on the previous cursor
    // (the rubber lags one press behind); bowed deposits retype the
    // previous cursor too, and the arc key marks it as the through point
    // for the next commit to finish.
    assert.deepEqual(source.points.map((p) => p.kind), [
      'bSpline', 'roundedCorner', 'bowedLine', 'bowedLine',
      'arcByThreeStart', 'arcByThreeEnd', 'bSpline',
    ]);
    assert.deepEqual(source.points.map((p) => p.outgoing.kind), [
      'bSpline', 'bSpline', 'bowedLine', 'bowedLine',
      'bSpline', 'bSpline', 'bSpline',
    ]);
    assert.equal(source.points[2].outgoing.bow.facing, 'A');
    assert.equal(source.points[3].outgoing.bow.facing, 'B');
    assert.deepEqual(
      source.points.map((p) => [p.x, p.y]),
      [[10, 10], [20, 10], [30, 10], [40, 10], [50, 10], [60, 10], [70, 10]],
    );
    assert.doesNotThrow(() => validatePath(source));
    distinct(resolveCompositePath(source));
  } finally { cleanup(); }
});

test('erase-last works in the clothoid layout', () => {
  const { s, e, cleanup } = engine();
  try {
    e.handleKeyDown(press('Backslash', '\\'));
    assert.equal(activeLayout(e.getKeyState()), 'clothoid');
    at(e, s, 10, 10); e.handleKeyDown(press('KeyS', 's'));
    at(e, s, 20, 10); e.handleKeyDown(press('KeyD', 'd'));
    at(e, s, 30, 10); e.handleKeyDown(press('KeyF', 'f'));
    // First erase drops the pending rubber duplicate; deposits stand.
    e.handleKeyDown(press('KeyZ', 'z'));
    let source = e.compositePathTool.stamp(false).source;
    assert.deepEqual(source.points.map((p) => p.kind), ['g2', 'clothoidCorner', 'clothoidCorner']);
    assert.doesNotThrow(() => validatePath(source));
    // Second erase removes the corner while the G2 deposit stands.
    // Clothoid commits share the key-click lag: D retyped the G4 deposit
    // to G2 and F's corner landed on the previous cursor.
    e.handleKeyDown(press('KeyZ', 'z'));
    source = e.compositePathTool.stamp(false).source;
    assert.deepEqual(source.points.map((p) => p.kind), ['g2', 'g2']);
    assert.deepEqual(
      source.points.map((p) => [p.x, p.y]),
      [[10, 10], [30, 10]],
    );
    assert.doesNotThrow(() => validatePath(source));
  } finally { cleanup(); }
});

test('layout registry stays per-layout and reserved codes keep no point keys', () => {
  // Registry shape: base + spline + clothoid, each with its own compile.
  assert.deepEqual(KEYBOARD_LAYOUTS.map((l) => l.id), ['base', 'spline', 'clothoid']);
  assert.equal(capsForLayout('spline').length, KEY_CAPS.length);
  assert.equal(capsForLayout('clothoid').length, KEY_CAPS.length);
  assert.equal(keyVariantsForLayout('repeat'), KEY_VARIANTS);
  assert.equal(commandById('bowed-point')?.action, 'bowed-point');
  assert.equal(commandById('clothoid-g4')?.action, 'clothoid-g4-deposit');
  assert.equal(commandById('bowed-hard-a'), undefined);
  // Reservation by construction: A/End, Q/Cancel, Escape, R carry no
  // point-deposit key on the plain chord in any layout.
  const pointIds = new Set(['sharp-point', 'spline-point', 'rounded-point',
    'bowed-point', 'bowed-point-flip', 'arc-three-point', 'switch-rounding', 'erase-last-point',
    'clothoid-g4', 'clothoid-g2', 'clothoid-corner', 'clothoid-line',
    'clothoid-prev-constraint', 'clothoid-next-constraint', 'clothoid-stamp']);
  for (const [id, list] of Object.entries(KEY_VARIANTS_BY_LAYOUT)) {
    for (const variant of list) {
      const plain = !variant.chord.shift && !variant.chord.alt && !variant.chord.control && !variant.chord.meta;
      if (plain && ['KeyA', 'KeyQ', 'Escape', 'KeyR'].includes(variant.code)) {
        assert.ok(!pointIds.has(variant.commandId), `${id}: ${variant.code} binds ${variant.commandId}`);
      }
    }
  }
  // Compiles stay small.
  assert.ok(KEY_VARIANTS.length < KEY_COMMANDS.length * 10);
});
