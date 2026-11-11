import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOW_TUTORIAL_FOR_NEW_USERS,
  TUTORIAL_COMPLETED_KEY,
  TUTORIAL_DISMISSED_KEY,
  TUTORIAL_PROGRESS_KEY,
} from '../src/config/tutorial.ts';
import {
  clearNibGliderSettings,
  getTutorialProgress,
  hasCompletedTutorial,
  hasDismissedTutorial,
  hasSeenTutorial,
  markTutorialCompleted,
  markTutorialDismissed,
  readTutorialProgress,
  recordTutorialProgress,
  shouldAutoShowTutorial,
} from '../src/tutorial/tutorialProgress.ts';

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test('tutorial auto-show is enabled for new users by default', () => {
  assert.equal(SHOW_TUTORIAL_FOR_NEW_USERS, true);
  assert.ok(TUTORIAL_COMPLETED_KEY.startsWith('nibglider.'));
});

test('completion flag drives auto-show', () => {
  const store = fakeStorage();
  assert.equal(hasCompletedTutorial(store), false);
  assert.equal(shouldAutoShowTutorial(store), true);
  markTutorialCompleted(store);
  assert.equal(hasCompletedTutorial(store), true);
  assert.equal(shouldAutoShowTutorial(store), false);
});

test('reset-all-settings clears the tutorial flag and keeps foreign keys', () => {
  const store = fakeStorage({
    [TUTORIAL_COMPLETED_KEY]: '1',
    [TUTORIAL_DISMISSED_KEY]: '1',
    'nibglider.keyboardVisible': '0',
    'other-app.theme': 'dark',
  });
  clearNibGliderSettings(store);
  assert.equal(store.getItem(TUTORIAL_COMPLETED_KEY), null);
  assert.equal(store.getItem(TUTORIAL_DISMISSED_KEY), null);
  assert.equal(store.getItem('nibglider.keyboardVisible'), null);
  assert.equal(store.getItem('other-app.theme'), 'dark');
});

test('dismissing the tutorial suppresses auto-show without marking completion', () => {
  const store = fakeStorage();
  assert.equal(shouldAutoShowTutorial(store), true);
  markTutorialDismissed(store);
  assert.equal(hasDismissedTutorial(store), true);
  assert.equal(hasCompletedTutorial(store), false);
  assert.equal(hasSeenTutorial(store), true);
  assert.equal(shouldAutoShowTutorial(store), false);
});

test('completion and dismissal are tracked independently', () => {
  assert.notEqual(TUTORIAL_COMPLETED_KEY, TUTORIAL_DISMISSED_KEY);
  const completedOnly = fakeStorage({ [TUTORIAL_COMPLETED_KEY]: '1' });
  assert.equal(hasCompletedTutorial(completedOnly), true);
  assert.equal(hasDismissedTutorial(completedOnly), false);
  assert.equal(shouldAutoShowTutorial(completedOnly), false);
  const dismissedOnly = fakeStorage({ [TUTORIAL_DISMISSED_KEY]: '1' });
  assert.equal(hasCompletedTutorial(dismissedOnly), false);
  assert.equal(hasDismissedTutorial(dismissedOnly), true);
  assert.equal(shouldAutoShowTutorial(dismissedOnly), false);
});

// --- Slice 23: per-tutorial progress store --------------------------------

test('progress store round-trips per tutorial, independently', () => {
  const store = fakeStorage();
  assert.equal(getTutorialProgress(store, 'arrange'), null);
  recordTutorialProgress(store, 'arrange', 'in-progress', 3, 1000);
  recordTutorialProgress(store, 'hello-rectangle', 'completed', 9, 2000);
  assert.deepEqual(getTutorialProgress(store, 'arrange'), { status: 'in-progress', stepIndex: 3, updatedAt: 1000 });
  assert.deepEqual(getTutorialProgress(store, 'hello-rectangle'), { status: 'completed', stepIndex: 9, updatedAt: 2000 });
  // Re-recording one tutorial leaves the other untouched.
  recordTutorialProgress(store, 'arrange', 'in-progress', 4, 3000);
  assert.equal(getTutorialProgress(store, 'arrange').stepIndex, 4);
  assert.equal(getTutorialProgress(store, 'hello-rectangle').status, 'completed');
  // The map survives a fresh read of the same store (real persistence).
  assert.deepEqual(readTutorialProgress(store).arrange.stepIndex, 4);
});

