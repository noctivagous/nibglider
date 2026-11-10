import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveAnchor, moveHandle, moveEdge, insertPointOnSegment, deletePoint,
  convertPoint, isSmoothPoint, joinContours, joinEndToEnd, reverseSegments,
  lowerToBezierPath,
} from '../src/engine/geometry/pointEditing.ts';

const seg = (x, y, hi = [0, 0], ho = [0, 0]) => ({
  point: { x, y }, handleIn: { x: hi[0], y: hi[1] }, handleOut: { x: ho[0], y: ho[1] },
});
const close = (a, b, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

test('moveAnchor moves the point and its relative handles travel', () => {
  const segs = [seg(0, 0, [-5, 0], [10, 0]), seg(40, 0, [-10, 0], [5, 0])];
  const out = moveAnchor(segs, 0, { x: 7, y: 3 });
  assert.ok(close(out[0].point, { x: 7, y: 3 }));
  assert.deepEqual(out[0].handleOut, { x: 10, y: 0 }, 'relative handle unchanged');
  assert.equal(segs[0].point.x, 0, 'input not mutated');
});

test('moveHandle coupled mirrors the opposite handle; broken leaves it', () => {
  const segs = [seg(0, 0), seg(40, 0), seg(80, 0)];
  const coupled = moveHandle(segs, 1, 'out', { x: 55, y: 10 }, { coupled: true });
  assert.deepEqual(coupled[1].handleOut, { x: 15, y: 10 });
  assert.deepEqual(coupled[1].handleIn, { x: -15, y: -10 });
  assert.equal(isSmoothPoint(coupled, 1), true);
  const broken = moveHandle(segs, 1, 'out', { x: 55, y: 10 }, { coupled: false });
  assert.deepEqual(broken[1].handleIn, { x: 0, y: 0 });
});

test('moveEdge moves both anchors of the edge, wrapping when closed', () => {
  const segs = [seg(0, 0), seg(10, 0), seg(10, 10)];
  const out = moveEdge(segs, 2, { x: 5, y: 5 }, true);
  assert.ok(close(out[2].point, { x: 15, y: 15 }));
  assert.ok(close(out[0].point, { x: 5, y: 5 }), 'closed wrap moves the first anchor too');
  const open = moveEdge(segs, 2, { x: 5, y: 5 }, false);
  assert.ok(close(open[2].point, { x: 10, y: 10 }), 'open contour has no edge after the last point');
});

test('insertPointOnSegment splits a curve without changing its shape', () => {
  const segs = [seg(0, 0, [0, 0], [30, 0]), seg(90, 60, [-30, 0], [0, 0])];
  const out = insertPointOnSegment(segs, 0, 0.5);
  assert.equal(out.length, 3);
  // Cubic midpoint of (0,0),(30,0),(60,60),(90,60) at t=.5 is (45,30).
  assert.ok(close(out[1].point, { x: 45, y: 30 }, 1e-9), `midpoint ${JSON.stringify(out[1].point)}`);
  // Shape check: midpoint of the split halves matches the original curve.
  const cubic = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return {
      x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
      y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
    };
  };
  const origAt = (t) => cubic({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 60, y: 60 }, { x: 90, y: 60 }, t);
  const left = out[0]; const mid = out[1]; const right = out[2];
  const splitAt = (t) => cubic(
    left.point,
    { x: left.point.x + left.handleOut.x, y: left.point.y + left.handleOut.y },
    { x: mid.point.x + mid.handleIn.x, y: mid.point.y + mid.handleIn.y },
    mid.point, t,
  );
  assert.ok(close(splitAt(0.5), origAt(0.25), 1e-6), 'first half traces the original curve');
  void right;
  assert.equal(segs.length, 2, 'input not mutated');
});

test('deletePoint removes one anchor and refuses to empty the path', () => {
  const segs = [seg(0, 0), seg(10, 0), seg(20, 0)];
  assert.equal(deletePoint(segs, 1).length, 2);
  assert.equal(deletePoint([seg(0, 0)], 0).length, 1);
});

test('convertPoint corner zeroes handles; smooth aligns them along neighbours', () => {
  const segs = [seg(0, 0), seg(50, 50, [-20, 5], [18, -4]), seg(100, 0)];
  const corner = convertPoint(segs, 1, 'corner');
  assert.deepEqual(corner[1].handleIn, { x: 0, y: 0 });
  assert.deepEqual(corner[1].handleOut, { x: 0, y: 0 });
  const smooth = convertPoint(segs, 1, 'smooth');
  assert.equal(isSmoothPoint(smooth, 1), true);
  assert.ok(Math.hypot(smooth[1].handleOut.x, smooth[1].handleOut.y) > 0);
});

test('reverseSegments and joins stitch open contours end to end', () => {
  const a = [seg(0, 0, [0, 0], [10, 0]), seg(30, 0, [-10, 0], [0, 0])];
  const b = [seg(30, 40, [0, 0], [10, 0]), seg(60, 40, [-10, 0], [0, 0])];
  const joined = joinContours(a, b);
  assert.equal(joined.length, 3);
  assert.ok(close(joined[1].point, { x: 30, y: 0 }), 'joint is a\'s end');
  assert.deepEqual(joined[1].handleOut, { x: 10, y: 0 }, 'joint leaves along b\'s first handle');
  const rev = reverseSegments(a);
  assert.ok(close(rev[0].point, { x: 30, y: 0 }));
  assert.ok(close(rev[1].point, { x: 0, y: 0 }));
  const endToEnd = joinEndToEnd(a, b);
  assert.equal(endToEnd.length, 3);
  assert.ok(close(endToEnd[2].point, { x: 30, y: 40 }), 'end-to-end finishes at b\'s start after reversal');
});

test('lowerToBezierPath: shapes become paths, bezier paths pass through, text refuses', () => {
  const base = {
    id: 'd1', layerId: 'paper-layer-1', transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    opacity: 1, visible: true, locked: false,
  };
  const shape = {
    ...base, kind: 'shape',
    source: { type: 'circle', center: { x: 10, y: 10 }, radius: 5 },
  };
  const lowered = lowerToBezierPath(shape);
  assert.equal(lowered.kind, 'path');
  assert.equal(lowered.source.mode, 'bezier');
  assert.equal(lowered.source.contours.length, 1);
  assert.equal(lowered.source.contours[0].closed, true);
  assert.ok(lowered.source.contours[0].segments.length >= 4);
  assert.equal(lowered.id, 'd1');
  const text = {
    ...base, kind: 'text',
    source: { content: 'Hi', fontFamily: 'Arial', fontSize: 12, fontWeight: 'normal', italic: false, layout: 'display' },
  };
  assert.equal(lowerToBezierPath(text), null);
  const composite = {
    ...base, kind: 'path',
    source: {
      id: 'p1', mode: 'ngComposite', closed: false,
      points: [
        { id: 'a', x: 0, y: 0, kind: 'hardCorner' },
        { id: 'b', x: 40, y: 0, kind: 'hardCorner' },
        { id: 'c', x: 40, y: 40, kind: 'hardCorner' },
      ],
    },
  };
  const loweredComposite = lowerToBezierPath(composite);
  assert.equal(loweredComposite.source.mode, 'bezier');
  assert.equal(loweredComposite.source.id, 'p1', 'source id survives lowering');
});
