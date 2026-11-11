// One param-addressing scheme for the tutorial system.
//
// Tutorial expects (setting-is) and demo scripts (set-param) both address
// a value by (settingsId, field). Two families share the scheme:
//   1. The per-key settings popovers — the schemas in
//      KeySettingsRegistry ('rect-diagonal-tool', 'path-tool', …),
//      resolved through settingsView exactly as the popover UI does.
//   2. The panel's engine params — the table below ('stroke', 'fill',
//      'grid', 'snapping', 'repeat', 'combinatorics', 'text', 'rect',
//      'circle', 'guides'). Writes go through the same engine setters the
//      panel controls call, so a demo performs the real action —
//      including the paint setters' selection-aware behaviour: with a
//      selection, setStrokeWidth/setFillColor/… repaint the selection,
//      which is exactly what the paint tutorials teach. Paint reads are
//      selection-aware in the same direction, mirroring the panel: with
//      a selection they report the selection's paint (what the Stroke
//      and Fill sections display), otherwise the global value.
//
// An address that resolves to nothing reads as undefined and refuses to
// write (writeParam returns false) — never a silent no-op success.

import { schemaById, type SettingsTarget } from './KeySettingsRegistry';
import { settingsView } from './KeySettingsViewModel';
import type {
  CircleInnerShape,
  CombineMode,
  FillSpec,
  FillType,
  GridType,
  RectangleInnerShape,
  StrokeCap,
  StrokeJoin,
} from '../types';
import type { FriezeGroupId, RepeatFamilyName, WallpaperGroupId } from '../repeat/symmetry';

export type ParamValue = string | number | boolean;

/** The selected item's paint as the panel displays it (the engine's
 * selectionPaint of the first selected item), or null with no selection. */
export interface SelectionPaintView {
  strokeOn: boolean;
  strokeColor: string;
  strokeWidth: number;
  strokeCap: StrokeCap;
  strokeJoin: StrokeJoin;
  dashLength: number;
  gapLength: number;
  fillOn: boolean;
  fillColor: string;
  fillSpec: FillSpec;
}

/** The engine surface the panel-param table reads and writes. The engine
 * satisfies this structurally; tests substitute a plain fake. */
export interface PanelParamTarget {
  selectionPaint(): SelectionPaintView | null;

  strokeEnabled: boolean;
  globalStrokeWidth: number;
  globalStrokeColor: string;
  globalDashLength: number;
  globalGapLength: number;
  globalStrokeCap: StrokeCap;
  globalStrokeJoin: StrokeJoin;
  setStrokeEnabled(v: boolean): void;
  setStrokeWidth(v: number): void;
  setStrokeColor(v: string): void;
  setStrokeDash(dash: number, gap: number): void;
  setStrokeCap(v: StrokeCap): void;
  setStrokeJoin(v: StrokeJoin): void;

  fillEnabled: boolean;
  globalFillType: FillType;
  globalFillColor: string;
  globalFillEndColor: string;
  globalFillAngle: number;
  setFillEnabled(v: boolean): void;
  setFillType(v: FillType): void;
  setFillColor(v: string): void;
  setFillEndColor(v: string): void;
  setFillAngle(v: number): void;

  isGridEnabled: boolean;
  gridSpacing: number;
  gridSubdivisions: number;
  gridStyle: 'dots' | 'lines';
  gridType: GridType;
  setGridEnabled(v: boolean): void;
  setGridSpacing(v: number): void;
  setGridSubdivisions(v: number): void;
  setGridStyle(v: 'dots' | 'lines'): void;
  setGridType(v: GridType): void;

  isGridSnappingEnabled: boolean;
  isPathSnappingEnabled: boolean;
  isPointSnappingEnabled: boolean;
  isAngleSnappingEnabled: boolean;
  isLengthSnappingEnabled: boolean;
  isAspectSnappingEnabled: boolean;
  guideSnapping: boolean;
  guidesVisible: boolean;
  setGridSnappingEnabled(v: boolean): void;
  setPathSnappingEnabled(v: boolean): void;
  setPointSnappingEnabled(v: boolean): void;
  setAngleSnappingEnabled(v: boolean): void;
  setLengthSnappingEnabled(v: boolean): void;
  setAspectSnappingEnabled(v: boolean): void;
  setGuideSnapping(v: boolean): void;
  setGuidesVisible(v: boolean): void;

