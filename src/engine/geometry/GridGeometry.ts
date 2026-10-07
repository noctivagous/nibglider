// Pure bounded-grid geometry for repeat, data tables, and page-layout grids.
// Owns no scene or engine state. Reads only the spec it is given. Mutates
// nothing. Paper path construction and cursor snapping stay in their owners
// (ShapeFactory, SnappingManager, GridRenderer).
// Non-goals: rendering, snapping, panel UI, persistence wiring. Intended
// consumers: REPEAT grid repeat (cell centers, intersections), CSV-paste
// Data Table (cell rects), modular/column page grids (bounds, cell rects).
// Tested from tests/grid-geometry.test.mjs.
import type { Vec2 } from '../model/geometryResolution';

export interface GridSpec {
  origin: Vec2;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  gutterX: number;
  gutterY: number;
  margin: number;
}

export interface GridRect { x: number; y: number; width: number; height: number }

/** One repeat position per cell, or one per lattice crossing. */
export type GridAnchor = 'cell-center' | 'intersection' | 'cell-origin';

export const DEFAULT_GRID_SPEC: GridSpec = {
  origin: { x: 0, y: 0 },
  cols: 1,
  rows: 1,
  cellW: 20,
  cellH: 20,
  gutterX: 0,
  gutterY: 0,
  margin: 0,
};

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function countOr(value: unknown, fallback: number): number {
  const n = finiteOr(value, fallback);
  return Math.max(1, Math.floor(n));
}

function sizeOr(value: unknown, fallback: number): number {
  const n = finiteOr(value, fallback);
  return n > 0 ? n : fallback;
}

function gapOr(value: unknown): number {
  const n = finiteOr(value, 0);
  return Math.max(0, n);
}

function originOr(value: unknown): Vec2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_GRID_SPEC.origin };
  const rec = value as Record<string, unknown>;
  return { x: finiteOr(rec['x'], 0), y: finiteOr(rec['y'], 0) };
}

/** Merge a partial spec over defaults; invalid values keep their defaults. */
export function createGrid(partial?: Partial<GridSpec> | null): GridSpec {
  if (!partial || typeof partial !== 'object') {
    return { ...DEFAULT_GRID_SPEC, origin: { ...DEFAULT_GRID_SPEC.origin } };
  }
  return {
    origin: originOr(partial.origin),
    cols: countOr(partial.cols, DEFAULT_GRID_SPEC.cols),
    rows: countOr(partial.rows, DEFAULT_GRID_SPEC.rows),
    cellW: sizeOr(partial.cellW, DEFAULT_GRID_SPEC.cellW),
    cellH: sizeOr(partial.cellH, DEFAULT_GRID_SPEC.cellH),
    gutterX: gapOr(partial.gutterX),
    gutterY: gapOr(partial.gutterY),
    margin: gapOr(partial.margin),
  };
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw);
}

// --- Getters ---

export function gridOrigin(spec: GridSpec): Vec2 {
  return { x: spec.origin.x, y: spec.origin.y };
}

export function gridCellCount(spec: GridSpec): number {
  return spec.cols * spec.rows;
}

export function gridCellSize(spec: GridSpec): { w: number; h: number } {
  return { w: spec.cellW, h: spec.cellH };
}

/** Outer frame bounds: origin plus cells, gutters, and margin on all sides. */
export function gridBounds(spec: GridSpec): GridRect {
  return {
    x: spec.origin.x,
    y: spec.origin.y,
    width: spec.margin * 2 + spec.cols * spec.cellW + Math.max(0, spec.cols - 1) * spec.gutterX,
    height: spec.margin * 2 + spec.rows * spec.cellH + Math.max(0, spec.rows - 1) * spec.gutterY,
  };
}

// --- Setters (immutable: each returns a new spec; invalid input keeps current) ---

export function setGridOrigin(spec: GridSpec, origin: Vec2): GridSpec {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return spec;
  return { ...spec, origin: { x: origin.x, y: origin.y } };
}

export function setGridRows(spec: GridSpec, rows: number): GridSpec {
  if (typeof rows !== 'number' || !Number.isFinite(rows)) return spec;
  return { ...spec, rows: Math.max(1, Math.floor(rows)) };
}

export function setGridCols(spec: GridSpec, cols: number): GridSpec {
  if (typeof cols !== 'number' || !Number.isFinite(cols)) return spec;
  return { ...spec, cols: Math.max(1, Math.floor(cols)) };
}

export function setGridCellSize(spec: GridSpec, w: number, h: number): GridSpec {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return spec;
  return { ...spec, cellW: w, cellH: h };
}

export function setGridGutters(spec: GridSpec, gx: number, gy: number): GridSpec {
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || gx < 0 || gy < 0) return spec;
  return { ...spec, gutterX: gx, gutterY: gy };
}

export function setGridMargin(spec: GridSpec, margin: number): GridSpec {
  if (!Number.isFinite(margin) || margin < 0) return spec;
  return { ...spec, margin };
}

// --- Cell and lattice queries ---

function validCell(spec: GridSpec, row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col) &&
    row >= 0 && row < spec.rows && col >= 0 && col < spec.cols;
}

