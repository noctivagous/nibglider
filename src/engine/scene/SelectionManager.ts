// Selection intent and commands. Paper collection details and undo closures
// stay here; the engine only decides when an intent is allowed and publishes UI.
import type { UndoCommand } from '../undoManager';
import { SceneRepository } from './SceneRepository';

type Item = any;
export class SelectionManager {
  private items: Item[] = [];
  private readonly scene: SceneRepository;
  private readonly push: (command: UndoCommand) => void;
  private readonly retainClone: (original: Item, clone: Item) => void;

  constructor(scene: SceneRepository, push: (command: UndoCommand) => void,
    retainClone: (original: Item, clone: Item) => void) {
    this.scene = scene; this.push = push; this.retainClone = retainClone;
  }
  get selectedItems(): Item[] { return this.items; }
  get hasSelection(): boolean { return this.items.length > 0; }
  snapshot(): Item[] { return [...this.items]; }

  add(item: Item): void {
    if (!item || this.scene.isNonContentItem(item) || this.items.includes(item)) return;
    item.selected = true; this.items.push(item);
  }
  remove(item: Item): void {
    const index = this.items.indexOf(item);
    if (index < 0) return;
    item.selected = false; this.items.splice(index, 1);
  }
  clear(): void {
    for (const item of this.items) {
      try { item.selected = false; } catch { /* Already gone. */ }
    }
    this.items = [];
  }
  restore(items: Item[]): void {
    this.clear();
    for (const item of items) {
      if (!item || !this.scene.isInScene(item) || this.items.includes(item)) continue;
      try { item.selected = true; this.items.push(item); } catch { /* Already gone. */ }
    }
  }
  toggle(item: Item): void { if (this.items.includes(item)) this.remove(item); else this.add(item); }
  prepend(item: Item): void {
    this.remove(item);
    if (!item || this.scene.isNonContentItem(item)) return;
    item.selected = true; this.items.unshift(item);
  }
  removeAll(): Item[] {
    const before = this.snapshot();
    for (const item of before) {
      this.remove(item);
      try { item.remove(); } catch { /* Detached already. */ }
    }
    return before;
  }

  collectiveBounds(items: Item[]): Item {
    let bounds: Item = null;
    for (const item of items) bounds = bounds ? bounds.unite(item.bounds) : item.bounds.clone();
    return bounds;
  }
  collectiveCenter(items: Item[]): Item {
    return this.collectiveBounds(items)?.center ?? new this.scene.scope.Point(0, 0);
  }
  topUserGroupOf(item: Item): Item {
    let current = item;
    while (current?.parent?.data?.isUserGroup) current = current.parent;
    return current;
  }
  topLevelSelected(): Item[] {
    const layer = this.scene.layer;
    const seen = new Set<Item>(); const out: Item[] = [];
    for (const item of this.items) {
      if (!item || !this.scene.isInScene(item)) continue;
      const top = this.topUserGroupOf(item);
      if (seen.has(top)) continue;
      seen.add(top);
      if (top.parent === layer) out.push(top);
    }
    return out;
  }
  groupableMembers(): Item[] { return this.topLevelSelected(); }
  get canGroup(): boolean { return this.groupableMembers().length >= 2; }
  get canUngroup(): boolean { return this.items.some((item) => item?.data?.isUserGroup && this.scene.isInScene(item)); }
  get canDuplicate(): boolean { return this.topLevelSelected().length > 0; }
  get canReorder(): boolean { return this.topLevelSelected().length > 0; }

