// Interlace: turn two intersecting stroked paths into an over/under weave.
// Crossings are found on spine centerlines; at each crossing the under-side
// band gets a real gap cut (boolean subtract of a disc), so exports stay
// clean. Gaps alone produce the weave — no restacking is needed, since the
// background shows through each gap regardless of paint order. Results bake
// the expansion and lower to Bézier, like other boolean results.
// Public: canInterlaceSelection, interlaceSelection.

import type { CombinatoricsHost } from './CombinatoricsManager';
import type { NGBezierPath, NGCompositePath, NGBSplinePath, NGPath } from '../model/NGPath';
import type { BezierSegment, ResolvedVectorGeometry, Vec2 } from '../model/geometryResolution';
import { resolveOutlinedStroke } from '../geometry/outlinedStroke';
import { resolvePath } from '../geometry/pathResolver';
import { canvasStrokeOf, gapPadding, gapRectFor } from '../geometry/interlaceWeave';
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
  /** Push one custom undo entry (label, undo, redo). */
  recordCustom(label: string, undo: () => void, redo: () => void): void;
}

interface InterlaceMemo {
  peer: string;
  phase: 0 | 1;
  /** Drawable id of the first-role band, keeping roles stable on re-run. */
  first: string;
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
}

const NO_CROSSINGS_NOTE = 'No crossings — paths do not intersect.';
const SELECT_NOTE = 'Select two stroked paths first.';
const EMPTY_NOTE = 'No result — the gaps consumed a band.';

export class InterlaceManager {
  private readonly host: InterlaceHost;
  constructor(host: InterlaceHost) { this.host = host; }

