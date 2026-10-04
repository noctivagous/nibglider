// Pin policy for select-dropdown menus.
//
// Application menus (the File/Document/Operations/Layers/Sections/Debug rail)
// hide their menu when the cursor exits the menu or its button, unless the
// user clicked the button — then the menu sticks (pins) until it is toggled,
// picked from, dismissed, or superseded. This module is the single source of
// truth for that policy: CustomSelect implements it, and the unit tests pin
// it down. No other dropdown opts in.

/** Window event a select menu dispatches whenever it opens. */
export const SELECT_MENU_OPEN_EVENT = 'nibglider:select-menu-open';

export type SelectMenuOpenTrigger = 'hover' | 'click' | 'keyboard';

export interface SelectMenuSnapshot {
  open: boolean;
  /** Pinned menus ignore cursor-exit dismissal until unpinned. */
  pinned: boolean;
}

export const CLOSED_MENU: SelectMenuSnapshot = { open: false, pinned: false };

/**
 * Snapshot for a menu that just opened. Only an explicit open (click or
 * keyboard) pins, only when the menu opted into stickiness, and hover opens
 * never pin — so cursor-exit dismissal still applies to them.
 */
export function selectMenuOpened(
  stickyOnClick: boolean,
  trigger: SelectMenuOpenTrigger,
): SelectMenuSnapshot {
  return { open: true, pinned: stickyOnClick && trigger !== 'hover' };
}

/**
 * Snapshot for a click on the trigger button.
 * - Closed -> opens pinned (explicit open sticks).
 * - Open but hover-opened -> stays open and pins instead of closing.
 * - Open and pinned -> closes and unpins (toggle).
 * Non-sticky menus keep the plain toggle.
 */
export function selectMenuTriggerClicked(
  current: SelectMenuSnapshot,
  stickyOnClick: boolean,
): SelectMenuSnapshot {
  if (!current.open) return selectMenuOpened(stickyOnClick, 'click');
  if (stickyOnClick && !current.pinned) return { open: true, pinned: true };
  return { ...CLOSED_MENU };
}

/** Any dismissal (pick, Escape, outside press, viewport shift) clears the pin. */
export function selectMenuDismissed(): SelectMenuSnapshot {
  return { ...CLOSED_MENU };
}

/**
 * Whether a cursor exit (trigger or menu mouse-leave) should schedule the
 * menu to close. Pinned menus stick; keyboard focus inside the menu also
 * holds it open past a mouse slip.
 */
export function shouldDismissOnCursorExit(args: {
  openOnHover: boolean;
  stickyOnClick: boolean;
  snapshot: SelectMenuSnapshot;
  focusWithinMenu: boolean;
}): boolean {
  if (!args.openOnHover) return false;
  if (!args.snapshot.open) return false;
  if (args.focusWithinMenu) return false;
  if (args.stickyOnClick && args.snapshot.pinned) return false;
  return true;
}
