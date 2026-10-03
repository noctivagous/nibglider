import type { NGDrawable } from '../model/NGDrawable';
import { SceneRepository, type RetainedPath } from '../scene/SceneRepository';
import type { SelectionManager } from '../scene/SelectionManager';
import { UndoManager, type UndoCommand } from '../undoManager';

type Item = any;
export interface MoveEntry { item: Item; before: paper.Point; after: paper.Point }
interface MoveCommand extends UndoCommand { entries: MoveEntry[] }
export interface ModelCommandHost {
  upsertModel(drawable: NGDrawable): void;
  removeModel(id: string): void;
  renderFromModel(id: string): void;
}
export interface UngroupPart { group: Item; kids: Item[]; at: number }

// Owns undo entries and gesture boundaries. Tools and selection services
// perform the mutation, then ask this manager to record one completed intent.
export class HistoryManager {
  private readonly scene: SceneRepository;
  private readonly selection: () => SelectionManager;
  private readonly stack: UndoManager;
  private moveGesture: { items: Item[]; points: Array<paper.Point | null> } | null = null;

  constructor(scene: SceneRepository, selection: () => SelectionManager, onChange: () => void) {
    this.scene = scene; this.selection = selection;
    this.stack = new UndoManager(100, 800, onChange);
  }
  push(command: UndoCommand): void { this.stack.push(command); }
  canUndo(): boolean { return this.stack.canUndo(); }
  canRedo(): boolean { return this.stack.canRedo(); }
  undoLabel(): string | null { return this.stack.undoLabel(); }
  redoLabel(): string | null { return this.stack.redoLabel(); }
  undo(): void { this.cancelMoveGesture(); this.stack.undo(); }
  redo(): void { this.cancelMoveGesture(); this.stack.redo(); }
  cancelMoveGesture(): void { this.moveGesture = null; }

  recordSceneCommand(label: string, before: Item[], selectedBefore: Item[],
    explicitPlaced: Array<Item | null>, retainedBefore?: Map<string, RetainedPath>): void {
    if (!this.scene.layer) return;
    const after = this.scene.contentItems();
    const beforeSet = new Set(before); const afterSet = new Set(after);
    const placed: Item[] = [];
    for (const item of explicitPlaced) if (item && this.scene.isInScene(item) && !placed.includes(item)) placed.push(item);
    for (const item of after) if (!beforeSet.has(item) && !placed.includes(item)) placed.push(item);
    const victims = before.filter((item) => {
      if (afterSet.has(item)) return false;
      for (let parent = item.parent; parent; parent = parent.parent) if (placed.includes(parent)) return false;
      return true;
    });
    if (!placed.length && !victims.length) return;
    const anchors = (order: Item[], changing: Item[]): Map<Item, Item | null> => {
      const set = new Set(changing); const result = new Map<Item, Item | null>();
      for (const item of changing) {
        const index = order.indexOf(item);
        result.set(item, order.slice(index + 1).find((next) => !set.has(next)) ?? null);
      }
      return result;
    };
    const anchorBefore = anchors(before, victims); const anchorAfter = anchors(after, placed);
    const descending = (items: Item[], order: Item[]) => [...items].sort((a, b) => order.indexOf(b) - order.indexOf(a));
    const selectedAfter = this.selection().snapshot();
    const retainedAfter = retainedBefore ? this.scene.snapshotRecords() : null;
    const restore = (remove: Item[], insert: Item[], anchor: Map<Item, Item | null>, selected: Item[], retained?: Map<string, RetainedPath> | null) => {
      if (retained) this.scene.restoreRecords(retained);
      for (const item of remove) if (this.scene.isInScene(item)) {
        this.selection().remove(item);
        try { item.remove(); } catch { /* Already gone. */ }
      }
      for (const item of insert) if (!this.scene.isInScene(item)) this.scene.insertContentAt(item, anchor.get(item) ?? null);
      this.selection().restore(selected);
    };
    this.push({ label,
      undo: () => restore(placed, descending(victims, before), anchorBefore, selectedBefore, retainedBefore),
      redo: () => restore(victims, descending(placed, after), anchorAfter, selectedAfter, retainedAfter),
    });
  }

