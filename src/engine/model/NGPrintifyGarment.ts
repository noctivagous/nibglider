// Printify garment records for In-Canvas Elements (TASKS.txt: Rect Keys >
// In-Canvas Elements). A garment is a document-stored group: one locked
// outline (visual guide from the Printify blank `views[]` template) plus one
// live area rect per printable placeholder (e.g. front, back). Each area
// reuses the export-frame crop path: artwork contained in or intersecting
// the area rect exports at the exact pixel size Printify lists for that
// variant placeholder. Pure data only: no Paper.js, no scene state, no
// network. Paper-side helpers live in ../scene/printifyGarment.ts; the GUI
// control schema lives in ../../ui/inCanvasGui.ts.
export interface PrintifyPxSize {
  width: number;
  height: number;
}

export interface PrintifyAreaRecord {
  /** Stable area identity, mirrored on the Paper item data. */
  id: string;
  /** Printify placeholder position, e.g. 'front', 'back', 'left_sleeve'. */
  position: string;
  /** Decoration method for this position, e.g. 'dtg', 'dtf', 'embroidery'. */
  decorationMethod: string;
  /** Required Printify pixel size for the bound variant. */
  requiredPx: PrintifyPxSize;
  /** Area bounds in document points. Follows the live item bounds. */
  rect: PrintifyPxSize & { x: number; y: number };
  /** Raster/vector scale applied at export time. Derived, not hand-tuned. */
  scale: number;
}

export interface PrintifyGarmentRecord {
  /** Stable garment identity, mirrored on outline + area items. */
  id: string;
  /** Display name shown in the frame GUI. */
  name: string;
  /** Printify catalog identity. */
  blueprintId: number;
  printProviderId: number;
  /** Variant ids this garment block covers. */
  variantIds: number[];
  /** Blank-product template image urls (Printify `views[].files[].src`). */
  templateSrcs: string[];
  /** One entry per printable placeholder. */
  areas: PrintifyAreaRecord[];
}

export class PrintifyGarmentValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'PrintifyGarmentValidationError'; }
}

function fail(path: string, expected: string): never {
  throw new PrintifyGarmentValidationError(`${path}: expected ${expected}`);
}

function plainRecord(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'plain record');
  const object = value as Record<string, unknown>;
  const proto = Object.getPrototypeOf(object);
  if (proto !== Object.prototype && proto !== null) fail(path, 'plain record');
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) fail(`${path}.${key}`, 'known printify-garment field');
  }
  return object;
}

function finite(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'finite number');
}

function positiveInt(value: unknown, path: string): asserts value is number {
  finite(value, path);
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail(path, 'positive integer');
}

function nonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(path, 'non-empty string');
}

function pointsRect(value: unknown, path: string): void {
  const b = plainRecord(value, path, ['x', 'y', 'width', 'height']);
  finite(b.x, `${path}.x`);
  finite(b.y, `${path}.y`);
  finite(b.width, `${path}.width`);
  finite(b.height, `${path}.height`);
  if ((b.width as number) <= 0 || (b.height as number) <= 0) fail(path, 'positive width and height');
}

function pxSize(value: unknown, path: string): asserts value is PrintifyPxSize {
  const b = plainRecord(value, path, ['width', 'height']);
  positiveInt(b.width, `${path}.width`);
  positiveInt(b.height, `${path}.height`);
}

/** Points rect for one placeholder. Printify placeholders are portrait
 * print areas; the rect preserves the placeholder aspect so artwork maps
 * 1:1 onto the required pixels. */
export function placeholderRectPoints(placeholderPx: PrintifyPxSize, heightPoints = 360): { width: number; height: number } {
  pxSize(placeholderPx, 'placeholderPx');
  if (!Number.isFinite(heightPoints) || heightPoints <= 0) fail('heightPoints', 'positive number');
  return { width: (heightPoints * placeholderPx.width) / placeholderPx.height, height: heightPoints };
}

/** Export scale that maps a points rect to exact Printify pixels.
 * NibGlider renders document points at 96dpi (72pt == 96px), so
 * scale = requiredPx / (points * 96/72). Rounded to 4dp; callers must use
 * exportPngSizeForArea to verify the round-trip lands exactly. */
export function exportScaleForArea(rectPoints: { width: number; height: number }, requiredPx: PrintifyPxSize): number {
  if (!Number.isFinite(rectPoints.width) || rectPoints.width <= 0) fail('rectPoints.width', 'positive number');
  if (!Number.isFinite(rectPoints.height) || rectPoints.height <= 0) fail('rectPoints.height', 'positive number');
  pxSize(requiredPx, 'requiredPx');
  const sx = requiredPx.width / ((rectPoints.width * 96) / 72);
  const sy = requiredPx.height / ((rectPoints.height * 96) / 72);
  // Placeholders keep aspect by construction; take the mean so a slightly
  // off-aspect rect still centers instead of clipping one axis.
  const scale = (sx + sy) / 2;
  if (!Number.isFinite(scale) || scale <= 0) fail('scale', 'positive number');
  return Math.round(scale * 10000) / 10000;
}

/** Raster dimensions in pixels for an area: must equal requiredPx exactly
 * when the rect/scale came from exportScaleForArea. */
