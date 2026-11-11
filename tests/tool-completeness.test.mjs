// Tier Two, Slice 7: tool completeness.
// Standalone Line / Ellipse / Arc key-click tools, Freehand depositing
// a smoothed-polyline model path (with its resolver), arrowheads as
// grouped derived geometry, and Stroke to Outline via the model's
// outlined-stroke mode.
import test from 'node:test';
import assert from 'node:assert/strict';

import paper from 'paper';

const { resolvePath, smoothPolylineSegments } = await import('../src/engine/geometry/pathResolver.ts');
const { arcThroughPoints, arcSegments, ellipseSegments } = await import('../src/engine/geometry/simpleGeometry.ts');
const { arrowheadGeometry, arrowLength } = await import('../src/engine/appearance/arrowheads.ts');
const { NibGliderEngine } = await import('../src/engine/engine.ts');

function makeEngine() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  return { scope, engine: new NibGliderEngine(scope, () => {}) };
}

function click(scope, engine, x, y) {
  engine.mousePt = new scope.Point(x, y);
}

// --- smoothed polyline resolution -------------------------------------------

test('smoothedPolyline: resolves through every point; tension 1 is the polyline', () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }, { x: 30, y: 10 }];
  const smooth = resolvePath({ id: 'p', mode: 'smoothedPolyline', closed: false, points, tension: 0 });
  assert.equal(smooth.kind, 'path');
  assert.deepEqual(smooth.segments.map((s) => s.point), points);
  assert.ok(Math.abs(smooth.segments[1].handleOut.x) > 0.1, 'Catmull-Rom handles at tension 0');
  const straight = resolvePath({ id: 'p', mode: 'smoothedPolyline', closed: false, points, tension: 1 });
  for (const s of straight.segments) {
    assert.deepEqual([s.handleIn, s.handleOut], [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  }
  const closed = smoothPolylineSegments(points, true, 0.5);
  assert.equal(closed.length, 4);
  assert.ok(closed[0].handleIn.x !== 0 || closed[0].handleIn.y !== 0, 'closed wraps neighbours');
});

// --- simple geometry -------------------------------------------------------------

test('ellipse segments: four kappa arcs on the ellipse bounds', () => {
  const segs = ellipseSegments({ x: 100, y: 50 }, 40, 20);
  assert.equal(segs.length, 4);
  assert.deepEqual(segs[0].point, { x: 140, y: 50 });
  assert.deepEqual(segs[1].point, { x: 100, y: 70 });
  assert.ok(Math.abs(segs[0].handleOut.y - 0.5522847498307936 * 20) < 1e-9);
  assert.deepEqual(ellipseSegments({ x: 0, y: 0 }, 0, 5), []);
});

test('arc through three points: quarter circle geometry and segments', () => {
  const info = arcThroughPoints({ x: 10, y: 0 }, { x: 7.071, y: 7.071 }, { x: 0, y: 10 });
  assert.ok(info);
  assert.ok(Math.hypot(info.center.x, info.center.y) < 1e-2, 'centre at origin (input rounded to 3dp)');
  assert.ok(Math.abs(info.radius - 10) < 1e-2);
  assert.ok(Math.abs(Math.abs(info.sweep) - Math.PI / 2) < 1e-3, 'quarter sweep');
  const segs = arcSegments(info);
  assert.ok(Math.hypot(segs[0].point.x - 10, segs[0].point.y) < 1e-6);
  const last = segs[segs.length - 1].point;
  assert.ok(Math.hypot(last.x, last.y - 10) < 1e-6, 'ends at the third point');
  // A point on the approximated arc stays near the true circle.
  assert.equal(arcThroughPoints({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }), null, 'collinear gives no arc');
});

// --- arrowhead geometry --------------------------------------------------------------

test('arrowheads: triangle spans back from the tip; barb is open; dot is a disc', () => {
  const tri = arrowheadGeometry({ x: 100, y: 0 }, { x: 1, y: 0 }, 'triangle', 4);
  assert.equal(tri.polygon.length, 3);
  assert.deepEqual(tri.polygon[0], { x: 100, y: 0 });
  assert.ok(tri.polygon[1].x < 100 && tri.polygon[1].y > 0);
  assert.ok(tri.polygon[2].x < 100 && tri.polygon[2].y < 0);
  const barb = arrowheadGeometry({ x: 0, y: 0 }, { x: 0, y: 1 }, 'barb', 4);
  assert.equal(barb.polygon, null);
  assert.equal(barb.polyline.length, 3);
  assert.deepEqual(barb.polyline[1], { x: 0, y: 0 });
  const dot = arrowheadGeometry({ x: 5, y: 5 }, { x: 1, y: 0 }, 'dot', 10);
  assert.ok(dot.dotRadius >= 8);
  assert.equal(arrowheadGeometry({ x: 0, y: 0 }, { x: 1, y: 0 }, 'none', 4).polygon, null);
  assert.equal(arrowLength(1), 7);
  assert.equal(arrowLength(100), 64);
});

// --- engine tools -----------------------------------------------------------------------

test('engine: Line tool deposits a two-point path in two clicks', () => {
  const { scope, engine } = makeEngine();
  click(scope, engine, 10, 10);
  engine.lineKC();
  assert.equal(engine.activeSimpleTool, 'line');
  assert.equal(engine.allContentItems().length, 0, 'nothing deposited yet');
  click(scope, engine, 110, 10);
  engine.lineKC();
  assert.equal(engine.activeSimpleTool, null);
  const items = engine.allContentItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].className, 'Path');
  assert.equal(items[0].segments.length, 2);
  assert.deepEqual([items[0].firstSegment.point.x, items[0].firstSegment.point.y], [10, 10]);
  assert.deepEqual([items[0].lastSegment.point.x, items[0].lastSegment.point.y], [110, 10]);
  engine.undo();
  assert.equal(engine.allContentItems().length, 0, 'one undo removes the line');
});

