import test from 'node:test';
import assert from 'node:assert/strict';
import {
  circleRepeatPositions,
  clampRepeatCount,
  isRepeatAnchor,
  isRepeatDirection,
  repeatPositions,
} from '../src/engine/geometry/RepeatGeometry.ts';
import { createGrid } from '../src/engine/geometry/GridGeometry.ts';

const SPEC = createGrid({
  origin: { x: 0, y: 0 },
  cols: 3,
  rows: 2,
  cellW: 100,
  cellH: 50,
  gutterX: 0,
  gutterY: 0,
  margin: 0,
});

test('repeat counts clamp to 1..12 and reject non-numbers', () => {
  assert.equal(clampRepeatCount(4), 4);
  assert.equal(clampRepeatCount(2.9), 2);
  assert.equal(clampRepeatCount(0), 1);
  assert.equal(clampRepeatCount(99), 12);
  assert.equal(clampRepeatCount(NaN), 1);
  assert.equal(clampRepeatCount('3'), 1);
  assert.equal(clampRepeatCount(NaN, 5), 5);
});

test('repeat anchors and directions validate by membership', () => {
  assert.equal(isRepeatAnchor('cell-center'), true);
  assert.equal(isRepeatAnchor('intersection'), true);
  assert.equal(isRepeatAnchor('cell-origin'), true);
  assert.equal(isRepeatAnchor('corner'), false);
  assert.equal(isRepeatDirection('both'), true);
  assert.equal(isRepeatDirection('horizontal'), true);
  assert.equal(isRepeatDirection('diagonal'), false);
});

test('grid repeat covers every cell center in row-major order', () => {
  const points = repeatPositions(SPEC, 'cell-center');
  assert.equal(points.length, 6);
  assert.deepEqual(points[0], { x: 50, y: 25 });
  assert.deepEqual(points[5], { x: 250, y: 75 });
  const origins = repeatPositions(SPEC, 'cell-origin');
  assert.equal(origins.length, 6);
  assert.deepEqual(origins[0], { x: 0, y: 0 });
  assert.deepEqual(origins[5], { x: 200, y: 50 });
});

test('grid repeat on intersections yields the full lattice', () => {
  const points = repeatPositions(SPEC, 'intersection');
  assert.equal(points.length, 12);
  assert.deepEqual(points[0], { x: 0, y: 0 });
  assert.deepEqual(points[11], { x: 300, y: 100 });
});

test('direction limits keep the first row or first column', () => {
  const horizontal = repeatPositions(SPEC, 'cell-center', 'horizontal');
  assert.equal(horizontal.length, 3);
  assert.deepEqual(horizontal[2], { x: 250, y: 25 });
  const vertical = repeatPositions(SPEC, 'cell-center', 'vertical');
  assert.equal(vertical.length, 2);
  assert.deepEqual(vertical[1], { x: 50, y: 75 });
  const crossRow = repeatPositions(SPEC, 'intersection', 'horizontal');
  assert.equal(crossRow.length, 4);
  assert.deepEqual(crossRow[3], { x: 300, y: 0 });
  const crossCol = repeatPositions(SPEC, 'intersection', 'vertical');
  assert.equal(crossCol.length, 3);
  assert.deepEqual(crossCol[2], { x: 0, y: 100 });
});

test('circle repeat spreads evenly around the ring from the start angle', () => {
  const points = circleRepeatPositions({ x: 10, y: 20 }, 100, 4, 0);
  assert.equal(points.length, 4);
  assert.deepEqual(points[0], { x: 110, y: 20 });
  const rounded = points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  assert.deepEqual(rounded[1], { x: 10, y: 120 });
  assert.deepEqual(rounded[2], { x: -90, y: 20 });
  assert.deepEqual(rounded[3], { x: 10, y: -80 });
  assert.equal(circleRepeatPositions({ x: 0, y: 0 }, 10, 99).length, 12);
  assert.deepEqual(circleRepeatPositions({ x: 5, y: 6 }, 0, 3),
    [{ x: 5, y: 6 }, { x: 5, y: 6 }, { x: 5, y: 6 }]);
});
