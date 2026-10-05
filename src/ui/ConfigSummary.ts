// Read-only config summary state for the rail summary box widget.
// Owns the selection-vs-globals decision so the component and tests share
// one rule: a selection shows the first selected item's paint (the same
// convention as the Stroke/Fill panel sections); otherwise globals show.
// Public: SummaryPaint, SummaryGlobals, SummaryState, resolveSummaryState.
// Tested from tests/config-summary.test.mjs.

import type { FillSpec, StrokeCap, StrokeJoin, StrokePosition } from '../engine/types';

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