  repeatFamily: RepeatFamilyName;
  repeatWallpaperGroup: WallpaperGroupId;
  repeatFriezeGroup: FriezeGroupId;
  repeatSymmetryCount: number;
  repeatPolarMode: 'division' | 'degrees';
  liveSymmetryArmed: boolean;
  isRepeatEnabled: boolean;
  setRepeatFamily(v: RepeatFamilyName): void;
  setRepeatWallpaperGroup(v: WallpaperGroupId): void;
  setRepeatFriezeGroup(v: FriezeGroupId): void;
  setRepeatSymmetryCount(v: number): void;
  setRepeatPolarMode(v: 'division' | 'degrees'): void;
  setLiveSymmetryArmed(v: boolean): void;
  setRepeatEnabled(v: boolean): void;

  combineMode: CombineMode | 'none';
  combineTool: CombineMode;
  setCombineMode(v: CombineMode | 'none'): void;
  setCombineTool(v: CombineMode): void;

  globalText: {
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    italic: boolean;
    letterSpacing: number;
  };
  setTextFontFamily(v: string): void;
  setTextFontSize(v: number): void;
  setTextFontWeight(v: string): void;
  setTextItalic(v: boolean): void;
  setTextLetterSpacing(v: number): void;

  rectangleInnerShapeType: RectangleInnerShape;
  circleInnerShapeType: CircleInnerShape;
  setRectangleInnerShapeType(v: RectangleInnerShape): void;
  setCircleInnerShapeType(v: CircleInnerShape): void;
}

export type ParamTarget = SettingsTarget & PanelParamTarget;

interface ParamSpec {
  read(target: ParamTarget): unknown;
  write(target: ParamTarget, value: ParamValue): boolean;
}

function boolParam(
  read: (t: ParamTarget) => boolean,
  write: (t: ParamTarget, v: boolean) => void,
): ParamSpec {
  return {
    read,
    write: (t, v) => {
      if (typeof v !== 'boolean') return false;
      write(t, v);
      return true;
    },
  };
}

function numberParam(
  read: (t: ParamTarget) => number,
  write: (t: ParamTarget, v: number) => void,
): ParamSpec {
  return {
    read,
    write: (t, v) => {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return false;
      write(t, n);
      return true;
    },
  };
}

function stringParam(
  read: (t: ParamTarget) => string,
  write: (t: ParamTarget, v: string) => void,
): ParamSpec {
  return {
    read,
    write: (t, v) => {
      if (typeof v !== 'string') return false;
      write(t, v);
      return true;
    },
  };
}

function enumParam<T extends string>(
  allowed: readonly T[],
  read: (t: ParamTarget) => T,
  write: (t: ParamTarget, v: T) => void,
): ParamSpec {
  return {
    read,
    write: (t, v) => {
      if (typeof v !== 'string' || !allowed.includes(v as T)) return false;
      write(t, v as T);
      return true;
    },
  };
}

/** A paint read that mirrors the panel: the selection's paint when a
 * selection exists, the global value otherwise. Writes keep using the
 * (already selection-aware) engine setters. */
function paintRead<T>(
  base: ParamSpec,
  pick: (paint: SelectionPaintView) => T,
): ParamSpec {
  return {
    read: (t) => {
      const paint = t.selectionPaint();
      return paint ? pick(paint) : base.read(t);
    },
    write: base.write,
  };
}

/** Dash and gap are one engine setter (setStrokeDash), so each field's
 * write carries the other half's effective current value — the
 * selection's when a selection exists, the global otherwise. */
