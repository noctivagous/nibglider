// Read-only bridges from engine/UI events to TutorialRunner.notify() and
// notifyState(). Tutorials observe; they never mutate the document.
//
// The signals are precise (schema v2):
//   selection — the engine's selected-id set actually changed. The engine
//     notifies on every version bump, so the bridge diffs consecutive
//     selected-id snapshots (SelectionManager has no subscriber list of
//     its own) and only reports real selection changes.
//   scene — document changes only, via subscribeDocumentChanges. A
//     'clean' change (a save marking the document clean) is not scene
//     activity and is skipped.
//   state — after either channel fires (and after command events), the
//     bridge builds a fresh TutorialState so the runner can evaluate the
//     current step's state predicates (selection-count, object-count,
//     setting-is).
// Keyboard and command events arrive through the helpers below.

import type { TutorialRunner, TutorialState } from './TutorialRunner';

const commandListeners = new Set<(commandId: string) => void>();

/** Report a command invocation (on-screen keycap, menu item, shortcut). */
export function emitTutorialCommand(commandId: string): void {
  for (const fn of commandListeners) fn(commandId);
}

export function subscribeTutorialCommands(fn: (commandId: string) => void): () => void {
  commandListeners.add(fn);
  return () => {
    commandListeners.delete(fn);
  };
}

interface KeyEventTarget {
  addEventListener(type: 'keydown', listener: (event: { key: string }) => void): void;
  removeEventListener(type: 'keydown', listener: (event: { key: string }) => void): void;
}

function defaultKeyTarget(): KeyEventTarget | null {
  if (typeof document === 'undefined') return null;
  return document as unknown as KeyEventTarget;
}

/** Forward physical key presses to the runner as { type: 'key' } events. */
export function attachTutorialKeyListener(
  runner: TutorialRunner,
  target: KeyEventTarget | null = defaultKeyTarget(),
): () => void {
  if (!target) return () => {};
  const onKeyDown = (event: { key: string }) => {
    runner.notify({ type: 'key', key: event.key });
  };
  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
}

export interface TutorialEngineSource {
  subscribe(fn: () => void): () => void;
  subscribeDocumentChanges?: (fn: (change: unknown) => void) => () => void;
  /** Ids of the currently selected items, snapshotted per notification
   * so the bridge can diff for real selection changes. */
  selectionIds?: () => readonly (string | number)[];
  /** Top-level objects on the active page (state predicates). */
  objectCount?: () => number;
  /** Current value of the param at (settingsId, field). */
  settingValue?: (settingsId: string, field: string) => unknown;
}

/** Build a TutorialState from a source, or null when the source cannot
 * supply every read (predicates then simply never auto-complete). */
export function readTutorialState(source: TutorialEngineSource): TutorialState | null {
  const { selectionIds, objectCount, settingValue } = source;
  if (!selectionIds || !objectCount || !settingValue) return null;
  return {
    selectionCount: selectionIds().length,
    objectCount: objectCount(),
    settingValue: (settingsId, field) => settingValue(settingsId, field),
  };
}

/**
 * Connect engine notifications to the runner with the precise signals
 * described above. Detach with the returned cleanup.
 */
export function bridgeEngineToRunner(source: TutorialEngineSource, runner: TutorialRunner): () => void {
  const cleanups: Array<() => void> = [];
  // The first snapshot is the baseline: it records the selection the
  // bridge started with without reporting a change.
  let lastSelectionKey: string | null = null;

  const observe = (): void => {
    if (source.selectionIds) {
      const key = source.selectionIds().map(String).join(',');
      if (lastSelectionKey !== null && key !== lastSelectionKey) {
        runner.notify({ type: 'selection' });
      }
      lastSelectionKey = key;
    }
    const state = readTutorialState(source);
    if (state) runner.notifyState(state);
  };

  cleanups.push(source.subscribe(observe));
  if (source.subscribeDocumentChanges) {
    cleanups.push(source.subscribeDocumentChanges((change) => {
      const reason = (change as { reason?: unknown } | null)?.reason;
      if (reason !== 'clean') runner.notify({ type: 'scene' });
      observe();
    }));
  }
  cleanups.push(subscribeTutorialCommands((commandId) => {
    runner.notify({ type: 'command', commandId });
    observe();
  }));
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
