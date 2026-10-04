// Widget placement registry and overlap rules.
// Owns widget rects/anchors and computes overlap-free placement. Reads and
// writes the store passed in. Does not touch the DOM; rects are reported in
// by components via setRect (viewport coordinates, e.g. getBoundingClientRect).
// Public: setRect, setWidgetPosition, clearWidgetPosition, snapshot, subscribe.
// Tested from tests/ui-state.test.mjs.

import { type KeyValueStore, browserStore } from './GUIManager';

export interface WidgetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WidgetId = 'panel' | 'menus' | 'sections' | 'keyboard' | 'status';

export interface WidgetLayoutSnapshot {
  /**
   * Left offset (px) the status box needs to clear widgets hanging below
   * the panel. Zero when nothing overlaps its lane.
   */
  statusShiftX: number;
  /** Saved drag positions by widget id; empty until widgets are draggable. */
  positions: Record<string, { x: number; y: number }>;
}

/** Vertical gap between the panel and the status box in the overlay stack. */
export const STACK_GAP = 8;

const POSITIONS_KEY = 'nibglider.widgetPositions';

function loadPositions(store: KeyValueStore): Record<string, { x: number; y: number }> {
  try {
    const raw = store.getItem(POSITIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, { x: number; y: number }> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (
          v && typeof v === 'object' && !Array.isArray(v) &&
          typeof (v as { x?: unknown }).x === 'number' &&
          typeof (v as { x?: unknown; y?: unknown }).y === 'number'
        ) {
          out[k] = { x: (v as { x: number }).x, y: (v as { y: number }).y };
        }
      }
      return out;
    }
  } catch { /* ignore */ }
  return {};
}

/**
 * Phase-1 placement rule: the status box sits left-aligned under the panel,
 * so any widget hanging below the panel in that column (today: the floating
 * side column with the menus rail and keymap table) pushes it right by the
 * widget's width.
 */
export function statusShiftX(
  panel: WidgetRect | undefined,
  rail: WidgetRect | undefined,
): number {
  if (!panel || !rail) return 0;
  const statusTop = panel.y + panel.height + STACK_GAP;
  const railBottom = rail.y + rail.height;
  if (railBottom <= statusTop) return 0;
  return Math.max(0, rail.width);
}

export class WidgetLayout {
  private readonly store: KeyValueStore;
  private readonly rects = new Map<WidgetId, WidgetRect>();
  private positions: Record<string, { x: number; y: number }>;
  private snapshot: WidgetLayoutSnapshot;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(store: KeyValueStore = browserStore()) {
    this.store = store;
    this.positions = loadPositions(store);
    this.snapshot = this.capture();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getVersion = (): number => this.version;

  getSnapshot = (): WidgetLayoutSnapshot => this.snapshot;

  setRect(id: WidgetId, rect: WidgetRect): void {
    const prev = this.rects.get(id);
    if (
      prev &&
      Math.abs(prev.x - rect.x) < 0.5 &&
      Math.abs(prev.y - rect.y) < 0.5 &&
      Math.abs(prev.width - rect.width) < 0.5 &&
      Math.abs(prev.height - rect.height) < 0.5
    ) {
      return;
    }
    this.rects.set(id, { ...rect });
    this.emit();
  }

  /** Foundation for draggable widgets: persists a custom position. */
  setWidgetPosition(id: string, x: number, y: number): void {
    this.positions = { ...this.positions, [id]: { x, y } };
    try {
      this.store.setItem(POSITIONS_KEY, JSON.stringify(this.positions));
    } catch { /* ignore */ }
    this.emit();
  }

  clearWidgetPosition(id: string): void {
    if (!(id in this.positions)) return;
    const next = { ...this.positions };
    delete next[id];
    this.positions = next;
    try {
      this.store.setItem(POSITIONS_KEY, JSON.stringify(this.positions));
    } catch { /* ignore */ }
    this.emit();
  }

  private capture(): WidgetLayoutSnapshot {
    return {
      statusShiftX: statusShiftX(this.rects.get('panel'), this.rects.get('menus')),
      positions: { ...this.positions },
    };
  }

  private emit(): void {
    const next = this.capture();
    if (
      next.statusShiftX === this.snapshot.statusShiftX &&
      JSON.stringify(next.positions) === JSON.stringify(this.snapshot.positions)
    ) {
      return;
    }
    this.snapshot = next;
    this.version += 1;
    this.listeners.forEach((fn) => fn());
  }
}
