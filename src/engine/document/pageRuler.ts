// PageRuler tick math (Tier Four, Slice 17): major ticks at human
// intervals chosen from the display unit and the current zoom — nice
// numbers, 1/2/5 × 10^n in the display unit — with minors splitting
// each major into fifths. Tick placement is independent of the grid.
// The ruler origin is the page's top-left corner when a page is set:
// offsets run from the corner and labels read 0 there, increasing
// along the edge. With no page, labels read absolute coordinates.
// Pure and unit-tested from tests/drawing-page.test.mjs; the overlay
// component only maps offsets to pixels.
import type { LengthUnit } from '../types';
import { pointsToUnit, unitToPoints } from './MeasurementUnits';

export interface RulerTick {
  /** Points from the page corner along the edge. */
  offsetPt: number;
  major: boolean;
  label: string | null;
}

/** Unit value trimmed for display ("0.25", never "0.25 in" — the overlay
 * names the unit once in the corner). */
export function tickLabel(offsetPt: number, unit: LengthUnit): string {
  return String(Number(pointsToUnit(offsetPt, unit).toFixed(2)));
}

const MINOR_DIVISIONS = 5;

/** The major tick interval, in points: the smallest 1/2/5 × 10^n step
 * in the display unit that spans at least minLabelPx on screen at
 * pxPerPt, so labels never crowd. Falls back to a 1-unit step when
 * the scale is unusable. */
export function niceRulerIntervalPt(unit: LengthUnit, pxPerPt: number, minLabelPx = 64): number {
  if (!Number.isFinite(pxPerPt) || !(pxPerPt > 0)) return unitToPoints(1, unit);
  for (let n = -4; n <= 7; n++) {
    for (const m of [1, 2, 5]) {
      const stepPt = unitToPoints(m * 10 ** n, unit);
      if (stepPt * pxPerPt >= minLabelPx) return stepPt;
    }
  }
  return unitToPoints(5000, unit);
}

/** What the rulers measure: the page when set, else the artwork
 * bounds, else the visible canvas. Units follow the rect (page unit,
 * else the display length unit). */
export interface RulerSource { rect: FrameRect; unit: LengthUnit }

export function rulerSource(
  page: FrameRect | null,
  pageUnit: LengthUnit,
  fallback: FrameRect,
  displayUnit: LengthUnit,
): RulerSource {
  return page ? { rect: page, unit: pageUnit } : { rect: fallback, unit: displayUnit };
}

/** Offsets of the labeled majors along an edge. Every major is
 * labeled (the interval is chosen so labels keep minLabelPx apart).
 * Guide lines reuse this set so lines and labels always agree. */
export function labeledMajors(
  sizePt: number,
  unit: LengthUnit,
  minLabelPx: number,
  pxPerPt: number,
  phasePt = 0,
  cornerOrigin = false,
): number[] {
  return computeRulerTicks(sizePt, unit, pxPerPt, phasePt, cornerOrigin, minLabelPx)
    .filter((tick) => tick.major)
    .map((tick) => tick.offsetPt);
}

export interface FrameView { centerX: number; centerY: number; viewWidth: number; viewHeight: number }
export interface FrameRect { x: number; y: number; width: number; height: number }
export interface FrameSize { width: number; height: number }

export interface FrameTrack { left: number; top: number; width?: number; height?: number }

export interface PageFrameTracks {
  top: FrameTrack;
  left: FrameTrack;
  corner: FrameTrack;
}

/** Screen-px track boxes hugging the page frame: the top ruler sits one
 * ruler above the page top edge, the left ruler one ruler left of the
 * page left edge. Canvas square pixels assumed (Paper view fills the
 * container). May run off-container when the page is panned away; the
 * container clips. */
export function pageFrameTracks(
  view: FrameView,
  page: FrameRect,
  container: FrameSize,
  rulerSize: number,
): PageFrameTracks {
  const pxPerPt = container.width / view.viewWidth;
  const pageLeft = (page.x - (view.centerX - view.viewWidth / 2)) * pxPerPt;
  const pageTop = (page.y - (view.centerY - view.viewHeight / 2)) * pxPerPt;
  const pageWidth = page.width * pxPerPt;
  const pageHeight = page.height * pxPerPt;
  return {
    top: { left: pageLeft, top: pageTop - rulerSize, width: pageWidth },
    left: { left: pageLeft - rulerSize, top: pageTop, height: pageHeight },
    corner: { left: pageLeft - rulerSize, top: pageTop - rulerSize },
  };
}

/**
 * Ticks along one edge of length sizePt starting at project
 * coordinate phasePt. Offsets are points from phasePt. With
 * cornerOrigin the edge is a page edge: a major sits on the corner
 * (offset 0, label "0") and labels read distance from the corner.
 * Otherwise majors land on absolute interval multiples and labels
 * read the absolute coordinate.
 */
export function computeRulerTicks(
  sizePt: number,
  unit: LengthUnit,
  pxPerPt: number,
  phasePt = 0,
  cornerOrigin = false,
  minLabelPx = 64,
): RulerTick[] {
  if (!Number.isFinite(sizePt) || !(sizePt > 0)) return [];
  if (!Number.isFinite(phasePt)) return [];
  pointsToUnit(1, unit); // Validate the unit even for degenerate sizes.
  const interval = niceRulerIntervalPt(unit, pxPerPt, minLabelPx);
  const epsilon = interval / 1e6;
  const round = (v: number): number => Math.round(v * 1e6) / 1e6 + 0;
  const majors: Array<{ offsetPt: number; label: string }> = [];
  if (cornerOrigin) {
    for (let at = 0; at <= sizePt + epsilon; at += interval) {
      majors.push({ offsetPt: round(at), label: tickLabel(at, unit) });
    }
  } else {
    const firstK = Math.ceil((phasePt - epsilon) / interval) + 0;
    const lastK = Math.floor((phasePt + sizePt + epsilon) / interval);
    for (let k = firstK; k <= lastK; k += 1) {
      majors.push({ offsetPt: round(k * interval - phasePt), label: tickLabel(k * interval, unit) });
    }
  }
  const ticks: RulerTick[] = [];
  let prev: number | null = null;
  for (const major of majors) {
    if (prev !== null) {
      for (let d = 1; d < MINOR_DIVISIONS; d += 1) {
        const minor = prev + (d * interval) / MINOR_DIVISIONS;
        if (minor < prev + epsilon || minor > major.offsetPt - epsilon) continue;
        ticks.push({ offsetPt: round(minor), major: false, label: null });
      }
    }
    ticks.push({ offsetPt: major.offsetPt, major: true, label: major.label });
    prev = major.offsetPt;
  }
  ticks.sort((a, b) => a.offsetPt - b.offsetPt);
  return ticks;
}
