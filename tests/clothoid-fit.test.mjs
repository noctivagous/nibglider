import test from 'node:test';
import assert from 'node:assert/strict';
import { fitClothoidG1, fresnel, sampleClothoid } from '../src/engine/geometry/clothoidFit.ts';
import { distance } from '../src/engine/geometry/splineInterpolation.ts';

const dot = (a, b) => a.x * b.x + a.y * b.y;
const norm = (v) => Math.hypot(v.x, v.y);
const unit = (v) => ({ x: v.x / norm(v), y: v.y / norm(v) });
const dir = (h) => ({ x: Math.cos(h), y: Math.sin(h) });
const legOut = (bez) => unit({ x: bez.p3.x - bez.p2.x, y: bez.p3.y - bez.p2.y });
const legIn = (bez) => unit({ x: bez.p1.x - bez.p0.x, y: bez.p1.y - bez.p0.y });
function curveMax(fn, beziers, samples = 9) {
  let worst = 0;
  for (const bez of beziers) {
    for (let i = 0; i <= samples; i++) {
      const t = i / samples; const u = 1 - t;
      const p = {
        x: u ** 3 * bez.p0.x + 3 * u * u * t * bez.p1.x + 3 * u * t * t * bez.p2.x + t ** 3 * bez.p3.x,
        y: u ** 3 * bez.p0.y + 3 * u * u * t * bez.p1.y + 3 * u * t * t * bez.p2.y + t ** 3 * bez.p3.y,
      };
      worst = Math.max(worst, fn(p));
    }
  }
  return worst;
}
function assertFiniteSpan(span, what) {
  assert.ok(span.beziers.length > 0, `${what}: emits beziers`);
  assert.ok(Number.isFinite(span.length) && span.length > 0, `${what}: finite length`);
  assert.ok(Number.isFinite(span.sharpness), `${what}: finite sharpness`);
  for (const bez of span.beziers) {
    for (const p of [bez.p0, bez.p1, bez.p2, bez.p3]) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${what}: finite control`);
    }
  }
}

test('Fresnel integrals match known values and stay odd', () => {
  assert.deepEqual(fresnel(0), { c: 0, s: 0 });
  const one = fresnel(1);
  assert.ok(Math.abs(one.c - 0.7798934003768228) < 1e-9);
  assert.ok(Math.abs(one.s - 0.4382591473903548) < 1e-9);
  const a = fresnel(2.3); const b = fresnel(-2.3);
  assert.ok(Math.abs(a.c + b.c) < 1e-12 && Math.abs(a.s + b.s) < 1e-12);
  assert.throws(() => fresnel(NaN));
});

test('exact straight stays straight with zero sharpness', () => {
  const span = fitClothoidG1({ x: 0, y: 0 }, 0, { x: 100, y: 0 }, 0);
  assert.equal(span.beziers.length, 1);
  assert.equal(span.length, 100);
  assert.equal(span.sharpness, 0);
  const [bez] = span.beziers;
  assert.deepEqual(bez.p0, { x: 0, y: 0 });
  assert.deepEqual(bez.p3, { x: 100, y: 0 });
  for (const p of [bez.p1, bez.p2]) assert.equal(p.y, 0);
});

test('quarter circle finds the arc: zero sharpness, arc length, on-circle curve', () => {
  const tol = 1e-9;
  const span = fitClothoidG1({ x: 1, y: 0 }, Math.PI / 2, { x: 0, y: 1 }, Math.PI, { tolerance: tol });
  assertFiniteSpan(span, 'quarter');
  assert.ok(Math.abs(span.sharpness) < 1e-9, `sharpness ${span.sharpness}`);
  assert.ok(Math.abs(span.length - Math.PI / 2) < 1e-9, `length ${span.length}`);
  const dev = curveMax((p) => Math.abs(Math.hypot(p.x, p.y) - 1), span.beziers);
  assert.ok(dev <= 1e-6, `radial deviation ${dev}`);
  assert.ok(span.beziers.length < 500, `bezier count ${span.beziers.length}`);
  const first = span.beziers[0]; const last = span.beziers.at(-1);
  assert.ok(distance(first.p0, { x: 1, y: 0 }) < 1e-9);
  assert.ok(distance(last.p3, { x: 0, y: 1 }) < 1e-9);
  assert.ok(dot(legIn(first), dir(Math.PI / 2)) > 1 - 1e-9);
  assert.ok(dot(legOut(last), dir(Math.PI)) > 1 - 1e-9);
});

test('S-curve inflects with exact endpoints and end tangents', () => {
  const span = fitClothoidG1({ x: 0, y: 0 }, 0, { x: 2, y: 1 }, 0, { tolerance: 1e-6 });
  assertFiniteSpan(span, 'S-curve');
  const first = span.beziers[0]; const last = span.beziers.at(-1);
  assert.ok(distance(first.p0, { x: 0, y: 0 }) < 1e-9);
  assert.ok(distance(last.p3, { x: 2, y: 1 }) < 1e-9);
  assert.ok(dot(legIn(first), dir(0)) > 1 - 1e-9);
  assert.ok(dot(legOut(last), dir(0)) > 1 - 1e-9);
  const chord = Math.hypot(2, 1);
  assert.ok(span.length > chord && span.length < 3 * chord, `length ${span.length}`);
  assert.ok(span.beziers.length < 200, `bezier count ${span.beziers.length}`);
});

test('adjacent spans share tangents (G1 across the joint)', () => {
  const knot = { x: 100, y: 0 }; const hk = 0.5;
  const left = fitClothoidG1({ x: 0, y: 0 }, -0.3, knot, hk, { tolerance: 1e-6 });
  const right = fitClothoidG1(knot, hk, { x: 180, y: 60 }, 1.1, { tolerance: 1e-6 });
  const outLast = legOut(left.beziers.at(-1));
  const inFirst = legIn(right.beziers[0]);
  assert.ok(dot(outLast, dir(hk)) > 1 - 1e-9, 'left exit matches knot heading');
  assert.ok(dot(inFirst, dir(hk)) > 1 - 1e-9, 'right entry matches knot heading');
  assert.ok(dot(outLast, inFirst) > 1 - 1e-9, 'no tangent kink at the joint');
});

test('runs interpolate endpoints, stay finite, and close the seam', () => {
  const open = sampleClothoid([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  assert.ok(open.length > 3);
  assert.deepEqual(open[0], { x: 0, y: 0 });
  assert.ok(distance(open.at(-1), { x: 100, y: 100 }) < 1e-6);
  assert.ok(open.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  for (let i = 1; i < open.length; i++) assert.ok(distance(open[i - 1], open[i]) > 1e-9);

  const triangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 87 }];
  const closed = sampleClothoid(triangle, true);
  assert.deepEqual(closed[0], { x: 0, y: 0 });
  assert.ok(closed.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  // Every on-curve point is covered by the closed run (seam pops the dupe).
  for (const q of triangle) {
    assert.ok(closed.some((p) => distance(p, q) < 1), `covers ${JSON.stringify(q)}`);
  }
});

test('degenerate input falls back, non-finite input throws', () => {
  const empty = fitClothoidG1({ x: 5, y: 5 }, 1, { x: 5, y: 5 }, 2);
  assert.deepEqual(empty.beziers, []);
  assert.equal(empty.length, 0);
  const single = sampleClothoid([{ x: 5, y: 5 }, { x: 5, y: 5 }]);
  assert.equal(single.length, 1);
  assert.throws(() => fitClothoidG1({ x: NaN, y: 0 }, 0, { x: 1, y: 0 }, 0));
  assert.throws(() => sampleClothoid([{ x: 0, y: 0 }, { x: Infinity, y: 0 }]));
  assert.throws(() => fitClothoidG1({ x: 0, y: 0 }, 0, { x: 1, y: 0 }, 0, { tolerance: 0 }));
  assert.throws(() => fitClothoidG1({ x: 0, y: 0 }, 0, { x: 1, y: 0 }, 0, { maxDepth: 99 }));
});
