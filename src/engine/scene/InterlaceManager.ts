// Interlace: turn two intersecting stroked paths into an over/under weave.
// Crossings are found on spine centerlines; at each crossing the under-side
// band loses its overlap with the padded over-band, so exports stay clean.
// Gaps alone produce the weave — no restacking is needed, since the
// background shows through each gap regardless of paint order. Results bake
// the expansion and lower to Bézier, like other boolean results.
// Public: canInterlaceSelection, interlaceSelection.

import type { CombinatoricsHost } from './CombinatoricsManager';
import type { NGBezierPath, NGCompositePath, NGBSplinePath, NGOutlinedStrokePath, NGPath } from '../model/NGPath';
import type { BezierSegment, ResolvedVectorGeometry, Vec2 } from '../model/geometryResolution';
import { resolveOutlinedStroke } from '../geometry/outlinedStroke';
import { resolvePath } from '../geometry/pathResolver';
import { canvasStrokeOf, clusterSlots, crossingKey, gapPadding, gapRectFor } from '../geometry/interlaceWeave';
import type { WeaveMember } from '../geometry/interlaceWeave';
import { hasBooleanArea } from '../geometry/booleanResolver';

type Item = any;
type Scope = any;

export interface InterlaceHost extends CombinatoricsHost {
  paperScope(): Scope;
  /** Authoring source when the scene knows one (model or retained record). */
  pathSourceOf(item: Item): NGPath | null;
  /** Current geometry of any path item as a Bézier record. */
  bezierSourceOf(item: Item): NGBezierPath;
  /** Authoring record still held for a past source id (live lookup). */
  sourceById?(id: string): NGPath | null;
  /** Push one custom undo entry (label, undo, redo). */
  recordCustom(label: string, undo: () => void, redo: () => void): void;
}

/** Spine modes the weaver can re-expand. Smoothed polylines stay out. */
type WeavableSource = NGBezierPath | NGCompositePath | NGBSplinePath | NGOutlinedStrokePath;

/** One weave member's authoring truth, kept on every baked band so later
 * runs and added shapes re-expand from parametric sources instead of a
 * flattened Bézier snapshot. */
export interface InterlaceSourceEntry {
  id: string;
  source: WeavableSource;
  width: number;
  cap: string;
  join: string;
  miterLimit: number;
  dashLength: number;
  gapLength: number;
  position: string;
}

interface InterlaceMemo {
  peer: string;
  phase: 0 | 1;
  /** First-role source id, keeping roles stable on re-run. Legacy pair
   * memos hold the first-role band's drawable id instead. */
  first: string;
  /** Shared bake id; '' on legacy pair memos. */
  weave: string;
  /** Member source ids in weave order. */
  order: string[];
  /** Full member records; empty on legacy pair memos. */
  sources: InterlaceSourceEntry[];
  /** This band's authoring source id, or null when it baked from a plain
   * canvas stroke with no record. */
  sourceId: string | null;
  /** This band's authoring source snapshot; null for record-less strokes. */
  source: WeavableSource | null;
  /** Per-crossing over picks for the whole weave, shared by every band. */
  overrides: Record<string, string>;
  width: number;
  cap: string;
  join: string;
  miterLimit: number;
  dashLength: number;
  gapLength: number;
  position: string;
  spine: { closed: boolean; segments: BezierSegment[] };
}

interface StrokeStyle {
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  dashLength: number;
  gapLength: number;
  position: 'center' | 'inside' | 'outside';
}

interface Ribbon {
  item: Item;
  /** Temp uninserted centerline, except plain paths where it is the item. */
  spine: Item;
  /** The band to cut: the item itself for record bands, else a temp expansion. */
  band: Item;
  width: number;
  style: StrokeStyle;
  /** Stable authoring source id, or null for record-less canvas strokes. */
  sourceId: string | null;
  /** Full authoring record when one exists, else null (Bézier fallback). */
  authoring: WeavableSource | null;
}

/** One weave member resolved for a bake: authoring truth plus its scene
 * item when one is present (fresh strokes and surviving bands). */
interface WeaveEntry {
  id: string;
  source: WeavableSource;
  width: number;
  style: StrokeStyle;
  item: Item | null;
  fresh: boolean;
}

/** Group-side weave params: phase/padding/first plus per-crossing picks. */
export interface InterlaceGroupParams {
  phase: 0 | 1;
  padding: number;
  firstId: string;
  overrides: Record<string, string>;
}

type InterlacePlan =
  | { kind: 'fresh'; entries: WeaveEntry[]; firstId: string; phase: 0 | 1; weave: string; overrides: Record<string, string>; label: string }
  | { kind: 'rerun'; entries: WeaveEntry[]; firstId: string; phase: 0 | 1; weave: string; overrides: Record<string, string>; label: string }
  | { kind: 'add'; entries: WeaveEntry[]; firstId: string; phase: 0 | 1; weave: string; overrides: Record<string, string>; label: string };

/** One enumerated crossing: stable key, display number, winner, center. */
export interface InterlaceCrossingInfo {
  key: string;
  number: number;
  overId: string;
  underId: string;
  x: number;
  y: number;
}

export interface InterlaceWeaveDescription {
  members: string[];
  phase: 0 | 1;
  crossings: InterlaceCrossingInfo[];
}

/** Group params equality including the override map. */
function paramsEqual(a: InterlaceGroupParams, b: InterlaceGroupParams): boolean {
  if (a.phase !== b.phase || a.padding !== b.padding || a.firstId !== b.firstId) return false;
  const keysA = Object.keys(a.overrides);
  const keysB = Object.keys(b.overrides);
  return keysA.length === keysB.length
    && keysA.every((key) => b.overrides[key] === a.overrides[key]);
}

const NO_CROSSINGS_NOTE = 'No crossings — paths do not intersect.';
const SELECT_NOTE = 'Select two or more intersecting stroked paths first.';
const ADD_SELECT_NOTE = 'Select a baked interlace result plus new crossing strokes.';
const MIXED_NOTE = 'Select bands from one baked weave at a time.';
const EMPTY_NOTE = 'No result — the gaps consumed a band.';

export class InterlaceManager {
  private readonly host: InterlaceHost;
  constructor(host: InterlaceHost) { this.host = host; }

