import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGrid,
  gridAllCenters,
  gridAllIntersections,
  gridAnchorPoints,
  gridBounds,
  gridCellCenter,
  gridCellCorners,
  gridCellCount,
  gridCellOrigin,
  gridCellRect,
  gridCellSize,
  gridFromJSON,
  gridIntersection,
  gridOrigin,
  gridPositionForIndex,
  gridToJSON,
  setGridCellSize,
  setGridCols,
  setGridGutters,
  setGridMargin,
  setGridOrigin,
  setGridRows,
} from '../src/engine/geometry/GridGeometry.ts';

const SPEC = createGrid({
  origin: { x: 10, y: 20 },
  cols: 3,
  rows: 2,
  cellW: 100,
  cellH: 50,
  gutterX: 10,
  gutterY: 5,
  margin: 4,
});

test('createGrid sanitizes invalid input to safe defaults', () => {
  assert.deepEqual(createGrid(null), createGrid({}));
  const bad = createGrid({ cols: 0, rows: -2.7, cellW: -5, cellH: NaN,
    gutterX: -1, gutterY: Infinity, margin: -3 });
  assert.equal(bad.cols, 1);
  assert.equal(bad.rows, 1);
  assert.ok(bad.cellW > 0 && bad.cellH > 0);
  assert.equal(bad.gutterX, 0);
  assert.equal(bad.gutterY, 0);
  assert.equal(bad.margin, 0);
  const frac = createGrid({ cols: 2.9, rows: 2.2 });
  assert.equal(frac.cols, 2);
  assert.equal(frac.rows, 2);
});

test('getters report origin, counts, sizes, and bounds', () => {
  assert.deepEqual(gridOrigin(SPEC), { x: 10, y: 20 });
  assert.equal(gridCellCount(SPEC), 6);
  assert.deepEqual(gridCellSize(SPEC), { w: 100, h: 50 });
  // width: 2*4 + 3*100 + 2*10 = 328; height: 2*4 + 2*50 + 1*5 = 113.
  assert.deepEqual(gridBounds(SPEC), { x: 10, y: 20, width: 328, height: 113 });
});

test('setters return new specs and keep current values on invalid input', () => {
  const moved = setGridOrigin(SPEC, { x: 1, y: 2 });
  assert.deepEqual(gridOrigin(moved), { x: 1, y: 2 });
  assert.deepEqual(gridOrigin(SPEC), { x: 10, y: 20 });
  assert.equal(setGridRows(SPEC, 4).rows, 4);
  assert.equal(setGridCols(SPEC, 5).cols, 5);
  assert.equal(setGridRows(SPEC, 2.9).rows, 2);
  assert.deepEqual(gridCellSize(setGridCellSize(SPEC, 30, 40)), { w: 30, h: 40 });
  const gutters = setGridGutters(SPEC, 7, 8);
  assert.equal(gutters.gutterX, 7);
  assert.equal(gutters.gutterY, 8);
  assert.equal(setGridMargin(SPEC, 6).margin, 6);
  assert.equal(setGridRows(SPEC, NaN), SPEC);
  assert.equal(setGridCols(SPEC, Infinity), SPEC);
  assert.equal(setGridCellSize(SPEC, -1, 10), SPEC);
  assert.equal(setGridGutters(SPEC, -1, 0), SPEC);
  assert.equal(setGridMargin(SPEC, -2), SPEC);
  assert.equal(setGridOrigin(SPEC, { x: NaN, y: 0 }), SPEC);
});

test('cell rects, origins, centers, and corners use margin plus pitch', () => {
  // Cell (0,0): x = 10 + 4 = 14, y = 20 + 4 = 24.
  assert.deepEqual(gridCellRect(SPEC, 0, 0), { x: 14, y: 24, width: 100, height: 50 });
  // Cell (1,2): x = 14 + 2*110 = 234, y = 24 + 1*55 = 79.
  assert.deepEqual(gridCellRect(SPEC, 1, 2), { x: 234, y: 79, width: 100, height: 50 });
  assert.deepEqual(gridCellOrigin(SPEC, 1, 2), { x: 234, y: 79 });
  assert.deepEqual(gridCellCenter(SPEC, 1, 2), { x: 284, y: 104 });
  assert.deepEqual(gridCellCorners(SPEC, 0, 0), [
    { x: 14, y: 24 },
    { x: 114, y: 24 },
    { x: 114, y: 74 },
    { x: 14, y: 74 },
  ]);
  assert.equal(gridCellRect(SPEC, 2, 0), null);
  assert.equal(gridCellRect(SPEC, 0, 3), null);
  assert.equal(gridCellCenter(SPEC, 0.5, 0), null);
  assert.equal(gridCellCorners(SPEC, -1, 0), null);
});

test('intersections form a (rows+1) x (cols+1) lattice on cell origins', () => {
  assert.deepEqual(gridIntersection(SPEC, 0, 0), { x: 14, y: 24 });
  assert.deepEqual(gridIntersection(SPEC, 0, 3), { x: 344, y: 24 });
  assert.deepEqual(gridIntersection(SPEC, 2, 0), { x: 14, y: 134 });
  assert.deepEqual(gridIntersection(SPEC, 2, 3), { x: 344, y: 134 });
  assert.equal(gridIntersection(SPEC, 3, 0), null);
  assert.equal(gridIntersection(SPEC, 0, 4), null);
  const all = gridAllIntersections(SPEC);
  assert.equal(all.length, 12);
  assert.deepEqual(all[0], { x: 14, y: 24 });
  assert.deepEqual(all[11], { x: 344, y: 134 });
});

test('ordered anchor lists serve repeat stamping', () => {
  const centers = gridAllCenters(SPEC);
  assert.equal(centers.length, 6);
  assert.deepEqual(centers[0], { x: 64, y: 49 });
  assert.deepEqual(centers[5], { x: 284, y: 104 });
  assert.deepEqual(gridAnchorPoints(SPEC, 'cell-center'), centers);
  assert.deepEqual(gridAnchorPoints(SPEC, 'intersection'), gridAllIntersections(SPEC));
  const origins = gridAnchorPoints(SPEC, 'cell-origin');
  assert.equal(origins.length, 6);
  assert.deepEqual(origins[0], { x: 14, y: 24 });
  assert.deepEqual(origins[5], { x: 234, y: 79 });
  assert.deepEqual(gridPositionForIndex(SPEC, 0), { x: 64, y: 49 });
  assert.deepEqual(gridPositionForIndex(SPEC, 5), { x: 284, y: 104 });
  assert.deepEqual(gridPositionForIndex(SPEC, 5, 'cell-origin'), { x: 234, y: 79 });
  assert.deepEqual(gridPositionForIndex(SPEC, 0, 'intersection'), { x: 14, y: 24 });
  assert.deepEqual(gridPositionForIndex(SPEC, 11, 'intersection'), { x: 344, y: 134 });
  assert.equal(gridPositionForIndex(SPEC, 6), null);
  assert.equal(gridPositionForIndex(SPEC, 12, 'intersection'), null);
  assert.equal(gridPositionForIndex(SPEC, -1), null);
});

test('json round-trips and rejects non-records', () => {
  const revived = gridFromJSON(gridToJSON(SPEC));
  assert.deepEqual(revived, SPEC);
  assert.deepEqual(gridFromJSON({ cols: 2, unknownKey: true }), createGrid({ cols: 2 }));
  assert.equal(gridFromJSON(null), null);
  assert.equal(gridFromJSON([1, 2]), null);
  assert.equal(gridFromJSON('grid'), null);
});
