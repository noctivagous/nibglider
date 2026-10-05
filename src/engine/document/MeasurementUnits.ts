// Measurement and page-unit foundation for New Document and page sizes.
// Owns: the full LengthUnit conversion table, the SI/English unit-system
// mapping, page-size preset tables (ISO vs. US, workspace canvas, image
// output), and ratio-to-size resolution. Document geometry stays in points;
// this module is the single place that knows what every unit means.
// CoordinateManager delegates its scalar conversions here; dialog and menu
// code reads presets and labels from here so a future locale only touches
// one seam (labels + formatInUnit's Intl.NumberFormat locale).
// Tested from tests/measurement-units.test.mjs.
import type { LengthUnit } from '../types';

export type UnitSystem = 'english' | 'si';

/** Unit-system preference default: English Units. */
export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'english';

/** localStorage key for the New Document unit-system preference. */
export const UNIT_SYSTEM_KEY = 'nibglider.unitSystem';

/** Default new document: 16:9 canvas, 1920x1080pt. */
export const DEFAULT_CANVAS_WIDTH_PT = 1920;
export const DEFAULT_CANVAS_HEIGHT_PT = 1080;

/** CSS pixels per inch: image presets are authored in px and land in
 * points through this rule (matches CoordinateManager's SVG_PX_PER_INCH). */
export const PX_PER_INCH = 96;

const POINTS_PER_UNIT: Record<LengthUnit, number> = {
  pt: 1,
  pica: 12,
  inch: 72,
  ft: 864,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  m: 7200 / 2.54,
};

function finite(value: number, what: string): void {
  if (!Number.isFinite(value)) throw new Error(`${what} must be finite`);
}

/** Points in one unit. Throws for unknown units (same message as the old
 * CoordinateManager guard so existing error expectations still hold). */
export function pointsPerUnit(unit: LengthUnit): number {
  const scale = (POINTS_PER_UNIT as Record<string, number>)[unit];
  if (scale == null) throw new Error(`Unsupported length unit: ${unit}`);
  return scale;
}

/** Convert a length in the given unit to document points. */
export function unitToPoints(value: number, unit: LengthUnit): number {
  finite(value, 'Document length');
  return value * pointsPerUnit(unit);
}

/** Convert document points to the given unit. */
export function pointsToUnit(points: number, unit: LengthUnit): number {
  finite(points, 'Document length');
  return points / pointsPerUnit(unit);
}

/** Parse a stored unit-system preference. Unknown values fall back to the
 * English default so a corrupt or future value never breaks the dialog. */
export function parseUnitSystem(raw: unknown): UnitSystem {
  return raw === 'si' ? 'si' : 'english';
}

/** Entry units per system. Users stay within mm..m for SI and inches..feet
 * for English; pt and pica ride along in both for typographic work, and
 * every unit converts to every other through points. */
export function systemUnits(system: UnitSystem): LengthUnit[] {
  return system === 'si'
    ? ['mm', 'cm', 'm', 'pt', 'pica']
    : ['inch', 'ft', 'pt', 'pica'];
}

/** Short UI label for a unit. */
export function unitLabel(unit: LengthUnit): string {
  switch (unit) {
    case 'pt': return 'pt';
    case 'pica': return 'pica';
    case 'inch': return 'in';
    case 'ft': return 'ft';
    case 'mm': return 'mm';
    case 'cm': return 'cm';
    case 'm': return 'm';
  }
}

