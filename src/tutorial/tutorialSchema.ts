// Declarative tutorial schema (v1).
// UI-agnostic: pure types plus a hand-written validator, no new dependency.
// A tutorial is JSON-compatible data authored under tutorials/ and checked
// with validateTutorial() before a TutorialRunner ever sees it.
// v1 adds an optional per-step `demo` action list for the Demonstration
// module: the program performs the actions live while the tutorial window
// stays open. v0 tutorials without `demo` still validate unchanged.

export type TutorialPlacement = 'above' | 'below' | 'left' | 'right' | 'center';

/** Authored parking corner for the tutorial bubble. A step that names an
 * anchor parks there deliberately, even over an avoid rect. */
export type TutorialCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type TutorialExpect =
  | { kind: 'none' }
  | { kind: 'press-key'; key: string }
  | { kind: 'run-command'; command: string }
  | { kind: 'selection-changed' }
  | { kind: 'scene-changed' };

export interface TutorialBubble {
  title: string;
  body: string;
  placement?: TutorialPlacement;
  /** Preferred screen corner when the bubble parks out of the way.
   * Omitted = the corner with the least overlap wins. */
  anchor?: TutorialCorner;
  /** Extra data-tutorial-id targets the parked bubble should avoid
   * covering. Unknown ids resolve to nothing and are ignored. */
  avoid?: string[];
}

export interface TutorialStep {
  id: string;
  /** Logical target id resolved via data-tutorial-id. Omitted = centered bubble. */
  target?: string;
  bubble: TutorialBubble;
  expect?: TutorialExpect;
  skippable?: boolean;
  /** Demonstration script played live while the tutorial window stays open. */
  demo?: DemoAction[];
  /** Workspace normalization applied before the demo plays. */
  preconditions?: DemoPreconditions;
}

/** One performed beat of a live demonstration. Targets reuse the
 * data-tutorial-id namespace; canvas points use 0..1 view fractions. */
export type DemoAction =
  | { kind: 'move-cursor'; to: string; durationMs?: number }
  | { kind: 'move-cursor-xy'; x: number; y: number; durationMs?: number }
  | { kind: 'press-key'; key: string; holdMs?: number }
  | { kind: 'open-popover'; key: string }
  | { kind: 'point-at'; target: string; label?: string }
  | { kind: 'set-param'; settingsId: string; field: string; value: string | number | boolean }
  | { kind: 'close-popover' }
  | { kind: 'wait'; ms: number }
  | { kind: 'narrate'; title: string; body: string };

/** Workspace normalization applied before a demo plays so the recording
 * is stable: canvas at normal zoom, required surfaces visible, named
 * panel sections expanded, no half-finished drawing in flight. */
export interface DemoPreconditions {
  normalZoom?: boolean;
  showKeyboard?: boolean;
  showPanel?: boolean;
  showStatus?: boolean;
  expandSections?: string[];
  cancelDrawing?: boolean;
}

export interface Tutorial {
  id: string;
  title: string;
  description?: string;
  steps: TutorialStep[];
}

export type TutorialValidation =
  | { ok: true; tutorial: Tutorial }
  | { ok: false; errors: string[] };

