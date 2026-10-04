// Live demonstration interpreter for tutorial demo scripts.
// Framework-free: owns action order, timing, and cancellation only. It
// never touches the DOM or the engine; the React layer supplies DemoHooks
// (which route through the same code paths as physical input) and a
// DemoWorkspace adapter (GUI + engine normalization). React observes it
// through subscribe/getSnapshot, same pattern as TutorialRunner.
// While playing, the runner is suspended via onSuspend so the demo cannot
// complete its own step through the completion detectors.

import type { DemoPreconditions, TutorialStep } from './tutorialSchema';

export type DemoStatus = 'idle' | 'playing' | 'done' | 'aborted';

export interface DemoNarration {
  title: string;
  body: string;
}

export interface DemoSnapshot {
  status: DemoStatus;
  stepId: string | null;
  actionIndex: number;
  narration: DemoNarration | null;
}

/** Implemented by the React layer. Cursor motion hooks also drive the
 * ghost-cursor overlay; pressKey routes through the engine keyboard path
 * so the on-screen keycaps light as if physically pressed. */
export interface DemoHooks {
  pressKey(key: string, holdMs: number): void | Promise<void>;
  moveCursorToTarget(target: string, durationMs: number): void | Promise<void>;
  moveCursorToXY(x: number, y: number, durationMs: number): void | Promise<void>;
  openPopover(key: string): void | Promise<void>;
  pointAt(target: string | null, label?: string): void | Promise<void>;
  setParam(settingsId: string, field: string, value: string | number | boolean): void | Promise<void>;
  closePopover(): void | Promise<void>;
  showNarration(narration: DemoNarration | null): void | Promise<void>;
}

/** Workspace normalization surface. Implemented in App.tsx over the
 * engine (zoom/drawing) and GUI/panel managers (visibility/layout). */
export interface DemoWorkspace {
  resetZoom(): void;
  cancelDrawing(): void;
  setKeyboardVisible(visible: boolean): void;
  setPanelVisible(visible: boolean): void;
  setStatusVisible(visible: boolean): void;
  expandSections(ids: string[]): void;
}

/** Apply a step's preconditions idempotently: safe to re-run on replay. */
export function prepareDemoWorkspace(pre: DemoPreconditions | undefined, ws: DemoWorkspace): void {
  if (!pre) return;
  if (pre.normalZoom) ws.resetZoom();
  if (pre.cancelDrawing) ws.cancelDrawing();
  if (pre.showKeyboard !== undefined) ws.setKeyboardVisible(pre.showKeyboard);
  if (pre.showPanel !== undefined) ws.setPanelVisible(pre.showPanel);
  if (pre.showStatus !== undefined) ws.setStatusVisible(pre.showStatus);
  if (pre.expandSections && pre.expandSections.length > 0) ws.expandSections(pre.expandSections);
}

export class DemonstrationPlayer {
  private status: DemoStatus = 'idle';
  private stepId: string | null = null;
  private actionIndex = 0;
  private narration: DemoNarration | null = null;
  private snapshot: DemoSnapshot = { status: 'idle', stepId: null, actionIndex: 0, narration: null };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private hooks: DemoHooks | null = null;
  private readonly onSuspend: (suspended: boolean) => void;

  constructor(onSuspend: (suspended: boolean) => void = () => {}) {
    this.onSuspend = onSuspend;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): DemoSnapshot => this.snapshot;

  get isPlaying(): boolean {
    return this.status === 'playing';
  }

  /** Play a step's demo script. Stops any in-flight playback first. */
  async play(step: TutorialStep, hooks: DemoHooks, ws: DemoWorkspace): Promise<DemoStatus> {
    this.stop();
    const actions = step.demo ?? [];
    if (actions.length === 0) return this.status;
    const gen = ++this.generation;
    this.hooks = hooks;
    this.status = 'playing';
    this.stepId = step.id;
    this.actionIndex = 0;
    this.narration = null;
    this.emit();
    this.onSuspend(true);
    try {
      prepareDemoWorkspace(step.preconditions, ws);
      for (let i = 0; i < actions.length; i++) {
        if (gen !== this.generation) return this.status;
        this.actionIndex = i;
        this.emit();
        const aborted = await this.runAction(actions[i], hooks, gen);
        if (aborted || gen !== this.generation) return this.status;
      }
      if (gen !== this.generation) return this.status;
      this.status = 'done';
      this.emit();
      return this.status;
    } finally {
      if (gen === this.generation) {
        this.onSuspend(false);
      }
    }
  }

  /** Abort in-flight playback. User input during a demo calls this. */
  stop(): void {
    if (this.status !== 'playing') return;
    this.generation += 1;
    this.status = 'aborted';
    this.emit();
    this.onSuspend(false);
    const hooks = this.hooks;
    this.hooks = null;
    if (hooks) {
      void hooks.showNarration(null);
      void hooks.pointAt(null);
    }
  }

  private async runAction(
    action: NonNullable<TutorialStep['demo']>[number],
    hooks: DemoHooks,
    gen: number,
  ): Promise<boolean> {
    switch (action.kind) {
      case 'press-key':
        await hooks.pressKey(action.key, action.holdMs ?? 120);
        return gen !== this.generation;
      case 'move-cursor':
        await hooks.moveCursorToTarget(action.to, action.durationMs ?? 600);
        return gen !== this.generation;
      case 'move-cursor-xy':
        await hooks.moveCursorToXY(action.x, action.y, action.durationMs ?? 600);
        return gen !== this.generation;
      case 'open-popover':
        await hooks.openPopover(action.key);
        return gen !== this.generation;
      case 'point-at':
        await hooks.pointAt(action.target, action.label);
        return gen !== this.generation;
      case 'set-param':
        await hooks.setParam(action.settingsId, action.field, action.value);
        return gen !== this.generation;
      case 'close-popover':
        await hooks.closePopover();
        await hooks.pointAt(null);
        return gen !== this.generation;
      case 'narrate':
        this.narration = { title: action.title, body: action.body };
        this.emit();
        await hooks.showNarration(this.narration);
        return gen !== this.generation;
      case 'wait':
        await this.sleep(action.ms, gen);
        return gen !== this.generation;
    }
  }

  private sleep(ms: number, gen: number): Promise<void> {
    if (gen !== this.generation) return Promise.resolve();
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, ms));
    });
  }

  private emit(): void {
    this.snapshot = {
      status: this.status,
      stepId: this.stepId,
      actionIndex: this.actionIndex,
      narration: this.narration,
    };
    for (const fn of this.listeners) fn();
  }
}