  recordDrop(label: string, item: Item, selectedBefore: Item[]): void {
    if (!this.scene.layer || !item || !this.scene.isInScene(item)) return;
    const after = this.scene.contentItems();
    const next = after.slice(after.indexOf(item) + 1).find((candidate) => candidate !== item) ?? null;
    const selectedAfter = this.selection().snapshot();
    this.push({ label,
      undo: () => {
        if (this.scene.isInScene(item)) {
          this.selection().remove(item);
          try { item.remove(); } catch { /* Already gone. */ }
        }
        this.selection().restore(selectedBefore);
      },
      redo: () => {
        if (!this.scene.isInScene(item)) this.scene.insertContentAt(item, next);
        this.selection().restore(selectedAfter);
      },
    });
  }

  recordDelete(before: Item[], selectedBefore: Item[]): void {
    this.recordSceneCommand(selectedBefore.length > 1 ? `Delete ${selectedBefore.length} items` : 'Delete',
      before, selectedBefore, []);
  }

  beginMoveGesture(items: Item[]): void {
    this.moveGesture = items.length ? { items: [...items], points: items.map((item) => item.position?.clone() ?? null) } : null;
  }
  commitMoveGesture(coalesceKey?: string): void {
    const gesture = this.moveGesture; this.moveGesture = null;
    if (!gesture) return;
    const layer = this.scene.layer; const entries: MoveEntry[] = [];
    for (let i = 0; i < gesture.items.length; i++) {
      const item = gesture.items[i]; const before = gesture.points[i];
      if (!item || !before || !item.position || !layer || item.parent !== layer) continue;
      try {
        const after = item.position.clone();
        if (after.getDistance(before) > 1e-9) entries.push({ item, before, after });
      } catch { /* Unmeasurable item. */ }
    }
    this.recordMove(entries, coalesceKey);
  }
  recordMove(entries: MoveEntry[], coalesceKey?: string): void {
    if (!entries.length) return;
    const cmd: MoveCommand = {
      label: entries.length > 1 ? `Move ${entries.length} items` : 'Move', entries,
      undo: () => this.restoreMove(entries, 'before'),
      redo: () => this.restoreMove(entries, 'after'),
    };
    if (coalesceKey !== undefined) {
      cmd.coalesceKey = coalesceKey;
      cmd.absorb = (next: UndoCommand): boolean => {
        const candidate = next as MoveCommand;
        if (!Array.isArray(candidate.entries) || candidate.entries.length !== entries.length) return false;
        if (entries.some((entry, i) => entry.item !== candidate.entries[i].item)) return false;
        entries.forEach((entry, i) => { entry.after = candidate.entries[i].after; });
        return true;
      };
    }
    this.push(cmd);
  }
  private restoreMove(entries: MoveEntry[], position: 'before' | 'after'): void {
    const layer = this.scene.layer;
    for (const entry of entries) if (entry.item && layer && entry.item.parent === layer) {
      try { entry.item.position = entry[position].clone(); } catch { /* Already gone. */ }
    }
  }

  recordScale(items: Item[], factor: number, center: paper.Point): void {
    this.recordAffine('Scale', items,
      () => this.applyAffine(items, (item) => item.scale(1 / factor, center)),
      () => this.applyAffine(items, (item) => item.scale(factor, center)));
  }
  recordRotate(items: Item[], degrees: number, center: paper.Point): void {
    this.recordAffine('Rotate', items,
      () => this.applyAffine(items, (item) => item.rotate(-degrees, center)),
      () => this.applyAffine(items, (item) => item.rotate(degrees, center)));
  }
  private applyAffine(items: Item[], apply: (item: Item) => void): void {
    for (const item of items) if (this.scene.isInScene(item)) {
      try { apply(item); } catch { /* Item was consumed by another operation. */ }
    }
  }
  private recordAffine(label: string, items: Item[], undo: () => void, redo: () => void): void {
    if (!items.length) return;
    this.push({ label, undo, redo });
  }

