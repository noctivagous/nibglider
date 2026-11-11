// Browser persistence for tutorial progress.
// Progress lives under the nibglider.* namespace so "Reset all settings"
// (which wipes that namespace) resets it too. Pure over the store passed
// in; every function tolerates storage being unavailable.
//
// Slice 23: progress is per tutorial. One JSON map at
// nibglider.tutorialProgress.v1 holds id → { status, stepIndex,
// updatedAt }, so an interrupted tutorial resumes where it stopped and
// each tutorial tracks its own completion. The pre-23 build kept two
// global flags (nibglider.tutorialCompleted / .tutorialDismissed); on
// first read those seed hello-rectangle's record — completed, or
// dismissed at step 0 — and the legacy keys are never written again.

import {
  SHOW_TUTORIAL_FOR_NEW_USERS,
  TUTORIAL_COMPLETED_KEY,
  TUTORIAL_DISMISSED_KEY,
  TUTORIAL_PROGRESS_KEY,
} from '../config/tutorial';

export interface TutorialStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ClearableStorage extends TutorialStore {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export type TutorialProgressStatus = 'in-progress' | 'completed' | 'dismissed';

export interface TutorialProgressRecord {
  status: TutorialProgressStatus;
  stepIndex: number;
  updatedAt: number;
}

export type TutorialProgressMap = Record<string, TutorialProgressRecord>;

/** The tutorial the legacy global flags described, and the only one
 * auto-shown to new users. */
export const INTRO_TUTORIAL_ID = 'hello-rectangle';

function isProgressRecord(value: unknown): value is TutorialProgressRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.status === 'in-progress' || record.status === 'completed' || record.status === 'dismissed')
    && typeof record.stepIndex === 'number'
    && Number.isFinite(record.stepIndex)
    && record.stepIndex >= 0
  );
}

function parseProgressMap(raw: string | null): TutorialProgressMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const map: TutorialProgressMap = {};
    for (const [id, record] of Object.entries(parsed)) {
      if (isProgressRecord(record)) {
        map[id] = {
          status: record.status,
          stepIndex: Math.floor(record.stepIndex),
          updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
        };
      }
    }
    return map;
  } catch {
    return {};
  }
}

function writeProgressMap(store: TutorialStore, map: TutorialProgressMap): void {
  try {
    store.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(map));
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}

/**
 * Read the whole progress map. On the first read after the per-tutorial
 * store lands (no progress key yet), legacy completed/dismissed flags
 * seed hello-rectangle's record and the migrated map is written back, so
 * migration happens exactly once.
 */
export function readTutorialProgress(store: TutorialStore): TutorialProgressMap {
  let raw: string | null = null;
  try {
    raw = store.getItem(TUTORIAL_PROGRESS_KEY);
  } catch {
    return {};
  }
  if (raw !== null) return parseProgressMap(raw);

  let seeded: TutorialProgressMap = {};
  try {
    if (store.getItem(TUTORIAL_COMPLETED_KEY) === '1') {
      seeded = { [INTRO_TUTORIAL_ID]: { status: 'completed', stepIndex: 0, updatedAt: Date.now() } };
    } else if (store.getItem(TUTORIAL_DISMISSED_KEY) === '1') {
      seeded = { [INTRO_TUTORIAL_ID]: { status: 'dismissed', stepIndex: 0, updatedAt: Date.now() } };
    }
  } catch {
    seeded = {};
  }
  if (Object.keys(seeded).length > 0) writeProgressMap(store, seeded);
  return seeded;
}

/** One tutorial's progress record, or null when it has never been run. */
export function getTutorialProgress(store: TutorialStore, tutorialId: string): TutorialProgressRecord | null {
  return readTutorialProgress(store)[tutorialId] ?? null;
}

/** Record a tutorial's status and position. Position is saved on every
 * step change while a tutorial runs; End records 'dismissed' with the
 * step it ended on; finishing records 'completed'. */
export function recordTutorialProgress(
  store: TutorialStore,
  tutorialId: string,
  status: TutorialProgressStatus,
  stepIndex: number,
  now: number = Date.now(),
): void {
  const map = readTutorialProgress(store);
  map[tutorialId] = {
    status,
    stepIndex: Math.max(0, Math.floor(stepIndex)),
    updatedAt: now,
  };
  writeProgressMap(store, map);
}

/** True once the user has gone through the intro tutorial to the end. */
export function hasCompletedTutorial(store: TutorialStore): boolean {
  return getTutorialProgress(store, INTRO_TUTORIAL_ID)?.status === 'completed';
}

/** Record that the user went through the intro tutorial to the end. */
export function markTutorialCompleted(store: TutorialStore): void {
  recordTutorialProgress(store, INTRO_TUTORIAL_ID, 'completed', 0);
}

/** True once the user has closed the intro tutorial early via End. */
export function hasDismissedTutorial(store: TutorialStore): boolean {
  return getTutorialProgress(store, INTRO_TUTORIAL_ID)?.status === 'dismissed';
}

/** Record that the user closed the intro tutorial early via End. */
export function markTutorialDismissed(store: TutorialStore): void {
  recordTutorialProgress(store, INTRO_TUTORIAL_ID, 'dismissed', 0);
}

/** True once the user has either completed or dismissed the intro tutorial. */
export function hasSeenTutorial(store: TutorialStore): boolean {
  const status = getTutorialProgress(store, INTRO_TUTORIAL_ID)?.status;
  return status === 'completed' || status === 'dismissed';
}

/** Whether a fresh load should drop the user into the intro tutorial:
 * only when it has no completed/dismissed record (an in-progress record
 * still auto-shows, and resumes) and the config flag is on. */
export function shouldAutoShowTutorial(store: TutorialStore): boolean {
  return SHOW_TUTORIAL_FOR_NEW_USERS && !hasSeenTutorial(store);
}

/**
 * Remove every nibglider.* setting, including the tutorial progress.
 * Used by "Reset all settings"; localStorage satisfies this interface.
 */
export function clearNibGliderSettings(storage: ClearableStorage): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith('nibglider.')) storage.removeItem(key);
  }
}
