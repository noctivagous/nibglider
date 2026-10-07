// Selection combine and deposit-time combine.
// Owns no mode or note. Reads the host's selection, layer, and combine mode.
// Mutates Paper items through unite, subtract, intersect, and per-target
// crop (destructive clip), then asks the host to retain a lowered Bézier
// result and record one selection command.
// Public: canCombineSelection, combineSelection, depositWithCombine.
// Tested from tests/combinatorics.test.mjs and tests/composite-path.test.mjs.

import type { RetainedPath } from './SceneRepository';
import type { CombineMode } from '../types';
import { hasBooleanArea } from '../geometry/booleanResolver';

type Item = any;
type Snap = { before: Item[]; selected: Item[]; retained: Map<string, RetainedPath> };

export interface CombinatoricsHost {
  combineMode(): CombineMode | 'none';
  setCombineNote(note: string): void;
  selectedItems(): Item[];
  prependSelection(item: Item): void;
  removeFromSelection(item: Item): void;
  addToSelection(item: Item): void;
  isSelected(item: Item): boolean;
  dropItem(item: Item): void;
  shapePartOf(item: Item): Item;
  textModeEnabled(): boolean;
  withShapeText(item: Item): Item;
  activeLayer(): Item;
  drawingPath(): Item;
  quadPath(): Item;
  isNonContentItem(item: Item): boolean;
  layerChildren(): Item[];
  capture(): Snap;
  commit(label: string, snap: Snap, placed: Item[]): void;
  retain(item: Item): void;
  updateTextContent(): void;
  notify(): void;
}

const SELECT_NOTE = 'Select two shapes first.';
const EMPTY_NOTE = 'No result — shapes may not overlap.';
const LABELS: Record<CombineMode, string> = {
  union: 'Union',
  subtract: 'Subtract',
  intersect: 'Intersect',
  crop: 'Crop',
  interlace: 'Interlace',
};

export class CombinatoricsManager {
  private readonly host: CombinatoricsHost;
  constructor(host: CombinatoricsHost) { this.host = host; }

  canCombineSelection(): boolean {
    const items = this.host.selectedItems();
    if (items.length < 2) return false;
    const base = items[0];
    const tool = items[1];
    return !!base && !!tool
      && typeof base.unite === 'function'
      && typeof base.subtract === 'function'
      && typeof base.intersect === 'function';
  }

  combineSelection(mode: CombineMode): void {
    const host = this.host;
    if (!this.canCombineSelection()) {
      host.setCombineNote(SELECT_NOTE);
      host.updateTextContent();
      host.notify();
      return;
    }
    const snap = host.capture();
    // Deposit-time and selection interlace live on InterlaceManager; the
    // engine routes that mode before calling here.
    if (mode === 'interlace') return;
    if (mode === 'crop') {
      const placed = this.combineCrop();
      if (placed) {
        for (const item of placed) host.retain(item);
        host.commit(LABELS[mode], snap, placed);
        host.setCombineNote(placed.length > 0 ? '' : EMPTY_NOTE);
      } else {
        host.setCombineNote(SELECT_NOTE);
      }
      host.updateTextContent();
      host.notify();
      return;
    }
    const result = this.combinePair(mode);
    if (result) {
      host.retain(result);
      host.commit(LABELS[mode], snap, [result]);
    }
    host.setCombineNote(result ? '' : EMPTY_NOTE);
    host.updateTextContent();
    host.notify();
  }

  // Deposit-time combinatorics. Returns the item to place, the input when
  // the mode is none or nothing is touched, or null when subtract consumes
  // the deposit. Callers already record the deposit command.
  depositWithCombine(deposited: Item): Item | null {
    const host = this.host;
    const mode = host.combineMode();
    if (!deposited || mode === 'none' || mode === 'interlace') return deposited;
    const opName = mode === 'union' ? 'unite' : mode === 'crop' ? 'intersect' : mode;
    const depositGeo = host.shapePartOf(deposited);
    if (!depositGeo || typeof depositGeo[opName] !== 'function') return deposited;
    const targets: Array<{ geo: Item; container: Item }> = [];
    for (const item of host.layerChildren()) {
      if (!item || item === deposited) continue;
      if (item === host.drawingPath() || item === host.quadPath()) continue;
      if (host.isNonContentItem(item)) continue;
      const geo = host.shapePartOf(item);
      if (!geo || geo === depositGeo || typeof geo[opName] !== 'function') continue;
      if (!this.shapesTouch(depositGeo, geo)) continue;
      targets.push({ geo, container: item });
    }
    if (targets.length === 0) return deposited;
    if (mode === 'crop') {
      const layer = host.activeLayer();
      for (const { geo, container } of targets) {
        const wasSelected = host.isSelected(container);
        let inside = false;
        try { inside = this.shapeInside(depositGeo, geo); } catch { inside = false; }
        if (inside) continue;
        let cut: Item | null = null;
        try {
          cut = geo.intersect(depositGeo, { insert: false });
        } catch {
          cut = null;
        }
        host.dropItem(container);
        if (cut && hasBooleanArea(cut.area)) {
          const replaced = this.retext(cut);
          layer.addChild(replaced);
          if (wasSelected) host.addToSelection(replaced);
        }
      }
      for (const doomed of new Set([deposited, depositGeo])) this.removeDetached(doomed);
      host.setCombineNote('');
      return null;
    }
    try {
      if (mode === 'subtract') {
        const cuts: Array<{ container: Item; cut: Item | null; wasSelected: boolean }> = [];
        for (const { geo, container } of targets) {
          cuts.push({
            container,
            cut: geo.subtract(depositGeo, { insert: false }),
            wasSelected: host.isSelected(container),
          });
        }
        const layer = host.activeLayer();
        for (const { container, cut, wasSelected } of cuts) {
          host.dropItem(container);
          if (cut && hasBooleanArea(cut.area)) {
            const replaced = this.retext(cut);
            layer.addChild(replaced);
            if (wasSelected) host.addToSelection(replaced);
          }
        }
        for (const doomed of new Set([deposited, depositGeo])) this.removeDetached(doomed);
        host.setCombineNote('');
        return null;
      }
      let acc: Item = depositGeo;
      if (mode === 'intersect') {
        let union: Item = targets[0].geo;
        for (const { geo } of targets.slice(1)) {
          union = union.unite(geo, { insert: false });
          if (!union) throw new Error('empty union');
        }
        acc = depositGeo.intersect(union, { insert: false });
      } else {
        for (const { geo } of targets) {
          acc = acc.unite(geo, { insert: false });
          if (!acc) throw new Error('empty union');
        }
      }
      if (!hasBooleanArea(acc?.area)) throw new Error('empty boolean result');
      for (const { container } of targets) host.dropItem(container);
      for (const doomed of new Set([deposited, depositGeo])) this.removeDetached(doomed);
      host.setCombineNote('');
      return this.retext(acc);
    } catch {
      host.setCombineNote(EMPTY_NOTE);
      return deposited;
    }
  }