export function exportPngSizeForArea(
  rectPoints: { width: number; height: number },
  scale: number,
): { width: number; height: number } {
  if (!Number.isFinite(rectPoints.width) || rectPoints.width <= 0) fail('rectPoints.width', 'positive number');
  if (!Number.isFinite(rectPoints.height) || rectPoints.height <= 0) fail('rectPoints.height', 'positive number');
  if (!Number.isFinite(scale) || scale <= 0) fail('scale', 'positive number');
  return {
    width: Math.max(1, Math.round((rectPoints.width * scale * 96) / 72)),
    height: Math.max(1, Math.round((rectPoints.height * scale * 96) / 72)),
  };
}

function validateArea(value: unknown, path: string): asserts value is PrintifyAreaRecord {
  const a = plainRecord(value, path, ['id', 'position', 'decorationMethod', 'requiredPx', 'rect', 'scale']);
  nonEmptyString(a.id, `${path}.id`);
  nonEmptyString(a.position, `${path}.position`);
  nonEmptyString(a.decorationMethod, `${path}.decorationMethod`);
  pxSize(a.requiredPx, `${path}.requiredPx`);
  pointsRect(a.rect, `${path}.rect`);
  finite(a.scale, `${path}.scale`);
  if ((a.scale as number) <= 0) fail(`${path}.scale`, 'positive number');
}

/** Validate a durable Printify garment record. Unknown fields are rejected
 * so stale or foreign GUI state can never become document truth. */
export function validatePrintifyGarment(value: unknown): asserts value is PrintifyGarmentRecord {
  const g = plainRecord(value, 'printifyGarment',
    ['id', 'name', 'blueprintId', 'printProviderId', 'variantIds', 'templateSrcs', 'areas']);
  nonEmptyString(g.id, 'printifyGarment.id');
  if (typeof g.name !== 'string') fail('printifyGarment.name', 'string');
  positiveInt(g.blueprintId, 'printifyGarment.blueprintId');
  positiveInt(g.printProviderId, 'printifyGarment.printProviderId');
  if (!Array.isArray(g.variantIds) || g.variantIds.length === 0) fail('printifyGarment.variantIds', 'non-empty array');
  if (g.variantIds.length > 256) fail('printifyGarment.variantIds', 'at most 256 variants');
  (g.variantIds as unknown[]).forEach((id, i) => positiveInt(id, `printifyGarment.variantIds[${i}]`));
  if (new Set(g.variantIds as unknown[]).size !== (g.variantIds as unknown[]).length) {
    fail('printifyGarment.variantIds', 'unique variant ids');
  }
  if (!Array.isArray(g.templateSrcs)) fail('printifyGarment.templateSrcs', 'array');
  (g.templateSrcs as unknown[]).forEach((src, i) => {
    if (typeof src !== 'string' || src.length === 0) fail(`printifyGarment.templateSrcs[${i}]`, 'non-empty url string');
  });
  if (!Array.isArray(g.areas) || (g.areas as unknown[]).length === 0) fail('printifyGarment.areas', 'non-empty array');
  if ((g.areas as unknown[]).length > 16) fail('printifyGarment.areas', 'at most 16 areas');
  (g.areas as unknown[]).forEach((area, i) => validateArea(area, `printifyGarment.areas[${i}]`));
  const areaIds = (g.areas as PrintifyAreaRecord[]).map((a) => a.id);
  if (new Set(areaIds).size !== areaIds.length) fail('printifyGarment.areas', 'unique area ids');
}

/** Placeholder pixel size for one printable position, as listed by the
 * Printify variants endpoint. */
export interface PrintifyPlaceholderSpec {
  width: number;
  height: number;
  decorationMethod?: string;
}

/** Deposit spec: garment identity plus one area per printable position.
 * Area rects default to the placeholder aspect at a readable height. */
export interface PrintifyGarmentSpec {
  name?: string;
  blueprintId: number;
  printProviderId: number;
  variantIds: number[];
  templateSrcs?: string[];
  areas: {
    position: string;
    decorationMethod: string;
    requiredPx: PrintifyPxSize;
    rect?: { x: number; y: number; width: number; height: number };
  }[];
  origin?: { x: number; y: number };
}

export function createPrintifyGarment(opts: PrintifyGarmentSpec & { id?: string }): PrintifyGarmentRecord {
  const origin = opts.origin ?? { x: 0, y: 0 };
  let cursorX = origin.x;
  const areas: PrintifyAreaRecord[] = opts.areas.map((area) => {
    const size = placeholderRectPoints(area.requiredPx);
    const rect = area.rect ?? { x: cursorX, y: origin.y, width: size.width, height: size.height };
    cursorX = rect.x + rect.width + 24;
    return {
      id: crypto.randomUUID(),
      position: area.position,
      decorationMethod: area.decorationMethod,
      requiredPx: { ...area.requiredPx },
      rect,
      scale: exportScaleForArea(rect, area.requiredPx),
    };
  });
  const record: PrintifyGarmentRecord = {
    id: opts.id ?? crypto.randomUUID(),
    name: opts.name ?? 'Printify garment',
    blueprintId: opts.blueprintId,
    printProviderId: opts.printProviderId,
    variantIds: [...opts.variantIds],
    templateSrcs: [...(opts.templateSrcs ?? [])],
    areas,
  };
  validatePrintifyGarment(record);
  return record;
}
