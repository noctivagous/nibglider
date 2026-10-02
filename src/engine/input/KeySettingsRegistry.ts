// Settings contract for on-screen keys.
//
// Owns: schemas, defaults, validation, help text, and the read/write
//   accessors each command uses. It does not own the values.
// May read: nothing until a caller passes a SettingsTarget.
// May mutate: nothing except through those accessors, which call the
//   engine methods that already own the value.
//
// Interaction rule: clicking a configurable on-screen key opens its
//   settings and does not run the command. The physical key still runs
//   the command. The whole cap is the hit target, so touch devices can
//   open settings without a right-click or a separate gear. Caps without
//   settings stay display-only so drawing still tracks underneath them.
//
// Domain owners named here (path, circle, rect, stroke, fill) are the
//   services that will eventually hold these fields. Until PathTool,
//   SnappingManager, and the rest exist, NibGliderEngine is the
//   authoritative store. Document-affecting values already live on that
//   engine. Nothing in this module is kept in React state. Preference-only
//   settings will go through GUIManager when that service exists.
//
// The schema for a command is `schemaById(command.settingsId)`. That is
//   the settingsSchema metadata on the key definition.

import type { CircleRadiusAnchor, PolygonRadiusMode, RectDiagonalMode } from '../types';

export type SettingsOwner = 'path' | 'circle' | 'rect' | 'stroke' | 'fill';

/** The engine methods these schemas read and write. */
export interface SettingsTarget {
  circleRadiusAnchor: CircleRadiusAnchor;
  rectDiagonalMode: RectDiagonalMode;
  polygonRadiusMode: PolygonRadiusMode;
  setCircleRadiusAnchor(anchor: CircleRadiusAnchor): void;
  setRectDiagonalMode(mode: RectDiagonalMode): void;
  setPolygonRadiusMode(mode: PolygonRadiusMode): void;
}

export interface SettingsOption {
  value: string;
  label: string;
}

interface FieldBase {
  id: string;
  label: string;
  help?: string;
  visible?: (target: SettingsTarget) => boolean;
}

export interface NumberSetting extends FieldBase {
  kind: 'number';
  min: number;
  max: number;
  /** When the ceiling lives on the target (stroke width). */
  maxOf?: (target: SettingsTarget) => number;
  step: number;
  unit?: string;
  decimals?: number;
  default: number;
  read: (target: SettingsTarget) => number;
  write: (target: SettingsTarget, value: number) => void;
  validate: (value: number, target: SettingsTarget) => number;
}

export interface ToggleSetting extends FieldBase {
  kind: 'toggle';
  default: boolean;
  read: (target: SettingsTarget) => boolean;
  write: (target: SettingsTarget, value: boolean) => void;
}

export interface SelectSetting extends FieldBase {
  kind: 'select';
  default: string;
  options: SettingsOption[];
  read: (target: SettingsTarget) => string;
  write: (target: SettingsTarget, value: string) => void;
  validate: (value: string) => string | null;
}

export interface ColorSetting extends FieldBase {
  kind: 'color';
  default: string;
  read: (target: SettingsTarget) => string;
  write: (target: SettingsTarget, value: string) => void;
  validate: (value: string) => string | null;
}

export type SettingsField = NumberSetting | ToggleSetting | SelectSetting | ColorSetting;

export interface KeySettingsSchema {
  id: string;
  title: string;
  help: string;
  owner: SettingsOwner;
  fields: SettingsField[];
}

export function clampShapeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 60;
  return Math.max(10, Math.min(170, deg));
}

/** 15° grid from 15° to 165°, shared with the panel angle slider. */
export function snapShapeAngle(deg: number): number {
  const c = clampShapeAngle(deg);
  return Math.max(15, Math.min(165, Math.round(c / 15) * 15));
}

export function clampSectorAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 90;
  return Math.max(10, Math.min(350, deg));
}

export function clampPolygonSides(sides: number): number {
  if (!Number.isFinite(sides)) return 6;
  return Math.max(3, Math.min(12, Math.round(sides)));
}

export function clampSplineTension(val: number): number {
  if (!Number.isFinite(val)) return 0.4;
  const stepped = Math.round(val * 10) / 10;
  return Math.max(0.1, Math.min(1, stepped));
}

export function clampStrokeWidth(val: number, max: number): number {
  if (!Number.isFinite(val)) return 1;
  const hi = Number.isFinite(max) && max >= 1 ? max : 200;
  return Math.min(hi, Math.max(1, val));
}

