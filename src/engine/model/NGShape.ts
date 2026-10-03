// Parametric authoring records. Derived geometry does not replace these
// parameters; destructive operations will explicitly lower them to NGPath.
import type { Vec2 } from './geometryResolution';

export interface NGCircle { type: 'circle'; center: Vec2; radius: number }
export interface NGRegularPolygon {
  type: 'regularPolygon'; center: Vec2; radius: number; sides: number;
  rotation: number; // degrees; vertex zero points along the positive x axis
}
export interface NGPolygon { type: 'polygon'; vertices: Vec2[] }
export interface NGQuadrilateral {
  type: 'quadrilateral'; vertices: [Vec2, Vec2, Vec2, Vec2];
}
export interface NGParallelogram {
  type: 'parallelogram'; origin: Vec2; edge1: Vec2; edge2: Vec2;
}
export interface NGTrapezoid {
  type: 'trapezoid'; origin: Vec2; bottomWidth: number; topWidth: number;
  height: number; topOffset: number;
}
export interface NGSupershape {
  type: 'supershape'; center: Vec2; scale: Vec2; rotation: number;
  m: number; n1: number; n2: number; n3: number; a: number; b: number;
}
export type NGShape = NGCircle | NGRegularPolygon | NGPolygon | NGQuadrilateral
  | NGParallelogram | NGTrapezoid | NGSupershape;
