// Engine-independent, derived geometry. Coordinates use document points;
// handles are offsets from their anchor, matching the existing Paper paths.
// No resolved geometry or scene item is stored as document authoring truth.
export interface Vec2 { x: number; y: number }
export interface AffineTransform {
  a: number; b: number; c: number; d: number; tx: number; ty: number;
}
export interface BezierSegment {
  point: Vec2;
  handleIn: Vec2;
  handleOut: Vec2;
}
export type FillRule = 'nonzero' | 'evenodd';
export interface ResolvedPath {
  kind: 'path';
  closed: boolean;
  segments: BezierSegment[];
}
export interface ResolvedCompoundPath {
  kind: 'compoundPath';
  paths: ResolvedPath[];
  fillRule: FillRule;
}
export type ResolvedVectorGeometry = ResolvedPath | ResolvedCompoundPath;
export interface ResolvedImageMask {
  kind: 'imageMask';
  assetId: string;
  boundary: ResolvedVectorGeometry;
  clip: ResolvedVectorGeometry | null;
}
export type ResolvedGeometry = ResolvedVectorGeometry | ResolvedImageMask;

export function identityTransform(): AffineTransform {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}
