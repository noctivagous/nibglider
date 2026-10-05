// DrawingPage: a named sheet on the infinite canvas. Each page is a
// user-dimensioned sheet (New Document dimensions) floating on top
// of it (New Document dimensions). The board owns a page list with an
// active page so multi-page documents need no remodel — only the UI
// exposes one page today. Layer ownership is conceptual: each page
// records the Paper content-layer id (`paper-layer-N`, the
// LayerManager.activeLayerId scheme) that holds its artwork; the
// engine ensures and activates that layer. Tested from
// tests/drawing-page.test.mjs.
import type { LengthUnit } from '../types';

export type DrawingPageOrientation = 'portrait' | 'landscape' | 'square';

export interface DrawingPageRect { x: number; y: number; width: number; height: number }

export interface DrawingPage {
  id: string;
  widthPt: number;
  heightPt: number;
  unit: LengthUnit;
  orientation: DrawingPageOrientation;
  /** Paper content-layer id holding this page's artwork; null until the
   * engine binds it (fresh page, or a new Paper project after attach). */
  layerId: string | null;
}

export function pageOrientationOf(widthPt: number, heightPt: number): DrawingPageOrientation {
  if (widthPt === heightPt) return 'square';
  return widthPt > heightPt ? 'landscape' : 'portrait';
}

export function createDrawingPage(
  id: string,
  widthPt: number,
  heightPt: number,
  unit: LengthUnit,
): DrawingPage {
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt)) {
    throw new Error('Drawing page dimensions must be finite');
  }
  if (widthPt <= 0 || heightPt <= 0) throw new Error('Drawing page dimensions must be positive');
  return { id, widthPt, heightPt, unit, orientation: pageOrientationOf(widthPt, heightPt), layerId: null };
}

/** Page rect centered on the project origin, like the board. */
export function drawingPageRect(page: DrawingPage): DrawingPageRect {
  return {
    x: -page.widthPt / 2,
    y: -page.heightPt / 2,
    width: page.widthPt,
    height: page.heightPt,
  };
}

/** Round dimensions to whole grid cells so a centered page's edges land
 * on grid lines: each side sits at half a multiple of 2*spacing. A
 * non-positive spacing disables snapping and returns the input. */
export function snapPageToGrid(
  widthPt: number,
  heightPt: number,
  spacingPt: number,
): { widthPt: number; heightPt: number } {
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt)) {
    throw new Error('Drawing page dimensions must be finite');
  }
  if (widthPt <= 0 || heightPt <= 0) throw new Error('Drawing page dimensions must be positive');
  if (!Number.isFinite(spacingPt) || spacingPt <= 0) return { widthPt, heightPt };
  const cell = spacingPt * 2;
  return {
    widthPt: Math.max(cell, Math.round(widthPt / cell) * cell),
    heightPt: Math.max(cell, Math.round(heightPt / cell) * cell),
  };
}
