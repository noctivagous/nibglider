// Keyboard focus movement for the horizontal application menu bar.
// Pure helpers so the stepping rules stay unit-testable without React:
// headers never take focus, and keyboard stepping skips disabled rows
// (hover still highlights them, matching the rail's CustomSelect).
// Tested from tests/menu-navigation.test.mjs.

import type { MenuItemDef } from './PanelsManager';

/** Row indexes the highlight may rest on: real items with a wired handler. */
export function focusableIndexes(items: MenuItemDef[], enabled: Set<string>): number[] {
  const out: number[] = [];
  items.forEach((item, index) => {
    if (!item.header && enabled.has(item.commandId)) out.push(index);
  });
  return out;
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
