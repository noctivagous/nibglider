import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOW_TUTORIAL_FOR_NEW_USERS, TUTORIAL_COMPLETED_KEY } from '../src/config/tutorial.ts';
import {
  clearNibGliderSettings,
  hasCompletedTutorial,
  markTutorialCompleted,
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
    'nibglider.keyboardVisible': '0',
    'other-app.theme': 'dark',
  });
  clearNibGliderSettings(store);
  assert.equal(store.getItem(TUTORIAL_COMPLETED_KEY), null);
  assert.equal(store.getItem('nibglider.keyboardVisible'), null);
  assert.equal(store.getItem('other-app.theme'), 'dark');
});
