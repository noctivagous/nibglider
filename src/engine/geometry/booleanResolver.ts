// Boolean operand policy and result lowering.
// Owns nothing. Reads class names and areas the caller passes in.
// Does not run Paper.js booleans, sample NGShape, or mutate operands.
// Public: operandAvailability, hasBooleanArea, BOOLEAN_EMPTY_AREA, RESULT_SOURCE_MODE.
// Tested from tests/combinatorics.test.mjs.

export const BOOLEAN_EMPTY_AREA = 1e-6;
export const RESULT_SOURCE_MODE = 'bezier' as const;

export type BooleanAvailability = 'geometry' | 'unavailable';

// Path and compound path geometry can be cut. Rasters, SVG images, and
// groups with no path child cannot. Shape text uses the geometry child
// (the caller passes that child's class name, not the group's).
export function operandAvailability(className: string | null | undefined): BooleanAvailability {
  if (className === 'Path' || className === 'CompoundPath') return 'geometry';
  return 'unavailable';
}

export function hasBooleanArea(area: number | null | undefined): boolean {
  return Math.abs(area || 0) > BOOLEAN_EMPTY_AREA;
}
