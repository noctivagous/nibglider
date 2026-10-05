// PageRuler tick math: major ticks on grid lines across one measured
// edge, minors splitting each major cell into quarters. Offsets run
// from the edge corner (the ruler origin), in points; labels are unit
// values of the absolute grid coordinate for majors, null for minors.
// phasePt is the project coordinate of the corner, so edges that start
// off-grid still land majors on grid lines. Pure and unit-tested from
// tests/drawing-page.test.mjs; the overlay component only maps offsets
// to pixels.
import type { LengthUnit } from '../types';
import { pointsToUnit } from './MeasurementUnits';

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

const MINOR_DIVISIONS = 4;

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

/** Offsets of labeled majors, thinned so labels keep minLabelPx apart.
 * Guide lines reuse this set so lines and labels always agree. */
export function labeledMajors(
  sizePt: number,
  spacingPt: number,
  minLabelPx: number,
  pxPerPt: number,
  phasePt = 0,
): number[] {
  if (!Number.isFinite(sizePt) || !(sizePt > 0)) return [];
  if (!Number.isFinite(spacingPt) || !(spacingPt > 0)) return [];
  if (!Number.isFinite(pxPerPt) || !(pxPerPt > 0)) return [];
  if (!Number.isFinite(phasePt)) return [];
  const stride = Math.max(1, Math.ceil(minLabelPx / Math.max(spacingPt * pxPerPt, 1e-9)));
  const out: number[] = [];
  const epsilon = spacingPt / 1e6;
  const firstK = Math.ceil((phasePt - epsilon) / spacingPt) + 0;
  const lastK = Math.floor((phasePt + sizePt + epsilon) / spacingPt);
  let index = 0;
  for (let k = firstK; k <= lastK; k += 1) {
    if (index % stride === 0) out.push(k * spacingPt - phasePt + 0);
    index += 1;
  }
  return out;
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

export function computeRulerTicks(
  sizePt: number,
  spacingPt: number,
  unit: LengthUnit,
  phasePt = 0,
): RulerTick[] {
  if (!Number.isFinite(sizePt) || !(sizePt > 0)) return [];
  if (!Number.isFinite(spacingPt) || !(spacingPt > 0)) return [];
  if (!Number.isFinite(phasePt)) return [];
  pointsToUnit(1, unit); // Validate the unit even for degenerate sizes.
  const ticks: RulerTick[] = [];
  const epsilon = spacingPt / 1e6;
  // ceil/floor of a near-zero negative yields -0; normalize once so
  // offsets compare cleanly downstream.
  const firstK = Math.ceil((phasePt - epsilon) / spacingPt) + 0;
  const lastK = Math.floor((phasePt + sizePt + epsilon) / spacingPt);
  let prevMajor: number | null = null;
  for (let k = firstK; k <= lastK; k += 1) {
    const at = k * spacingPt - phasePt + 0;
    if (prevMajor !== null) {
      for (let d = 1; d < MINOR_DIVISIONS; d += 1) {
        const minor = prevMajor + (d * spacingPt) / MINOR_DIVISIONS;
        if (minor < prevMajor + epsilon || minor > at - epsilon) continue;
        ticks.push({ offsetPt: minor, major: false, label: null });
      }
    }
    ticks.push({ offsetPt: at, major: true, label: tickLabel(k * spacingPt, unit) });
    prevMajor = at;
  }
  ticks.sort((a, b) => a.offsetPt - b.offsetPt);
  return ticks;
}