  private combinePair(mode: CombineMode): Item | null {
    const host = this.host;
    const base = host.selectedItems()[0];
    const tool = host.selectedItems()[1];
    if (!base || !tool) return null;
    const op = mode === 'union' ? base.unite : base[mode];
    if (typeof op !== 'function') return null;
    let result: Item = null;
    try {
      result = op.call(base, tool, { insert: true });
    } catch {
      result = null;
    }
    if (!hasBooleanArea(result?.area)) {
      this.removeDetached(result);
      return null;
    }
    host.removeFromSelection(base);
    host.removeFromSelection(tool);
    try { base.remove(); } catch { /* Already detached. */ }
    try { tool.remove(); } catch { /* Already detached. */ }
    host.prependSelection(result);
    return result;
  }

  // Crop: the last-selected item is the frame; every other selected
  // item is clipped to it. Returns the surviving replacements (possibly
  // empty when everything fell outside the frame), or null when the frame
  // cannot cut. Untouched items keep their selection; the frame is consumed.
  private combineCrop(): Item[] | null {
    const host = this.host;
    const items = [...host.selectedItems()];
    if (items.length < 2) return null;
    const frame = items.pop();
    if (!frame || typeof frame.intersect !== 'function') return null;
    const placed: Item[] = [];
    for (const art of items) {
      if (!art || typeof art.intersect !== 'function') continue;
      let cut: Item = null;
      try {
        cut = art.intersect(frame, { insert: true });
      } catch {
        cut = null;
      }
      host.removeFromSelection(art);
      try { art.remove(); } catch { /* Already detached. */ }
      if (cut && hasBooleanArea(cut.area)) {
        host.prependSelection(cut);
        placed.push(cut);
      } else {
        this.removeDetached(cut);
      }
    }
    host.removeFromSelection(frame);
    try { frame.remove(); } catch { /* Already detached. */ }
    return placed;
  }

  private retext(geo: Item): Item {
    if (!this.host.textModeEnabled()) return geo;
    try { return this.host.withShapeText(geo); } catch { return geo; }
  }

  private removeDetached(item: Item): void {
    try {
      if (item && item.parent != null) item.remove();
    } catch { /* Detached already. */ }
  }

  private shapesTouch(a: Item, b: Item): boolean {
    try {
      if (a && b && typeof a.intersects === 'function' && a.intersects(b)) return true;
      const pa = this.somePointOn(a);
      const pb = this.somePointOn(b);
      if (pa && this.containsPoint(b, pa)) return true;
      if (pb && this.containsPoint(a, pb)) return true;
      return false;
    } catch {
      return true;
    }
  }

  private somePointOn(item: Item): Item | null {
    try {
      if (item.segments && item.segments.length > 0) return item.segments[0].point;
      if (Array.isArray(item.children)) {
        for (const child of item.children) {
          const point = this.somePointOn(child);
          if (point) return point;
        }
      }
      if (item.bounds) return item.bounds.center;
    } catch { /* Fall through. */ }
    return null;
  }

  private containsPoint(boundary: Item, pt: Item): boolean {
    try { return !!boundary.contains(pt); } catch { return false; }
  }

  // Conservative containment for the crop shortcut: true only when the
  // candidate sits inside the frame's bounds and a sample point of the
  // candidate is contained. Any doubt returns false and the caller runs
  // the boolean instead.
  private shapeInside(frame: Item, geo: Item): boolean {
    try {
      if (frame.bounds && geo.bounds && typeof frame.bounds.contains === 'function') {
        if (!frame.bounds.contains(geo.bounds)) return false;
      }
      const pt = this.somePointOn(geo);
      if (pt && !this.containsPoint(frame, pt)) return false;
      return true;
    } catch {
      return false;
    }
  }
}
