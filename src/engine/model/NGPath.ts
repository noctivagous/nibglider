// Serializable path authoring data. Does not import Paper, React, or events.
// Bézier contours preserve existing anchors/relative handles and compound
// winding. The semantic modes retain intent; their interpolation is Phase 4b.
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
export interface NGSegmentParams {
  kind: 'inherit' | 'line' | 'bSpline' | 'bowedLine' | 'arc';
  bowOffset?: number;
  bowFacing?: 'left' | 'right';
}
export interface NGPathPoint extends Vec2 {
  id: string;
  kind: 'bSpline' | 'hardCorner' | 'roundedCorner' | 'line' | 'bowedLine'
    | 'arcByThreeStart' | 'arcByThreeEnd';
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
export type NGPath = NGBezierPath | NGCompositePath | NGBSplinePath | NGSmoothedPolyline;
