import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { douglasPeucker, douglasPeuckerClosed } from '../src/engine/geometry/douglasPeucker.ts';
import { fitPolylineWithError } from '../src/engine/geometry/polylineFit.ts';

function setup() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(900, 700));
  const e = new NibGliderEngine(s, () => {});
  return { s, e, cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); } };
}

/** A polyline hugging a circular arc: centre (300,300), r=150, from -80° to 80°. */
function arcPoints(n = 61) {
  const points = [];
  for (let i = 0; i < n; i++) {
    const a = (-80 + (160 * i) / (n - 1)) * Math.PI / 180;
    points.push({ x: 300 + 150 * Math.cos(a), y: 300 + 150 * Math.sin(a) });
  }
  return points;
}

function addPolyline(s, e, points, closed = false) {
  const path = new s.Path({ segments: points.map((p) => new s.Point(p.x, p.y)), closed, strokeColor: 'black' });
  s.project.activeLayer.addChild(path);
  e.addItemToSelection(path);
  return path;
}

function maxDeviation(pathA, pathB) {
  // Largest distance from samples of A to the polyline of B's fitted curves,
  // approximated by dense samples of B.
  const dense = [];
  const lb = pathB.length;
  for (let i = 0; i <= 200; i++) dense.push(pathB.getPointAt((lb * i) / 200));
  let worst = 0;
  const la = pathA.length;
  for (let i = 0; i <= 60; i++) {
    const p = pathA.getPointAt((la * i) / 60);
    let best = Infinity;
    for (const q of dense) best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
    worst = Math.max(worst, best);
  }
  return worst;
}

test('douglas-peucker keeps endpoints and drops what fits inside the tolerance', () => {
  const line = [];
  for (let i = 0; i <= 20; i++) line.push({ x: i * 10, y: 0 });
  line[10] = { x: 100, y: 3 }; // a 3-unit bump
  const coarse = douglasPeucker(line, 5);
  assert.deepEqual(coarse, [{ x: 0, y: 0 }, { x: 200, y: 0 }], 'bump inside tolerance: only endpoints survive');
  const fine = douglasPeucker(line, 1);
  assert.ok(fine.some((p) => p.x === 100 && p.y === 3), 'bump outside tolerance is kept');
  assert.equal(fine[0].x, 0);
  assert.equal(fine[fine.length - 1].x, 200);
});

test('douglas-peucker closed keeps a square its corners only', () => {
  const ring = [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 },
    { x: 100, y: 100 }, { x: 50, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 50 },
  ];
  const kept = douglasPeuckerClosed(ring, 1);
  assert.equal(kept.length, 4);
  assert.deepEqual(
    kept.map((p) => `${p.x},${p.y}`).sort(),
    ['0,0', '0,100', '100,0', '100,100'],
  );
});

test('fit reports its achieved error and stays within reach of the tolerance', () => {
  const points = [];
  for (let i = 0; i < 96; i++) {
    const a = (2 * Math.PI * i) / 96;
    points.push({ x: 200 + 120 * Math.cos(a), y: 200 + 120 * Math.sin(a) });
  }
  const { segments, maxError } = fitPolylineWithError(points, true, 1);
  assert.ok(segments.length >= 3 && segments.length <= 12, `circle fits to a handful of cubics (${segments.length})`);
  assert.ok(maxError > 0, 'error is measured, not assumed');
  assert.ok(maxError <= 1.05, `achieved error ${maxError} within the requested tolerance's reach`);
});

test('simplify reduces a dense polyline inside its tolerance, in one undo step', () => {
  const { s, e, cleanup } = setup();
  try {
    const original = addPolyline(s, e, arcPoints(61));
    const originalData = original.pathData;
    e.setSimplifyTolerance(2);
    assert.equal(e.simplifySelectionPaths(), 1);
    const simplified = e.contentItems()[0];
    assert.notEqual(simplified, original);
    assert.ok(simplified.segments.length < 20, `61 points became ${simplified.segments.length}`);
    assert.ok(maxDeviation(original, simplified) <= 2.6, 'geometry stays within tolerance (+ sampling slack)');
    assert.match(e.pathOpFeedback, /61 points became/);
    assert.deepEqual(simplified.data.simplifyRecord, { version: 1, tolerance: 2 });
    e.undo();
    assert.equal(e.contentItems()[0].pathData, originalData, 'one undo restores the dense polyline');
  } finally { cleanup(); }
});

test('fit converts a raw polyline into an editable bezier path and reports its error', () => {
  const { s, e, cleanup } = setup();
  try {
    const original = addPolyline(s, e, arcPoints(61));
    const originalData = original.pathData;
    e.setFitTolerance(1);
    assert.equal(e.fitBeziersSelection(), 1);
    const fitted = e.contentItems()[0];
    assert.ok(fitted.segments.length <= 12, `61 points became ${fitted.segments.length} anchors`);
    const curved = fitted.segments.filter((seg) => (
      Math.hypot(seg.handleIn.x, seg.handleIn.y) > 0.01 || Math.hypot(seg.handleOut.x, seg.handleOut.y) > 0.01
    ));
    assert.ok(curved.length >= fitted.segments.length - 1, 'anchors carry curve handles');
    assert.ok(fitted.data.fitRecord.maxError <= 1.05, `recorded error ${fitted.data.fitRecord.maxError}`);
    assert.match(e.pathOpFeedback, /largest error/);
    assert.ok(maxDeviation(original, fitted) <= 1.6, 'fitted curve tracks the polyline');
    e.undo();
    assert.equal(e.contentItems()[0].pathData, originalData);
  } finally { cleanup(); }
});

test('fit converts a smoothed curve path into a plain bezier path', () => {
  const { s, e, cleanup } = setup();
  try {
    // A smoothed polyline renders as a curvy path; fitting it must
    // land an ordinary editable Bézier path with fewer anchors.
    const wave = new s.Path({
      segments: [new s.Point(50, 300), new s.Point(200, 180), new s.Point(350, 420), new s.Point(500, 300), new s.Point(650, 180)],
      strokeColor: 'black',
    });
    wave.smooth();
    s.project.activeLayer.addChild(wave);
    e.addItemToSelection(wave);
    const sampledBefore = wave.length;
    e.setFitTolerance(1.5);
    assert.equal(e.fitBeziersSelection(), 1);
    const fitted = e.contentItems()[0];
    assert.equal(fitted.className, 'Path');
    assert.ok(Math.abs(fitted.length - sampledBefore) / sampledBefore < 0.05, 'length roughly preserved');
    assert.ok(fitted.data.fitRecord.maxError <= 1.6, `recorded error ${fitted.data.fitRecord.maxError}`);
  } finally { cleanup(); }
});