function dashParam(which: 'dash' | 'gap'): ParamSpec {
  return {
    read: (t) => {
      const paint = t.selectionPaint();
      if (paint) return which === 'dash' ? paint.dashLength : paint.gapLength;
      return which === 'dash' ? t.globalDashLength : t.globalGapLength;
    },
    write: (t, v) => {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return false;
      const paint = t.selectionPaint();
      const dash = which === 'dash' ? n : (paint?.dashLength ?? t.globalDashLength);
      const gap = which === 'gap' ? n : (paint?.gapLength ?? t.globalGapLength);
      t.setStrokeDash(dash, gap);
      return true;
    },
  };
}

const COMBINE_MODES: readonly CombineMode[] = ['union', 'subtract', 'intersect', 'exclude', 'crop', 'cut', 'interlace'];

const PANEL_PARAMS: Record<string, Record<string, ParamSpec>> = {
  stroke: {
    enabled: paintRead(boolParam((t) => t.strokeEnabled, (t, v) => t.setStrokeEnabled(v)), (p) => p.strokeOn),
    width: paintRead(numberParam((t) => t.globalStrokeWidth, (t, v) => t.setStrokeWidth(v)), (p) => p.strokeWidth),
    color: paintRead(stringParam((t) => t.globalStrokeColor, (t, v) => t.setStrokeColor(v)), (p) => p.strokeColor),
    dashLength: dashParam('dash'),
    gapLength: dashParam('gap'),
    cap: paintRead(enumParam(['butt', 'round', 'square'], (t) => t.globalStrokeCap, (t, v) => t.setStrokeCap(v)), (p) => p.strokeCap),
    join: paintRead(enumParam(['miter', 'round', 'bevel'], (t) => t.globalStrokeJoin, (t, v) => t.setStrokeJoin(v)), (p) => p.strokeJoin),
  },
  fill: {
    enabled: paintRead(boolParam((t) => t.fillEnabled, (t, v) => t.setFillEnabled(v)), (p) => p.fillOn),
    type: paintRead(enumParam(['solid', 'linear', 'radial'], (t) => t.globalFillType, (t, v) => t.setFillType(v)), (p) => p.fillSpec.type),
    color: paintRead(stringParam((t) => t.globalFillColor, (t, v) => t.setFillColor(v)), (p) => p.fillColor),
    endColor: paintRead(stringParam((t) => t.globalFillEndColor, (t, v) => t.setFillEndColor(v)), (p) => p.fillSpec.endColor),
    angle: paintRead(numberParam((t) => t.globalFillAngle, (t, v) => t.setFillAngle(v)), (p) => p.fillSpec.angle),
  },
  grid: {
    enabled: boolParam((t) => t.isGridEnabled, (t, v) => t.setGridEnabled(v)),
    spacing: numberParam((t) => t.gridSpacing, (t, v) => t.setGridSpacing(v)),
    subdivisions: numberParam((t) => t.gridSubdivisions, (t, v) => t.setGridSubdivisions(v)),
    style: enumParam(['dots', 'lines'], (t) => t.gridStyle, (t, v) => t.setGridStyle(v)),
    type: enumParam(['square', 'diamond'], (t) => t.gridType, (t, v) => t.setGridType(v)),
  },
  snapping: {
    grid: boolParam((t) => t.isGridSnappingEnabled, (t, v) => t.setGridSnappingEnabled(v)),
    path: boolParam((t) => t.isPathSnappingEnabled, (t, v) => t.setPathSnappingEnabled(v)),
    points: boolParam((t) => t.isPointSnappingEnabled, (t, v) => t.setPointSnappingEnabled(v)),
    angle: boolParam((t) => t.isAngleSnappingEnabled, (t, v) => t.setAngleSnappingEnabled(v)),
    length: boolParam((t) => t.isLengthSnappingEnabled, (t, v) => t.setLengthSnappingEnabled(v)),
    aspect: boolParam((t) => t.isAspectSnappingEnabled, (t, v) => t.setAspectSnappingEnabled(v)),
    guides: boolParam((t) => t.guideSnapping, (t, v) => t.setGuideSnapping(v)),
  },
  guides: {
    visible: boolParam((t) => t.guidesVisible, (t, v) => t.setGuidesVisible(v)),
    snapping: boolParam((t) => t.guideSnapping, (t, v) => t.setGuideSnapping(v)),
  },
  repeat: {
    family: enumParam(
      ['wallpaper', 'frieze', 'polar', 'alongStroke', 'normals'],
      (t) => t.repeatFamily,
      (t, v) => t.setRepeatFamily(v),
    ),
    wallpaperGroup: stringParam((t) => t.repeatWallpaperGroup, (t, v) => t.setRepeatWallpaperGroup(v as WallpaperGroupId)),
    friezeGroup: stringParam((t) => t.repeatFriezeGroup, (t, v) => t.setRepeatFriezeGroup(v as FriezeGroupId)),
    count: numberParam((t) => t.repeatSymmetryCount, (t, v) => t.setRepeatSymmetryCount(v)),
    polarMode: enumParam(['division', 'degrees'], (t) => t.repeatPolarMode, (t, v) => t.setRepeatPolarMode(v)),
    armed: boolParam((t) => t.liveSymmetryArmed, (t, v) => t.setLiveSymmetryArmed(v)),
    gridEnabled: boolParam((t) => t.isRepeatEnabled, (t, v) => t.setRepeatEnabled(v)),
  },
  combinatorics: {
    mode: enumParam(['none', ...COMBINE_MODES], (t) => t.combineMode, (t, v) => t.setCombineMode(v)),
    tool: enumParam(COMBINE_MODES, (t) => t.combineTool, (t, v) => t.setCombineTool(v)),
  },
  text: {
    family: stringParam((t) => t.globalText.fontFamily, (t, v) => t.setTextFontFamily(v)),
    size: numberParam((t) => t.globalText.fontSize, (t, v) => t.setTextFontSize(v)),
    weight: stringParam((t) => t.globalText.fontWeight, (t, v) => t.setTextFontWeight(v)),
    italic: boolParam((t) => t.globalText.italic, (t, v) => t.setTextItalic(v)),
    letterSpacing: numberParam((t) => t.globalText.letterSpacing, (t, v) => t.setTextLetterSpacing(v)),
  },
  // The Rect/Circle Keys sections' shape selectors. (The sections' other
  // params — diagonal mode, radius anchor — live in the per-key popover
  // schemas: 'rect-diagonal-tool', 'circle-radius-tool', …)
  rect: {
    innerShape: stringParam((t) => t.rectangleInnerShapeType, (t, v) => t.setRectangleInnerShapeType(v as RectangleInnerShape)),
  },
  circle: {
    innerShape: stringParam((t) => t.circleInnerShapeType, (t, v) => t.setCircleInnerShapeType(v as CircleInnerShape)),
  },
};

/** Read the param at (settingsId, field); undefined when the address
 * does not resolve (unknown settings id, unknown field). */
export function readParam(target: ParamTarget, settingsId: string, field: string): unknown {
  const schema = schemaById(settingsId);
  if (schema) {
    const control = settingsView(schema, target).controls.find((c) => c.id === field);
    return control ? control.value : undefined;
  }
  const spec = PANEL_PARAMS[settingsId]?.[field];
  return spec ? spec.read(target) : undefined;
}

/** Write the param at (settingsId, field) through the same setter the
 * panel uses. Returns false when the address does not resolve or the
 * value has the wrong shape for the field. */
export function writeParam(target: ParamTarget, settingsId: string, field: string, value: ParamValue): boolean {
  const schema = schemaById(settingsId);
  if (schema) {
    const control = settingsView(schema, target).controls.find((c) => c.id === field);
    if (!control) return false;
    (control.commit as (v: ParamValue) => void)(value);
    return true;
  }
  const spec = PANEL_PARAMS[settingsId]?.[field];
  return spec ? spec.write(target, value) : false;
}
