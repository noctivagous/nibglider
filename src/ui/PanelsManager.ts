// Panel section layout; application menus load from menus/menus.xml.
// Owns collapsed, removed, and order records in the store passed in.
// Reads menu layout from the same store GUIManager writes. Does not render.
// Public: collapsed, removed, order, menuLayout, sectionOrder, moveSection, menus.
// Tested from tests/ui-state.test.mjs.

import { MENU_LAYOUT_KEY, type KeyValueStore, type MenuLayout, browserStore } from './GUIManager';
import menusXML from './menus/menus.xml?raw';
import { parseMenuXML } from './menuXML';

export interface MenuItemDef {
  commandId: string;
  /** Non-interactive group header separating grouped areas of a menu. */
  header?: boolean;
  /** Explicit label; defaults to the title-cased command id. */
  label?: string;
  /** Right-aligned keyboard shortcut chip shown next to the label. */
  shortcut?: string;
  /** Icon key rendered to the left of the label (see AppMenu icon map). */
  icon?: string;
}
export interface MenuDef { id: string; title: string; items: MenuItemDef[] }

const parsedMenus = parseMenuXML(menusXML);
if ('error' in parsedMenus) {
  // The menu suite pins the full structure, so a broken definition fails
  // loudly there; at runtime the bar degrades to empty instead of crashing.
  console.error(`Application menus failed to parse: ${parsedMenus.error}`);
}
export const APPLICATION_MENUS: MenuDef[] = 'menus' in parsedMenus ? parsedMenus.menus : [];

export const PANEL_GROUP_IDS = ['paint', 'keys', 'snap'] as const;
export type PanelGroupId = (typeof PANEL_GROUP_IDS)[number];

export const PANEL_SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'strokeControls', label: 'Stroke' },
  { id: 'fillControls', label: 'Fill' },
  { id: 'textControls', label: 'Text' },
  { id: 'circleFrameControls', label: 'Circle Keys' },
  { id: 'rectFrameControls', label: 'Rect Keys' },
  { id: 'combinatoricsControls', label: 'Combinatorics' },
  { id: 'historyControls', label: 'History' },
  { id: 'gridControls', label: 'Grid' },
  { id: 'snappingControls', label: 'Snapping' },
];

const DEFAULT_SECTION_GROUPS: Record<string, string[]> = {
  paint: ['strokeControls', 'fillControls', 'textControls'],
  keys: ['circleFrameControls', 'rectFrameControls', 'combinatoricsControls', 'historyControls'],
  snap: ['gridControls', 'snappingControls'],
};

const COLLAPSED_KEY = 'nibglider.panelCollapsed';
const REMOVED_KEY = 'nibglider.panelRemoved';
const ORDER_KEY = 'nibglider.panelOrder';
const ROW_STARTS_KEY = 'nibglider.panelRowStarts';

export function sectionLabel(id: string): string {
  return PANEL_SECTIONS.find((section) => section.id === id)?.label ?? id;
}

export function sectionLists(orderMap: Record<string, string[]>): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  const placed = new Set<string>();
  for (const group of PANEL_GROUP_IDS) {
    const saved = orderMap[group];
    const seed = saved && saved.length ? saved : DEFAULT_SECTION_GROUPS[group];
    next[group] = [];
    for (const id of seed) {
      if (placed.has(id)) continue;
      next[group].push(id);
      placed.add(id);
    }
  }
  for (const group of PANEL_GROUP_IDS) {
    for (const id of DEFAULT_SECTION_GROUPS[group]) {
      if (placed.has(id)) continue;
      next[group].push(id);
      placed.add(id);
    }
  }
  return next;
}

/** One visual sequence, with the former group layout used only to migrate saves. */
export function sectionOrder(orderMap: Record<string, string[]>): string[] {
  const saved = orderMap.all;
  const legacy = sectionLists(orderMap);
  const fallback = PANEL_GROUP_IDS.flatMap((group) => legacy[group]);
  const known = new Set(PANEL_SECTIONS.map((section) => section.id));
  const result: string[] = [];
  for (const id of [...(saved ?? fallback), ...fallback]) {
    if (known.has(id) && !result.includes(id)) result.push(id);
  }
  return result;
}

