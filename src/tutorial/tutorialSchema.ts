// Declarative tutorial schema (v0).
// UI-agnostic: pure types plus a hand-written validator, no new dependency.
// A tutorial is JSON-compatible data authored under tutorials/ and checked
// with validateTutorial() before a TutorialRunner ever sees it.

export type TutorialPlacement = 'above' | 'below' | 'left' | 'right' | 'center';

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
}

export interface TutorialStep {
  id: string;
  /** Logical target id resolved via data-tutorial-id. Omitted = centered bubble. */
  target?: string;
  bubble: TutorialBubble;
  expect?: TutorialExpect;
  skippable?: boolean;
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
const EXPECT_KINDS: readonly string[] = ['none', 'press-key', 'run-command', 'selection-changed', 'scene-changed'];

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

/** Validate unknown data (e.g. parsed JSON) against the v0 tutorial schema. */
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
    const expect = checkExpect(raw.expect, raw.id, errors);
    if (raw.skippable !== undefined && typeof raw.skippable !== 'boolean') {
      errors.push(`step "${raw.id}": "skippable" must be a boolean when present`);
    }
    if (expect === null) continue;
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
      },
      expect,
      ...(typeof raw.skippable === 'boolean' ? { skippable: raw.skippable } : {}),
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