  canInterlaceSelection(): boolean {
    const items = [...this.host.selectedItems()];
    const temps: Item[] = [];
    try {
      return this.classify(items, temps) !== null;
    } catch {
      return false;
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
  }

  interlaceSelection(): void {
    const host = this.host;
    // Copy refs first: selectedItems() is the live selection array, and
    // placement edits below would shift it mid-loop.
    const items = [...host.selectedItems()];
    const snap = host.capture();
    const temps: Item[] = [];
    try {
      const plan = this.classify(items, temps);
      if (!plan) {
        host.setCombineNote(this.failNote(items));
        host.updateTextContent();
        host.notify();
        return;
      }
      if (!this.bakeWeave(plan, temps, snap)) {
        host.setCombineNote(EMPTY_NOTE);
        host.updateTextContent();
        host.notify();
        return;
      }
      host.setCombineNote('');
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
    host.updateTextContent();
    host.notify();
  }

  // Hint matching the selection shape when classify() rejects it: a mixed
  // weave selection names the add flow, while two weavable fresh strokes
  // that merely miss each other keep the legacy no-crossings note.
  private failNote(items: Item[]): string {
    if (items.some((item) => this.memoOf(item))) {
      const keys = new Set(items.map((item) => {
        const memo = this.memoOf(item);
        return memo ? this.weaveKey(memo, item?.data?.drawableId) : '';
      }).filter(Boolean));
      if (keys.size > 1) return MIXED_NOTE;
      return ADD_SELECT_NOTE;
    }
    if (items.length >= 2 && items.every((item) => item)
      && new Set(items).size === items.length && !items.some((item) => this.memoOf(item))) {
      const local: Item[] = [];
      try {
        if (items.every((item) => this.ribbonFor(item, local))) return NO_CROSSINGS_NOTE;
      } catch { /* Fall through to the selection hint. */ }
      finally {
        for (const temp of local) this.removeDetached(temp);
      }
    }
    return SELECT_NOTE;
  }

  // Shared weave key for one bake: the v2 weave id, or the legacy pair link.
  private weaveKey(memo: InterlaceMemo, itemId: unknown): string {
    if (memo.weave) return `weave:${memo.weave}`;
    const ids = [typeof itemId === 'string' ? itemId : '', memo.peer].sort();
    return `legacy:${ids[0]}|${ids[1]}`;
  }

  // Route a selection to one bake: a fresh connected set, a re-run of a
  // whole baked weave (phase flip), or an add of fresh strokes to a baked
  // weave (phase kept). Unselected bands of the weave auto-join, so
  // selecting any band plus new strokes reweaves everything. Temps collect
  // temp spines; the caller owns disposal.
  private classify(items: Item[], temps: Item[]): InterlacePlan | null {
    const clean = items.filter((item) => item);
    if (!clean.length) return null;
    const bandItems = clean.filter((item) => this.memoOf(item));
    const freshItems = clean.filter((item) => !this.memoOf(item));
    if (!bandItems.length) {
      // Fresh multi-weave: any connected set of two or more weavable
      // strokes bakes in one op — pairs run in selection order with the
      // pair-ordinal alternation, so two still behave exactly as before.
      if (freshItems.length < 2 || new Set(freshItems).size !== freshItems.length) return null;
      const ribbons: Ribbon[] = [];
      for (const item of freshItems) {
        const ribbon = this.ribbonFor(item, temps);
        if (!ribbon) return null;
        ribbons.push(ribbon);
      }
      // Every member must cross another, or it would bake unchanged and
      // silently join the memo list.
      const freshSpines = ribbons.map((ribbon) => ribbon.spine);
      const touches = (n: number): boolean => freshSpines.some((other, m) =>
        m !== n && this.crossings(freshSpines[n], other).length > 0);
      if (!ribbons.every((_, n) => touches(n))) return null;
      let entries: WeaveEntry[];
      try {
        entries = ribbons.map((ribbon) => this.entryOf(ribbon, true));
      } catch {
        return null;
      }
      return { kind: 'fresh', entries, firstId: entries[0].id, phase: 0,
        weave: crypto.randomUUID(), overrides: {}, label: 'Interlace' };
    }
    const keys = new Set(bandItems.map((item) =>
      this.weaveKey(this.memoOf(item)!, item?.data?.drawableId)));
    if (keys.size !== 1) return null;
    const key = [...keys][0];
    const weaveBands = this.weaveBands(key, bandItems);
    if (!weaveBands.length) return null;
    const entries = this.weaveEntries(weaveBands);
    if (!entries.length) return null;
    const first = entries.find((entry) => entry.id === this.weaveFirst(weaveBands)) ?? entries[0];
    // Reorder entries so the first-role member leads: pair alternation then
    // matches the legacy pair behavior exactly.
    const ordered = [first, ...entries.filter((entry) => entry !== first)];
    if (!freshItems.length) {
      const phase = ((1 - this.weavePhase(weaveBands)) as 0 | 1);
      return { kind: 'rerun', entries: ordered, firstId: first.id, phase,
        weave: this.weaveId(weaveBands), overrides: this.weaveOverrides(weaveBands), label: 'Interlace' };
    }
    const fresh: WeaveEntry[] = [];
    try {
      for (const item of freshItems) {
        const ribbon = this.ribbonFor(item, temps);
        if (!ribbon) return null;
        fresh.push(this.entryOf(ribbon, true));
      }
    } catch {
      return null;
    }
    const all = [...ordered, ...fresh];
    // Every added stroke must cross the existing weave, or it would bake
    // unchanged and silently join the memo list.
    const spines = this.entrySpines(ordered, temps);
    if (!spines) return null;
    for (const entry of fresh) {
      const spine = this.entrySpine(entry, temps);
      if (!spine) return null;
      const touches = spines.some((other) => this.crossings(spine, other).length > 0);
      if (!touches) return null;
    }
    return { kind: 'add', entries: all, firstId: first.id,
      phase: this.weavePhase(weaveBands), weave: this.weaveId(weaveBands),
      overrides: this.weaveOverrides(weaveBands), label: 'Interlace Add' };
  }

  // One planned cut per crossing cluster, in display order: pairs run in
  // weave order, crossings sort along the earlier member, and alternation
  // offsets by pair ordinal so appended members never shift existing pairs'
  // gaps. An override naming one pair member takes that crossing over.
  // Crossings whose gap windows overlap (a corner region crossed twice)
  // merge into one cut under the first member's roles. The cutter is the
  // overlap of the padded over-band at those centers, so the edge follows
  // the band however the strokes actually overlap. Lone crossings plan
  // alone.
  private planCrossings(
    entries: Array<{ id: string; width: number }>, spines: Item[], phase: 0 | 1,
    overrides: Record<string, string>, padding?: number,
  ): Array<{ key: string; over: number; unders: number[]; involved: number[]; center: Vec2; centers: Vec2[] }> {
    const solo: Array<{ key: string; pair: [number, number]; over: number; under: number; center: Vec2; halfLen: number }> = [];
    let pairOrdinal = 0;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const crossings = this.crossings(spines[i], spines[j]);
        for (let k = 0; k < crossings.length; k++) {
          const key = crossingKey(entries[i].id, entries[j].id, k);
          const explicit = overrides[key];
          const overFirst = explicit === entries[i].id ? true
            : explicit === entries[j].id ? false
            : (k + phase + pairOrdinal) % 2 === 0;
          const over = overFirst ? i : j; const under = overFirst ? j : i;
          const sine = this.crossingSine(spines[i], spines[j], crossings[k],
            entries[i].width, entries[j].width);
          const halfLen = gapRectFor(0, entries[over].width, entries[under].width,
            sine, padding).length / 2;
          solo.push({ key, pair: [i, j], over, under, center: crossings[k], halfLen });
        }
        pairOrdinal++;
      }
    }
    return clusterSlots(solo).map((group) => {
      const head = solo[group[0]];
      const unders: number[] = [];
      const involved: number[] = [];
      const centers: Vec2[] = [];
      for (const m of group) {
        centers.push(solo[m].center);
        if (!unders.includes(solo[m].under)) unders.push(solo[m].under);
        for (const band of solo[m].pair) {
          if (!involved.includes(band)) involved.push(band);
        }
      }
      // Absorbed members lose their own over side: one connected daylight
      // region admits a single winner, so the head's over stands and every
      // other involved band is cut.
      const targets = unders.filter((u) => u !== head.over);
      return { key: head.key, over: head.over, unders: targets,
        involved, center: head.center, centers };
    });
  }

  // Centerline direction vectors of two spines around a crossing, sampled
  // across an epsilon window. Symmetric in the spines; null when either
  // spine cannot be sampled (callers fall back to axis-aligned defaults).
  private crossingTangents(spineA: Item, spineB: Item, center: Vec2,
    widthA: number, widthB: number): { a: Vec2; b: Vec2 } | null {
    try {
      const scope = this.host.paperScope();
      const epsilon = Math.max(0.5, (widthA + widthB) / 4);
      const at = new scope.Point(center.x, center.y);
      const offA = spineA.getOffsetOf(at);
      const offB = spineB.getOffsetOf(at);
      if (!Number.isFinite(offA) || !Number.isFinite(offB)) return null;
      const a0 = spineA.getPointAt(Math.max(0, offA - epsilon));
      const a1 = spineA.getPointAt(offA + epsilon);
      const b0 = spineB.getPointAt(Math.max(0, offB - epsilon));
      const b1 = spineB.getPointAt(offB + epsilon);
      const a = { x: a1.x - a0.x, y: a1.y - a0.y };
      const b = { x: b1.x - b0.x, y: b1.y - b0.y };
      if (Math.hypot(a.x, a.y) < 1e-9 || Math.hypot(b.x, b.y) < 1e-9) return null;
      return { a, b };
    } catch {
      return null;
    }
  }

  // Absolute sine between two spines at a crossing; 1 when unsampleable.
  private crossingSine(spineA: Item, spineB: Item, center: Vec2,
    widthA: number, widthB: number): number {
    const tan = this.crossingTangents(spineA, spineB, center, widthA, widthB);
    if (!tan) return 1;
    const la = Math.hypot(tan.a.x, tan.a.y); const lb = Math.hypot(tan.b.x, tan.b.y);
    if (!(la > 1e-9) || !(lb > 1e-9)) return 1;
    return Math.abs(tan.a.x * tan.b.y - tan.a.y * tan.b.x) / (la * lb);
  }

