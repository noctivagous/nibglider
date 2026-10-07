// Pure repeat-position math for grid and ring repeats.
// Owns no scene or engine state. Reads only the spec it is given. Mutates
// nothing. Grid anchors reuse GridGeometry; ring positions are computed here.
// Tested from tests/repeat-geometry.test.mjs.
import {
  createGrid,
  gridCellCenter,
  gridCellOrigin,
  gridIntersection,
  type GridSpec,
} from './GridGeometry';
import type { Vec2 } from '../model/geometryResolution';

export type RepeatAnchor = 'cell-center' | 'intersection' | 'cell-origin';
export type RepeatDirection = 'both' | 'horizontal' | 'vertical';

export const REPEAT_MIN_COUNT = 1;
export const REPEAT_MAX_COUNT = 12;

/** Clamp a row/column count to an integer in [1, 12]; invalid keeps fallback. */
export function clampRepeatCount(value: unknown, fallback = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(REPEAT_MIN_COUNT, Math.min(REPEAT_MAX_COUNT, Math.floor(value)));
}

export function isRepeatAnchor(value: unknown): value is RepeatAnchor {
  return value === 'cell-center' || value === 'intersection' || value === 'cell-origin';
}

export function isRepeatDirection(value: unknown): value is RepeatDirection {
  return value === 'both' || value === 'horizontal' || value === 'vertical';
}

/**
 * Ring positions for circle repeat: `count` points on a circle of `radius`
 * around `center`, starting at `startAngleDeg` and stepping clockwise in
 * document coordinates (y down). Non-positive or non-finite radius collapses
 * to `count` copies of the center; count clamps to [1, 12].
 */
export function circleRepeatPositions(
  center: Vec2,
  radius: number,
  count: number,
  startAngleDeg = 0,
): Vec2[] {
  const n = clampRepeatCount(count);
  const out: Vec2[] = [];
  if (!(radius > 0) || !Number.isFinite(radius)) {
    for (let i = 0; i < n; i++) out.push({ x: center.x, y: center.y });
    return out;
  }
  const start = (Number.isFinite(startAngleDeg) ? startAngleDeg : 0) * (Math.PI / 180);
  for (let i = 0; i < n; i++) {
    const angle = start + (i / n) * Math.PI * 2;
    out.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return out;
}

/**
 * Ordered grid repeat positions for one anchor and direction. Row-major.
 * 'horizontal' keeps the first row only; 'vertical' keeps the first column.
 * Intersections iterate the (rows + 1) x (cols + 1) lattice from GridGeometry.
 */
export function repeatPositions(
  spec: GridSpec,
  anchor: RepeatAnchor,
  direction: RepeatDirection = 'both',
): Vec2[] {
  const grid = createGrid(spec);
  const keepRow = (row: number): boolean => direction !== 'horizontal' || row === 0;
  const keepCol = (col: number): boolean => direction !== 'vertical' || col === 0;
  const out: Vec2[] = [];
  if (anchor === 'intersection') {
    for (let row = 0; row <= grid.rows; row++) {
      if (!keepRow(row)) continue;
      for (let col = 0; col <= grid.cols; col++) {
        if (!keepCol(col)) continue;
        out.push(gridIntersection(grid, row, col) as Vec2);
      }
    }
    return out;
  }
  for (let row = 0; row < grid.rows; row++) {
    if (!keepRow(row)) continue;
    for (let col = 0; col < grid.cols; col++) {
      if (!keepCol(col)) continue;
      const point = anchor === 'cell-origin'
        ? gridCellOrigin(grid, row, col)
        : gridCellCenter(grid, row, col);
      out.push(point as Vec2);
    }
  }
  return out;
}
