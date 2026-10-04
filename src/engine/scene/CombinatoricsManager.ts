// Selection combine and deposit-time combine.
// Owns no mode or note. Reads the host's selection, layer, and combine mode.
// Mutates Paper items through unite, subtract, and intersect, then asks the
// host to retain a lowered Bézier result and record one selection command.
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
    if (!deposited || mode === 'none') return deposited;
    const opName = mode === 'union' ? 'unite' : mode;
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
}
