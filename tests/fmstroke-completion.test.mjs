import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCompositePath } from '../src/engine/geometry/compositeExpansion.ts';
import { PathDrawingSession } from '../src/engine/drawing/PathDrawingSession.ts';

let seq = 0;
const pt = (x, y, kind = 'bSpline', outgoing) => ({
  id: `p${++seq}`, x, y, kind, ...(outgoing ? { outgoing } : {}),
});
// Full 9-field bow record (Slice 14 model), absolute amplitude.
const bowRec = (facing, amplitude) => ({
  facing, amplitude, amplitudeIsPercent: false, peakLocation: 0.5,
  peakLocationMultiplier: 1, isArc: false, dualDistance: 0, corneredApex: 'none',
});
const composite = (points, closed = false) => ({ id: 'c', mode: 'ngComposite', closed, points });

function samplesOf(path) {
  return resolveCompositePath(path).segments.map((s) => s.point);
}

test('bowed segment bows to the facing side by its offset', () => {
  const left = samplesOf(composite([
    pt(0, 0, 'bowedLine', { kind: 'bowedLine', bow: bowRec('A', 20) }),
    pt(100, 0),
  ]));
  const minY = Math.min(...left.map((p) => p.y));
  assert.ok(minY < -15, `left bow peaks up (min y ${minY})`);
  assert.equal(left[0].y, 0);
  assert.equal(left[left.length - 1].y, 0);

  const right = samplesOf(composite([
    pt(0, 0, 'bowedLine', { kind: 'bowedLine', bow: bowRec('B', 20) }),
    pt(100, 0),
  ]));
  const maxY = Math.max(...right.map((p) => p.y));
  assert.ok(maxY > 15, `right bow peaks down (max y ${maxY})`);
});

test('bowed segment defaults to a quarter-chord bow', () => {
  const samples = samplesOf(composite([
    pt(0, 0, 'bowedLine', { kind: 'bowedLine' }),
    pt(80, 0),
  ]));
  const minY = Math.min(...samples.map((p) => p.y));
  assert.ok(minY < -14 && minY > -26, `default bow near -20, got ${minY}`);
});

test('three-point arc resolves onto the circle through its points', () => {
  const samples = samplesOf(composite([
    pt(0, 0),
    pt(50, -50, 'arcByThreeStart'),
    pt(100, 0, 'arcByThreeEnd'),
    pt(160, 0, 'line'),
  ]));
  assert.ok(samples.length > 6);
  // Circle through (0,0), (50,-50), (100,0): centre (50,0), r = 50
  // (the through point is the circle's bottom — a semicircle).
  const arcSamples = samples.filter((p) => p.x >= 0 && p.x <= 100);
  assert.ok(arcSamples.length > 4);
  for (const p of arcSamples) {
    const d = Math.hypot(p.x - 50, p.y - 0);
    assert.ok(Math.abs(d - 50) < 2.5, `sample on circle (d=${d})`);
  }
  const minY = Math.min(...samples.map((p) => p.y));
  assert.ok(minY < -45, 'arc reaches the through point height');
});

test('collinear three-point arc falls back to straight segments', () => {
  const samples = samplesOf(composite([
    pt(0, 0),
    pt(50, 0, 'arcByThreeStart'),
    pt(100, 0, 'arcByThreeEnd'),
  ]));
  assert.ok(samples.every((p) => Math.abs(p.y) < 1e-6));
  assert.ok(samples.length >= 2);
});

test("outgoing 'arc' segment resolves as a semicircle on the chord", () => {
  const samples = samplesOf(composite([
    pt(0, 0, 'line', { kind: 'arc' }),
    pt(100, 0, 'line'),
  ]));
  const minY = Math.min(...samples.map((p) => p.y));
  assert.ok(minY < -45 && minY > -55, `semicircle apex near -50, got ${minY}`);
});

test('drawing session deposits bowed and arc points that resolve', () => {
  const session = new PathDrawingSession('s1', { x: 0, y: 0 }, 'bSpline');
  session.commit('bSpline', { x: 50, y: -50 });
  session.commitArcThrough({ x: 100, y: 0 });
  const mid = session.snapshot();
  assert.equal(mid.points[1].kind, 'arcByThreeStart');
  assert.equal(mid.points[2].kind, 'arcByThreeEnd');
  // The mid-session snapshot resolves without throwing.
  assert.ok(samplesOf(mid).length > 3);
  session.commit('bSpline', { x: 160, y: 0 });
  const done = session.snapshot();
  assert.equal(done.points[1].kind, 'arcByThreeStart');
  assert.equal(done.points[2].kind, 'arcByThreeEnd');
  assert.ok(samplesOf(done).length > 5);

  const bowed = new PathDrawingSession('s2', { x: 0, y: 0 }, 'bSpline');
  bowed.commitBowed({ x: 100, y: 0 }, 'right');
  const snap = bowed.snapshot();
  assert.equal(snap.points[0].kind, 'bowedLine');
  assert.equal(snap.points[0].outgoing.bow.facing, 'B');
  const samples = samplesOf(snap);
  assert.ok(Math.max(...samples.map((p) => p.y)) > 10, 'deposited bow renders');
});
