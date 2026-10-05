// PageRuler tick math: major ticks on board-grid lines across one page
// edge, minors splitting each major cell into quarters. Offsets run
// from the page corner (the ruler origin), in points; labels are unit
// values for majors, null for minors. Pure and unit-tested from
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

export function computeRulerTicks(
  sizePt: number,
  spacingPt: number,
  unit: LengthUnit,
): RulerTick[] {
  if (!Number.isFinite(sizePt) || !(sizePt > 0)) return [];
  if (!Number.isFinite(spacingPt) || !(spacingPt > 0)) return [];
  pointsToUnit(1, unit); // Validate the unit even for degenerate sizes.
  const ticks: RulerTick[] = [];
  const epsilon = spacingPt / 1e6;
  const majorCount = Math.floor((sizePt + epsilon) / spacingPt);
  for (let k = 0; k <= majorCount; k += 1) {
    const at = Math.min(k * spacingPt, sizePt);
    if (k > 0) {
      for (let d = 1; d < MINOR_DIVISIONS; d += 1) {
        const minor = (k - 1) * spacingPt + (d * spacingPt) / MINOR_DIVISIONS;
        if (minor < epsilon || minor > sizePt - epsilon) continue;
        ticks.push({ offsetPt: minor, major: false, label: null });
      }
    }
    ticks.push({ offsetPt: at, major: true, label: tickLabel(at, unit) });
  }
  ticks.sort((a, b) => a.offsetPt - b.offsetPt);
  return ticks;
}
