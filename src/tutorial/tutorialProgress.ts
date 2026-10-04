// Browser persistence for tutorial progress.
// The completed flag lives under a nibglider.* key so "Reset all settings"
// (which wipes that namespace) resets it too. Pure over the store passed in.

import { SHOW_TUTORIAL_FOR_NEW_USERS, TUTORIAL_COMPLETED_KEY } from '../config/tutorial';

export interface TutorialStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ClearableStorage extends TutorialStore {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/** True once the user has gone through the tutorial to the end. */
export function hasCompletedTutorial(store: TutorialStore): boolean {
  try {
    return store.getItem(TUTORIAL_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Record that the user went through the tutorial to the end. */
export function markTutorialCompleted(store: TutorialStore): void {
  try {
    store.setItem(TUTORIAL_COMPLETED_KEY, '1');
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}

/** Whether a fresh load should drop the user into the tutorial. */
export function shouldAutoShowTutorial(store: TutorialStore): boolean {
  return SHOW_TUTORIAL_FOR_NEW_USERS && !hasCompletedTutorial(store);
}

/**
 * Remove every nibglider.* setting, including the tutorial flag.
 * Used by "Reset all settings"; localStorage satisfies this interface.
 */
export function clearNibGliderSettings(storage: ClearableStorage): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith('nibglider.')) storage.removeItem(key);
  }
}