const SUPERSHAPE_RANGE: Record<string, { min: number; max: number; step: number; fallback: number }> = {
  m: { min: 1, max: 20, step: 1, fallback: 3 },
  n1: { min: 0.1, max: 4, step: 0.1, fallback: 0.2 },
  n2: { min: 0.1, max: 4, step: 0.1, fallback: 1.7 },
  n3: { min: 0.1, max: 4, step: 0.1, fallback: 1.7 },
  a1: { min: 0.1, max: 1.7, step: 0.1, fallback: 1 },
  a2: { min: 0.1, max: 1.7, step: 0.1, fallback: 1 },
};

export function clampSupershapeParam(key: string, val: number): number {
  const spec = SUPERSHAPE_RANGE[key];
  if (!spec) return val;
  if (!Number.isFinite(val)) return spec.fallback;
  const q = spec.min + Math.round((val - spec.min) / spec.step) * spec.step;
  const clamped = Math.min(spec.max, Math.max(spec.min, q));
  return Number(clamped.toFixed(2));
}

export function cssHex(value: string, fallback: string): string | null {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return /^#[0-9a-fA-F]{6}$/.test(fallback) ? fallback.toLowerCase() : null;
}

function oneOf(options: SettingsOption[], fallback: string): (value: string) => string | null {
  const allowed = new Set(options.map((o) => o.value));
  return (value) => (allowed.has(value) ? value : allowed.has(fallback) ? fallback : null);
}

const CIRCLE_RADIUS_ANCHOR_OPTIONS: SettingsOption[] = [
  { value: 'origin', label: 'Origin' },
  { value: 'circumference', label: 'Circumference' },
];

const RECT_DIAGONAL_MODE_OPTIONS: SettingsOption[] = [
  { value: 'full', label: 'Full rect' },
  { value: 'half', label: 'Half rect' },
  { value: 'quarter', label: 'Quarter rect' },
];

const POLYGON_RADIUS_MODE_OPTIONS: SettingsOption[] = [
  { value: 'circumradius', label: 'Circumradius' },
  { value: 'inradius', label: 'Inradius' },
];

function polygonRadiusModeField(): SelectSetting {
  return {
    id: 'polygon-radius-mode',
    kind: 'select',
    label: 'Polygon radius',
    help: 'Regular Polygon fit: vertices reach the frame circle (circumradius), or edge midpoints do (inradius).',
    default: 'inradius',
    options: POLYGON_RADIUS_MODE_OPTIONS,
    read: (t) => t.polygonRadiusMode,
    write: (t, value) => t.setPolygonRadiusMode(value as PolygonRadiusMode),
    validate: oneOf(POLYGON_RADIUS_MODE_OPTIONS, 'inradius'),
  };
}

// Key popovers edit how a tool draws, not what the panel sections draw.
// Circle by Diameter, Circle by Radius, and Rect by Diagonal have popovers;
// a key without a schema here shows no popover at all.
const SCHEMAS: KeySettingsSchema[] = [
  {
    id: 'circle-diameter-tool',
    title: 'Circle by Diameter',
    help: 'How the tool draws: the Regular Polygon inner shape fits the circle frame by circumradius or inradius.',
    owner: 'circle',
    fields: [polygonRadiusModeField()],
  },
  {
    id: 'circle-radius-tool',
    title: 'Circle by Radius',
    help: 'Where the radius starts: the press point is the circle origin, or a fixed circumference point with the cursor as the center.',
    owner: 'circle',
    fields: [
      {
        id: 'circle-radius-anchor',
        kind: 'select',
        label: 'Start from',
        default: 'origin',
        options: CIRCLE_RADIUS_ANCHOR_OPTIONS,
        read: (t) => t.circleRadiusAnchor,
        write: (t, value) => t.setCircleRadiusAnchor(value as CircleRadiusAnchor),
        validate: oneOf(CIRCLE_RADIUS_ANCHOR_OPTIONS, 'origin'),
      },
      polygonRadiusModeField(),
    ],
  },
  {
    id: 'rect-diagonal-tool',
    title: 'Rect by Diagonal',
    help: 'Which portion of the final rectangle the drawn diagonal covers.',
    owner: 'rect',
    fields: [
      {
        id: 'rect-diagonal-mode',
        kind: 'select',
        label: 'Diagonal is',
        default: 'full',
        options: RECT_DIAGONAL_MODE_OPTIONS,
        read: (t) => t.rectDiagonalMode,
        write: (t, value) => t.setRectDiagonalMode(value as RectDiagonalMode),
        validate: oneOf(RECT_DIAGONAL_MODE_OPTIONS, 'full'),
      },
    ],
  },
];

const BY_ID = new Map(SCHEMAS.map((schema) => [schema.id, schema]));

export function schemaById(id: string): KeySettingsSchema | null {
  return BY_ID.get(id) ?? null;
}

export function settingsSchemaIds(): string[] {
  return SCHEMAS.map((schema) => schema.id);
}
