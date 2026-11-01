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
/** Bowed-segment params mirroring FM `BowedInfo` (Phase 2): the bow
 * describes the segment *following* the point, stored on `outgoing`
 * while the point keeps its corner kind (`hardCorner`/`roundedCorner`). */
export interface NGBowedParams {
  /** Which side of the chord the peak sits on. */
  facing: 'A' | 'B';
  /** Peak offset: absolute pt, or % of chord length when `amplitudeIsPercent`. */
  amplitude: number;
  amplitudeIsPercent: boolean;
  /** Peak position along the chord (0…1) before `peakLocationMultiplier`. */
  peakLocation: number;
  peakLocationMultiplier: number;
  /** Arc-mode bow (circle fit) vs spline-mode bow (spline controls). */
  isArc: boolean;
  /** 0 = single peak; nonzero straddles two peaks by `dualDistance / 2`. */
  dualDistance: number;
  corneredApex: 'none' | 'rounded' | 'hard';
}
/** Persisted defaults: 10% chord-length amplitude at the midpoint. */
export const DEFAULT_BOWED_PARAMS: NGBowedParams = {
  facing: 'A', amplitude: 10, amplitudeIsPercent: true,
  peakLocation: 0.5, peakLocationMultiplier: 1,
  isArc: false, dualDistance: 0, corneredApex: 'none',
};
export interface NGSegmentParams {
  kind: 'inherit' | 'line' | 'bSpline' | 'bowedLine' | 'arc';
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