const PLACEMENTS: readonly string[] = ['above', 'below', 'left', 'right', 'center'];
const CORNERS: readonly string[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const EXPECT_KINDS: readonly string[] = ['none', 'press-key', 'run-command', 'selection-changed', 'scene-changed'];
const DEMO_KINDS: readonly string[] = [
  'move-cursor',
  'move-cursor-xy',
  'press-key',
  'open-popover',
  'point-at',
  'set-param',
  'close-popover',
  'wait',
  'narrate',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkExpect(value: unknown, stepId: string, errors: string[]): TutorialExpect | null {
  if (value === undefined) return { kind: 'none' };
  if (!isRecord(value)) {
    errors.push(`step "${stepId}": expect must be an object`);
    return null;
  }
  const kind = value.kind;
  if (typeof kind !== 'string' || !EXPECT_KINDS.includes(kind)) {
    errors.push(`step "${stepId}": unknown expect kind ${JSON.stringify(kind)}`);
    return null;
  }
  if (kind === 'press-key') {
    if (!isNonEmptyString(value.key)) {
      errors.push(`step "${stepId}": press-key expect needs a non-empty "key"`);
      return null;
    }
    return { kind, key: value.key };
  }
  if (kind === 'run-command') {
    if (!isNonEmptyString(value.command)) {
      errors.push(`step "${stepId}": run-command expect needs a non-empty "command"`);
      return null;
    }
    return { kind, command: value.command };
  }
  return { kind } as TutorialExpect;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkDuration(value: unknown, stepId: string, field: string, errors: string[], max: number): number | null {
  if (value === undefined) return null;
  if (!isFiniteNumber(value) || value < 0 || value > max) {
    errors.push(`step "${stepId}": demo "${field}" must be 0..${max}ms when present`);
    return null;
  }
  return value;
}

function checkDemoAction(value: unknown, stepId: string, index: number, errors: string[]): DemoAction | null {
  const where = `step "${stepId}" demo[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${where}: action must be an object`);
    return null;
  }
  const kind = value.kind;
  if (typeof kind !== 'string' || !DEMO_KINDS.includes(kind)) {
    errors.push(`${where}: unknown demo kind ${JSON.stringify(kind)}`);
    return null;
  }
  switch (kind) {
    case 'move-cursor': {
      if (!isNonEmptyString(value.to)) {
        errors.push(`${where}: move-cursor needs a non-empty "to" target id`);
        return null;
      }
      const durationMs = checkDuration(value.durationMs, stepId, 'durationMs', errors, 10000);
      if (value.durationMs !== undefined && durationMs === null) return null;
      return { kind, to: value.to, ...(durationMs !== null ? { durationMs } : {}) };
    }
    case 'move-cursor-xy': {
      if (!isFiniteNumber(value.x) || value.x < 0 || value.x > 1 || !isFiniteNumber(value.y) || value.y < 0 || value.y > 1) {
        errors.push(`${where}: move-cursor-xy needs "x" and "y" canvas fractions in 0..1`);
        return null;
      }
      const durationMs = checkDuration(value.durationMs, stepId, 'durationMs', errors, 10000);
      if (value.durationMs !== undefined && durationMs === null) return null;
      return { kind, x: value.x, y: value.y, ...(durationMs !== null ? { durationMs } : {}) };
    }
    case 'press-key': {
      if (!isNonEmptyString(value.key)) {
        errors.push(`${where}: press-key needs a non-empty "key"`);
        return null;
      }
      const holdMs = checkDuration(value.holdMs, stepId, 'holdMs', errors, 5000);
      if (value.holdMs !== undefined && holdMs === null) return null;
      return { kind, key: value.key, ...(holdMs !== null ? { holdMs } : {}) };
    }
    case 'open-popover': {
      if (!isNonEmptyString(value.key)) {
        errors.push(`${where}: open-popover needs a non-empty "key"`);
        return null;
      }
      return { kind, key: value.key };
    }
    case 'point-at': {
      if (!isNonEmptyString(value.target)) {
        errors.push(`${where}: point-at needs a non-empty "target"`);
        return null;
      }
      if (value.label !== undefined && typeof value.label !== 'string') {
        errors.push(`${where}: point-at "label" must be a string when present`);
        return null;
      }
      return { kind, target: value.target, ...(typeof value.label === 'string' ? { label: value.label } : {}) };
    }
    case 'set-param': {
      if (!isNonEmptyString(value.settingsId) || !isNonEmptyString(value.field)) {
        errors.push(`${where}: set-param needs non-empty "settingsId" and "field"`);
        return null;
      }
      if (typeof value.value !== 'string' && typeof value.value !== 'number' && typeof value.value !== 'boolean') {
        errors.push(`${where}: set-param "value" must be a string, number, or boolean`);
        return null;
      }
      return { kind, settingsId: value.settingsId, field: value.field, value: value.value };
    }
    case 'close-popover':
      return { kind };
    case 'wait': {
      if (!isFiniteNumber(value.ms) || value.ms < 0 || value.ms > 30000) {
        errors.push(`${where}: wait needs "ms" in 0..30000`);
        return null;
      }
      return { kind, ms: value.ms };
    }
    case 'narrate': {
      if (!isNonEmptyString(value.title) || !isNonEmptyString(value.body)) {
        errors.push(`${where}: narrate needs non-empty "title" and "body"`);
        return null;
      }
      return { kind, title: String(value.title), body: String(value.body) };
    }
    default:
      return null;
  }
}

function checkPreconditions(value: unknown, stepId: string, errors: string[]): DemoPreconditions | null {
  if (value === undefined) return null;
  const where = `step "${stepId}" preconditions`;
  if (!isRecord(value)) {
    errors.push(`${where}: must be an object`);
    return null;
  }
  for (const field of ['normalZoom', 'showKeyboard', 'showPanel', 'showStatus', 'cancelDrawing']) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      errors.push(`${where}: "${field}" must be a boolean when present`);
      return null;
    }
  }
  if (value.expandSections !== undefined) {
    if (!Array.isArray(value.expandSections) || !value.expandSections.every(isNonEmptyString)) {
      errors.push(`${where}: "expandSections" must be an array of non-empty section ids`);
      return null;
    }
  }
  const out: DemoPreconditions = {};
  for (const field of ['normalZoom', 'showKeyboard', 'showPanel', 'showStatus', 'cancelDrawing'] as const) {
    if (typeof value[field] === 'boolean') out[field] = value[field] as boolean;
  }
  if (Array.isArray(value.expandSections)) out.expandSections = [...(value.expandSections as string[])];
  return out;
}

