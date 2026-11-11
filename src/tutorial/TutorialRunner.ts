// Framework-free tutorial state machine.
// The runner owns step order and completion matching only: it never touches
// the DOM or the engine. Completion detectors feed it TutorialEvents (things
// the user did) and TutorialState snapshots (for the schema-v2 state
// predicates), and React observes it through subscribe/getSnapshot (same
// pattern as GUIManager and EngineContext).
//
// Matching is precise by design: a 'selection' event means the engine's
// selected-id set actually changed, and a 'scene' event means the document
// changed. There is deliberately no generic "engine did something" event —
// the v1 bridge fed one, and selection/scene steps completed on almost any
// activity.

import type { Tutorial, TutorialExpect, TutorialStep } from './tutorialSchema';

export type TutorialStatus = 'idle' | 'active' | 'done';

export interface TutorialSnapshot {
  status: TutorialStatus;
  tutorial: Tutorial | null;
  stepIndex: number;
}

export type TutorialEvent =
  | { type: 'key'; key: string }
  | { type: 'command'; commandId: string }
  | { type: 'selection' }
  | { type: 'scene' };

/** A point-in-time read of the world the state predicates inspect. The
 * bridge builds one from the engine on every notification; tests and the
 * step-entry check build literals. */
export interface TutorialState {
  selectionCount: number;
  objectCount: number;
  settingValue(settingsId: string, field: string): unknown;
}

/** Event expects only: does this observed event complete the step?
 * press-key is counted by the runner itself (see notify), and the state
 * predicates never match events. */
function matches(expect: TutorialExpect | undefined, event: TutorialEvent): boolean {
  if (!expect) return false;
  switch (expect.kind) {
    case 'run-command':
      return event.type === 'command' && event.commandId === expect.command;
    case 'selection-changed':
      return event.type === 'selection';
    case 'scene-changed':
      return event.type === 'scene';
    default:
      return false;
  }
}

function inRange(n: number, min: number | undefined, max: number | undefined): boolean {
  return (min === undefined || n >= min) && (max === undefined || n <= max);
}

/** State predicates only: is the expect already satisfied by this state? */
function stateSatisfies(expect: TutorialExpect | undefined, state: TutorialState): boolean {
  if (!expect) return false;
  switch (expect.kind) {
    case 'selection-count':
      return inRange(state.selectionCount, expect.min, expect.max);
    case 'object-count':
      return inRange(state.objectCount, expect.min, expect.max);
    case 'setting-is':
      return state.settingValue(expect.settingsId, expect.field) === expect.value;
    default:
      return false;
  }
}

export class TutorialRunner {
  private tutorial: Tutorial | null = null;
  private stepIndex = 0;
  private status: TutorialStatus = 'idle';
  private suspended = false;
  /** Presses of the expected key seen on the current step (press-key count). */
  private pressCount = 0;
  private snapshot: TutorialSnapshot = { status: 'idle', tutorial: null, stepIndex: 0 };
  private readonly listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): TutorialSnapshot => this.snapshot;

  get currentStep(): TutorialStep | null {
    if (this.status !== 'active' || !this.tutorial) return null;
    return this.tutorial.steps[this.stepIndex] ?? null;
  }

  load(tutorial: Tutorial): void {
    this.tutorial = tutorial;
    this.stepIndex = 0;
    this.status = 'idle';
    this.pressCount = 0;
    this.emit();
  }

  /** Begin the loaded tutorial. `startAt` resumes at a saved step index
   * (per-tutorial progress); it is clamped into range, so a stale index
   * from an earlier, longer version of the tutorial lands on the last
   * step instead of failing. */
  start(startAt = 0): void {
    if (!this.tutorial || this.tutorial.steps.length === 0) return;
    const last = this.tutorial.steps.length - 1;
    this.stepIndex = Math.max(0, Math.min(Math.floor(startAt) || 0, last));
    this.status = 'active';
    this.pressCount = 0;
    this.emit();
  }

  /** Advance one step; finishing the last step completes the tutorial. */
  next(): void {
    if (this.status !== 'active' || !this.tutorial) return;
    this.stepForward();
    this.emit();
  }

  back(): void {
    if (this.status !== 'active') return;
    if (this.stepIndex > 0) {
      this.stepIndex -= 1;
      this.pressCount = 0;
      this.emit();
    }
  }

  /** Skip the current step when the schema allows it; otherwise a no-op. */
  skip(): void {
    const step = this.currentStep;
    if (!step || step.skippable === false) return;
    this.next();
  }

  abort(): void {
    if (this.status === 'idle') return;
    this.status = 'idle';
    this.stepIndex = 0;
    this.suspended = false;
    this.pressCount = 0;
    this.emit();
  }

  /**
   * While suspended (a demonstration is playing its own scripted actions),
   * observed events are ignored so the demo cannot complete its own step.
   */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  /**
   * Feed an observed user action to the runner. Returns true when the event
   * satisfied the current step and advanced the tutorial. A press-key step
   * with a `count` advances only on the count-th press of its key; presses
   * of other keys neither advance nor reset the count.
   */
  notify(event: TutorialEvent): boolean {
    if (this.suspended) return false;
    const step = this.currentStep;
    if (!step) return false;
    const expect = step.expect;
    if (expect?.kind === 'press-key') {
      if (event.type !== 'key' || event.key.toLowerCase() !== expect.key.toLowerCase()) return false;
      this.pressCount += 1;
      if (this.pressCount < (expect.count ?? 1)) return false;
      this.next();
      return true;
    }
    if (!matches(expect, event)) return false;
    this.next();
    return true;
  }

  /**
   * Evaluate the current step's state predicate (selection-count,
   * object-count, setting-is) against a fresh state read. The bridge calls
   * this on every relevant engine event, and the app calls it once when a
   * step becomes current — a step whose predicate is already true when
   * reached completes immediately, including the step it lands on, so a
   * run of satisfied predicate steps settles in a single pass. Returns
   * true when at least one step advanced.
   */
  notifyState(state: TutorialState): boolean {
    if (this.suspended || this.status !== 'active') return false;
    let advanced = false;
    while (this.status === 'active') {
      const step = this.currentStep;
      if (!step || !stateSatisfies(step.expect, state)) break;
      this.stepForward();
      advanced = true;
    }
    if (advanced) this.emit();
    return advanced;
  }

  /** Move one step forward (or finish), resetting per-step progress. */
  private stepForward(): void {
    if (!this.tutorial) return;
    this.pressCount = 0;
    if (this.stepIndex + 1 >= this.tutorial.steps.length) {
      this.status = 'done';
    } else {
      this.stepIndex += 1;
    }
  }

  private emit(): void {
    this.snapshot = { status: this.status, tutorial: this.tutorial, stepIndex: this.stepIndex };
    for (const fn of this.listeners) fn();
  }
}
