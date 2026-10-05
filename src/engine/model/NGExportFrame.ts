// Export Frame records for In-Canvas Elements (TASKS.txt: Rect Keys >
// In-Canvas Elements > EXPORT FRAME). A frame is a permanent,
// document-stored rectangle that crops the artwork contained in or
// intersecting it for export, without clipping the live elements.
// Pure data only: no Paper.js, no scene state. Paper-side helpers live in
// ../scene/exportFrames.ts; the GUI control schema lives in
// ../../ui/inCanvasGui.ts.
export interface ExportFrameBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ExportFrameFormat = 'svg';

export interface ExportFrameRecord {
  /** Stable frame identity, also mirrored on the Paper item data. */
  id: string;
  /** Display name shown in the frame GUI. */
  name: string;
  /** Frame bounds in document points. Follows the live item bounds. */
  rect: ExportFrameBox;
  /** Export boxes as fractions of the frame rect. Empty means full frame.
   * Unit space keeps boxes aligned when the frame is moved or resized. */
  boxes: ExportFrameBox[];
  format: ExportFrameFormat;
  /** Raster/vector scale factor applied at export time. */
  scale: number;
  /** Background fill for the export, or null for transparent. */
  background: string | null;
}

export class ExportFrameValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ExportFrameValidationError'; }
}

function fail(path: string, expected: string): never {
  throw new ExportFrameValidationError(`${path}: expected ${expected}`);
}

function record(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'plain record');
  const object = value as Record<string, unknown>;
  const proto = Object.getPrototypeOf(object);
  if (proto !== Object.prototype && proto !== null) fail(path, 'plain record');
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) fail(`${path}.${key}`, 'known export-frame field');
  }
  return object;
}

function finite(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'finite number');
}

function nonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(path, 'non-empty string');
}

function pointsBox(value: unknown, path: string): asserts value is ExportFrameBox {
  const b = record(value, path, ['x', 'y', 'width', 'height']);
  for (const key of ['x', 'y'] as const) finite(b[key], `${path}.${key}`);
  for (const key of ['width', 'height'] as const) {
    finite(b[key], `${path}.${key}`);
    if ((b[key] as number) <= 0) fail(`${path}.${key}`, 'positive number');
  }
}

function unitBox(value: unknown, path: string): asserts value is ExportFrameBox {
  const b = record(value, path, ['x', 'y', 'width', 'height']);
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    finite(b[key], `${path}.${key}`);
    const v = b[key] as number;
    if (v < 0 || v > 1) fail(`${path}.${key}`, 'fraction in [0, 1]');
  }
  if ((b.width as number) <= 0 || (b.height as number) <= 0) fail(path, 'positive width and height');
  if ((b.x as number) + (b.width as number) > 1 || (b.y as number) + (b.height as number) > 1) {
    fail(path, 'box inside the unit frame');
  }
}

function color(value: unknown, path: string): void {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) fail(path, 'hex color like #rrggbb');
}

/** Validate a durable Export Frame record. Unknown fields are rejected so
 * stale or foreign GUI state can never become document truth. */
export function validateExportFrame(value: unknown): asserts value is ExportFrameRecord {
  const f = record(value, 'exportFrame', ['id', 'name', 'rect', 'boxes', 'format', 'scale', 'background']);
  nonEmptyString(f.id, 'exportFrame.id');
  if (typeof f.name !== 'string') fail('exportFrame.name', 'string');
  pointsBox(f.rect, 'exportFrame.rect');
  if (!Array.isArray(f.boxes)) fail('exportFrame.boxes', 'array');
  if ((f.boxes as unknown[]).length > 64) fail('exportFrame.boxes', 'at most 64 boxes');
  (f.boxes as unknown[]).forEach((entry, i) => unitBox(entry, `exportFrame.boxes[${i}]`));
  if (f.format !== 'svg') fail('exportFrame.format', 'svg');
  finite(f.scale, 'exportFrame.scale');
  if ((f.scale as number) <= 0) fail('exportFrame.scale', 'positive number');
  if (f.background !== null) color(f.background, 'exportFrame.background');
}

export function createExportFrame(
  rect: ExportFrameBox,
  opts?: { id?: string; name?: string },
): ExportFrameRecord {
  const record: ExportFrameRecord = {
    id: opts?.id ?? crypto.randomUUID(),
    name: opts?.name ?? 'Export frame',
    rect: { ...rect },
    boxes: [],
    format: 'svg',
    scale: 1,
    background: null,
  };
  validateExportFrame(record);
  return record;
}

/** Split the unit frame into count boxes on a near-square grid. Used by the
 * frame GUI to configure multiple export boxes inside one frame. */
export function splitFrameBoxes(count: number): ExportFrameBox[] {
  if (!Number.isInteger(count) || count < 1 || count > 64) {
    throw new ExportFrameValidationError('count: expected integer in [1, 64]');
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const boxes: ExportFrameBox[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    boxes.push({ x: col / cols, y: row / rows, width: 1 / cols, height: 1 / rows });
  }
  return boxes;
}

/** Absolute export boxes in document points. An empty box list exports the
 * full frame, so a frame always has at least one configured box. Pass the
 * live item bounds as rectOverride so dragged/resized frames stay exact. */
export function resolveExportBoxes(frame: ExportFrameRecord, rectOverride?: ExportFrameBox): ExportFrameBox[] {
  validateExportFrame(frame);
  const rect = rectOverride ?? frame.rect;
  if (frame.boxes.length === 0) return [{ ...rect }];
  return frame.boxes.map((b) => ({
    x: rect.x + b.x * rect.width,
    y: rect.y + b.y * rect.height,
    width: b.width * rect.width,
    height: b.height * rect.height,
  }));
}

/** True when the artwork rect is contained in or intersects the frame. */
export function frameMatchesArtwork(
  frame: ExportFrameBox,
  art: ExportFrameBox,
): boolean {
  return art.x < frame.x + frame.width
    && art.x + art.width > frame.x
    && art.y < frame.y + frame.height
    && art.y + art.height > frame.y;
}