  // Enumerate one weave's crossings for picking UI: members in order plus
  // every crossing with its stable key, number, winner, and center. The
  // entries must already lead with the first-role member (as classify and
  // the group path order them), so keys match the bake exactly.
  private describeEntries(
    entries: WeaveEntry[], phase: 0 | 1, overrides: Record<string, string>, temps: Item[],
    padding?: number,
  ): InterlaceWeaveDescription | null {
    const spines = this.entrySpines(entries, temps);
    if (!spines) return null;
    const planned = this.planCrossings(entries, spines, phase, overrides, padding);
    return {
      members: entries.map((entry) => entry.id),
      phase,
      crossings: planned.map((cross, n) => ({
        key: cross.key,
        number: n + 1,
        overId: entries[cross.over].id,
        underId: entries[cross.unders[0]].id,
        x: Math.round(cross.center.x * 10) / 10,
        y: Math.round(cross.center.y * 10) / 10,
      })),
    };
  }

  // Baked bands of one weave in the current selection (no fresh strokes):
  // auto-include unselected bands so partial selections still describe the
  // whole result. Null unless the selection holds such bands.
  private selectedBakedBands(): Item[] | null {
    const selected = [...this.host.selectedItems()].filter((item) => item && this.memoOf(item));
    if (!selected.length) return null;
    if ([...this.host.selectedItems()].some((item) => item && !this.memoOf(item))) return null;
    const keys = new Set(selected.map((item) =>
      this.weaveKey(this.memoOf(item)!, item?.data?.drawableId)));
    if (keys.size !== 1) return null;
    return this.weaveBands([...keys][0], selected);
  }