/** Validate unknown data (e.g. parsed JSON) against the v1 tutorial schema. */
export function validateTutorial(value: unknown): TutorialValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['tutorial must be an object'] };
  if (!isNonEmptyString(value.id)) errors.push('tutorial needs a non-empty string "id"');
  if (!isNonEmptyString(value.title)) errors.push('tutorial needs a non-empty string "title"');
  if (value.description !== undefined && typeof value.description !== 'string') {
    errors.push('tutorial "description" must be a string when present');
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    return { ok: false, errors: [...errors, 'tutorial needs a non-empty "steps" array'] };
  }
  const seen = new Set<string>();
  const steps: TutorialStep[] = [];
  for (let i = 0; i < value.steps.length; i++) {
    const raw = value.steps[i] as unknown;
    const label = isRecord(raw) && typeof raw.id === 'string' ? raw.id : `#${i}`;
    if (!isRecord(raw)) {
      errors.push(`step "${label}": step must be an object`);
      continue;
    }
    if (!isNonEmptyString(raw.id)) {
      errors.push(`step "${label}": step needs a non-empty string "id"`);
      continue;
    }
    if (seen.has(raw.id)) {
      errors.push(`step "${raw.id}": duplicate step id`);
      continue;
    }
    seen.add(raw.id);
    if (raw.target !== undefined && !isNonEmptyString(raw.target)) {
      errors.push(`step "${raw.id}": "target" must be a non-empty string when present`);
    }
    if (!isRecord(raw.bubble)) {
      errors.push(`step "${raw.id}": step needs a "bubble" object`);
      continue;
    }
    if (!isNonEmptyString(raw.bubble.title)) errors.push(`step "${raw.id}": bubble needs a non-empty "title"`);
    if (!isNonEmptyString(raw.bubble.body)) errors.push(`step "${raw.id}": bubble needs a non-empty "body"`);
    if (raw.bubble.placement !== undefined && !PLACEMENTS.includes(raw.bubble.placement as string)) {
      errors.push(`step "${raw.id}": unknown bubble placement ${JSON.stringify(raw.bubble.placement)}`);
    }
    if (raw.bubble.anchor !== undefined && !CORNERS.includes(raw.bubble.anchor as string)) {
      errors.push(`step "${raw.id}": unknown bubble anchor ${JSON.stringify(raw.bubble.anchor)}`);
    }
    if (
      raw.bubble.avoid !== undefined &&
      (!Array.isArray(raw.bubble.avoid) ||
        !(raw.bubble.avoid as unknown[]).every(isNonEmptyString))
    ) {
      errors.push(`step "${raw.id}": bubble "avoid" must be an array of non-empty target ids when present`);
    }
    const expect = checkExpect(raw.expect, raw.id, errors);
    if (raw.skippable !== undefined && typeof raw.skippable !== 'boolean') {
      errors.push(`step "${raw.id}": "skippable" must be a boolean when present`);
    }
    if (expect === null) continue;
    let demo: DemoAction[] | undefined;
    if (raw.demo !== undefined) {
      if (!Array.isArray(raw.demo) || raw.demo.length === 0) {
        errors.push(`step "${raw.id}": "demo" must be a non-empty action array when present`);
        continue;
      }
      demo = [];
      let demoOk = true;
      for (let d = 0; d < raw.demo.length; d++) {
        const action = checkDemoAction(raw.demo[d] as unknown, raw.id, d, errors);
        if (action === null) {
          demoOk = false;
          break;
        }
        demo.push(action);
      }
      if (!demoOk) continue;
    }
    const preconditions = checkPreconditions(raw.preconditions, raw.id, errors);
    if (raw.preconditions !== undefined && preconditions === null) continue;
    steps.push({
      id: raw.id,
      ...(isNonEmptyString(raw.target) ? { target: raw.target } : {}),
      bubble: {
        title: String(raw.bubble.title),
        body: String(raw.bubble.body),
        ...(typeof raw.bubble.placement === 'string' &&
        PLACEMENTS.includes(raw.bubble.placement as string)
          ? { placement: raw.bubble.placement as TutorialPlacement }
          : {}),
        ...(typeof raw.bubble.anchor === 'string' &&
        CORNERS.includes(raw.bubble.anchor as string)
          ? { anchor: raw.bubble.anchor as TutorialCorner }
          : {}),
        ...(Array.isArray(raw.bubble.avoid) &&
        (raw.bubble.avoid as unknown[]).every(isNonEmptyString)
          ? { avoid: [...(raw.bubble.avoid as string[])] }
          : {}),
      },
      expect,
      ...(typeof raw.skippable === 'boolean' ? { skippable: raw.skippable } : {}),
      ...(demo ? { demo } : {}),
      ...(preconditions ? { preconditions } : {}),
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    tutorial: {
      id: String(value.id),
      title: String(value.title),
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
      steps,
    },
  };
}