test('engine: Ellipse tool deposits a closed four-arc ellipse', () => {
  const { scope, engine } = makeEngine();
  click(scope, engine, 100, 100); engine.ellipseKC();
  click(scope, engine, 150, 100); engine.ellipseKC();
  click(scope, engine, 100, 130); engine.ellipseKC();
  const items = engine.allContentItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].closed, true);
  assert.equal(items[0].segments.length, 4);
  const b = items[0].bounds;
  assert.ok(Math.abs(b.width - 100) < 0.5 && Math.abs(b.height - 60) < 0.5, `bounds ${b.width}x${b.height}`);
});

test('engine: Arc tool deposits an arc through the three clicks', () => {
  const { scope, engine } = makeEngine();
  click(scope, engine, 110, 100); engine.arcKC();
  click(scope, engine, 100 + 10 * Math.SQRT1_2, 100 - 10 * Math.SQRT1_2); engine.arcKC();
  // centre (100,100) radius 10: start at angle 0, through -45°, end -90°
  click(scope, engine, 100, 90); engine.arcKC();
  const items = engine.allContentItems();
  assert.equal(items.length, 1);
  const first = items[0].firstSegment.point;
  const last = items[0].lastSegment.point;
  assert.ok(Math.hypot(first.x - 110, first.y - 100) < 1e-6);
  assert.ok(Math.hypot(last.x - 100, last.y - 90) < 1e-6);
  // Arc bulges toward the through point (up-right), not the chord.
  const mid = items[0].getPointAt(items[0].length / 2);
  assert.ok(mid.x > 105 && mid.y < 95, `arc midpoint ${mid.x},${mid.y}`);
});

test('engine: freehand drag deposits a smoothed-polyline model path', () => {
  const { scope, engine } = makeEngine();
  engine.setFreehandArmed(true);
  engine.inputMouseDown({ point: new scope.Point(0, 0) });
  assert.equal(engine.isFreehandCapturing, true);
  engine.inputMouseDrag({ point: new scope.Point(10, 4) });
  engine.inputMouseDrag({ point: new scope.Point(20, 0) });
  engine.inputMouseDrag({ point: new scope.Point(30, 6) });
  engine.inputMouseUp();
  assert.equal(engine.isFreehandCapturing, false);
  const items = engine.allContentItems();
  assert.equal(items.length, 1);
  assert.ok(items[0].segments.length >= 4);
  const id = items[0].data.drawableId;
  const retained = engine.getRetainedPathDrawable(id);
  assert.equal(retained.source.mode, 'smoothedPolyline', 'model keeps the polyline as truth');
  assert.equal(retained.source.points.length, 4);
  assert.equal(retained.source.tension, 0.3);
});

test('engine: arrowheads wrap a deposited line and rebuild on change', () => {
  const { scope, engine } = makeEngine();
  engine.setArrowEnd('triangle');
  click(scope, engine, 0, 0); engine.lineKC();
  click(scope, engine, 100, 0); engine.lineKC();
  const tops = engine.allContentItems();
  assert.equal(tops.length, 1);
  const group = tops[0];
  assert.equal(group.className, 'Group');
  assert.equal(group.data.arrowGroup, true);
  const heads = group.children.filter((c) => c.data?.arrowhead);
  assert.equal(heads.length, 1);
  assert.equal(heads[0].data.arrowhead, 'end');
  const tip = heads[0].segments.reduce((max, s) => Math.max(max, s.point.x), -Infinity);
  assert.ok(Math.abs(tip - 100) < 1e-6, 'triangle tip lands on the line end');
  // Changing the setting on the selection rebuilds; clearing unwraps.
  engine.selection.restore([group]);
  engine.setArrowStart('barb');
  const heads2 = group.children.filter((c) => c.data?.arrowhead);
  assert.equal(heads2.length, 2);
  engine.setArrowStart('none');
  engine.setArrowEnd('none');
  const after = engine.allContentItems();
  assert.equal(after.length, 1);
  assert.equal(after[0].className, 'Path', 'group unwraps when both heads are none');
});

test('engine: stroke to outline converts a stroked path to filled geometry', () => {
  const { scope, engine } = makeEngine();
  click(scope, engine, 10, 10); engine.lineKC();
  click(scope, engine, 110, 10); engine.lineKC();
  const line = engine.allContentItems()[0];
  engine.selection.restore([line]);
  const count = engine.strokeToOutlineSelection();
  assert.equal(count, 1);
  const items = engine.allContentItems();
  assert.equal(items.length, 1);
  const band = items[0];
  assert.equal(band.strokeColor, null, 'no stroke anymore');
  assert.ok(band.fillColor, 'filled with the old stroke colour');
  assert.equal(band.closed, true);
  const b = band.bounds;
  const w = Number(line.strokeWidth) || engine.globalStrokeWidth;
  assert.ok(Math.abs(b.height - w) < 0.6, `band height ${b.height} vs stroke width ${w}`);
  assert.ok(b.width > 99, 'band spans the line length plus caps');
  const retained = engine.getRetainedPathDrawable(band.data.drawableId);
  assert.equal(retained.source.mode, 'outlinedStroke', 'model keeps the live outlined stroke');
  assert.equal(retained.source.width, w);
  engine.undo();
  assert.equal(engine.allContentItems()[0].strokeColor !== null, true, 'undo restores the stroked line');
});
