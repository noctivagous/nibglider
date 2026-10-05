// Persisted engine settings: one versioned JSON document under a
// nibglider.* key (GUIManager's localStorage pattern), so the Debug menu's
// Reset (wipe prefix + reload) restores defaults with no extra code.
// Owns the key table only: each entry snapshots one setting and restores it
// through the matching engine setter, inheriting that setter's validation.
// Unknown keys are ignored; invalid values keep their defaults; storage or
// JSON failures degrade to defaults, never a throw. Tested from
// tests/engine-settings.test.mjs.
import {
  clampPolygonSides,
  clampSupershapeParam,
  clampSplineTension,
  cssHex,
} from './input/KeySettingsRegistry';
import type { QuadMapping } from './geometry/RectangleGeometry';
import type { NibGliderEngine } from './engine';
import type { InnerShapeParams } from './types';

/** Minimal store surface; localStorage and GUIManager stores satisfy it. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function memorySettingsStore(): SettingsStorage {
  const mem = new Map<string, string>();
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key) as string : null),
    setItem: (key, value) => { mem.set(key, value); },
  };
}

export const ENGINE_SETTINGS_KEY = 'nibglider.settings.v1';

interface SettingEntry {
  key: string;
  save(engine: NibGliderEngine): unknown;
  load(engine: NibGliderEngine, raw: unknown): void;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw);
}

function num(
  key: string,
  get: (e: NibGliderEngine) => number,
  set: (e: NibGliderEngine, v: number) => void,
): SettingEntry {
  return {
    key,
    save: (e) => get(e),
    load: (e, raw) => { if (typeof raw === 'number' && Number.isFinite(raw)) set(e, raw); },
  };
}

function bool(
  key: string,
  get: (e: NibGliderEngine) => boolean,
  set: (e: NibGliderEngine, v: boolean) => void,
): SettingEntry {
  return {
    key,
    save: (e) => get(e),
    load: (e, raw) => { if (typeof raw === 'boolean') set(e, raw); },
  };
}

function str(
  key: string,
  get: (e: NibGliderEngine) => string,
  set: (e: NibGliderEngine, v: string) => void,
): SettingEntry {
  return {
    key,
    save: (e) => get(e),
    load: (e, raw) => { if (typeof raw === 'string') set(e, raw); },
  };
}

function en(
  key: string,
  allowed: readonly string[],
  get: (e: NibGliderEngine) => string,
  set: (e: NibGliderEngine, v: string) => void,
): SettingEntry {
  return {
    key,
    save: (e) => get(e),
    load: (e, raw) => {
      if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) {
        set(e, raw);
      }
    },
  };
}

function hex(
  key: string,
  get: (e: NibGliderEngine) => string,
  set: (e: NibGliderEngine, v: string) => void,
): SettingEntry {
  return {
    key,
    save: (e) => get(e),
    load: (e, raw) => {
      if (typeof raw !== 'string') return;
      const checked = cssHex(raw, '');
      if (checked != null) set(e, checked);
    },
  };
}

function finiteNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function paramsEntry(
  key: string,
  get: (e: NibGliderEngine) => InnerShapeParams,
  setSides: (e: NibGliderEngine, v: number) => void,
  setSuper: (e: NibGliderEngine, k: 'm' | 'n1' | 'n2' | 'n3' | 'a1' | 'a2', v: number) => void,
  setAngle: (e: NibGliderEngine, v: number) => void,
  // Rect shapes have no sector field; circle params pass setCircleSector.
  setSector: ((e: NibGliderEngine, v: number) => void) | null,
): SettingEntry {
  return {
    key,
    save: (e) => ({ ...get(e) }),
    load: (e, raw) => {
      if (!isRecord(raw)) return;
      const sides = finiteNumber(raw['sides']);
      if (sides != null) setSides(e, clampPolygonSides(sides));
      for (const k of ['m', 'n1', 'n2', 'n3', 'a1', 'a2'] as const) {
        const v = finiteNumber(raw[k]);
        if (v != null) setSuper(e, k, clampSupershapeParam(k, v));
      }
      const angle = finiteNumber(raw['angle']);
      if (angle != null) setAngle(e, angle);
      const sector = finiteNumber(raw['sector']);
      if (sector != null) setSector?.(e, sector);
    },
  };
}

const CIRCLE_INNER = [
  'circle', 'semicircle', 'sector', 'segment', 'polygon', 'supershape',
  'trapezoid', 'parallelogram', 'rightTriangle', 'rhombus', 'kite',
] as const;

const RECT_INNER = [
  'rectangle', 'circle', 'polygon', 'supershape', 'trapezoid',
  'parallelogram', 'rightTriangle', 'rhombus', 'kite',
] as const;

const ENTRIES: SettingEntry[] = [
  // Paint.
  num('stroke.width', (e) => e.globalStrokeWidth, (e, v) => e.setStrokeWidth(v)),
  hex('stroke.color', (e) => e.globalStrokeColor, (e, v) => e.setStrokeColor(v)),
  en('stroke.cap', ['butt', 'round', 'square'], (e) => e.globalStrokeCap, (e, v) => e.setStrokeCap(v as never)),
  en('stroke.join', ['miter', 'round', 'bevel'], (e) => e.globalStrokeJoin, (e, v) => e.setStrokeJoin(v as never)),
  en('stroke.position', ['center', 'inside', 'outside'], (e) => e.globalStrokePosition, (e, v) => e.setStrokePosition(v as never)),
  num('stroke.miter', (e) => e.globalMiterLimit, (e, v) => e.setMiterLimit(v)),
  {
    key: 'stroke.dash',
    save: (e) => e.strokeDashArrayValue() ?? [0, 0],
    load: (e, raw) => {
      if (!Array.isArray(raw) || raw.length !== 2) return;
      const d = finiteNumber(raw[0]);
      const g = finiteNumber(raw[1]);
      if (d != null && g != null) e.setStrokeDash(d, g);
    },
  },
  bool('stroke.enabled', (e) => e.strokeEnabled, (e, v) => e.setStrokeEnabled(v)),
  hex('fill.color', (e) => e.globalFillColor, (e, v) => e.setFillColor(v)),
  en('fill.type', ['solid', 'linear', 'radial'], (e) => e.globalFillType, (e, v) => e.setFillType(v as never)),
  hex('fill.endColor', (e) => e.globalFillEndColor, (e, v) => e.setFillEndColor(v)),
  num('fill.angle', (e) => e.globalFillAngle, (e, v) => e.setFillAngle(v)),
  num('fill.inner', (e) => e.globalFillInner, (e, v) => e.setFillInner(v)),
  bool('fill.enabled', (e) => e.fillEnabled, (e, v) => e.setFillEnabled(v)),
  // Grid and snapping.
  bool('grid.enabled', (e) => e.isGridEnabled, (e, v) => e.setGridEnabled(v)),
  en('grid.type', ['square', 'diamond'], (e) => e.gridType, (e, v) => e.setGridType(v as never)),
  bool('snap.grid', (e) => e.isGridSnappingEnabled, (e, v) => e.setGridSnappingEnabled(v)),
  bool('snap.path', (e) => e.isPathSnappingEnabled, (e, v) => e.setPathSnappingEnabled(v)),
  bool('snap.point', (e) => e.isPointSnappingEnabled, (e, v) => e.setPointSnappingEnabled(v)),
  bool('snap.angle', (e) => e.isAngleSnappingEnabled, (e, v) => e.setAngleSnappingEnabled(v)),
  num('snap.angleStep', (e) => e.angleSnapDegrees, (e, v) => e.setAngleSnapDegrees(v)),
  bool('snap.length', (e) => e.isLengthSnappingEnabled, (e, v) => e.setLengthSnappingEnabled(v)),
  num('snap.lengthStep', (e) => e.lengthSnapStep, (e, v) => e.setLengthSnapStep(v)),
  en('snap.lengthUnit', ['pt', 'pica', 'inch', 'ft', 'mm', 'cm', 'm'], (e) => e.lengthUnit, (e, v) => e.setLengthUnit(v as never)),
  bool('snap.aspect', (e) => e.isAspectSnappingEnabled, (e, v) => e.setAspectSnappingEnabled(v)),
  str('snap.aspectRatio', (e) => e.aspectRatioKey(), (e, v) => e.setAspectRatioKey(v)),
  // Shapes.
  en('circle.inner', CIRCLE_INNER, (e) => e.circleInnerShapeType, (e, v) => e.setCircleInnerShapeType(v as never)),
  paramsEntry(
    'circle.params',
    (e) => e.circleInnerShapeParams,
    (e, v) => e.setCircleSides(v),
    (e, k, v) => e.setSupershapeParam(k, v),
    (e, v) => e.setCircleAngle(v),
    (e, v) => e.setCircleSector(v),
  ),
  en('rect.inner', RECT_INNER, (e) => e.rectangleInnerShapeType, (e, v) => e.setRectangleInnerShapeType(v as never)),
  paramsEntry(
    'rect.params',
    (e) => e.rectangleInnerShapeParams,
    (e, v) => e.setRectangleSides(v),
    (e, k, v) => e.setRectangleSupershapeParam(k, v),
    (e, v) => e.setRectangleAngle(v),
    null,
  ),
  num('rect.orientation', (e) => e.rectangleOrientation, (e, v) => e.setRectangleOrientation(v)),
  en('shape.polygonRadius', ['inradius', 'circumradius'], (e) => e.polygonRadiusMode, (e, v) => e.setPolygonRadiusMode(v)),
  en('shape.circleAnchor', ['origin', 'circumference'], (e) => e.circleRadiusAnchor, (e, v) => e.setCircleRadiusAnchor(v as never)),
  en('shape.rectDiagonal', ['full', 'half', 'quarter'], (e) => e.rectDiagonalMode, (e, v) => e.setRectDiagonalMode(v as never)),
  // Path.
  en('path.mode', ['legacy', 'ngComposite'], (e) => e.pathDrawingMode, (e, v) => e.setPathDrawingMode(v as never)),
  num('path.cornerRadius', (e) => e.compositeCornerRadius, (e, v) => e.setCompositeCornerRadius(v)),
  num('path.splineTension', (e) => e.splineTension, (e, v) => e.setSplineTension(clampSplineTension(v))),
  // Text.
  str('text.content', (e) => e.globalText.content, (e, v) => e.setTextContent(v)),
  str('text.line2', (e) => e.globalText.line2, (e, v) => e.setTextLine2(v)),
  str('text.fontFamily', (e) => e.globalText.fontFamily, (e, v) => e.setTextFontFamily(v)),
  num('text.fontSize', (e) => e.globalText.fontSize, (e, v) => e.setTextFontSize(v)),
  str('text.fontWeight', (e) => e.globalText.fontWeight, (e, v) => e.setTextFontWeight(v)),
  bool('text.italic', (e) => e.globalText.italic, (e, v) => e.setTextItalic(v)),
  en('text.justification', ['left', 'center', 'right'], (e) => e.globalText.justification, (e, v) => e.setTextJustification(v as never)),
  num('text.leading', (e) => e.globalText.leading, (e, v) => e.setTextLeading(v)),
  bool('text.modeEnabled', (e) => e.textModeEnabled, (e, v) => e.setTextModeEnabled(v)),
  en('text.mode', ['display', 'body'], (e) => e.textMode, (e, v) => e.setTextMode(v as never)),
  en('text.flow', ['interior', 'exterior'], (e) => e.displayFlow, (e, v) => e.setDisplayFlow(v as never)),
  en('text.glyph', ['outward', 'inward'], (e) => e.glyphOrientation, (e, v) => e.setGlyphOrientation(v as never)),
  en('text.splinePlacement', ['above', 'baseline', 'below'], (e) => e.splineTextPlacement, (e, v) => e.setSplineTextPlacement(v as never)),
  num('text.displayOffset', (e) => e.displayOffset, (e, v) => e.setDisplayOffset(v)),
  num('text.circGap', (e) => e.circumferenceGap, (e, v) => e.setCircumferenceGap(v)),
  num('text.circAngle', (e) => e.circumferenceAngleOffset, (e, v) => e.setCircumferenceAngleOffset(v)),
  en('text.pasteLocation', ['crosshair', 'view-center'], (e) => e.textPasteLocation, (e, v) => e.setTextPasteLocation(v as never)),
  // Modes.
  en('combine.mode', ['none', 'union', 'subtract', 'intersect'], (e) => e.combineMode, (e, v) => e.setCombineMode(v as never)),
  en('quad.mapping', ['bilinear', 'projective'], (e) => e.quadMapping, (e, v) => e.setQuadMapping(v as QuadMapping)),
  bool('quad.perspectiveCircle', (e) => e.perspectiveCircle, (e, v) => e.setPerspectiveCircle(v)),
];

export function snapshotEngineSettings(engine: NibGliderEngine): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const entry of ENTRIES) values[entry.key] = entry.save(engine);
  return values;
}

export function applyEngineSettings(engine: NibGliderEngine, values: Record<string, unknown>): void {
  for (const entry of ENTRIES) {
    if (!(entry.key in values)) continue;
    try {
      entry.load(engine, values[entry.key]);
    } catch {
      // One bad value keeps its default; the rest still apply.
    }
  }
}

/**
 * Snapshot, compare, and write. Returns the snapshot JSON now on record:
 * unchanged input returns lastJson without touching storage, so calling
 * this from notify() stays cheap between actual setting changes.
 */
export function saveEngineSettings(
  engine: NibGliderEngine,
  store: SettingsStorage,
  lastJson: string | null,
): string | null {
  let json: string;
  try {
    json = JSON.stringify({ version: 1, values: snapshotEngineSettings(engine) });
  } catch {
    return lastJson;
  }
  if (json === lastJson) return lastJson;
  try {
    store.setItem(ENGINE_SETTINGS_KEY, json);
  } catch {
    // Storage can be unavailable in private browsing.
    return lastJson;
  }
  return json;
}

export function loadEngineSettings(engine: NibGliderEngine, store: SettingsStorage): void {
  let raw: string | null = null;
  try {
    raw = store.getItem(ENGINE_SETTINGS_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let doc: unknown = null;
  try {
    doc = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isRecord(doc) || !isRecord(doc['values'])) return;
  applyEngineSettings(engine, doc['values']);
}
