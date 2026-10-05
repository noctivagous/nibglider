import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  computeScrollGeometry,
  scrollCenterForOffset,
  scrollCenterForPage,
  unionRects,
  MIN_THUMB_RATIO,
} from '../src/engine/document/scrollbarMath.ts';

function openEngine(shared) {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(800, 600));
  const engine = new NibGliderEngine(scope, () => {}, shared ?? {
    getItem: () => null,
    setItem: () => {},
  });
  return { scope, engine, cleanup: () => scope.project.remove() };
}

test('view covering the content yields a full thumb', () => {
  const geo = computeScrollGeometry(-500, 1000, -100, 200);
  assert.equal(geo.sizeRatio, 1);
  assert.equal(geo.offsetRatio, 0);
});

test('zoomed-in view yields a proportional thumb and offset', () => {
  // Content 0..1000, view 250..500.
  const geo = computeScrollGeometry(250, 250, 0, 1000);
  assert.ok(Math.abs(geo.sizeRatio - 0.25) < 1e-9);
  assert.ok(Math.abs(geo.offsetRatio - 250 / 750) < 1e-9);
  assert.equal(geo.rangeMin, 0);
  assert.equal(geo.rangeSize, 1000);
});

test('range is the content/view union when panned outside', () => {
  // Content 0..100, view 200..300 (fully outside in empty space).
  const geo = computeScrollGeometry(200, 100, 0, 100);
  assert.equal(geo.rangeMin, 0);
  assert.equal(geo.rangeSize, 300);
  assert.ok(Math.abs(geo.sizeRatio - 100 / 300) < 1e-9);
  assert.equal(geo.offsetRatio, 1);
});

test('tiny thumbs clamp to the minimum grab size', () => {
  const geo = computeScrollGeometry(0, 1, 0, 100000);
  assert.equal(geo.sizeRatio, MIN_THUMB_RATIO);
});

test('degenerate input yields a full thumb instead of NaN', () => {
  for (const geo of [
    computeScrollGeometry(0, 0, 0, 100),
    computeScrollGeometry(NaN, 100, 0, 100),
    computeScrollGeometry(0, 100, 0, -5),
  ]) {
    assert.equal(geo.sizeRatio, 1);
    assert.equal(geo.offsetRatio, 0);
    assert.ok(Number.isFinite(geo.rangeMin));
  }
});

test('offset round-trips through scrollCenterForOffset', () => {
  const center = scrollCenterForOffset(250 / 750, 250, 0, 1000);
  assert.ok(Math.abs(center - 375) < 1e-9);
  assert.equal(scrollCenterForOffset(-0.5, 250, 0, 1000), 125);
  assert.equal(scrollCenterForOffset(1.5, 250, 0, 1000), 875);
});

test('unionRects spans both rects, null-safe', () => {
  const both = unionRects(
    { x: -100, y: -100, width: 200, height: 200 },
    { x: 0, y: 0, width: 400, height: 100 },
  );
  assert.deepEqual(both, { x: -100, y: -100, width: 500, height: 200 });
  const single = unionRects({ x: 1, y: 2, width: 3, height: 4 }, null);
  assert.deepEqual(single, { x: 1, y: 2, width: 3, height: 4 });
});

test('paging moves by most of a viewport and clamps to the range', () => {
  assert.equal(scrollCenterForPage(500, 250, 1, 0, 1000), 500 + 225);
  assert.equal(scrollCenterForPage(900, 250, 1, 0, 1000), 875);
  assert.equal(scrollCenterForPage(100, 250, -1, 0, 1000), 125);
});

test('engine view state tracks page and artwork and notifies subscribers', () => {
  const { engine, cleanup } = openEngine();
  try {
    let notifications = 0;
    const release = engine.subscribeView(() => { notifications += 1; });
    const before = engine.getViewVersion();
    const state = engine.getViewState();
    assert.ok(state);
    assert.ok(state.viewWidth > 0 && state.viewHeight > 0);
    assert.equal(state.page, null);
    assert.equal(state.artwork, null);
    engine.scrollViewTo(state.centerX + 50, state.centerY);
    const moved = engine.getViewState();
    assert.ok(moved);
    assert.ok(Math.abs(moved.centerX - (state.centerX + 50)) < 1e-6);
    assert.ok(engine.getViewVersion() > before);
    assert.ok(notifications > 0);
    const version = engine.getViewVersion();
    release();
    engine.scrollViewTo(state.centerX, state.centerY);
    assert.equal(engine.getViewVersion(), version + 1);
    // Invalid scroll targets never throw or move the view.
    assert.doesNotThrow(() => engine.scrollViewTo(NaN, Infinity));
    release();
  } finally { cleanup(); }
});

test('artwork flows into the next view snapshot', () => {
  const { scope, engine, cleanup } = openEngine();
  try {
    assert.equal(engine.getViewState()?.artwork, null);
    new scope.Path.Rectangle({ from: [10, 20], to: [110, 120] });
    const state = engine.getViewState();
    assert.ok(state);
    assert.deepEqual(state.artwork, { x: 10, y: 20, width: 100, height: 100 });
  } finally { cleanup(); }
});

test('user page flows into the view snapshot for scrollbar range', () => {
  const { engine, cleanup } = openEngine();
  try {
    assert.equal(engine.getViewState()?.page, null);
    engine.setPageDimensions(800, 600, 'pt');
    const state = engine.getViewState();
    assert.ok(state);
    assert.deepEqual(state.page, { x: -400, y: -300, width: 800, height: 600 });
    const content = unionRects(state.page, state.artwork);
    assert.ok(content.width >= 800 && content.height >= 600);
  } finally { cleanup(); }
});
