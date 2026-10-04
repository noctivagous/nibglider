// Panel section layout and application-menu definitions.
// Owns collapsed, removed, and order records in the store passed in.
// Reads menu layout from the same store GUIManager writes. Does not render.
// Public: collapsed, removed, order, menuLayout, sectionOrder, moveSection, menus.
// Tested from tests/ui-state.test.mjs.

import { MENU_LAYOUT_KEY, type KeyValueStore, type MenuLayout, browserStore } from './GUIManager';

export interface MenuItemDef { commandId: string }
export interface MenuDef { id: string; title: string; items: MenuItemDef[] }

export const APPLICATION_MENUS: MenuDef[] = [
  { id: 'file', title: 'File', items: [{ commandId: 'undo' }, { commandId: 'redo' }] },
  { id: 'document', title: 'Document and Settings', items: [{ commandId: 'reset-zoom' }] },
  { id: 'operations', title: 'Operations and Modes', items: [{ commandId: 'group' }, { commandId: 'delete-selection' }] },
  { id: 'layers', title: 'Layers and Objects', items: [{ commandId: 'select' }] },
];

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
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(store: KeyValueStore = browserStore()) {
    this.store = store;
    this.collapsed = loadRecord(store, COLLAPSED_KEY);
    this.removed = loadList(store, REMOVED_KEY);
    this.order = loadOrder(store, ORDER_KEY);
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

  moveSection(fromId: string, toId: string, after = false): void {
    const before = sectionOrder(this.order);
    if (!before.includes(fromId) || fromId === toId) return;
    const next = before.filter((id) => id !== fromId);
    const at = toId ? next.indexOf(toId) : -1;
    if (at < 0) next.push(fromId);
    else next.splice(after ? at + 1 : at, 0, fromId);
    if (before.every((id, index) => id === next[index])) return;
    this.order = { all: next };
    this.write(ORDER_KEY, JSON.stringify(this.order));
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