  group(): boolean {
    const members = this.groupableMembers(); const layer = this.scene.layer;
    if (!layer || members.length < 2) return false;
    const before = this.snapshot();
    const at = Math.min(...members.map((m) => m.index));
    const group: Item = new this.scene.scope.Group(members);
    group.data.isUserGroup = true;
    try { layer.insertChild(Math.min(at, layer.children.length), group); }
    catch { try { layer.addChild(group); } catch { return false; } }
    this.restore([group]);
    const kids = [...members];
    this.push({
      label: `Group ${kids.length} items`,
      undo: () => {
        const index = Math.max(0, group.index);
        for (let i = kids.length - 1; i >= 0; i--) {
          try { layer.insertChild(Math.min(index, layer.children.length), kids[i]); }
          catch { try { layer.addChild(kids[i]); } catch { /* Detached. */ } }
        }
        this.remove(group); try { group.remove(); } catch { /* Already gone. */ }
        this.restore(before);
      },
      redo: () => {
        for (const kid of kids) if (this.scene.isInScene(kid) && kid.parent !== group) {
          try { group.addChild(kid); } catch { /* Gone. */ }
        }
        if (!this.scene.isInScene(group)) {
          try { layer.insertChild(Math.min(at, layer.children.length), group); }
          catch { try { layer.addChild(group); } catch { /* Detached. */ } }
        }
        this.restore([group]);
      },
    });
    return true;
  }

  ungroup(): boolean {
    const groups = this.items.filter((item) => item?.data?.isUserGroup && this.scene.isInScene(item));
    const layer = this.scene.layer;
    if (!layer || !groups.length) return false;
    const before = this.snapshot();
    const parts = groups.map((group: Item) => ({ group, kids: [...group.children] as Item[], at: Math.max(0, group.index) }));
    const apply = (): Item[] => {
      const out: Item[] = [];
      for (const part of parts) {
        this.remove(part.group);
        const kids = [...part.group.children] as Item[];
        kids.forEach((kid, i) => {
          try { layer.insertChild(Math.min(part.at + i, layer.children.length), kid); }
          catch { try { layer.addChild(kid); } catch { /* Detached. */ } }
        });
        try { part.group.remove(); } catch { /* Already gone. */ }
        out.push(...kids.filter((kid) => this.scene.isInScene(kid)));
      }
      return out;
    };
    this.restore(apply());
    this.push({
      label: groups.length > 1 ? `Ungroup ${groups.length} groups` : 'Ungroup',
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
        this.restore(before);
      },
      redo: () => this.restore(apply()),
    });
    return true;
  }

  duplicate(): boolean {
    const sources = this.topLevelSelected();
    if (!sources.length) return false;
    const before = this.snapshot(); const retainedBefore = this.scene.snapshotRecords();
    const clones: Item[] = []; const step = new this.scene.scope.Point(20, 20);
    for (const item of sources) {
      try {
        const copy = item.clone(); this.retainClone(item, copy); copy.translate(step);
        if (this.scene.isInScene(copy)) clones.push(copy);
      } catch { /* This source could not be cloned. */ }
    }
    if (!clones.length) return false;
    this.restore(clones);
    const after = this.snapshot(); const retainedAfter = this.scene.snapshotRecords();
    this.push({
      label: clones.length > 1 ? `Duplicate ${clones.length} items` : 'Duplicate',
      undo: () => {
        this.scene.restoreRecords(retainedBefore);
        for (const clone of clones) if (this.scene.isInScene(clone)) {
          this.remove(clone); try { clone.remove(); } catch { /* Already gone. */ }
        }
        this.restore(before);
      },
      redo: () => {
        this.scene.restoreRecords(retainedAfter);
        for (const clone of clones) if (!this.scene.isInScene(clone)) this.scene.insertContentAt(clone, null);
        this.restore(after);
      },
    });
    return true;
  }

  reorder(place: 'front' | 'back'): boolean {
    const layer = this.scene.layer; const targets = this.topLevelSelected();
    if (!layer || !targets.length) return false;
    const before = [...layer.children] as Item[];
    const set = new Set(targets); const rest = before.filter((item) => !set.has(item));
    const after = place === 'front' ? [...rest, ...targets] : [...targets, ...rest];
    const apply = (order: Item[]) => {
      for (const item of order) try { layer.addChild(item); } catch { /* Detached. */ }
    };
    apply(after);
    const selected = this.snapshot();
    this.push({
      label: place === 'front' ? 'Bring to Front' : 'Send to Back',
      undo: () => { apply(before.filter((item) => this.scene.isInScene(item))); this.restore(selected); },
      redo: () => { apply(after.filter((item) => this.scene.isInScene(item))); this.restore(selected); },
    });
    return true;
  }
  bringToFront(): boolean { return this.reorder('front'); }
  sendToBack(): boolean { return this.reorder('back'); }
}
