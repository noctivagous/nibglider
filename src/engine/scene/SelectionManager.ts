// Selection intent and Paper mutations. HistoryManager records undo entries.
import { HistoryManager } from '../history/HistoryManager';
import { SceneRepository } from './SceneRepository';

type Item = any;

/** Floating Marker parity: selected drawables carry a two-tone halo — a light
 * Paper selection outline over a dark blurred glow — so the selection reads
 * on any background, unlike a single flat outline color. See
 * refs/selection-halo-options.md for the alternatives considered. */
const SELECTION_GLOW_BLUR = 7;
/** Hot blur while the settle pulse fires on a discrete selection commit. */
const SELECTION_PULSE_BLUR = 14;
/** Settle delay before the pulse decays to the steady halo. */
const SELECTION_PULSE_MS = 280;

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export class SelectionManager {
  private items: Item[] = [];
  private readonly scene: SceneRepository;
  private readonly history: HistoryManager;
  private readonly retainClone: (original: Item, clone: Item) => void;
  private glowSuspended = false;

  constructor(scene: SceneRepository, history: HistoryManager,
    retainClone: (original: Item, clone: Item) => void) {
    this.scene = scene; this.history = history; this.retainClone = retainClone;
  }
  get selectedItems(): Item[] { return this.items; }
  get hasSelection(): boolean { return this.items.length > 0; }
  snapshot(): Item[] { return [...this.items]; }

  add(item: Item): void {
    if (!item || this.scene.isNonContentItem(item) || this.items.includes(item)) return;
    this.mark(item, true); this.items.push(item);
    this.firePulse();
  }
  remove(item: Item): void {
    const index = this.items.indexOf(item);
    if (index < 0) return;
    this.mark(item, false); this.items.splice(index, 1);
  }
  clear(): void {
    for (const item of this.items) {
      try { this.mark(item, false); } catch { /* Already gone. */ }
    }
    this.items = [];
  }
  restore(items: Item[], opts?: { quiet?: boolean }): void {
    this.clear();
    for (const item of items) {
      if (!item || !this.scene.isInScene(item) || this.items.includes(item)) continue;
      try { this.mark(item, true); this.items.push(item); } catch { /* Already gone. */ }
    }
    // Continuous updates (marquee live-select, Esc) stay quiet so dragging
    // never shimmers; discrete commits fire the settle pulse.
    if (!opts?.quiet && this.items.length > 0) this.firePulse();
  }
  /** Re-fire the settle pulse on the current selection (e.g. marquee commit). */
  pulse(): void {
    if (this.items.length > 0) this.firePulse();
  }
  toggle(item: Item): void { if (this.items.includes(item)) this.remove(item); else this.add(item); }
  prepend(item: Item): void {
    this.remove(item);
    if (!item || this.scene.isNonContentItem(item)) return;
    this.mark(item, true); this.items.unshift(item);
  }
  /** Drop the glow (print/export) without changing membership. */
  suspendGlow(): void {
    this.glowSuspended = true;
    this.pulseGeneration += 1;
    for (const item of this.items) {
      try { this.clearGlow(item); } catch { /* Already gone. */ }
    }
    this.refresh();
  }
  /** Re-apply the glow after suspendGlow. */
  restoreGlow(): void {
    this.glowSuspended = false;
    for (const item of this.items) {
      try { this.applyGlow(item, SELECTION_GLOW_BLUR); } catch { /* Already gone. */ }
    }
    this.refresh();
  }
  private mark(item: Item, on: boolean): void {
    item.selected = on;
    if (on && !this.glowSuspended) this.applyGlow(item, SELECTION_GLOW_BLUR);
    else if (!on) this.clearGlow(item);
  }
  private applyGlow(item: Item, blur: number): void {
    item.selectedColor = new this.scene.scope.Color(1, 1, 1);
    item.shadowColor = new this.scene.scope.Color(0, 0, 0, 0.85);
    item.shadowBlur = blur;
    item.shadowOffset = new this.scene.scope.Point(0, 0);
  }
  private clearGlow(item: Item): void {
    item.shadowColor = null;
    item.shadowBlur = 0;
  }
  /**
   * Settle pulse: the glow fires hot, then decays to steady. A generation
   * counter retires stale timers from rapid re-selection or suspends.
   */
  private pulseGeneration = 0;
  private firePulse(): void {
    if (this.glowSuspended || prefersReducedMotion()) return;
    const generation = ++this.pulseGeneration;
    for (const item of this.items) {
      try { this.applyGlow(item, SELECTION_PULSE_BLUR); } catch { /* Already gone. */ }
    }
    this.refresh();
    setTimeout(() => {
      if (generation !== this.pulseGeneration || this.glowSuspended) return;
      for (const item of this.items) {
        try { this.applyGlow(item, SELECTION_GLOW_BLUR); } catch { /* Already gone. */ }
      }
      this.refresh();
    }, SELECTION_PULSE_MS);
  }
  private refresh(): void {
    try { this.scene.scope.view?.update(); } catch { /* Headless. */ }
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
    this.history.recordGroup(group, [...members], at, before);
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
    this.history.recordUngroup(parts, before, apply);
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
    this.history.recordDuplicate(clones, before, after, retainedBefore, retainedAfter);
    return true;
  }

  reorder(place: 'front' | 'back'): boolean {
    const layer = this.scene.layer; const targets = this.topLevelSelected();
    if (!layer || !targets.length) return false;
    const before = [...layer.children] as Item[];
    const set = new Set(targets); const rest = before.filter((item) => !set.has(item));
    const after = place === 'front' ? [...rest, ...targets] : [...targets, ...rest];
    for (const item of after) try { layer.addChild(item); } catch { /* Detached. */ }
    const selected = this.snapshot();
    this.history.recordReorder(place, before, after, selected);
    return true;
  }
  bringToFront(): boolean { return this.reorder('front'); }
  sendToBack(): boolean { return this.reorder('back'); }
}
