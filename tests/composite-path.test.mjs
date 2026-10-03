import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { sampleBSpline, distance } from '../src/engine/geometry/splineInterpolation.ts';
import { expandCompositePoints, resolveCompositePath } from '../src/engine/geometry/compositeExpansion.ts';
import { PathDrawingSession } from '../src/engine/drawing/PathDrawingSession.ts';
import { PathTool } from '../src/engine/drawing/PathTool.ts';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { serializeDrawable, deserializeDrawable } from '../src/engine/model/serialization.ts';
import { resolveKeyboardLayout } from '../src/engine/input/KeyboardLayoutResolver.ts';
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
    assert.equal(layout.find((cap) => cap.id === 'KeyJ').available, false);
    e.cancelCurrentDrawingOperation(); e.setPathDrawingMode('legacy');
    layout = resolveKeyboardLayout(BASE_MODIFIERS, 'other', e.getKeyState());
    assert.equal(layout.find((cap) => cap.id === 'KeyH').available, false);
    e.mousePt = new s.Point(10, 10); e.splinePointKC();
    assert.equal(e.path.data.isPathPreview, undefined);
  } finally { cleanup(); }
});