  canInterlaceSelection(): boolean {
    const items = this.host.selectedItems();
    if (items.length !== 2 || !items[0] || !items[1] || items[0] === items[1]) return false;
    const temps: Item[] = [];
    try {
      const a = this.ribbonFor(items[0], temps);
      const b = this.ribbonFor(items[1], temps);
      if (!a || !b) return false;
      return this.crossings(a.spine, b.spine).length > 0;
    } catch {
      return false;
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
  }

  interlaceSelection(): void {
    const host = this.host;
    const items = host.selectedItems();
    if (items.length !== 2 || !items[0] || !items[1] || items[0] === items[1]) {
      host.setCombineNote(SELECT_NOTE);
      host.updateTextContent();
      host.notify();
      return;
    }
    const snap = host.capture();
    const temps: Item[] = [];
    try {
      const a = this.ribbonFor(items[0], temps);
      const b = this.ribbonFor(items[1], temps);
      if (!a || !b) {
        host.setCombineNote(SELECT_NOTE);
        host.updateTextContent();
        host.notify();
        return;
      }
      // Fresh runs follow selection order: the first-selected path goes over
      // at the first crossing along its spine. Re-running on the same pair
      // keeps those roles (selection order may have flipped under it) and
      // flips the weave phase instead.
      const memoA = this.memoOf(items[0]);
      const memoB = this.memoOf(items[1]);
      const id0 = items[0].data?.drawableId;
      const id1 = items[1].data?.drawableId;
      const existing = (memoA && memoA.peer === id1) ? memoA
        : (memoB && memoB.peer === id0) ? memoB : null;
      let phase: 0 | 1 = 0;
      let first = items[0];
      if (existing) {
        phase = ((1 - existing.phase) as 0 | 1);
        if (existing.first !== id0 && existing.first === id1) {
          first = items[1];
        }
      }
      const orderA = first === items[0] ? a : b;
      const orderB = first === items[0] ? b : a;
      // Crossings sort along the first-role spine, so alternation starts there.
      const crossings = this.crossings(orderA.spine, orderB.spine);
      if (!crossings.length) {
        host.setCombineNote(NO_CROSSINGS_NOTE);
        host.updateTextContent();
        host.notify();
        return;
      }

      // Snapshot spines before placement changes; removed items stay readable
      // but detached temps are cheaper to convert while everything is live.
      const spineContourA = host.bezierSourceOf(orderA.spine).contours[0];
      const spineContourB = host.bezierSourceOf(orderB.spine).contours[0];
      let bandA = orderA.band; let bandB = orderB.band;
      let cutAny = false;
      for (let i = 0; i < crossings.length; i++) {
        const overA = (i + phase) % 2 === 0;
        const underWidth = overA ? orderB.width : orderA.width;
        const overWidth = overA ? orderA.width : orderB.width;
        const cutter = this.gapCutter(crossings[i], overA ? orderA.spine : orderB.spine,
          overA ? orderB.spine : orderA.spine, overWidth, underWidth);
        if (!cutter) continue;
        try {
          const target = overA ? bandB : bandA;
          if (!target || typeof target.subtract !== 'function') continue;
          const cut = target.subtract(cutter, { insert: false });
          if (cut && hasBooleanArea(cut.area)) {
            if (target !== (overA ? items[1] : items[0])) this.removeDetached(target);
            if (overA) bandB = cut; else bandA = cut;
            cutAny = true;
          } else {
            this.removeDetached(cut);
          }
        } catch {
          // Keep the band whole at this crossing and try the rest.
        } finally {
          this.removeDetached(cutter);
        }
      }
      if (!cutAny) {
        host.setCombineNote(EMPTY_NOTE);
        host.updateTextContent();
        host.notify();
        return;
      }
      const layer = host.activeLayer();
      for (const band of [bandA, bandB]) {
        if (band !== items[0] && band !== items[1]) {
          try { layer.addChild(band); } catch { /* Detached; skip. */ }
        }
      }
      // Only replaced originals leave the scene: a band cut at no crossing
      // stays in place (single-crossing over side) and keeps its record.
      // Both originals are captured first because selectedItems() is the live
      // selection array, so the first removal would shift the second away.
      const pairs = [[bandA, orderA.item], [bandB, orderB.item]] as Array<[Item, Item]>;
      for (const [band, original] of pairs) {
        if (band !== original) {
          host.removeFromSelection(original);
          try { original.remove(); } catch { /* Already detached. */ }
        }
      }
      const placed = [bandA, bandB].filter((band) => band && band.parent != null);
      for (const band of placed) host.prependSelection(band);
      // New bands bake the expansion and lower to Bézier; untouched originals
      // keep their live spine records.
      for (const [band] of pairs) {
        if (band !== pairs[0][1] && band !== pairs[1][1]) host.retain(band);
      }
      // Link the pair so a re-run flips the phase instead of repeating it.
      // Style, widths, and spine snapshots let the next run re-expand both
      // bands fresh, and the first-role id keeps roles stable across
      // selection-order changes.
      const firstId = bandA?.data?.drawableId;
      const link = (
        band: Item, peer: Item, ribbon: Ribbon, contour: { closed: boolean; segments: BezierSegment[] },
      ): void => {
        try {
          if (!band || !peer || band.parent == null || peer.parent == null) return;
          const memo: InterlaceMemo = { peer: peer.data?.drawableId, phase,
            first: firstId, width: ribbon.width, cap: ribbon.style.cap, join: ribbon.style.join,
            miterLimit: ribbon.style.miterLimit, dashLength: ribbon.style.dashLength,
            gapLength: ribbon.style.gapLength, position: ribbon.style.position,
            spine: structuredClone(contour) };
          band.data ??= {};
          band.data.interlace = memo;
        } catch { /* Metadata is best-effort. */ }
      };
      link(bandA, bandB, orderA, spineContourA);
      link(bandB, bandA, orderB, spineContourB);
      host.commit('Interlace', snap, placed);
      host.setCombineNote(placed.length === 2 ? '' : EMPTY_NOTE);
    } finally {
      for (const temp of temps) this.removeDetached(temp);
    }
    host.updateTextContent();
    host.notify();
  }

  // --- Live interlace groups ---
  // Members keep their records (nothing lowers or leaves the group); only
  // derived display bands show the weave. Re-resolves rebuild the group, so
  // param tweaks stay undoable through ordinary scene commands.

  canGroupSelection(): boolean {
    return this.canInterlaceSelection();
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
    this.buildGroup(items, typed, { phase: 0, padding, firstId: typed[0].id }, 'Interlace Group');
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
      return {
        id: typeof item.data?.drawableId === 'string' ? item.data.drawableId : crypto.randomUUID(),
        source: { id: 'memo-spine', mode: 'bezier' as const, fillRule: 'nonzero' as const,
          contours: [memo.spine] },
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
      { phase: existing.phase, padding, firstId: ordered[0].id }, 'Interlace Group');
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
  setInterlaceParams(patch: { phase?: 0 | 1; padding?: number }): void {
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
    if (patch.phase !== undefined && patch.phase !== 0 && patch.phase !== 1) return;
    if (patch.padding !== undefined && (!(patch.padding >= 0) || !Number.isFinite(patch.padding))) return;
    const params = { ...stored.params, ...patch };
    if (params.phase === stored.params.phase && params.padding === stored.params.padding) return;
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
      const oldParams = { ...stored.params };
      const oldDisplays = [...(group.children ?? [])].filter((child: Item) => child?.data?.interlaceDisplay);
      const apply = (displays: Item[], active: { phase: 0 | 1; padding: number; firstId: string }): void => {
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
    members: WeaveMember[], params: { phase: 0 | 1; padding: number; firstId: string },
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
    for (let i = 0; i < crossings.length; i++) {
      const overFirst = (i + params.phase) % 2 === 0;
      const over = overFirst ? ordered[0] : ordered[1];
      const under = overFirst ? ordered[1] : ordered[0];
      const spineOver = over === members[0] ? spines[0] : spines[1];
      const spineUnder = over === members[0] ? spines[1] : spines[0];
      const cutter = this.gapCutter(crossings[i], spineOver, spineUnder,
        over.stroke.width, under.stroke.width, params.padding);
      if (!cutter) continue;
      try {
        const target = overFirst ? bands[1] : bands[0];
        const cut = target.subtract(cutter, { insert: false });
        if (cut && hasBooleanArea(cut.area)) {
          this.removeDetached(target);
          bands[overFirst ? 1 : 0] = cut;
          try {
            cut.fillColor = fillOf(itemOf(overFirst ? ordered[1] : ordered[0]));
            cut.strokeColor = null;
          } catch { /* Style is cosmetic. */ }
        } else {
          this.removeDetached(cut);
        }
      } catch {
        // Keep the band whole at this crossing and try the rest.
      } finally {
        this.removeDetached(cutter);
      }
    }
    for (const band of bands) {
      band.data = { interlaceDisplay: true };
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
    params: { phase: 0 | 1; padding: number; firstId: string },
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
          band.data = { interlaceDisplay: true };
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

  // Resolve one selected item to its centerline spine and cuttable band.
  // Previous results carry a spine snapshot; outlined records resolve their
  // spine; plain open/closed paths with a real stroke expand to a temp band.
  private ribbonFor(item: Item, temps: Item[]): Ribbon | null {
    const host = this.host;
    const scope = host.paperScope();
    if (!item || typeof item.subtract !== 'function') return null;
    const memo = this.memoOf(item);
    if (memo) {
      // A previous result re-expands from its spine snapshot, so a re-run
      // cuts fresh gaps per the flipped phase instead of accumulating them.
      const spine = this.buildPath(scope, memo.spine.closed, memo.spine.segments);
      if (!spine || !(memo.width > 0)) return null;
      temps.push(spine);
      const spineSource: NGBezierPath = { id: 'memo-spine', mode: 'bezier',
        fillRule: 'nonzero', contours: [memo.spine] };
      const band = this.expandBand(spineSource, this.sanitizeStyle(memo), memo.width, item.fillColor);
      if (!band) return null;
      temps.push(band);
      return { item, spine, band, width: memo.width, style: this.sanitizeStyle(memo) };
    }
    const source = host.pathSourceOf(item);
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
      return { item, spine, band: item, width: source.width, style };
    }
    // Plain path with a painted stroke: the item is its own centerline and
    // the band is a temp expansion, mirroring its canvas stroke settings.
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
      return { item, spine: item, band, width: stroke.width, style };
    }
    return null;
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

  // Rectangular cutter at a crossing, aligned with the over-band so the
  // under-band's cut ends parallel the peer. Lengthened for shallow crossing
  // angles so the under-band severs fully and the over-band hides inside.
  private gapCutter(center: Vec2, overSpine: Item, underSpine: Item, overWidth: number, underWidth: number, padding?: number): Item | null {
    const scope = this.host.paperScope();
    let angle = 0; let sine = 1;
    try {
      const epsilon = Math.max(0.5, (overWidth + underWidth) / 4);
      const at = new scope.Point(center.x, center.y);
      const offOver = overSpine.getOffsetOf(at);
      const offUnder = underSpine.getOffsetOf(at);
      if (Number.isFinite(offOver) && Number.isFinite(offUnder)) {
        const o0 = overSpine.getPointAt(Math.max(0, offOver - epsilon));
        const o1 = overSpine.getPointAt(offOver + epsilon);
        const u0 = underSpine.getPointAt(Math.max(0, offUnder - epsilon));
        const u1 = underSpine.getPointAt(offUnder + epsilon);
        const to = { x: o1.x - o0.x, y: o1.y - o0.y };
        const tu = { x: u1.x - u0.x, y: u1.y - u0.y };
        const lo = Math.hypot(to.x, to.y); const lu = Math.hypot(tu.x, tu.y);
        if (lo > 1e-9 && lu > 1e-9) {
          angle = Math.atan2(to.y, to.x);
          sine = Math.abs(to.x * tu.y - to.y * tu.x) / (lo * lu);
        }
      }
    } catch { /* Axis-aligned fallback gap. */ }
    const rect = gapRectFor(angle, overWidth, underWidth, sine, padding);
    if (!(rect.length > 0) || !(rect.width > 0)
      || !Number.isFinite(rect.length) || !Number.isFinite(rect.width)) return null;
    const prev = scope.settings?.insertItems;
    try {
      if (scope.settings) scope.settings.insertItems = false;
      const cutter = new scope.Path.Rectangle(
        new scope.Point(center.x - rect.length / 2, center.y - rect.width / 2),
        new scope.Size(rect.length, rect.width),
      );
      cutter.rotate(rect.angle * 180 / Math.PI, new scope.Point(center.x, center.y));
      return cutter;
    } catch {
      return null;
    } finally {
      if (scope.settings) scope.settings.insertItems = prev;
    }
  }

  private memoOf(item: Item): InterlaceMemo | null {
    const memo = item?.data?.interlace;
    if (!memo || typeof memo.peer !== 'string' || (memo.phase !== 0 && memo.phase !== 1)) return null;
    if (!(memo.width > 0) || !memo.spine || !Array.isArray(memo.spine.segments)) return null;
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