test('legacy completed flag migrates to hello-rectangle on first read', () => {
  const store = fakeStorage({ [TUTORIAL_COMPLETED_KEY]: '1' });
  const record = getTutorialProgress(store, 'hello-rectangle');
  assert.equal(record.status, 'completed');
  // Migration persists the v1 map so it runs exactly once.
  assert.ok(store.getItem(TUTORIAL_PROGRESS_KEY));
  assert.equal(hasCompletedTutorial(store), true);
});

test('legacy dismissed flag migrates as dismissed at step 0', () => {
  const store = fakeStorage({ [TUTORIAL_DISMISSED_KEY]: '1' });
  const record = getTutorialProgress(store, 'hello-rectangle');
  assert.deepEqual({ status: record.status, stepIndex: record.stepIndex }, { status: 'dismissed', stepIndex: 0 });
  assert.equal(hasDismissedTutorial(store), true);
  assert.equal(hasCompletedTutorial(store), false);
});

test('an existing v1 map wins over legacy flags (no double migration)', () => {
  const store = fakeStorage({
    [TUTORIAL_PROGRESS_KEY]: JSON.stringify({ 'hello-rectangle': { status: 'in-progress', stepIndex: 2, updatedAt: 5 } }),
    [TUTORIAL_COMPLETED_KEY]: '1',
  });
  const record = getTutorialProgress(store, 'hello-rectangle');
  assert.equal(record.status, 'in-progress');
  assert.equal(record.stepIndex, 2);
});

test('legacy keys are no longer written by the mark helpers', () => {
  const store = fakeStorage();
  markTutorialCompleted(store);
  assert.equal(store.getItem(TUTORIAL_COMPLETED_KEY), null);
  assert.equal(store.getItem(TUTORIAL_DISMISSED_KEY), null);
  assert.ok(store.getItem(TUTORIAL_PROGRESS_KEY));
  const store2 = fakeStorage();
  markTutorialDismissed(store2);
  assert.equal(store2.getItem(TUTORIAL_DISMISSED_KEY), null);
  assert.ok(store2.getItem(TUTORIAL_PROGRESS_KEY));
});

test('auto-show decisions per progress state', () => {
  const fresh = fakeStorage();
  assert.equal(shouldAutoShowTutorial(fresh), true);
  // In-progress still auto-shows (it resumes where it stopped).
  const inProgress = fakeStorage();
  recordTutorialProgress(inProgress, 'hello-rectangle', 'in-progress', 2);
  assert.equal(shouldAutoShowTutorial(inProgress), true);
  // Completed or dismissed suppress it.
  const completed = fakeStorage();
  recordTutorialProgress(completed, 'hello-rectangle', 'completed', 0);
  assert.equal(shouldAutoShowTutorial(completed), false);
  const dismissed = fakeStorage();
  recordTutorialProgress(dismissed, 'hello-rectangle', 'dismissed', 1);
  assert.equal(shouldAutoShowTutorial(dismissed), false);
  // Another tutorial's completion does not affect the intro decision.
  const other = fakeStorage();
  recordTutorialProgress(other, 'arrange', 'completed', 0);
  assert.equal(shouldAutoShowTutorial(other), true);
});

test('a corrupt progress value reads as empty instead of throwing', () => {
  const store = fakeStorage({ [TUTORIAL_PROGRESS_KEY]: '{not json' });
  assert.deepEqual(readTutorialProgress(store), {});
  assert.equal(getTutorialProgress(store, 'hello-rectangle'), null);
  assert.equal(shouldAutoShowTutorial(store), true);
});

test('reset-all-settings clears the per-tutorial progress too', () => {
  const store = fakeStorage();
  recordTutorialProgress(store, 'arrange', 'in-progress', 2);
  store.setItem('other-app.theme', 'dark');
  clearNibGliderSettings(store);
  assert.equal(store.getItem(TUTORIAL_PROGRESS_KEY), null);
  assert.equal(store.getItem('other-app.theme'), 'dark');
});