  /** Crossing list for the selected baked weave, or null. */
  describeBakedSelection(): InterlaceWeaveDescription | null {
    const bands = this.selectedBakedBands();
    if (!bands) return null;
    const entries = this.weaveEntries(bands);
    if (!entries.length) return null;
    const first = entries.find((entry) => entry.id === this.weaveFirst(bands)) ?? entries[0];
    const ordered = [first, ...entries.filter((entry) => entry !== first)];
    const temps: Item[] = [];
    try {
      return this.describeEntries(ordered, this.weavePhase(bands), this.weaveOverrides(bands), temps);
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
  }

  /** Flip one baked crossing's over side and re-bake with the phase kept.
   * The pick is stored as an explicit override, so later phase flips and
   * added shapes keep it. One scene commit covers the re-bake. */
  flipBakedCrossing(key: string): void {
    const host = this.host;
    const bands = this.selectedBakedBands();
    if (!bands || typeof key !== 'string' || !key) {
      host.setCombineNote('Select a baked interlace result first.');
      host.updateTextContent();
      host.notify();
      return;
    }
    const snap = host.capture();
    const temps: Item[] = [];
    try {
      const entries = this.weaveEntries(bands);
      if (!entries.length) {
        host.setCombineNote('Select a baked interlace result first.');
        host.updateTextContent();
        host.notify();
        return;
      }
      const first = entries.find((entry) => entry.id === this.weaveFirst(bands)) ?? entries[0];
      const ordered = [first, ...entries.filter((entry) => entry !== first)];
      const phase = this.weavePhase(bands);
      const weave = this.weaveId(bands);
      const overrides = this.weaveOverrides(bands);
      const spines = this.entrySpines(ordered, temps);
      if (!spines) {
        host.setCombineNote(EMPTY_NOTE);
        host.updateTextContent();
        host.notify();
        return;
      }
      const planned = this.planCrossings(ordered, spines, phase, overrides);
      const target = planned.find((cross) => cross.key === key);
      if (!target) {
        host.setCombineNote('Crossing not found — the weave may have changed.');
        host.updateTextContent();
        host.notify();
        return;
      }
      const next = { ...overrides };
      const other = target.involved.find((band) => band !== target.over) ?? target.unders[0];
      next[key] = ordered[other].id;
      if (!this.bakeWeave({ kind: 'rerun', entries: ordered, firstId: first.id,
        phase, weave, overrides: next, label: 'Interlace Crossing' }, temps, snap)) {
        host.setCombineNote(EMPTY_NOTE);
        host.updateTextContent();
        host.notify();
        return;
      }
      host.setCombineNote('');
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
    host.updateTextContent();
    host.notify();
  }

  /** Crossing list for the selected interlace group, or null. */
  describeGroupSelection(): InterlaceWeaveDescription | null {
    const selected = this.host.selectedItems();
    const group = selected.length === 1 ? selected[0] : null;
    const stored = group?.data?.interlaceGroup;
    if (!group || !stored || !Array.isArray(stored.members) || stored.members.length !== 2) return null;
    const params = this.groupParams(stored.params, stored.members);
    if (!params) return null;
    const members = stored.members as WeaveMember[];
    const first = members.find((member) => member.id === params.firstId) ?? members[0];
    const ordered = [first, ...members.filter((member) => member !== first)];
    const entries: WeaveEntry[] = ordered.map((member) => ({
      id: member.id, source: member.source, width: member.stroke.width,
      style: { ...member.stroke }, item: null, fresh: false,
    }));
    const temps: Item[] = [];
    try {
      return this.describeEntries(entries, params.phase, params.overrides, temps, params.padding);
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
  }

  // Normalized group params: phase/padding/first validated, overrides
  // default to {} on older groups and drop non-member values.
  private groupParams(raw: unknown, members: WeaveMember[]): InterlaceGroupParams | null {
    if (!raw || typeof raw !== 'object') return null;
    const params = raw as Record<string, unknown>;
    if (params.phase !== 0 && params.phase !== 1) return null;
    if (!(typeof params.padding === 'number') || !(params.padding >= 0)
      || !Number.isFinite(params.padding)) return null;
    if (typeof params.firstId !== 'string') return null;
    const ids = new Set(members.map((member) => member.id));
    const overrides: Record<string, string> = {};
    const rawOverrides = params.overrides;
    if (rawOverrides !== undefined) {
      if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) return null;
      for (const [key, over] of Object.entries(rawOverrides as Record<string, unknown>)) {
        if (typeof over !== 'string' || !ids.has(over)) return null;
        overrides[key] = over;
      }
    }
    return { phase: params.phase, padding: params.padding, firstId: params.firstId, overrides };
  }

  /** Flip one group crossing's over side in place with undo. */
  flipGroupCrossing(key: string): void {
    const host = this.host;
    const described = this.describeGroupSelection();
    if (!described || typeof key !== 'string' || !key) {
      host.setCombineNote('Select an interlace group first.');
      host.updateTextContent();
      host.notify();
      return;
    }
    const target = described.crossings.find((cross) => cross.key === key);
    if (!target) {
      host.setCombineNote('Crossing not found — the weave may have changed.');
      host.updateTextContent();
      host.notify();
      return;
    }
    const selected = host.selectedItems();
    const stored = selected[0]?.data?.interlaceGroup;
    const params = this.groupParams(stored.params, stored.members);
    if (!params) {
      host.setCombineNote('Select an interlace group first.');
      host.updateTextContent();
      host.notify();
      return;
    }
    const next = { ...params.overrides };
    next[key] = target.overId === described.members[0] ? described.members[1] : described.members[0];
    this.setInterlaceParams({ overrides: next });
  }

  // Stored per-crossing picks of one weave (first band's memo carries them;
  // every band of a bake shares the same map). Never null.
  private weaveOverrides(bands: Item[]): Record<string, string> {
    const memo = this.weaveMemos(bands)[0];
    const raw = memo?.overrides;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const clean: Record<string, string> = {};
    for (const [key, over] of Object.entries(raw)) {
      if (typeof key === 'string' && typeof over === 'string') clean[key] = over;
    }
    return clean;
  }

  // Every band of one weave in the layer, selected or not, so partial
  // selections still reweave the whole result.
  private weaveBands(key: string, selected: Item[]): Item[] {
    const seen = new Set<Item>(selected);
    let layer: Item[] = [];
    try {
      layer = this.host.layerChildren() ?? [];
    } catch {
      layer = [];
    }
    for (const item of layer) {
      const memo = this.memoOf(item);
      if (memo && this.weaveKey(memo, item?.data?.drawableId) === key) seen.add(item);
    }
    return [...seen];
  }

  private weaveMemos(bands: Item[]): InterlaceMemo[] {
    return bands.map((band) => this.memoOf(band)!).filter(Boolean);
  }

  private weaveId(bands: Item[]): string {
    const memo = this.weaveMemos(bands)[0];
    return memo?.weave || crypto.randomUUID();
  }

  private weavePhase(bands: Item[]): 0 | 1 {
    const memo = this.weaveMemos(bands)[0];
    return memo?.phase === 1 ? 1 : 0;
  }

  private weaveFirst(bands: Item[]): string {
    const memos = this.weaveMemos(bands);
    const first = memos[0]?.first;
    if (typeof first === 'string' && first) return first;
    return '';
  }

  // Member records in weave order: stored v2 sources when every band
  // carries them, else legacy derivation from pair memos. Legacy entry ids
  // are band drawable ids, so the stored first-role id still resolves.
  private weaveEntries(bands: Item[]): WeaveEntry[] {
    const memos = this.weaveMemos(bands);
    const ref = memos[0];
    const bySource = new Map<string, Item>();
    for (let i = 0; i < bands.length; i++) {
      const memo = memos[i];
      bySource.set(memo.sourceId ?? bands[i]?.data?.drawableId ?? `band-${i}`, bands[i]);
    }
    let order = Array.isArray(ref.order) ? [...ref.order] : [];
    if (!order.length || !order.every((id) => bySource.has(id))) {
      const ids = [...bySource.keys()];
      const first = typeof ref.first === 'string' && bySource.has(ref.first) ? ref.first : ids[0];
      order = [first, ...ids.filter((id) => id !== first)];
    }
    const stored = new Map((Array.isArray(ref.sources) ? ref.sources : []).map((s) => [s.id, s]));
    const entries: WeaveEntry[] = [];
    for (const id of order) {
      const band = bySource.get(id)!;
      const memo = this.memoOf(band)!;
      const record = stored.get(id);
      if (record && this.isWeavableSource(record.source)) {
        entries.push({ id, source: record.source, width: record.width,
          style: this.sanitizeStyle(record), item: band, fresh: false });
        continue;
      }
      if (memo.source && this.isWeavableSource(memo.source)) {
        entries.push({ id, source: memo.source, width: memo.width,
          style: this.sanitizeStyle(memo), item: band, fresh: false });
        continue;
      }
      // Legacy fallback: the flattened Bézier spine snapshot.
      entries.push({ id, source: this.bezierOfSpine(memo.spine), width: memo.width,
        style: this.sanitizeStyle(memo), item: band, fresh: false });
    }
    if (entries.some((entry) => !(entry.width > 0))) return [];
    return entries;
  }

  private bezierOfSpine(spine: { closed: boolean; segments: BezierSegment[] }): NGBezierPath {
    return { id: 'memo-spine', mode: 'bezier', fillRule: 'nonzero',
      contours: [structuredClone(spine)] };
  }

  private isWeavableSource(source: NGPath | null | undefined): source is WeavableSource {
    return !!source && (source.mode === 'bezier' || source.mode === 'bSpline'
      || source.mode === 'ngComposite' || source.mode === 'outlinedStroke');
  }

  // Bake one plan: expand every member band from authoring truth, cut each
  // under-side at every crossing, place results, and link memos carrying the
  // full member records for the next run. Pairs run in weave order and
  // alternation offsets by pair ordinal, so appended members never shift the
  // existing pairs' gaps. Commits once when snap is given (callers composing
  // a bigger op pass null and commit themselves). Returns the placed bands,
  // or null when nothing was baked.
  private bakeWeave(plan: InterlacePlan, temps: Item[],
    snap: { before: Item[]; selected: Item[]; retained: Map<string, any> } | null): Item[] | null {
    const host = this.host;
    const entries = plan.entries;
    const spines = this.entrySpines(entries, temps);
    if (!spines) return null;
    const bands: Item[] = [];
    for (const entry of entries) {
      const center = entry.source.mode === 'outlinedStroke' ? entry.source.spine : entry.source;
      const band = this.expandBand(center, { ...entry.style }, entry.width, this.fillOf(entry.item));
      if (!band) return null;
      temps.push(band);
      bands.push(band);
    }
    const firstIdx = Math.max(0, entries.findIndex((entry) => entry.id === plan.firstId));
    // Pairs in weave order; crossings sort along the earlier member so the
    // two-member case matches the legacy first-role ordering exactly.
    const planned = this.planCrossings(entries, spines, plan.phase, plan.overrides);
    let cutAny = false;
    for (const cross of planned) {
      const overEntry = entries[cross.over];
      const overSource = overEntry.source.mode === 'outlinedStroke' ? overEntry.source.spine : overEntry.source;
      for (const u of cross.unders) {
        const cut = this.cutOverlap(bands[u], spines[u], overSource, overEntry.style,
          overEntry.width, gapPadding(entries[u].width), cross.centers);
        if (!cut) continue;
        if (bands[u] !== entries[u].item) this.removeDetached(bands[u]);
        bands[u] = cut;
        try {
          cut.fillColor = this.fillOf(entries[u].item);
          cut.strokeColor = null;
        } catch { /* Style is cosmetic. */ }
        cutAny = true;
      }
    }
    if (!cutAny) return null;
    const layer = host.activeLayer();
    const originals = entries.map((entry) => entry.item);
    for (const band of bands) {
      if (band && !originals.includes(band)) {
        try { layer.addChild(band); } catch { /* Detached; skip. */ }
      }
    }
    // Only replaced originals leave the scene: a band cut at no crossing
    // stays in place and keeps its record.
    for (let i = 0; i < bands.length; i++) {
      if (bands[i] !== entries[i].item && entries[i].item) {
        host.removeFromSelection(entries[i].item);
        try { entries[i].item!.remove(); } catch { /* Already detached. */ }
      }
    }
    const placed = bands.filter((band) => band && band.parent != null);
    for (const band of placed) host.prependSelection(band);
    // New bands bake the expansion and lower to Bézier; untouched originals
    // keep their live records.
    for (const band of bands) {
      if (!originals.includes(band)) host.retain(band);
    }
    // Link every band to the weave: full member records plus a Bézier spine
    // snapshot fallback keep the next run re-expandable, and the first-role
    // source id keeps roles stable across selection-order changes.
    const sources: InterlaceSourceEntry[] = entries.map((entry) => ({
      id: entry.id, source: structuredClone(entry.source), width: entry.width,
      cap: entry.style.cap, join: entry.style.join, miterLimit: entry.style.miterLimit,
      dashLength: entry.style.dashLength, gapLength: entry.style.gapLength, position: entry.style.position,
    }));
    const order = entries.map((entry) => entry.id);
    const firstEntry = entries[firstIdx] ?? entries[0];
    for (let i = 0; i < placed.length; i++) {
      const band = placed[i];
      const entry = entries[i];
      let contour;
      try {
        contour = structuredClone(host.bezierSourceOf(spines[i]).contours[0]);
      } catch {
        continue;
      }
      try {
        if (!band || band.parent == null) continue;
        const memo: InterlaceMemo = { peer: placed[(i + 1) % placed.length]?.data?.drawableId ?? '',
          phase: plan.phase, first: firstEntry.id, weave: plan.weave, order: [...order], sources,
          overrides: { ...plan.overrides },
          sourceId: entry.id, source: structuredClone(entry.source),
          width: entry.width, cap: entry.style.cap, join: entry.style.join,
          miterLimit: entry.style.miterLimit, dashLength: entry.style.dashLength,
          gapLength: entry.style.gapLength, position: entry.style.position,
          spine: contour };
        band.data ??= {};
        band.data.interlace = memo;
      } catch { /* Metadata is best-effort. */ }
    }
    if (!placed.length) return null;
    if (snap) host.commit(plan.label, snap, placed);
    return placed;
  }

  // Stable entry id for one band: the authoring source id, else the band's
  // own drawable id (legacy pair memos).
  private entryIdOf(band: Item): string {
    const memo = this.memoOf(band);
    return memo?.sourceId ?? band?.data?.drawableId ?? '';
  }

  // Drop override keys naming a removed member; surviving pairs keep theirs.
  private pruneOverrides(overrides: Record<string, string>, removedIds: Set<string>): Record<string, string> {
    const kept: Record<string, string> = {};
    for (const [key, over] of Object.entries(overrides)) {
      const pair = /^(.*)>(.*)#\d+$/.exec(key);
      if (!pair || removedIds.has(pair[1]) || removedIds.has(pair[2])) continue;
      kept[key] = over;
    }
    return kept;
  }

  /** True when the selection holds at least one baked interlace band. */
  canRemoveFromInterlace(): boolean {
    return [...this.host.selectedItems()].some((item) => item && this.memoOf(item));
  }

  // Gap-free standalone stroke re-expanded from one member's authoring
  // truth: the shape as it was before any weave cut it. Placed on the layer
  // and retained as plain Bézier; null when it cannot expand.
  private restoreStroke(entry: WeaveEntry, temps: Item[]): Item | null {
    const host = this.host;
    const center = entry.source.mode === 'outlinedStroke' ? entry.source.spine : entry.source;
    const band = this.expandBand(center, { ...entry.style }, entry.width, this.fillOf(entry.item));
    if (!band) return null;
    temps.push(band);
    try {
      host.activeLayer().addChild(band);
    } catch {
      return null;
    }
    host.retain(band);
    return band.parent != null ? band : null;
  }

  /** Remove the selected baked bands' members from their weaves. Removed
   * shapes come back as clean gap-free strokes; survivors re-weave when two
   * or more remain (a lone survivor is restored clean too). One commit
   * covers the whole op. */
  removeFromInterlace(): void {
    const host = this.host;
    const selected = [...host.selectedItems()].filter((item) => item && this.memoOf(item));
    if (!selected.length) {
      host.setCombineNote('Select a baked interlace result first.');
      host.updateTextContent();
      host.notify();
      return;
    }
    const keys = new Set(selected.map((item) =>
      this.weaveKey(this.memoOf(item)!, item?.data?.drawableId)));
    if (keys.size !== 1) {
      host.setCombineNote(MIXED_NOTE);
      host.updateTextContent();
      host.notify();
      return;
    }
    const snap = host.capture();
    const temps: Item[] = [];
    try {
      const bands = this.weaveBands([...keys][0], selected);
      const entries = this.weaveEntries(bands);
      if (!entries.length) {
        host.setCombineNote('Select a baked interlace result first.');
        host.updateTextContent();
        host.notify();
        return;
      }
      const doomed = new Set(selected.map((band) => this.entryIdOf(band)));
      const kept = entries.filter((entry) => !doomed.has(entry.id));
      const freed = entries.filter((entry) => doomed.has(entry.id));
      if (!freed.length) {
        host.setCombineNote('Select a baked interlace result first.');
        host.updateTextContent();
        host.notify();
        return;
      }
      const overrides = this.pruneOverrides(this.weaveOverrides(bands), doomed);
      const restored: Item[] = [];
      for (const entry of [...freed, ...(kept.length === 1 ? kept : [])]) {
        const stroke = this.restoreStroke(entry, temps);
        if (stroke) {
          restored.push(stroke);
        }
      }
      let placed: Item[] = [];
      if (kept.length >= 2) {
        const first = kept.find((entry) => entry.id === this.weaveFirst(bands)) ?? kept[0];
        const result = this.bakeWeave({ kind: 'rerun', entries: kept, firstId: first.id,
          phase: this.weavePhase(bands), weave: this.weaveId(bands), overrides, label: '' }, temps, null);
        if (!result) {
          host.setCombineNote(EMPTY_NOTE);
          host.updateTextContent();
          host.notify();
          return;
        }
        placed = result;
      }
      if (!restored.length && !placed.length) {
        host.setCombineNote(EMPTY_NOTE);
        host.updateTextContent();
        host.notify();
        return;
      }
      // Restored strokes leave the weave: drop their originals, select them.
      for (const entry of [...freed, ...(kept.length === 1 ? kept : [])]) {
        if (entry.item && !restored.includes(entry.item) && !placed.includes(entry.item)) {
          host.removeFromSelection(entry.item);
          try { entry.item.remove(); } catch { /* Already detached. */ }
        }
      }
      for (const stroke of [...restored, ...placed]) host.prependSelection(stroke);
      host.commit('Remove from Interlace', snap, [...restored, ...placed]);
      host.setCombineNote('');
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
    host.updateTextContent();
    host.notify();
  }

  // Temp uninserted centerlines for entries, in order. Null when any member
  // cannot resolve; callers own the temps.
  private entrySpines(entries: WeaveEntry[], temps: Item[]): Item[] | null {
    const spines: Item[] = [];
    for (const entry of entries) {
      const spine = this.entrySpine(entry, temps);
      if (!spine) return null;
      spines.push(spine);
    }
    return spines;
  }

  private entrySpine(entry: WeaveEntry, temps: Item[]): Item | null {
    const scope = this.host.paperScope();
    const center = entry.source.mode === 'outlinedStroke' ? entry.source.spine : entry.source;
    let geometry: ResolvedVectorGeometry;
    try {
      geometry = resolvePath(center, { tolerance: 0.1 });
    } catch {
      return null;
    }
    if (geometry.kind !== 'path') return null;
    const spine = this.buildPath(scope, geometry.closed, geometry.segments);
    if (!spine) return null;
    temps.push(spine);
    return spine;
  }

  private fillOf(item: Item | null): Item {
    try {
      return item?.fillColor ?? item?.strokeColor ?? '#000000';
    } catch {
      return '#000000';
    }
  }

  // --- Live interlace groups ---
  // Members keep their records (nothing lowers or leaves the group); only
  // derived display bands show the weave. Re-resolves rebuild the group, so
  // param tweaks stay undoable through ordinary scene commands.

  canGroupSelection(): boolean {
    // Live groups stay two-member in v1; the baked op takes any connected set.
    return this.host.selectedItems().length === 2 && this.canInterlaceSelection();
  }

  groupSelection(): void {
    const host = this.host;
    const items = host.selectedItems();
    if (items.length !== 2 || !items[0] || !items[1] || items[0] === items[1]) {
      host.setCombineNote(SELECT_NOTE);
      host.updateTextContent();
      host.notify();
      return;
    }
    const members = items.map((item) => this.snapshotMember(item));
    if (members.some((member) => !member)) {
      host.setCombineNote(SELECT_NOTE);
      host.updateTextContent();
      host.notify();
      return;
    }
    const typed = members as WeaveMember[];
    const padding = gapPadding(Math.min(typed[0].stroke.width, typed[1].stroke.width));
    this.buildGroup(items, typed, { phase: 0, padding, firstId: typed[0].id, overrides: {} }, 'Interlace Group');
  }

  // Upgrade a baked pair (linked interlace memos) to a live group, keeping
  // its phase and roles.
  convertSelectionToGroup(): void {
    const host = this.host;
    const items = host.selectedItems();
    if (items.length !== 2 || !items[0] || !items[1] || items[0] === items[1]) {
      host.setCombineNote(SELECT_NOTE);
      host.updateTextContent();
      host.notify();
      return;
    }
    const memoA = this.memoOf(items[0]); const memoB = this.memoOf(items[1]);
    const id0 = items[0].data?.drawableId; const id1 = items[1].data?.drawableId;
    const existing = (memoA && memoA.peer === id1) ? memoA
      : (memoB && memoB.peer === id0) ? memoB : null;
    if (!existing) {
      host.setCombineNote('Select a baked interlace pair first.');
      host.updateTextContent();
      host.notify();
      return;
    }
    const members = items.map((item) => {
      const memo = this.memoOf(item);
      if (!memo) return null;
      const styled = this.sanitizeStyle(memo);
      // Kept authoring sources travel into the group; legacy pair memos
      // fall back to the flattened spine snapshot.
      const source: WeavableSource = this.memoAuthoring(memo)
        ?? { id: 'memo-spine', mode: 'bezier' as const, fillRule: 'nonzero' as const,
          contours: [structuredClone(memo.spine)] };
      return {
        id: memo.sourceId ?? (typeof item.data?.drawableId === 'string' ? item.data.drawableId : crypto.randomUUID()),
        source,
        stroke: { width: memo.width, cap: styled.cap, join: styled.join, miterLimit: styled.miterLimit,
          dashLength: styled.dashLength, gapLength: styled.gapLength, position: styled.position },
      } as WeaveMember;
    });
    if (members.some((member) => !member)) {
      host.setCombineNote(SELECT_NOTE);
      host.updateTextContent();
      host.notify();
      return;
    }
    const typed = members as WeaveMember[];
    const ordered = (existing.first !== id0 && existing.first === id1)
      ? [typed[1], typed[0]] : [typed[0], typed[1]];
    const padding = gapPadding(Math.min(ordered[0].stroke.width, ordered[1].stroke.width));
    this.buildGroup(items, ordered as [WeaveMember, WeaveMember],
      { phase: existing.phase, padding, firstId: ordered[0].id, overrides: {} }, 'Interlace Group');
  }

  // Snapshot one selected item to a weave member without touching the scene.
  private snapshotMember(item: Item): WeaveMember | null {
    const host = this.host;
    let source: NGPath | null = null;
    try {
      source = host.pathSourceOf(item);
    } catch {
      source = null;
    }
    if (!source) {
      try {
        source = host.bezierSourceOf(item);
      } catch {
        return null;
      }
    }
    if (source.mode !== 'bezier' && source.mode !== 'bSpline'
      && source.mode !== 'ngComposite' && source.mode !== 'outlinedStroke') return null;
    const stroke = source.mode === 'outlinedStroke'
      ? { width: source.width, cap: source.cap, join: source.join, miterLimit: source.miterLimit,
        dashLength: source.dashLength, gapLength: source.gapLength, position: source.position }
      : canvasStrokeOf(item);
    if (!stroke || !(stroke.width > 0)) return null;
    const id = typeof item.data?.drawableId === 'string' ? item.data.drawableId : crypto.randomUUID();
    return { id, source, stroke };
  }

  // Retune a selected group in place: derived displays are swapped inside
  // the same group item (members never move), so selection is untouched and
  // one custom undo entry covers the tweak.
  setInterlaceParams(patch: { phase?: 0 | 1; padding?: number; overrides?: Record<string, string> }): void {
    const host = this.host;
    const selected = host.selectedItems();
    const group = selected.length === 1 ? selected[0] : null;
    const stored = group?.data?.interlaceGroup;
    if (!group || !stored || !Array.isArray(stored.members) || stored.members.length !== 2) {
      host.setCombineNote('Select an interlace group first.');
      host.updateTextContent();
      host.notify();
      return;
    }
    const normalized = this.groupParams({ ...stored.params, ...(patch as Record<string, unknown>) },
      stored.members);
    if (!normalized) return;
    const before = this.groupParams(stored.params, stored.members);
    if (before && paramsEqual(before, normalized)) return;
    const params = normalized;
    const members = [...(group.children ?? [])].filter((child: Item) => !child?.data?.interlaceDisplay);
    if (members.length !== 2) {
      host.setCombineNote('Interlace group members are missing.');
      host.updateTextContent();
      host.notify();
      return;
    }
    const temps: Item[] = [];
    try {
      const rebuilt = this.weaveDisplays(stored.members, params, members, temps);
      if (!rebuilt) {
        host.setCombineNote(EMPTY_NOTE);
        host.updateTextContent();
        host.notify();
        return;
      }
      const oldParams = this.groupParams(stored.params, stored.members) ?? params;
      const oldDisplays = [...(group.children ?? [])].filter((child: Item) => child?.data?.interlaceDisplay);
      const apply = (displays: Item[], active: InterlaceGroupParams): void => {
        try {
          for (const child of [...(group.children ?? [])]) {
            if (child?.data?.interlaceDisplay) child.remove();
          }
          for (const display of displays) {
            try { group.addChild(display); } catch { /* Detached; skip. */ }
          }
          stored.params = { ...active };
        } catch { /* Best effort. */ }
      };
      apply(rebuilt, params);
      host.recordCustom('Interlace Params',
        () => apply(oldDisplays, oldParams),
        () => apply(rebuilt, params));
      host.setCombineNote('');
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
    host.updateTextContent();
    host.notify();
  }

  // Fresh display bands for stored members under params. All temps; the
  // caller places them. Returns null when the weave cannot resolve.
  private weaveDisplays(
    members: WeaveMember[], params: InterlaceGroupParams,
    items: Item[], temps: Item[],
  ): Item[] | null {
    const host = this.host;
    const scope = host.paperScope();
    if (members.length !== 2 || members[0].id === members[1].id) return null;
    const spines: Item[] = [];
    for (const member of members) {
      const spineSource = member.source.mode === 'outlinedStroke' ? member.source.spine : member.source;
      let geometry;
      try {
        geometry = resolvePath(spineSource, { tolerance: 0.1 });
      } catch {
        return null;
      }
      if (geometry.kind !== 'path') return null;
      const spine = this.buildPath(scope, geometry.closed, geometry.segments);
      if (!spine) return null;
      temps.push(spine);
      spines.push(spine);
    }
    const first = members.find((member) => member.id === params.firstId) ?? members[0];
    const second = first === members[0] ? members[1] : members[0];
    const crossings = this.crossings(first === members[0] ? spines[0] : spines[1],
      first === members[0] ? spines[1] : spines[0]);
    if (!crossings.length) return null;
    const ordered = [first, second];
    const itemOf = (member: WeaveMember): Item => items[members.indexOf(member)];
    const fillOf = (item: Item): Item => {
      try {
        return item.fillColor ?? item.strokeColor ?? '#000000';
      } catch {
        return '#000000';
      }
    };
    const bands: Item[] = [];
    for (const member of ordered) {
      const spineSource = member.source.mode === 'outlinedStroke' ? member.source.spine : member.source;
      const band = this.expandBand(spineSource,
        { ...member.stroke }, member.stroke.width, fillOf(itemOf(member)));
      if (!band) return null;
      temps.push(band);
      bands.push(band);
    }
    const overrides = params.overrides ?? {};
    // Plan in first-role-led order so pair keys match the bake exactly.
    const planned = this.planCrossings(
      ordered.map((member) => ({ id: member.id, width: member.stroke.width })),
      ordered.map((member) => spines[members.indexOf(member)]),
      params.phase, overrides, params.padding);
    for (const cross of planned) {
      const over = ordered[cross.over];
      const overSource = over.source.mode === 'outlinedStroke' ? over.source.spine : over.source;
      for (const u of cross.unders) {
        const cut = this.cutOverlap(bands[u], spines[members.indexOf(ordered[u])],
          overSource, over.stroke, over.stroke.width, params.padding, cross.centers);
        if (!cut) continue;
        this.removeDetached(bands[u]);
        bands[u] = cut;
        try {
          cut.fillColor = fillOf(itemOf(ordered[u]));
          cut.strokeColor = null;
        } catch { /* Style is cosmetic. */ }
      }
    }
    for (let i = 0; i < bands.length; i++) {
      // Member lineage rides along for future per-member actions.
      bands[i].data = { interlaceDisplay: true, memberId: ordered[i].id };
    }
    return bands;
  }

  // Drop derived displays and reveal members; the caller (ungroup flow)
  // records history. Displays are pure derivations, so losing them is safe.
  stripDisplays(group: Item): void {
    try {
      for (const child of [...(group?.children ?? [])]) {
        if (child?.data?.interlaceDisplay) {
          try { child.remove(); } catch { /* Already detached. */ }
        } else {
          try { child.visible = true; } catch { /* Gone. */ }
        }
      }
    } catch { /* Best effort. */ }
  }

  // Core group construction shared by grouping, convert, and param rebuilds.
  // Member items are reparented into the new group and hidden; derived bands
  // show the weave. Returns true when the group was placed and committed.
  private buildGroup(
    items: Item[], members: WeaveMember[],
    params: InterlaceGroupParams,
    label: string,
    atIndex?: number,
  ): boolean {
    const host = this.host;
    const scope = host.paperScope();
    if (members.length !== 2 || members[0].id === members[1].id) return false;
    if (params.phase !== 0 && params.phase !== 1) return false;
    if (!(params.padding >= 0) || !Number.isFinite(params.padding)) return false;
    const temps: Item[] = [];
    try {
      const bands = this.weaveDisplays(members, params, items, temps);
      if (!bands) {
        host.setCombineNote(NO_CROSSINGS_NOTE);
        host.updateTextContent();
        host.notify();
        return false;
      }
      const layer = host.activeLayer();
      const at = atIndex ?? Math.min(items[0].index ?? layer.children.length, items[1].index ?? layer.children.length);
      // Copy refs first: selectedItems() is live, and selection edits below
      // would shift it mid-loop (the same hazard combinePair avoids).
      const memberRefs = [...items];
      let group: Item = null;
      try {
        group = new scope.Group(memberRefs);
      } catch {
        return false;
      }
      try { layer.insertChild(Math.min(at, layer.children.length), group); }
      catch { try { layer.addChild(group); } catch { return false; } }
      for (const band of bands) {
        try {
          band.data ??= {};
          band.data.interlaceDisplay = true;
          group.addChild(band);
        } catch { /* Detached; skip. */ }
      }
      for (const item of memberRefs) {
        try { item.visible = false; } catch { /* Gone. */ }
        host.removeFromSelection(item);
      }
      group.data = {
        isUserGroup: true,
        interlaceGroup: {
          params: { ...params },
          members: members.map((member) => structuredClone({
            id: member.id, source: member.source, stroke: member.stroke })),
        },
      };
      host.prependSelection(group);
      // A scene command cannot express reparenting (undo would drop the group
      // with its members trapped inside), so the group swaps as one custom
      // entry: undo releases the members back to the layer, redo regroups.
      const homeLayer = layer;
      const homeIndex = Math.min(at, layer.children.length);
      host.recordCustom(label,
        () => {
          try {
            if (!group.parent) return;
            const index = Math.max(0, group.index);
            try { group.remove(); } catch { /* Already detached. */ }
            memberRefs.forEach((member, i) => {
              try { member.visible = true; } catch { /* Gone. */ }
              try { homeLayer.insertChild(Math.min(index + i, homeLayer.children.length), member); }
              catch { try { homeLayer.addChild(member); } catch { /* Detached. */ } }
            });
            host.removeFromSelection(group);
            for (const member of memberRefs) host.addToSelection(member);
          } catch { /* Best effort. */ }
        },
        () => {
          try {
            if (group.parent || memberRefs.some((member) => !member.parent)) return;
            for (const member of memberRefs) {
              try { member.visible = false; } catch { /* Gone. */ }
              try { group.addChild(member); } catch { /* Detached. */ }
            }
            try { homeLayer.insertChild(Math.min(homeIndex, homeLayer.children.length), group); }
            catch { try { homeLayer.addChild(group); } catch { /* Detached. */ } }
            for (const member of memberRefs) host.removeFromSelection(member);
            host.prependSelection(group);
          } catch { /* Best effort. */ }
        });
      host.setCombineNote('');
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
    host.updateTextContent();
    host.notify();
    return true;
  }

  // Fresh entry from a resolved ribbon: the full authoring record travels
  // with the member so later runs re-expand parametric sources.
  private entryOf(ribbon: Ribbon, fresh: boolean): WeaveEntry {
    const style = { ...ribbon.style };
    const source = ribbon.authoring ?? this.bezierOfSpine(
      this.host.bezierSourceOf(ribbon.spine).contours[0]);
    return { id: ribbon.sourceId ?? crypto.randomUUID(), source,
      width: ribbon.width, style, item: ribbon.item, fresh };
  }

  // Resolve one selected item to its centerline spine and cuttable band.
  // Previous results prefer the live authoring record (via the stored source
  // id), then the stored source snapshot, then the legacy Bézier spine
  // snapshot — so a re-run cuts fresh gaps per the flipped phase instead of
  // accumulating them, and parametric spines survive across runs. Outlined
  // records resolve their spine; plain open/closed paths with a real stroke
  // expand to a temp band.
  private ribbonFor(item: Item, temps: Item[]): Ribbon | null {
    const host = this.host;
    const scope = host.paperScope();
    if (!item || typeof item.subtract !== 'function') return null;
    const memo = this.memoOf(item);
    if (memo) {
      const authoring = this.memoAuthoring(memo);
      if (authoring) {
        const center = authoring.mode === 'outlinedStroke' ? authoring.spine : authoring;
        let geometry: ResolvedVectorGeometry;
        try {
          geometry = resolvePath(center, { tolerance: 0.1 });
        } catch {
          return null;
        }
        if (geometry.kind !== 'path') return null;
        const spine = this.buildPath(scope, geometry.closed, geometry.segments);
        if (!spine || !(memo.width > 0)) return null;
        temps.push(spine);
        const style = this.sanitizeStyle(memo);
        const band = this.expandBand(center, style, memo.width, item.fillColor);
        if (!band) return null;
        temps.push(band);
        return { item, spine, band, width: memo.width, style,
          sourceId: memo.sourceId, authoring };
      }
      // Legacy fallback: re-expand from the flattened spine snapshot.
      const spine = this.buildPath(scope, memo.spine.closed, memo.spine.segments);
      if (!spine || !(memo.width > 0)) return null;
      temps.push(spine);
      const spineSource: NGBezierPath = { id: 'memo-spine', mode: 'bezier',
        fillRule: 'nonzero', contours: [memo.spine] };
      const band = this.expandBand(spineSource, this.sanitizeStyle(memo), memo.width, item.fillColor);
      if (!band) return null;
      temps.push(band);
      return { item, spine, band, width: memo.width, style: this.sanitizeStyle(memo),
        sourceId: memo.sourceId, authoring: null };
    }
    const source = host.pathSourceOf(item);
    const drawableId = typeof item.data?.drawableId === 'string' ? item.data.drawableId : null;
    if (source?.mode === 'outlinedStroke') {
      let geometry: ResolvedVectorGeometry;
      try {
        geometry = resolvePath(source.spine);
      } catch {
        return null;
      }
      if (geometry.kind !== 'path') return null;
      const spine = this.buildPath(scope, geometry.closed, geometry.segments);
      if (!spine) return null;
      temps.push(spine);
      const style: StrokeStyle = { cap: source.cap, join: source.join, miterLimit: source.miterLimit,
        dashLength: source.dashLength, gapLength: source.gapLength, position: source.position };
      return { item, spine, band: item, width: source.width, style,
        sourceId: drawableId, authoring: source };
    }
    // Plain path with a painted stroke: the item is its own centerline and
    // the band is a temp expansion, mirroring its canvas stroke settings.
    // A held authoring record (bSpline/composite/bezier) travels along so
    // the bake does not flatten parametric intent.
    if (item instanceof scope.Path) {
      const stroke = canvasStrokeOf(item);
      if (!stroke) return null;
      const style: StrokeStyle = { ...stroke };
      let spineSource: NGBezierPath;
      try {
        spineSource = host.bezierSourceOf(item);
      } catch {
        return null;
      }
      const band = this.expandBand(spineSource, style, stroke.width, item.strokeColor);
      if (!band) return null;
      temps.push(band);
      const record = this.isWeavableSource(source) ? source : null;
      return { item, spine: item, band, width: stroke.width, style,
        sourceId: record ? drawableId : null, authoring: record };
    }
    return null;
  }

  // A memo band's authoring truth: the live record when its source id still
  // resolves, else the stored source snapshot. Null when neither is weavable.
  private memoAuthoring(memo: InterlaceMemo): WeavableSource | null {
    if (memo.sourceId) {
      try {
        const live = this.host.sourceById?.(memo.sourceId) ?? null;
        if (this.isWeavableSource(live)) return live;
      } catch { /* Fall through to the snapshot. */ }
    }
    return this.isWeavableSource(memo.source) ? memo.source : null;
  }

  // Temp filled band for a Bézier spine record, or null when it cannot
  // expand. Callers own disposal of the returned item.
  private expandBand(spineSource: NGBezierPath | NGCompositePath | NGBSplinePath, style: StrokeStyle, width: number, fill: Item): Item | null {
    const scope = this.host.paperScope();
    let geometry: ResolvedVectorGeometry;
    try {
      geometry = resolveOutlinedStroke({ id: 'interlace-band', mode: 'outlinedStroke',
        spine: spineSource, width, cap: style.cap, join: style.join, miterLimit: style.miterLimit,
        dashLength: style.dashLength, gapLength: style.gapLength, position: style.position });
    } catch {
      return null;
    }
    const loops = geometry.kind === 'path' ? [geometry] : geometry.paths;
    if (!loops.length) return null;
    // The band may be several loops (dashes); cut every loop at each gap.
    const band = loops.length === 1
      ? this.buildPath(scope, true, loops[0].segments)
      : this.buildCompound(scope, loops);
    if (!band) return null;
    // The temp band renders the stroke as filled geometry, mirroring how
    // DrawableRenderer paints outlined strokes.
    try {
      band.fillColor = fill;
      band.strokeColor = null;
    } catch { /* Style is cosmetic; geometry stands alone. */ }
    return band;
  }

  private sanitizeStyle(raw: InterlaceMemo): StrokeStyle {
    return {
      cap: raw.cap === 'round' || raw.cap === 'square' ? raw.cap : 'butt',
      join: raw.join === 'bevel' || raw.join === 'round' ? raw.join : 'miter',
      miterLimit: Number.isFinite(raw.miterLimit) && raw.miterLimit >= 1 ? raw.miterLimit : 10,
      dashLength: Number.isFinite(raw.dashLength) && raw.dashLength > 0 ? raw.dashLength : 0,
      gapLength: Number.isFinite(raw.gapLength) && raw.gapLength > 0 ? raw.gapLength : 0,
      position: raw.position === 'inside' || raw.position === 'outside' ? raw.position : 'center',
    };
  }

  // Ordered crossing points along spine A, deduplicated for shared endpoints.
  private crossings(spineA: Item, spineB: Item): Vec2[] {
    let raw: Item[] = [];
    try {
      raw = spineA.getIntersections(spineB) ?? [];
    } catch {
      return [];
    }
    const withOffsets = raw.map((loc, index) => {
      let offset = index;
      try {
        const measured = spineA.getOffsetOf(loc.point);
        if (Number.isFinite(measured)) offset = measured;
      } catch { /* Keep discovery order. */ }
      return { point: { x: loc.point.x, y: loc.point.y } as Vec2, offset };
    });
    withOffsets.sort((p, q) => p.offset - q.offset);
    const points: Vec2[] = [];
    for (const entry of withOffsets) {
      const last = points[points.length - 1];
      if (!last || Math.hypot(last.x - entry.point.x, last.y - entry.point.y) > 1e-4) {
        points.push(entry.point);
      }
    }
    return points;
  }

  // Cut the under-band by its real overlap with the padded over-band.
  // The cutter is that overlap (every piece that holds a cluster center),
  // not a window sized from the crossing angle: partial overlaps, shallow
  // angles, and corners all keep the over-band's own outline. A corner's
  // inner miter can pinch off a sliver of the under-band inside the hole;
  // that island holds no spine sample and is dropped.
  private cutOverlap(
    underBand: Item, underSpine: Item,
    overSource: NGBezierPath | NGCompositePath | NGBSplinePath,
    overStyle: StrokeStyle, overWidth: number, padding: number, centers: Vec2[],
  ): Item | null {
    if (!underBand || typeof underBand.subtract !== 'function') return null;
    if (!(overWidth > 0) || !(padding >= 0) || !Number.isFinite(padding)) return null;
    const padded = this.expandBand(overSource, overStyle, overWidth + 2 * padding, '#000');
    if (!padded) return null;
    const temps: Item[] = [padded];
    try {
      const cutter = this.overlapCutter(padded, underBand, centers);
      if (!cutter) return null;
      temps.push(cutter);
      let cut: Item | null = null;
      try {
        cut = underBand.subtract(cutter, { insert: false });
      } catch {
        return null;
      }
      if (!cut || !hasBooleanArea(cut.area)) {
        this.removeDetached(cut);
        return null;
      }
      const cleaned = this.withoutStrayIslands(cut, underSpine);
      if (cleaned !== cut) this.removeDetached(cut);
      if (!cleaned || !hasBooleanArea(cleaned.area)) {
        this.removeDetached(cleaned);
        return null;
      }
      return cleaned;
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
  }

  // Intersection of the padded over-band with the under-band, limited to
  // the pieces that contain this cut's crossing centers. Other crossings
  // of the same pair keep their own roles.
  private overlapCutter(padded: Item, under: Item, centers: Vec2[]): Item | null {
    let hit: Item | null = null;
    try {
      hit = padded.intersect(under, { insert: false });
    } catch {
      return null;
    }
    if (!hit || !hasBooleanArea(hit.area)) {
      this.removeDetached(hit);
      return null;
    }
    if (hit.className !== 'CompoundPath') return hit;
    const children = [...(hit.children ?? [])];
    const kept = children.filter((part: Item) => this.partCovers(part, centers));
    if (!kept.length) {
      this.removeDetached(hit);
      return null;
    }
    if (kept.length === children.length) return hit;
    try {
      const scope = this.host.paperScope();
      const cutter = new scope.CompoundPath({ insert: false, fillRule: 'evenodd', children: kept });
      this.removeDetached(hit);
      return cutter;
    } catch {
      this.removeDetached(hit);
      return null;
    }
  }

  private partCovers(part: Item, centers: Vec2[]): boolean {
    const scope = this.host.paperScope();
    for (const center of centers) {
      const point = new scope.Point(center.x, center.y);
      try {
        if (part.contains(point)) return true;
      } catch { /* Fall through to a near-boundary check. */ }
      try {
        const nearest = part.getNearestPoint(point);
        if (nearest && Math.hypot(nearest.x - center.x, nearest.y - center.y) <= 0.75) return true;
      } catch { /* This piece does not cover the center. */ }
    }
    return false;
  }

  // Drop filled contours that hold no under-spine sample. Hole contours
  // (odd containment depth) stay, so a gapped ring keeps its opening.
  // Corner miters leave a spineless speck in the hole; this removes it.
  private withoutStrayIslands(band: Item, spine: Item): Item {
    if (!band || band.className !== 'CompoundPath') return band;
    const contours: Item[] = [...(band.children ?? [])];
    if (contours.length < 2) return band;
    const insides = contours.map((contour) => this.pointJustInside(contour));
    const depth = contours.map((_, index) => contours.filter((other, otherIndex) =>
      otherIndex !== index && insides[index] && other.contains(insides[index])).length);
    const samples = this.spineSamples(spine);
    const stray = contours.map((contour, index) => {
      if (depth[index] % 2 === 1) return false;
      return !samples.some((sample) => {
        try { return contour.contains(sample); } catch { return false; }
      });
    });
    if (!stray.some(Boolean)) return band;
    const keep = contours.filter((_, index) => !stray[index]);
    if (!keep.length || keep.length === contours.length) return band;
    try {
      const scope = this.host.paperScope();
      if (keep.length === 1) return keep[0].clone({ insert: false });
      return new scope.CompoundPath({
        insert: false, fillRule: 'evenodd',
        children: keep.map((contour) => contour.clone({ insert: false })),
      });
    } catch {
      return band;
    }
  }

  // A point just inside a closed contour, for hole-vs-island depth.
  private pointJustInside(contour: Item): Item | null {
    try {
      const segments = contour.segments;
      if (!segments || segments.length < 2) return null;
      const a = segments[0].point;
      const b = segments[1].point;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const span = Math.hypot(dx, dy) || 1;
      const sign = contour.clockwise ? 1 : -1;
      const nx = sign * (dy / span);
      const ny = sign * (-dx / span);
      const scope = this.host.paperScope();
      const toward = new scope.Point(a.x + nx * 0.75, a.y + ny * 0.75);
      if (contour.contains(toward)) return toward;
      const away = new scope.Point(a.x - nx * 0.75, a.y - ny * 0.75);
      return contour.contains(away) ? away : toward;
    } catch {
      return null;
    }
  }

  private spineSamples(spine: Item): Item[] {
    try {
      const total = spine?.length;
      if (!(total > 0)) return [];
      const n = Math.max(2, Math.ceil(total));
      const samples: Item[] = [];
      for (let i = 0; i <= n; i++) {
        const point = spine.getPointAt(Math.min(total, total * i / n));
        if (point) samples.push(point);
      }
      return samples;
    } catch {
      return [];
    }
  }

  private memoOf(item: Item): InterlaceMemo | null {
    const memo = item?.data?.interlace;
    if (!memo || typeof memo.peer !== 'string' || (memo.phase !== 0 && memo.phase !== 1)) return null;
    if (!(memo.width > 0) || !memo.spine || !Array.isArray(memo.spine.segments)) return null;
    // Normalize legacy pair memos (no weave/source fields) to the v2 shape.
    if (typeof memo.weave !== 'string') memo.weave = '';
    if (!Array.isArray(memo.order)) memo.order = [];
    if (!Array.isArray(memo.sources)) memo.sources = [];
    if (typeof memo.sourceId !== 'string') memo.sourceId = null;
    if (memo.source !== null && typeof memo.source !== 'object') memo.source = null;
    if (!memo.overrides || typeof memo.overrides !== 'object' || Array.isArray(memo.overrides)) {
      memo.overrides = {};
    }
    return memo;
  }

  private buildPath(scope: Scope, closed: boolean, segments: BezierSegment[]): Item | null {
    try {
      const path = new scope.Path({ insert: false, closed,
        segments: segments.map((s) => new scope.Segment(
          new scope.Point(s.point.x, s.point.y),
          new scope.Point(s.handleIn.x, s.handleIn.y),
          new scope.Point(s.handleOut.x, s.handleOut.y),
        )),
      });
      return path.segments.length ? path : null;
    } catch {
      return null;
    }
  }

  private buildCompound(scope: Scope, loops: Array<{ segments: BezierSegment[] }>): Item | null {
    try {
      const children = loops.map((loop) => this.buildPath(scope, true, loop.segments)).filter(Boolean);
      if (!children.length) return null;
      return new scope.CompoundPath({ insert: false, fillRule: 'evenodd', children });
    } catch {
      return null;
    }
  }

  private removeDetached(item: Item): void {
    try {
      if (item && item.parent == null) item.remove();
    } catch { /* Detached already. */ }
  }
}
