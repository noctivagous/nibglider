import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import {
  computeScrollGeometry,
  scrollCenterForOffset,
  scrollCenterForPage,
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

test('view covering the board yields a full thumb', () => {
  const geo = computeScrollGeometry(-500, 1000, -100, 200);
  assert.equal(geo.sizeRatio, 1);
  assert.equal(geo.offsetRatio, 0);
});

test('zoomed-in view yields a proportional thumb and offset', () => {
  // Board 0..1000, view 250..500.
  const geo = computeScrollGeometry(250, 250, 0, 1000);
  assert.ok(Math.abs(geo.sizeRatio - 0.25) < 1e-9);
  assert.ok(Math.abs(geo.offsetRatio - 250 / 750) < 1e-9);
  assert.equal(geo.rangeMin, 0);
  assert.equal(geo.rangeSize, 1000);
});

test('range is the board/view union when panned outside', () => {
  // Board 0..100, view 200..300 (fully outside in empty space).
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

test('paging moves by most of a viewport and clamps to the range', () => {
  assert.equal(scrollCenterForPage(500, 250, 1, 0, 1000), 500 + 225);
  assert.equal(scrollCenterForPage(900, 250, 1, 0, 1000), 875);
  assert.equal(scrollCenterForPage(100, 250, -1, 0, 1000), 125);
});

test('engine view state tracks the board and notifies subscribers', () => {
  const { engine, cleanup } = openEngine();
  try {
    let notifications = 0;
    const release = engine.subscribeView(() => { notifications += 1; });
    const before = engine.getViewVersion();
    const state = engine.getViewState();
    assert.ok(state);
    assert.ok(state.viewWidth > 0 && state.viewHeight > 0);
    assert.equal(state.board.width, engine.drawingBoardRect().width);
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

test('board resize flows into the next view snapshot', () => {
  const { engine, cleanup } = openEngine();
  try {
    engine.setDrawingBoardSize(1, 1, 'm');
    const state = engine.getViewState();
    assert.ok(state);
    assert.equal(state.board.width, engine.drawingBoardRect().width);
  } finally { cleanup(); }
});
