import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { fbm1, noise1 } from '../src/engine/geometry/noise.ts';

function setup() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  const e = new NibGliderEngine(s, () => {});
  return { s, e, cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); } };
}

function addLine(s, e) {
  const line = new s.Path.Line(new s.Point(50, 300), new s.Point(550, 300));
  line.strokeColor = 'black';
  line.strokeWidth = 2;
  s.project.activeLayer.addChild(line);
  e.addItemToSelection(line);
  return line;
}

test('seeded noise is deterministic, seed-sensitive, and bounded', () => {
  for (const x of [0, 0.5, 1.25, 7.75, 100.125]) {
    assert.equal(noise1(42, x), noise1(42, x), 'same seed + input = same output');
    assert.equal(fbm1(7, x), fbm1(7, x));
    assert.ok(Math.abs(noise1(42, x)) <= 1);
    assert.ok(Math.abs(fbm1(7, x)) <= 1);
  }
  const a = [0.3, 1.7, 4.2].map((x) => fbm1(1, x));
  const b = [0.3, 1.7, 4.2].map((x) => fbm1(2, x));
  assert.notDeepEqual(a, b, 'different seeds give different noise');
  // The noise actually varies along its domain.
  const samples = new Set();
  for (let i = 0; i <= 40; i++) samples.add(fbm1(3, i / 4).toFixed(3));
  assert.ok(samples.size > 20, 'noise varies along the path coordinate');
});

test('applying noise displaces a straight path and records its parameters', () => {
  const { s, e, cleanup } = setup();
  try {
    const line = addLine(s, e);
    e.setNoiseAmplitude(24);
    e.setNoiseScale(60);
    e.setNoiseSeed(5);
    assert.equal(e.applyNoiseDisplacement(), 1);
    const displaced = e.contentItems()[0];
    assert.notEqual(displaced, line, 'the source item is replaced');
    // Some sampled point now sits well off the original straight line.
    let maxDeviation = 0;
    const length = displaced.length;
    for (let i = 0; i <= 40; i++) {
      const p = displaced.getPointAt((length * i) / 40);
      maxDeviation = Math.max(maxDeviation, Math.abs(p.y - 300));
    }
    assert.ok(maxDeviation > 4, `path pushed sideways (max deviation ${maxDeviation})`);
    assert.deepEqual(displaced.data.noiseDisplacement, { version: 1, amplitude: 24, scale: 60, seed: 5 });
    // One undo restores the straight line.
    e.undo();
    assert.equal(e.contentItems().length, 1);
    assert.equal(e.contentItems()[0].pathData, line.pathData);
  } finally { cleanup(); }
});

test('the same seed and input give the same displaced path; another seed differs', () => {
  const runs = [];
  for (const seed of [9, 9, 10]) {
    const { s, e, cleanup } = setup();
    try {
      addLine(s, e);
      e.setNoiseAmplitude(18);
      e.setNoiseScale(45);
      e.setNoiseSeed(seed);
      e.applyNoiseDisplacement();
      runs.push(e.contentItems()[0].pathData);
    } finally { cleanup(); }
  }
  assert.equal(runs[0], runs[1], 'deterministic for a given seed');
  assert.notEqual(runs[0], runs[2], 'a different seed displaces differently');
});

test('a closed path stays closed and smooth after displacement', () => {
  const { s, e, cleanup } = setup();
  try {
    const circle = new s.Path.Circle(new s.Point(300, 300), 120);
    circle.fillColor = 'black';
    s.project.activeLayer.addChild(circle);
    e.addItemToSelection(circle);
    e.setNoiseAmplitude(10);
    e.setNoiseScale(80);
    e.setNoiseSeed(3);
    assert.equal(e.applyNoiseDisplacement(), 1);
    const displaced = e.contentItems()[0];
    assert.equal(displaced.closed, true, 'closed stays closed');
    assert.ok(displaced.segments.length <= 40, `refit stays compact (${displaced.segments.length} segments)`);
    // Every segment carries handles (a smooth refit, not a polyline).
    const curved = displaced.segments.filter((seg) => (
      Math.hypot(seg.handleIn.x, seg.handleIn.y) > 0.01 || Math.hypot(seg.handleOut.x, seg.handleOut.y) > 0.01
    ));
    assert.ok(curved.length >= displaced.segments.length - 1, 'segments are fitted cubics');
    // Still roughly circular: radii stay within amplitude of 120.
    const length = displaced.length;
    for (let i = 0; i <= 24; i++) {
      const p = displaced.getPointAt((length * i) / 24);
      const r = Math.hypot(p.x - 300, p.y - 300);
      assert.ok(r > 100 && r < 140, `radius ${r} within reach of the original circle`);
    }
  } finally { cleanup(); }
});

test('zero amplitude leaves the path on its original course', () => {
  const { s, e, cleanup } = setup();
  try {
    addLine(s, e);
    e.setNoiseAmplitude(0);
    assert.equal(e.applyNoiseDisplacement(), 1);
    const displaced = e.contentItems()[0];
    const length = displaced.length;
    for (let i = 0; i <= 20; i++) {
      const p = displaced.getPointAt((length * i) / 20);
      assert.ok(Math.abs(p.y - 300) < 0.5, 'no sideways drift at zero amplitude');
    }
  } finally { cleanup(); }
});

test('preview shows guide copies without touching content or history', () => {
  const { s, e, cleanup } = setup();
  try {
    addLine(s, e);
    e.setNoiseAmplitude(20);
    e.setNoisePreview(true);
    const guides = s.project.activeLayer.children.filter((item) => !!item.guide);
    assert.equal(guides.length, 1, 'one guide preview item');
    assert.equal(e.contentItems().length, 1, 'content untouched');
    assert.equal(e.canUndo(), false, 'no history entry for a preview');
    // Changing a parameter rebuilds the preview in place.
    e.setNoiseSeed(99);
    const guides2 = s.project.activeLayer.children.filter((item) => !!item.guide);
    assert.equal(guides2.length, 1);
    assert.notEqual(guides2[0], guides[0]);
    e.setNoisePreview(false);
    assert.equal(s.project.activeLayer.children.filter((item) => !!item.guide).length, 0);
  } finally { cleanup(); }
});