function cellTopLeft(spec: GridSpec, row: number, col: number): Vec2 {
  return {
    x: spec.origin.x + spec.margin + col * (spec.cellW + spec.gutterX),
    y: spec.origin.y + spec.margin + row * (spec.cellH + spec.gutterY),
  };
}

/** Cell frame for (row, col); null when the address is out of range. */
export function gridCellRect(spec: GridSpec, row: number, col: number): GridRect | null {
  if (!validCell(spec, row, col)) return null;
  const top = cellTopLeft(spec, row, col);
  return { x: top.x, y: top.y, width: spec.cellW, height: spec.cellH };
}

/** Top-left corner of a cell; null when the address is out of range. */
export function gridCellOrigin(spec: GridSpec, row: number, col: number): Vec2 | null {
  if (!validCell(spec, row, col)) return null;
  return cellTopLeft(spec, row, col);
}

/** Center of a cell; null when the address is out of range. */
export function gridCellCenter(spec: GridSpec, row: number, col: number): Vec2 | null {
  const rect = gridCellRect(spec, row, col);
  if (!rect) return null;
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Four corners of a cell in order: TL, TR, BR, BL; null out of range. */
export function gridCellCorners(spec: GridSpec, row: number, col: number): Vec2[] | null {
  const rect = gridCellRect(spec, row, col);
  if (!rect) return null;
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

/**
 * Lattice crossing at column line `col` (0..cols) and row line `row`
 * (0..rows). Lines sit on cell origins, so the far lines extend one pitch
 * past the last cell. Null when the address is out of range.
 */
export function gridIntersection(spec: GridSpec, row: number, col: number): Vec2 | null {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || row > spec.rows || col < 0 || col > spec.cols) return null;
  return {
    x: spec.origin.x + spec.margin + col * (spec.cellW + spec.gutterX),
    y: spec.origin.y + spec.margin + row * (spec.cellH + spec.gutterY),
  };
}

/** Row-major cell centers, for repeat-in-center stamping. */
export function gridAllCenters(spec: GridSpec): Vec2[] {
  const out: Vec2[] = [];
  for (let row = 0; row < spec.rows; row++) {
    for (let col = 0; col < spec.cols; col++) {
      out.push(gridCellCenter(spec, row, col) as Vec2);
    }
  }
  return out;
}

/** Row-major lattice crossings ((rows + 1) * (cols + 1)), for repeat-on-intersection. */
export function gridAllIntersections(spec: GridSpec): Vec2[] {
  const out: Vec2[] = [];
  for (let row = 0; row <= spec.rows; row++) {
    for (let col = 0; col <= spec.cols; col++) {
      out.push(gridIntersection(spec, row, col) as Vec2);
    }
  }
  return out;
}

/** Ordered repeat positions for one anchor kind. */
export function gridAnchorPoints(spec: GridSpec, anchor: GridAnchor): Vec2[] {
  switch (anchor) {
    case 'intersection':
      return gridAllIntersections(spec);
    case 'cell-origin': {
      const out: Vec2[] = [];
      for (let row = 0; row < spec.rows; row++) {
        for (let col = 0; col < spec.cols; col++) {
          out.push(cellTopLeft(spec, row, col));
        }
      }
      return out;
    }
    case 'cell-center':
    default:
      return gridAllCenters(spec);
  }
}

/**
 * Repeat position for a row-major cell index under one anchor. Intersections
 * use (rows + 1) * (cols + 1) indexing instead. Null out of range.
 */
export function gridPositionForIndex(
  spec: GridSpec,
  index: number,
  anchor: GridAnchor = 'cell-center',
): Vec2 | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (anchor === 'intersection') {
    const stride = spec.cols + 1;
    if (index >= (spec.rows + 1) * stride) return null;
    return gridIntersection(spec, Math.floor(index / stride), index % stride);
  }
  if (index >= spec.cols * spec.rows) return null;
  const row = Math.floor(index / spec.cols);
  const col = index % spec.cols;
  if (anchor === 'cell-origin') return gridCellOrigin(spec, row, col);
  return gridCellCenter(spec, row, col);
}

// --- Serialization (plain data; unknown keys ignored, invalid keeps defaults) ---

export function gridToJSON(spec: GridSpec): Record<string, unknown> {
  return {
    origin: { x: spec.origin.x, y: spec.origin.y },
    cols: spec.cols,
    rows: spec.rows,
    cellW: spec.cellW,
    cellH: spec.cellH,
    gutterX: spec.gutterX,
    gutterY: spec.gutterY,
    margin: spec.margin,
  };
}

export function gridFromJSON(raw: unknown): GridSpec | null {
  if (!isRecord(raw)) return null;
  return createGrid({
    origin: originOr(raw['origin']),
    cols: countOr(raw['cols'], DEFAULT_GRID_SPEC.cols),
    rows: countOr(raw['rows'], DEFAULT_GRID_SPEC.rows),
    cellW: sizeOr(raw['cellW'], DEFAULT_GRID_SPEC.cellW),
    cellH: sizeOr(raw['cellH'], DEFAULT_GRID_SPEC.cellH),
    gutterX: gapOr(raw['gutterX']),
    gutterY: gapOr(raw['gutterY']),
    margin: gapOr(raw['margin']),
  });
}
