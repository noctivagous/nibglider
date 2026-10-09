// App-wide overlay preferences.
// Owns visibility, keyboard width, spacebar visibility, and menu layout.
// Reads and writes the store passed in. Does not touch the DOM or Paper.js.
// Public: the preference fields, their setters, subscribe, getSnapshot.
// Tested from tests/ui-state.test.mjs.

export type MenuLayout = 'stack' | 'grid';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const KEYBOARD_WIDTH_DEFAULT = 920;
export const KEYBOARD_WIDTH_MIN = 480;
export const KEYBOARD_WIDTH_MAX = 1600;
export const KEYBOARD_WIDTH_KEY = 'nibglider.keyboardWidth';
export const KEYBOARD_VISIBLE_KEY = 'nibglider.keyboardVisible';
export const CONTROLS_VISIBLE_KEY = 'nibglider.controlsVisible';
export const STATUS_VISIBLE_KEY = 'nibglider.statusVisible';
export const FILTERS_VISIBLE_KEY = 'nibglider.filtersVisible';
export const MENU_LAYOUT_KEY = 'nibglider.menuLayout';

export interface GUISnapshot {
  keyboardWidth: number;
  keyboardVisible: boolean;
  controlsVisible: boolean;
  statusVisible: boolean;
  filtersVisible: boolean;
  showSpacebar: boolean;
  menuLayout: MenuLayout;
  /** Id of the XML-defined window currently open, or null. */
  openWindowId: string | null;
}

function memoryStore(): KeyValueStore {
  const mem = new Map<string, string>();
  return { getItem: (key) => mem.get(key) ?? null, setItem: (key, value) => { mem.set(key, value); } };
}

export function browserStore(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* Private mode. */ }
  return memoryStore();
}

function loadFlag(store: KeyValueStore, key: string, fallback: boolean): boolean {
  try {
    const raw = store.getItem(key);
    if (raw == null || raw === '') return fallback;
    return raw !== '0' && raw.toLowerCase() !== 'false';
  } catch { return fallback; }
}

function loadWidth(store: KeyValueStore): number {
  try {
    const raw = store.getItem(KEYBOARD_WIDTH_KEY);
    if (raw == null || raw === '') return KEYBOARD_WIDTH_DEFAULT;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.min(KEYBOARD_WIDTH_MAX, Math.max(KEYBOARD_WIDTH_MIN, n));
  } catch { /* ignore */ }
  return KEYBOARD_WIDTH_DEFAULT;
}

function loadLayout(store: KeyValueStore): MenuLayout {
  return store.getItem(MENU_LAYOUT_KEY) === 'grid' ? 'grid' : 'stack';
}

export class GUIManager {
  private readonly store: KeyValueStore;
  keyboardWidth: number;
  keyboardVisible: boolean;
  controlsVisible: boolean;
  statusVisible: boolean;
  filtersVisible: boolean;
  showSpacebar = false;
  menuLayout: MenuLayout;
  /** XML-defined window currently open; window content itself is transient. */
  openWindowId: string | null = null;
  private snapshot: GUISnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(store: KeyValueStore = browserStore()) {
    this.store = store;
    this.keyboardWidth = loadWidth(store);
    this.keyboardVisible = loadFlag(store, KEYBOARD_VISIBLE_KEY, true);
    this.controlsVisible = loadFlag(store, CONTROLS_VISIBLE_KEY, true);
    this.statusVisible = loadFlag(store, STATUS_VISIBLE_KEY, true);
    this.filtersVisible = loadFlag(store, FILTERS_VISIBLE_KEY, false);
    this.menuLayout = loadLayout(store);
    this.snapshot = this.capture();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getSnapshot = (): GUISnapshot => this.snapshot;

  setKeyboardWidth(width: number): void {
    if (!Number.isFinite(width) || width <= 0) return;
    this.keyboardWidth = Math.min(KEYBOARD_WIDTH_MAX, Math.max(KEYBOARD_WIDTH_MIN, width));
    this.persist(KEYBOARD_WIDTH_KEY, String(this.keyboardWidth));
    this.emit();
  }

  setKeyboardVisible(visible: boolean): void { this.setFlag('keyboardVisible', KEYBOARD_VISIBLE_KEY, visible); }
  setControlsVisible(visible: boolean): void { this.setFlag('controlsVisible', CONTROLS_VISIBLE_KEY, visible); }
  setStatusVisible(visible: boolean): void { this.setFlag('statusVisible', STATUS_VISIBLE_KEY, visible); }
  setFiltersVisible(visible: boolean): void { this.setFlag('filtersVisible', FILTERS_VISIBLE_KEY, visible); }
  setShowSpacebar(visible: boolean): void {
    this.showSpacebar = visible;
    this.emit();
  }
  toggleKeyboard(): void { this.setKeyboardVisible(!this.keyboardVisible); }
  toggleControls(): void { this.setControlsVisible(!this.controlsVisible); }
  toggleStatus(): void { this.setStatusVisible(!this.statusVisible); }
  toggleFilters(): void { this.setFiltersVisible(!this.filtersVisible); }

  setMenuLayout(layout: MenuLayout): void {
    if (layout !== 'stack' && layout !== 'grid') return;
    this.menuLayout = layout;
    this.persist(MENU_LAYOUT_KEY, layout);
    this.emit();
  }

  openWindow(windowId: string): void {
    if (typeof windowId !== 'string' || windowId.trim() === '') return;
    if (this.openWindowId === windowId) return;
    this.openWindowId = windowId;
    this.emit();
  }

  closeWindow(): void {
    if (this.openWindowId == null) return;
    this.openWindowId = null;
    this.emit();
  }

  private setFlag(field: 'keyboardVisible' | 'controlsVisible' | 'statusVisible' | 'filtersVisible', key: string, visible: boolean): void {
    this[field] = visible;
    this.persist(key, visible ? '1' : '0');
    this.emit();
  }

  private persist(key: string, value: string): void {
    try { this.store.setItem(key, value); } catch { /* ignore */ }
  }

  private capture(): GUISnapshot {
    return {
      keyboardWidth: this.keyboardWidth,
      keyboardVisible: this.keyboardVisible,
      controlsVisible: this.controlsVisible,
      statusVisible: this.statusVisible,
      filtersVisible: this.filtersVisible,
      showSpacebar: this.showSpacebar,
      menuLayout: this.menuLayout,
      openWindowId: this.openWindowId,
    };
  }

  private emit(): void {
    this.snapshot = this.capture();
    this.listeners.forEach((fn) => fn());
  }
}
