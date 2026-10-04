// Read-only bridges from engine/UI events to TutorialRunner.notify().
// Tutorials observe; they never mutate the document. Selection and scene
// completion ride on the engine's existing subscribe/document notifications
// (SelectionManager has no subscriber list of its own); keyboard and command
// events arrive through the helpers below.

import type { TutorialRunner } from './TutorialRunner';

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
}

/**
 * Connect engine notifications to the runner. Every engine version bump
 * counts as both selection and scene activity for matching; document
 * changes count as scene activity. Detach with the returned cleanup.
 */
export function bridgeEngineToRunner(source: TutorialEngineSource, runner: TutorialRunner): () => void {
  const cleanups: Array<() => void> = [];
  cleanups.push(source.subscribe(() => {
    runner.notify({ type: 'engine' });
  }));
  if (source.subscribeDocumentChanges) {
    cleanups.push(source.subscribeDocumentChanges(() => {
      runner.notify({ type: 'scene' });
    }));
  }
  cleanups.push(subscribeTutorialCommands((commandId) => {
    runner.notify({ type: 'command', commandId });
  }));
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