function loadRecord(store: KeyValueStore, key: string): Record<string, boolean> {
  try {
    const raw = store.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (v === true) out[k] = true;
      }
      return out;
    }
  } catch { /* ignore */ }
  return {};
}

function loadList(store: KeyValueStore, key: string): string[] {
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
  } catch { /* ignore */ }
  return [];
}

function loadOrder(store: KeyValueStore, key: string): Record<string, string[]> {
  try {
    const raw = store.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(v)) out[k] = v.filter((s) => typeof s === 'string');
      }
      return out;
    }
  } catch { /* ignore */ }
  return {};
}

export class PanelsManager {
  private readonly store: KeyValueStore;
  collapsed: Record<string, boolean>;
  removed: string[];
  order: Record<string, string[]>;
  rowStarts: string[];
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(store: KeyValueStore = browserStore()) {
    this.store = store;
    this.collapsed = loadRecord(store, COLLAPSED_KEY);
    this.removed = loadList(store, REMOVED_KEY);
    this.order = loadOrder(store, ORDER_KEY);
    this.rowStarts = loadList(store, ROW_STARTS_KEY);
  }

  get menuLayout(): MenuLayout {
    return this.store.getItem(MENU_LAYOUT_KEY) === 'grid' ? 'grid' : 'stack';
  }

  get menus(): MenuDef[] { return APPLICATION_MENUS; }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getVersion = (): number => this.version;

  toggleCollapse(id: string): void {
    this.collapsed = { ...this.collapsed, [id]: !this.collapsed[id] };
    this.write(COLLAPSED_KEY, JSON.stringify(this.collapsed));
    this.emit();
  }

  removeSection(id: string): void {
    if (!this.removed.includes(id)) this.removed = [...this.removed, id];
    this.write(REMOVED_KEY, JSON.stringify(this.removed));
    this.emit();
  }

  restoreSection(id: string): void {
    this.removed = this.removed.filter((section) => section !== id);
    this.write(REMOVED_KEY, JSON.stringify(this.removed));
    this.emit();
  }

  setRowStarts(ids: string[]): void {
    const order = sectionOrder(this.order);
    const next = [...new Set(ids)].filter((id) => order.includes(id) && id !== order[0]);
    if (next.length === this.rowStarts.length && next.every((id, i) => id === this.rowStarts[i])) return;
    this.rowStarts = next;
    this.write(ROW_STARTS_KEY, JSON.stringify(next));
    this.emit();
  }

  moveSection(fromId: string, toId: string, after = false): void {
    const before = sectionOrder(this.order);
    if (!before.includes(fromId) || fromId === toId) return;
    const next = before.filter((id) => id !== fromId);
    const at = toId ? next.indexOf(toId) : -1;
    if (at < 0) next.push(fromId);
    else next.splice(after ? at + 1 : at, 0, fromId);
    const starts = new Set(this.rowStarts);
    if (starts.delete(fromId)) {
      const successor = before[before.indexOf(fromId) + 1];
      if (successor) starts.add(successor);
    }
    if (!after && starts.delete(toId)) starts.add(fromId);
    const rowStarts = next.filter((id) => starts.has(id) && id !== next[0]);
    const orderChanged = before.some((id, index) => id !== next[index]);
    const rowsChanged = rowStarts.length !== this.rowStarts.length ||
      rowStarts.some((id, index) => id !== this.rowStarts[index]);
    if (!orderChanged && !rowsChanged) return;
    if (orderChanged) {
      this.order = { all: next };
      this.write(ORDER_KEY, JSON.stringify(this.order));
    }
    if (rowsChanged) {
      this.rowStarts = rowStarts;
      this.write(ROW_STARTS_KEY, JSON.stringify(rowStarts));
    }
    this.emit();
  }

  private write(key: string, value: string): void {
    try { this.store.setItem(key, value); } catch { /* ignore */ }
  }

  private emit(): void {
    this.version += 1;
    this.listeners.forEach((fn) => fn());
  }
}
