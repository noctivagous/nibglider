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

export interface PageBracketPoint { x: number; y: number }

/** Arm length of a corner bracket, in project points. Capped so the
 * four marks stay separate corners and never close into a frame. */
export function pageBracketArm(width: number, height: number): number {
  const shorter = Math.min(width, height);
  if (!(shorter > 0)) return 0;
  return Math.min(64, shorter * 0.12);
}

export interface PageEdgeTick {
  /** Two points: the page edge, then the inward end. */
  points: [PageBracketPoint, PageBracketPoint];
  major: boolean;
}

/** Ruler ticks on all four sides, inward from the edge. Offsets run
 * from the top-left corner along that side. Lengths are project points. */
export function pageEdgeTicks(
  rect: DrawingPageRect,
  alongWidth: { offsetPt: number; major: boolean }[],
  alongHeight: { offsetPt: number; major: boolean }[],
  majorLen: number,
  minorLen: number,
): PageEdgeTick[] {
  const len = (major: boolean): number => (major ? majorLen : minorLen);
  const onSpan = (offset: number, size: number): boolean =>
    offset >= -0.01 && offset <= size + 0.01;
  const out: PageEdgeTick[] = [];
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  for (const tick of alongWidth) {
    if (!onSpan(tick.offsetPt, rect.width)) continue;
    const x = x0 + tick.offsetPt;
    const arm = len(tick.major);
    out.push({ major: tick.major, points: [{ x, y: y0 }, { x, y: y0 + arm }] });
    out.push({ major: tick.major, points: [{ x, y: y1 }, { x, y: y1 - arm }] });
  }
  for (const tick of alongHeight) {
    if (!onSpan(tick.offsetPt, rect.height)) continue;
    const y = y0 + tick.offsetPt;
    const arm = len(tick.major);
    out.push({ major: tick.major, points: [{ x: x0, y }, { x: x0 + arm, y }] });
    out.push({ major: tick.major, points: [{ x: x1, y }, { x: x1 - arm, y }] });
  }
  return out;
}

/** Four open corner brackets. Each entry is three points: one arm end,
 * the page corner, then the other arm end. */
export function pageCornerBrackets(rect: DrawingPageRect): PageBracketPoint[][] {
  const arm = pageBracketArm(rect.width, rect.height);
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.width;
  const y1 = rect.y + rect.height;
  return [
    [{ x: x0 + arm, y: y0 }, { x: x0, y: y0 }, { x: x0, y: y0 + arm }],
    [{ x: x1 - arm, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y0 + arm }],
    [{ x: x1 - arm, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y1 - arm }],
    [{ x: x0 + arm, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y1 - arm }],
  ];
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
