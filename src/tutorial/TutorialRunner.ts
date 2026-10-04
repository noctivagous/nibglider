// Framework-free tutorial state machine.
// The runner owns step order and completion matching only: it never touches
// the DOM or the engine. Completion detectors feed it TutorialEvents and
// React observes it through subscribe/getSnapshot (same pattern as
// GUIManager and EngineContext).

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
  | { type: 'scene' }
  | { type: 'engine' };

function matches(expect: TutorialExpect | undefined, event: TutorialEvent): boolean {
  if (!expect || expect.kind === 'none') return false;
  switch (expect.kind) {
    case 'press-key':
      return event.type === 'key' && event.key.toLowerCase() === expect.key.toLowerCase();
    case 'run-command':
      return event.type === 'command' && event.commandId === expect.command;
    case 'selection-changed':
      return event.type === 'selection' || event.type === 'engine';
    case 'scene-changed':
      return event.type === 'scene' || event.type === 'engine';
  }
}

export class TutorialRunner {
  private tutorial: Tutorial | null = null;
  private stepIndex = 0;
  private status: TutorialStatus = 'idle';
  private suspended = false;
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
  };

  load(tutorial: Tutorial): void {
    this.tutorial = tutorial;
    this.stepIndex = 0;
    this.status = 'idle';
    this.emit();
  }

  start(): void {
    if (!this.tutorial || this.tutorial.steps.length === 0) return;
    this.stepIndex = 0;
    this.status = 'active';
    this.emit();
  }

  /** Advance one step; finishing the last step completes the tutorial. */
  next(): void {
    if (this.status !== 'active' || !this.tutorial) return;
    if (this.stepIndex + 1 >= this.tutorial.steps.length) {
      this.status = 'done';
    } else {
      this.stepIndex += 1;
    }
    this.emit();
  }

  back(): void {
    if (this.status !== 'active') return;
    if (this.stepIndex > 0) {
      this.stepIndex -= 1;
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
   * satisfied the current step and advanced the tutorial.
   */
  notify(event: TutorialEvent): boolean {
    if (this.suspended) return false;
    const step = this.currentStep;
    if (!step) return false;
    if (!matches(step.expect, event)) return false;
    this.next();
    return true;
  }

  private emit(): void {
    this.snapshot = { status: this.status, tutorial: this.tutorial, stepIndex: this.stepIndex };
    for (const fn of this.listeners) fn();
  }
}
