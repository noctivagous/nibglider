// Read-only config summary state for the rail summary box widget.
// Owns the selection-vs-globals decision so the component and tests share
// one rule: a selection shows the first selected item's paint (the same
// convention as the Stroke/Fill panel sections); otherwise globals show.
// Also owns the live-measure rule: the in-flight radius or spline-segment
// vector only becomes text when its snapping mode is on (length for the
// distance, angle for the direction); otherwise it stays hidden.
// Public: SummaryPaint, SummaryGlobals, SummaryState, resolveSummaryState,
// LiveMeasureInput, LiveMeasure, resolveLiveMeasure, formatZoomPercent.
// Tested from tests/config-summary.test.mjs.

import type { FillSpec, LengthUnit, StrokeCap, StrokeJoin, StrokePosition } from '../engine/types';
import { formatInUnit } from '../engine/document/MeasurementUnits';

export interface SummaryPaint {
  strokeOn: boolean;
  strokeColor: string;
  strokeWidth: number;
  strokeCap: StrokeCap;
  strokeJoin: StrokeJoin;
  strokePosition: StrokePosition;
  miterLimit: number;
  dashLength: number;
  gapLength: number;
  fillOn: boolean;
  fillColor: string;
  fillSpec: FillSpec;
}

export type SummaryGlobals = SummaryPaint;

export interface SummaryState {
  /** 'selection' when a selection drives the box, else 'defaults'. */
  mode: 'selection' | 'defaults';
  paint: SummaryPaint;
  /** True when more than one item is selected (box shows the first). */
  mixed: boolean;
}

export function resolveSummaryState(
  selection: SummaryPaint | null,
  selectedCount: number,
  globals: SummaryGlobals,
): SummaryState {
  if (selection && selectedCount > 0) {
    return { mode: 'selection', paint: selection, mixed: selectedCount > 1 };
  }
  return { mode: 'defaults', paint: globals, mixed: false };
}

export interface LiveMeasureInput {
  /** Length snapping on: show the live radius/segment distance. */
  lengthOn: boolean;
  /** Angle snapping on: show the live radius/segment direction. */
  angleOn: boolean;
  /** Live radius or rubber-band spline segment in page points, else null. */
  vector: { lengthPt: number; angleDeg: number } | null;
  unit: LengthUnit;
}

export interface LiveMeasure {
  lengthText: string | null;
  angleText: string | null;
}

const NO_MEASURE: LiveMeasure = { lengthText: null, angleText: null };

export function resolveLiveMeasure(input: LiveMeasureInput): LiveMeasure {
  const vector = input.vector;
  if (!vector) return NO_MEASURE;
  if (!Number.isFinite(vector.lengthPt) || !Number.isFinite(vector.angleDeg)) return NO_MEASURE;
  return {
    lengthText: input.lengthOn ? formatInUnit(vector.lengthPt, input.unit) : null,
    angleText: input.angleOn ? `${Math.round(vector.angleDeg)}°` : null,
  };
}

/** Zoom factor (1 = 100%) as a display percent. Non-finite zoom shows an em dash. */
export function formatZoomPercent(zoom: number): string {
  if (!Number.isFinite(zoom)) return '—';
  return `${Math.round(zoom * 100)}%`;
}