function formatNumber(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

/** Display string for document points in the given unit ("8.5 in"). */
export function formatInUnit(points: number, unit: LengthUnit, locale?: string): string {
  finite(points, 'Document length');
  pointsPerUnit(unit);
  return `${formatNumber(pointsToUnit(points, unit), locale)} ${unitLabel(unit)}`;
}

export type PresetTarget = 'workspace' | 'print' | 'image';

export interface PagePreset {
  id: string;
  label: string;
  /** Portrait width/height in the preset's own unit. */
  width: number;
  height: number;
  unit: LengthUnit;
  /** Print family: ISO page sizes vs. US page sizes. */
  family?: 'iso' | 'us';
}

export const WORKSPACE_PRESETS: PagePreset[] = [
  { id: 'canvas-16-9', label: 'Default canvas 16:9', width: 1920, height: 1080, unit: 'pt' },
  { id: 'canvas-720p', label: 'HD 1280 × 720', width: 1280, height: 720, unit: 'pt' },
  { id: 'canvas-square', label: 'Square 1080 × 1080', width: 1080, height: 1080, unit: 'pt' },
  { id: 'canvas-portrait', label: 'Portrait 1080 × 1920', width: 1080, height: 1920, unit: 'pt' },
];

export const PRINT_PRESETS: PagePreset[] = [
  { id: 'iso-a5', label: 'ISO A5', width: 148, height: 210, unit: 'mm', family: 'iso' },
  { id: 'iso-a4', label: 'ISO A4', width: 210, height: 297, unit: 'mm', family: 'iso' },
  { id: 'iso-a3', label: 'ISO A3', width: 297, height: 420, unit: 'mm', family: 'iso' },
  { id: 'us-letter', label: 'US Letter', width: 8.5, height: 11, unit: 'inch', family: 'us' },
  { id: 'us-legal', label: 'US Legal', width: 8.5, height: 14, unit: 'inch', family: 'us' },
  { id: 'us-tabloid', label: 'US Tabloid', width: 11, height: 17, unit: 'inch', family: 'us' },
];

export interface ImagePreset {
  id: string;
  label: string;
  /** Pixel dimensions; converted to points at 96 CSS px per inch. */
  widthPx: number;
  heightPx: number;
}

export const IMAGE_PRESETS: ImagePreset[] = [
  { id: 'img-hd', label: 'Full HD 1920 × 1080', widthPx: 1920, heightPx: 1080 },
  { id: 'img-4k', label: '4K UHD 3840 × 2160', widthPx: 3840, heightPx: 2160 },
  { id: 'img-square', label: 'Square post 1080 × 1080', widthPx: 1080, heightPx: 1080 },
  { id: 'img-social', label: 'Social 1200 × 630', widthPx: 1200, heightPx: 630 },
];

/** Points for an image preset (portrait dims, before orientation). */
export function imagePresetToPoints(preset: ImagePreset): { widthPt: number; heightPt: number } {
  if (!Number.isFinite(preset.widthPx) || preset.widthPx <= 0) {
    throw new Error('Image preset width must be positive');
  }
  if (!Number.isFinite(preset.heightPx) || preset.heightPx <= 0) {
    throw new Error('Image preset height must be positive');
  }
  const scale = 72 / PX_PER_INCH;
  return { widthPt: preset.widthPx * scale, heightPt: preset.heightPx * scale };
}

export type Orientation = 'portrait' | 'landscape';

/** Points for a page preset. Without an orientation the preset keeps its
 * authored shape (workspace canvases are landscape-first); with one, the
 * dims are normalized to portrait or landscape for the print/image tabs. */
export function pagePresetToPoints(
  preset: PagePreset,
  orientation?: Orientation,
): { widthPt: number; heightPt: number } {
  if (!Number.isFinite(preset.width) || preset.width <= 0) {
    throw new Error('Page preset width must be positive');
  }
  if (!Number.isFinite(preset.height) || preset.height <= 0) {
    throw new Error('Page preset height must be positive');
  }
  const widthPt = unitToPoints(preset.width, preset.unit);
  const heightPt = unitToPoints(preset.height, preset.unit);
  if (orientation === 'landscape') {
    return { widthPt: Math.max(widthPt, heightPt), heightPt: Math.min(widthPt, heightPt) };
  }
  if (orientation === 'portrait') {
    return { widthPt: Math.min(widthPt, heightPt), heightPt: Math.max(widthPt, heightPt) };
  }
  return { widthPt, heightPt };
}

export interface RatioPreset {
  id: string;
  label: string;
  a: number;
  b: number;
}

export const RATIO_PRESETS: RatioPreset[] = [
  { id: 'ratio-16-9', label: '16 : 9', a: 16, b: 9 },
  { id: 'ratio-16-10', label: '16 : 10', a: 16, b: 10 },
  { id: 'ratio-4-3', label: '4 : 3', a: 4, b: 3 },
  { id: 'ratio-3-2', label: '3 : 2', a: 3, b: 2 },
  { id: 'ratio-1-1', label: '1 : 1', a: 1, b: 1 },
  { id: 'ratio-9-16', label: '9 : 16', a: 9, b: 16 },
];

/** Multiply a ratio by a length: width = a*scale, height = b*scale. */
export function resolveRatioToPoints(
  a: number,
  b: number,
  scale: number,
  unit: LengthUnit,
): { widthPt: number; heightPt: number } {
  if (!Number.isFinite(a) || a <= 0) throw new Error('Ratio width part must be positive');
  if (!Number.isFinite(b) || b <= 0) throw new Error('Ratio height part must be positive');
  finite(scale, 'Ratio scale');
  if (scale <= 0) throw new Error('Ratio scale must be positive');
  const scalePt = unitToPoints(scale, unit);
  return { widthPt: a * scalePt, heightPt: b * scalePt };
}

/** Clamp for dialog entry: DocumentManager already rejects non-positive
 * sizes; this keeps absurd values out before they get there. */
export const MAX_DIMENSION_PT = 20000;

export function clampDimensionPt(points: number): number {
  finite(points, 'Document dimension');
  return Math.min(Math.max(points, 0), MAX_DIMENSION_PT);
}
