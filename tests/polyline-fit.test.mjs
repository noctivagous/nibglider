import test from 'node:test';
import assert from 'node:assert/strict';
import { reducePolyline } from '../src/engine/geometry/polylineFit.ts';

function cubicAt(from, c1, c2, to, t) {
  const s = 1 - t;
  return {
    x: s ** 3 * from.x + 3 * s * s * t * c1.x + 3 * s * t * t * c2.x + t ** 3 * to.x,
    y: s ** 3 * from.y + 3 * s * s * t * c1.y + 3 * s * t * t * c2.y + t ** 3 * to.y,
  };
}

function deviation(points, segments, closed) {
  let max = 0;
  const n = segments.length;
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const a = segments[i];
    const b = segments[(i + 1) % n];
    const from = a.point;
    const c1 = { x: from.x + a.handleOut.x, y: from.y + a.handleOut.y };
    const to = b.point;
    const c2 = { x: to.x + b.handleIn.x, y: to.y + b.handleIn.y };
    for (const point of points) {
      let best = Infinity;
      for (let k = 0; k <= 360; k++) {
        const hit = cubicAt(from, c1, c2, to, k / 360);
        best = Math.min(best, Math.hypot(hit.x - point.x, hit.y - point.y));
      }
      // Only score points that belong near this span: the nearest span wins below.
      point._best = Math.min(point._best ?? Infinity, best);
    }
  }
  for (const point of points) {
    max = Math.max(max, point._best ?? Infinity);
    delete point._best;
  }
  return max;
}

test('collinear points collapse to the original endpoints', () => {
  const points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }];
  const fit = reducePolyline(points, false, 0.1);
  assert.equal(fit.length, 2);
  assert.deepEqual(fit[0].point, { x: 0, y: 0 });
  assert.deepEqual(fit[1].point, { x: 9, y: 0 });
  for (const seg of fit) {
    assert.deepEqual(seg.handleIn, { x: 0, y: 0 });
    assert.deepEqual(seg.handleOut, { x: 0, y: 0 });
  }
});

test('a rectangle keeps its corners and stays straight', () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 4 }];
  const fit = reducePolyline(points, true, 0.1);
  assert.equal(fit.length, 4);
  for (const seg of fit) {
    assert.ok(points.some((p) => p.x === seg.point.x && p.y === seg.point.y));
    assert.equal(seg.handleIn.x, 0);
    assert.equal(seg.handleIn.y, 0);
    assert.equal(seg.handleOut.x, 0);
    assert.equal(seg.handleOut.y, 0);
  }
});

test('a sampled circle refits to a handful of cubics within tolerance', () => {
  const points = [];
  for (let d = 0; d < 360; d += 6) {
    const a = d * Math.PI / 180;
    points.push({ x: 40 * Math.cos(a), y: 40 * Math.sin(a) });
  }
  const fit = reducePolyline(points, true, 0.1);
  assert.ok(fit.length <= 8, `circle kept ${fit.length} anchors`);
  assert.ok(fit.length >= 4, `circle collapsed to ${fit.length}`);
  assert.ok(fit.some((seg) => Math.hypot(seg.handleOut.x, seg.handleOut.y) > 1), 'expected curve handles');
  const err = deviation(points, fit, true);
  assert.ok(err <= 0.1 + 1e-6, `sample left the cubic by ${err}`);
});

test('a right-angle corner stays an anchor between fitted sides', () => {
  const points = [];
  for (let i = 0; i <= 8; i++) points.push({ x: i * 5, y: 0 });
  for (let i = 1; i <= 8; i++) points.push({ x: 40, y: i * 5 });
  const fit = reducePolyline(points, false, 0.1);
  assert.equal(fit.length, 3);
  assert.deepEqual(fit[1].point, { x: 40, y: 0 });
  for (const seg of fit) {
    assert.equal(seg.handleIn.x, 0);
    assert.equal(seg.handleOut.y, 0);
  }
});
