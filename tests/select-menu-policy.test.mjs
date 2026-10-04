import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSED_MENU,
  selectMenuDismissed,
  selectMenuOpened,
  selectMenuTriggerClicked,
  shouldDismissOnCursorExit,
} from '../src/components/selectMenuPolicy.ts';

test('hover opens unpinned so cursor exit dismisses', () => {
  const snapshot = selectMenuOpened(true, 'hover');
  assert.deepEqual(snapshot, { open: true, pinned: false });
  assert.equal(
    shouldDismissOnCursorExit({
      openOnHover: true,
      stickyOnClick: true,
      snapshot,
      focusWithinMenu: false,
    }),
    true,
  );
});

test('click opens pinned so cursor exit keeps the menu', () => {
  const snapshot = selectMenuOpened(true, 'click');
  assert.deepEqual(snapshot, { open: true, pinned: true });
  assert.equal(
    shouldDismissOnCursorExit({
      openOnHover: true,
      stickyOnClick: true,
      snapshot,
      focusWithinMenu: false,
    }),
    false,
  );
});

test('keyboard opens pinned when sticky', () => {
  assert.deepEqual(selectMenuOpened(true, 'keyboard'), { open: true, pinned: true });
  assert.deepEqual(selectMenuOpened(false, 'keyboard'), { open: true, pinned: false });
});

test('clicking a hover-opened menu pins it instead of closing', () => {
  const hovered = selectMenuOpened(true, 'hover');
  assert.deepEqual(selectMenuTriggerClicked(hovered, true), { open: true, pinned: true });
});

test('clicking a pinned menu closes and unpins it', () => {
  const pinned = selectMenuOpened(true, 'click');
  assert.deepEqual(selectMenuTriggerClicked(pinned, true), CLOSED_MENU);
});

test('clicking a closed menu opens it pinned when sticky', () => {
  assert.deepEqual(selectMenuTriggerClicked(CLOSED_MENU, true), { open: true, pinned: true });
});

test('non-sticky menus never pin and keep the plain toggle', () => {
  assert.deepEqual(selectMenuOpened(false, 'hover'), { open: true, pinned: false });
  assert.deepEqual(selectMenuOpened(false, 'click'), { open: true, pinned: false });
  assert.deepEqual(
    selectMenuTriggerClicked({ open: true, pinned: false }, false),
    CLOSED_MENU,
  );
  assert.equal(
    shouldDismissOnCursorExit({
      openOnHover: true,
      stickyOnClick: false,
      snapshot: { open: true, pinned: false },
      focusWithinMenu: false,
    }),
    true,
  );
});

test('dismissal always clears the pin', () => {
  assert.deepEqual(selectMenuDismissed(), CLOSED_MENU);
});

test('keyboard focus inside the menu holds it open past a mouse slip', () => {
  assert.equal(
    shouldDismissOnCursorExit({
      openOnHover: true,
      stickyOnClick: true,
      snapshot: { open: true, pinned: false },
      focusWithinMenu: true,
    }),
    false,
  );
});

test('cursor exit never dismisses click-only or closed menus', () => {
  assert.equal(
    shouldDismissOnCursorExit({
      openOnHover: false,
      stickyOnClick: false,
      snapshot: { open: true, pinned: false },
      focusWithinMenu: false,
    }),
    false,
  );
  assert.equal(
    shouldDismissOnCursorExit({
      openOnHover: true,
      stickyOnClick: true,
      snapshot: CLOSED_MENU,
      focusWithinMenu: false,
    }),
    false,
  );
});
