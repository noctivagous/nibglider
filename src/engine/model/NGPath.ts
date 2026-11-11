// Serializable path authoring data. Does not import Paper, React, or events.
// Bézier contours preserve existing anchors/relative handles and compound
// winding. Semantic modes retain intent; B-spline/composite interpolation is
// implemented separately from these plain records.
import type { BezierSegment, FillRule, Vec2 } from './geometryResolution';

export interface NGBezierContour {
  closed: boolean;
  segments: BezierSegment[];
}
export interface NGBezierPath {
  id: string;
  mode: 'bezier';
  contours: NGBezierContour[];
  fillRule: FillRule;
}
export interface NGCornerParams {
  rounding: 'arc' | 'bSpline' | 'bevel';
  radius: number;
}
/**
 * The full bowed-line parameter record (TASKS-FMStroke Phase 2),
 * superseding the interim bowOffset/bowFacing pair. Facing 'A' bows to
 * the left of travel, 'B' to the right (Floating Marker's facing
 * convention). Amplitude is a percentage of the chord when
 * amplitudeIsPercent, else absolute points. The peak sits at
 * peakLocation × peakLocationMultiplier along the chord. dualDistance
 * straddles the peak into two peaks when nonzero. corneredApex repeats
 * the peak control (B-spline multiplicity): 'rounded' ×2, 'hard' ×3.
 */
export interface NGBowedParams {
  facing: 'A' | 'B';
  amplitude: number;
  amplitudeIsPercent: boolean;
  peakLocation: number;
  peakLocationMultiplier: number;
  isArc: boolean;
  dualDistance: number;
  corneredApex: 'none' | 'rounded' | 'hard';
}
/** Legacy bow defaults (10% chord-length amplitude at the midpoint),
 * kept for existing fixtures and peak-math tests; new deposits stamp
 * BOWED_DEFAULTS through the session snapshot. */
export const DEFAULT_BOWED_PARAMS: NGBowedParams = {
  facing: 'A', amplitude: 10, amplitudeIsPercent: true,
  peakLocation: 0.5, peakLocationMultiplier: 1,
  isArc: false, dualDistance: 0, corneredApex: 'none',
};

export interface NGSegmentParams {
  kind: 'inherit' | 'line' | 'bSpline' | 'bowedLine' | 'arc';
  /** Present on bowedLine segments stamped by a drawing session. An
   * absent bow resolves with BOWED_DEFAULTS (the Tier Two behaviour:
   * quarter-chord bow to the left, peak at the midpoint). */
  bow?: NGBowedParams;
}
export interface NGPathPoint extends Vec2 {
  id: string;
  kind: 'bSpline' | 'hardCorner' | 'roundedCorner' | 'line' | 'bowedLine'
    | 'arcByThreeStart' | 'arcByThreeEnd'
    | 'g4' | 'g2' | 'clothoidCorner' | 'prevConstraint' | 'nextConstraint';
  corner?: NGCornerParams;
  outgoing?: NGSegmentParams;
}
export interface NGCompositePath {
  id: string;
  mode: 'ngComposite';
  closed: boolean;
  points: NGPathPoint[];
}
export interface NGBSplinePath {
  id: string;
  mode: 'bSpline';
  closed: boolean;
  points: Vec2[];
  degree: 3;
}
export interface NGSmoothedPolyline {
  id: string;
  mode: 'smoothedPolyline';
  closed: boolean;
  points: Vec2[];
  tension: number;
}
// Live outlined stroke: the spine stays editable authoring truth while
// resolution renders the expanded stroke band in its place. Cap/join/
// miter/dash/position mirror the ordinary stroke style features. Boolean
// results bake the expansion and lower to plain Bézier.
export interface NGOutlinedStrokePath {
  id: string;
  mode: 'outlinedStroke';
  spine: NGBezierPath | NGCompositePath | NGBSplinePath;
  width: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  dashLength: number;
  gapLength: number;
  position: 'center' | 'inside' | 'outside';
}
export type NGPath = NGBezierPath | NGCompositePath | NGBSplinePath | NGSmoothedPolyline | NGOutlinedStrokePath;

/** Bow parameters for a bowed segment that carries none (Tier Two's
 * shipped behaviour) and the base a drawing session stamps from. */
export const BOWED_DEFAULTS: NGBowedParams = {
  facing: 'A',
  amplitude: 25,
  amplitudeIsPercent: true,
  peakLocation: 0.5,
  peakLocationMultiplier: 1,
  isArc: false,
  dualDistance: 0,
  corneredApex: 'none',
};