  recordGroup(group: Item, kids: Item[], at: number, before: Item[]): void {
    const layer = this.scene.layer;
    if (!layer) return;
    this.push({ label: `Group ${kids.length} items`,
      undo: () => {
        const index = Math.max(0, group.index);
        for (let i = kids.length - 1; i >= 0; i--) {
          try { layer.insertChild(Math.min(index, layer.children.length), kids[i]); }
          catch { try { layer.addChild(kids[i]); } catch { /* Detached. */ } }
        }
        this.selection().remove(group); try { group.remove(); } catch { /* Already gone. */ }
        this.selection().restore(before);
      },
      redo: () => {
        for (const kid of kids) if (this.scene.isInScene(kid) && kid.parent !== group) {
          try { group.addChild(kid); } catch { /* Gone. */ }
        }
        if (!this.scene.isInScene(group)) {
          try { layer.insertChild(Math.min(at, layer.children.length), group); }
          catch { try { layer.addChild(group); } catch { /* Detached. */ } }
        }
        this.selection().restore([group]);
      },
    });
  }

  recordUngroup(parts: UngroupPart[], before: Item[], apply: () => Item[]): void {
    const layer = this.scene.layer;
    if (!layer) return;
    this.push({ label: parts.length > 1 ? `Ungroup ${parts.length} groups` : 'Ungroup',
      undo: () => {
        for (const part of parts) {
          for (const kid of part.kids) if (this.scene.isInScene(kid) && kid.parent !== part.group) {
            try { part.group.addChild(kid); } catch { /* Gone. */ }
          }
          if (!this.scene.isInScene(part.group)) {
            try { layer.insertChild(Math.min(part.at, layer.children.length), part.group); }
            catch { try { layer.addChild(part.group); } catch { /* Detached. */ } }
          }
        }
        this.selection().restore(before);
      },
      redo: () => this.selection().restore(apply()),
    });
  }

  recordDuplicate(clones: Item[], before: Item[], after: Item[], retainedBefore: Map<string, RetainedPath>, retainedAfter: Map<string, RetainedPath>): void {
    this.push({ label: clones.length > 1 ? `Duplicate ${clones.length} items` : 'Duplicate',
      undo: () => {
        this.scene.restoreRecords(retainedBefore);
        for (const clone of clones) if (this.scene.isInScene(clone)) {
          this.selection().remove(clone); try { clone.remove(); } catch { /* Already gone. */ }
        }
        this.selection().restore(before);
      },
      redo: () => {
        this.scene.restoreRecords(retainedAfter);
        for (const clone of clones) if (!this.scene.isInScene(clone)) this.scene.insertContentAt(clone, null);
        this.selection().restore(after);
      },
    });
  }

  recordReorder(place: 'front' | 'back', before: Item[], after: Item[], selected: Item[]): void {
    const layer = this.scene.layer;
    if (!layer) return;
    const apply = (order: Item[]) => {
      for (const item of order) try { layer.addChild(item); } catch { /* Detached. */ }
    };
    this.push({ label: place === 'front' ? 'Bring to Front' : 'Send to Back',
      undo: () => { apply(before.filter((item) => this.scene.isInScene(item))); this.selection().restore(selected); },
      redo: () => { apply(after.filter((item) => this.scene.isInScene(item))); this.selection().restore(selected); },
    });
  }

  // Restore plain model records first, then rebuild their derived Paper items.
  // This remains independent of document persistence and file formats.
  recordModelChange(label: string, before: NGDrawable[], after: NGDrawable[], host: ModelCommandHost): void {
    const oldRecords = structuredClone(before); const newRecords = structuredClone(after);
    const ids = new Set([...before, ...after].map((drawable) => drawable.id));
    const restore = (records: NGDrawable[]) => {
      const byId = new Map(records.map((drawable) => [drawable.id, drawable]));
      for (const id of ids) if (!byId.has(id)) host.removeModel(id);
      for (const drawable of records) host.upsertModel(structuredClone(drawable));
      for (const drawable of records) host.renderFromModel(drawable.id);
    };
    this.push({ label, undo: () => restore(oldRecords), redo: () => restore(newRecords) });
  }
}
