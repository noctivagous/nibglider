// Keyboard focus movement for the horizontal application menu bar.
// Pure helpers so the stepping rules stay unit-testable without React:
// headers never take focus, and keyboard stepping skips disabled leaves
// (hover still highlights them, matching the rail's CustomSelect).
// Tested from tests/menu-navigation.test.mjs.

import type { MenuItemDef } from './PanelsManager';

/**
 * Row indexes the highlight may rest on: real items with a wired handler,
 * plus expandable parents (their Enter expands the submenu instead of
 * dispatching, so they stay reachable while unwired).
 */
export function focusableIndexes(items: MenuItemDef[], enabled: Set<string>): number[] {
  const out: number[] = [];
  items.forEach((item, index) => {
    if (!item.header && (enabled.has(item.commandId) || item.children)) out.push(index);
  });
  return out;
}

/** A highlighted row, enough to decide whether its flyout stays open. */
export interface SubmenuRow {
  commandId: string;
  /** Set when the row is an option inside an open submenu. */
  parentId: string | null;
  hasChildren: boolean;
}

/**
 * Which submenu stays open after the highlight moves onto `row`.
 * Pointer entry on a parent opens that parent. Keyboard movement does
 * not open a parent; it only keeps the flyout while the highlight is
 * on that parent or one of its options. A leaf, a group header, or a
 * different parent closes the previous flyout.
 */
export function submenuForRow(
  openSub: string | null,
  row: SubmenuRow,
  via: 'pointer' | 'keyboard',
): string | null {
  if (row.parentId) return row.parentId;
  if (!row.hasChildren) return null;
  if (via === 'pointer' || row.commandId === openSub) return row.commandId;
  return null;
}

/**
 * Next focusable row from `from` in `dir`, wrapping around the menu.
 * `from` of -1 starts at the near edge. Returns -1 when nothing is focusable.
 */
export function stepFocus(items: MenuItemDef[], enabled: Set<string>, from: number, dir: 1 | -1): number {
  const focusable = focusableIndexes(items, enabled);
  if (focusable.length === 0) return -1;
  if (from < 0) return dir > 0 ? focusable[0] : focusable[focusable.length - 1];
  if (dir > 0) {
    for (const index of focusable) {
      if (index > from) return index;
    }
    return focusable[0];
  }
  for (let k = focusable.length - 1; k >= 0; k--) {
    if (focusable[k] < from) return focusable[k];
  }
  return focusable[focusable.length - 1];
}
