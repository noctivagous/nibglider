// Shared types and unit-conversion helpers.
//
// Owns: no state.
// May read: nothing.
// May mutate: nothing.
// Public surface: the types below, PT_PER_INCH, PT_PER_CM,
//   pointsToLengthUnit, and lengthUnitToPoints.
// Events: none.
// Tests: pt/inch/cm round-trips are pure. Drawing behavior that consumes
//   these types is on the manual checklist in refs/engine-smoke-checklist.md.
//
// engine.ts re-exports this module so existing imports keep resolving.

export type ShapeType =
  | 'circle_radius'
  | 'circle_diameter'
  | 'circle_radial_stamp'
  | 'rectangle_diagonal'
  | 'rectangle_two_edges'
  | 'rectangle_centerline';

/** How the Circle by Radius tool anchors its preview: press point is the
 * center (origin), or a fixed circumference point with the cursor as center. */
export type CircleRadiusAnchor = 'origin' | 'circumference';

/** Which portion of the final rect the drawn diagonal covers: the full
 * diagonal (current), half of it (final = 2x), or a quarter (final = 4x). */
export type RectDiagonalMode = 'full' | 'half' | 'quarter';

/** How a Regular Polygon inner shape fits its circle frame. Inradius puts
 * an edge midpoint on the frame circle toward the cursor (edge forward);
 * circumradius puts a vertex on the frame circle toward the cursor. */
export type PolygonRadiusMode = 'inradius' | 'circumradius';

// A key remap that applies while a live drawing preview is active. The
// engine checks registered bindings before the idle (selection) handlers,
// so the same physical key can adjust the live preview instead. Future
// components (e.g. a repeat-circle counter) register here without touching
// handleKeyDown. Digit0..Digit9 codes are reserved as slots for such
// future bindings.
export interface LiveKeyBinding {
  /** Stable id, e.g. 'live-scale-down'. */
  id: string;
  /** Keycap labels shown in the Status Box, e.g. ['[']. */
  keys: string[];
  /** Short status description, e.g. 'scale'. */
  label: string;
  match: (event: KeyboardEvent) => boolean;
  /** Whether this binding applies right now. */
  applies: () => boolean;
  apply: (event: KeyboardEvent) => void;
}

export type CircleInnerShape =
  | 'circle'
  | 'semicircle'
  | 'sector'
  | 'segment'
  | 'polygon'
  | 'supershape'
  | 'trapezoid'
  | 'parallelogram'
  | 'rightTriangle'
  | 'rhombus'
  | 'kite';

export type CombineMode = 'union' | 'subtract' | 'intersect';

export type TextJustification = 'left' | 'center' | 'right';

export interface TextSpec {
  /** Primary line of text (Display Text, and line 1 of Circumference). */
  content: string;
  /** Second circumference line (Circumference 2 Lines). */
  line2: string;
  fontFamily: string;
  /** Font size in points. */
  fontSize: number;
  fontWeight: string;
  italic: boolean;
  justification: TextJustification;
  /** Leading as a multiple of the font size. */
  leading: number;
}

/** Text Mode content: flowing display type vs. contained body type. */
export type TextMode = 'display' | 'body';

/** Display Text placement relative to the shape boundary. */
export type DisplayFlow = 'interior' | 'exterior';

/** Which way Display glyph tops point: to the circumference or origin. */
export type GlyphOrientation = 'outward' | 'inward';

/** Vertical anchoring of Display Text glyphs on open spline strokes. */
export type SplineTextPlacement = 'above' | 'baseline' | 'below';

export type StrokeCap = 'butt' | 'round' | 'square';
export type StrokeJoin = 'miter' | 'round' | 'bevel';
/** Alignment relative to the filled region of a closed path. */
export type StrokePosition = 'center' | 'inside' | 'outside';

export type FillType = 'solid' | 'linear' | 'radial';

export interface FillSpec {
  type: FillType;
  /** Solid color, and the gradient start stop. */
  color: string;
  /** Gradient end stop. */
  endColor: string;
  /** Linear gradient direction, degrees. */
  angle: number;
  /** Radial inner-stop offset, 0..0.95. */
  inner: number;
}

export type GridType = 'square' | 'diamond';

/** Display unit for snapping length inputs. Stored values stay in points. */
export type LengthUnit = 'pt' | 'inch' | 'cm';

// Compatibility exports for existing callers. CoordinateManager owns the
// conversion rules and finite-value checks.
export { PT_PER_INCH, PT_PER_CM } from './document/CoordinateManager';
import { coordinates } from './document/CoordinateManager';
export function pointsToLengthUnit(pt: number, unit: LengthUnit): number { return coordinates.fromPoints(pt, unit); }
export function lengthUnitToPoints(v: number, unit: LengthUnit): number { return coordinates.toPoints(v, unit); }

export type RectangleInnerShape =
  | 'rectangle'
  | 'circle'
  | 'polygon'
  | 'supershape'
  | 'trapezoid'
  | 'parallelogram'
  | 'rightTriangle'
  | 'rhombus'
  | 'kite';

export interface InnerShapeParams {
  sides: number;
  m: number;
  n1: number;
  n2: number;
  n3: number;
  a1: number;
  a2: number;
  angle: number;
  sector: number;
}

export interface KeyActivity {
  code: string;
  active: boolean;
}

// Overlay schema: state lines (what is true) plus step lines (what to do
// next). Text runs render plain; key runs render as keycaps in the key's
// keyboard-group color.
export type StatusKeyGroup = 'circle' | 'rect' | 'quad' | 'op' | 'end' | 'neutral';
export type StatusRun =
  | { t: 'text'; s: string }
  | { t: 'key'; s: string; g: StatusKeyGroup };
export type StatusLine = {
  kind: 'title' | 'meta' | 'hint' | 'adjust';
  runs: StatusRun[];
};
export interface StatusSchema {
  state: StatusLine[];
  steps: StatusLine[];
}
