// Interlace: turn two intersecting stroked paths into an over/under weave.
// Crossings are found on spine centerlines; at each crossing the under-side
// band gets a real gap cut (boolean subtract of a disc), so exports stay
// clean. Gaps alone produce the weave — no restacking is needed, since the
// background shows through each gap regardless of paint order. Results bake
// the expansion and lower to Bézier, like other boolean results.
// Public: canInterlaceSelection, interlaceSelection.

import type { CombinatoricsHost } from './CombinatoricsManager';
import type { NGBezierPath, NGPath } from '../model/NGPath';
import type { BezierSegment, ResolvedVectorGeometry, Vec2 } from '../model/geometryResolution';
import { resolveOutlinedStroke } from '../geometry/outlinedStroke';
import { resolvePath } from '../geometry/pathResolver';
import { hasBooleanArea } from '../geometry/booleanResolver';

type Item = any;
type Scope = any;

export interface InterlaceHost extends CombinatoricsHost {
  paperScope(): Scope;
  /** Authoring source when the scene knows one (model or retained record). */
  pathSourceOf(item: Item): NGPath | null;
  /** Current geometry of any path item as a Bézier record. */
  bezierSourceOf(item: Item): NGBezierPath;
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

/** Gap daylight beyond the over-band edge, in document points. */
function gapPadding(underWidth: number): number {
  return Math.max(2, underWidth * 0.15);
}

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
        const disc = this.gapDisc(crossings[i], overWidth, underWidth, orderA.spine, orderB.spine);
        if (!disc) continue;
        try {
          const target = overA ? bandB : bandA;
          if (!target || typeof target.subtract !== 'function') continue;
          const cut = target.subtract(disc, { insert: false });
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
          this.removeDetached(disc);
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
      const width = Number(item.strokeWidth);
      if (!(width > 0) || item.strokeColor == null) return null;
      const style: StrokeStyle = {
        cap: item.strokeCap === 'round' || item.strokeCap === 'square' ? item.strokeCap : 'butt',
        join: item.strokeJoin === 'bevel' || item.strokeJoin === 'round' ? item.strokeJoin : 'miter',
        miterLimit: Number.isFinite(item.miterLimit) && item.miterLimit >= 1 ? item.miterLimit : 10,
        dashLength: 0,
        gapLength: 0,
        position: 'center',
      };
      const dash = item.dashArray ?? item.strokeDashArray ?? [];
      style.dashLength = Math.max(0, Number(dash[0]) || 0);
      style.gapLength = Math.max(0, Number(dash[1]) || 0);
      let spineSource: NGBezierPath;
      try {
        spineSource = host.bezierSourceOf(item);
      } catch {
        return null;
      }
      const band = this.expandBand(spineSource, style, width, item.strokeColor);
      if (!band) return null;
      temps.push(band);
      return { item, spine: item, band, width, style };
    }
    return null;
  }

  // Temp filled band for a Bézier spine record, or null when it cannot
  // expand. Callers own disposal of the returned item.
  private expandBand(spineSource: NGBezierPath, style: StrokeStyle, width: number, fill: Item): Item | null {
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

  // Gap disc at a crossing, widened for shallow crossing angles so the whole
  // over-band hides inside the gap.
  private gapDisc(center: Vec2, overWidth: number, underWidth: number, spineA: Item, spineB: Item): Item | null {
    const scope = this.host.paperScope();
    let sine = 1;
    try {
      const epsilon = Math.max(0.5, (overWidth + underWidth) / 4);
      const offA = spineA.getOffsetOf(new scope.Point(center.x, center.y));
      const offB = spineB.getOffsetOf(new scope.Point(center.x, center.y));
      if (Number.isFinite(offA) && Number.isFinite(offB)) {
        const a0 = spineA.getPointAt(Math.max(0, offA - epsilon));
        const a1 = spineA.getPointAt(offA + epsilon);
        const b0 = spineB.getPointAt(Math.max(0, offB - epsilon));
        const b1 = spineB.getPointAt(offB + epsilon);
        const ta = { x: a1.x - a0.x, y: a1.y - a0.y };
        const tb = { x: b1.x - b0.x, y: b1.y - b0.y };
        const la = Math.hypot(ta.x, ta.y); const lb = Math.hypot(tb.x, tb.y);
        if (la > 1e-9 && lb > 1e-9) sine = Math.abs(ta.x * tb.y - ta.y * tb.x) / (la * lb);
      }
    } catch { /* Circular gap. */ }
    const radius = (overWidth / 2 + gapPadding(underWidth)) / Math.max(sine, 0.35);
    if (!(radius > 0) || !Number.isFinite(radius)) return null;
    const prev = scope.settings?.insertItems;
    try {
      if (scope.settings) scope.settings.insertItems = false;
      return new scope.Path.Circle(new scope.Point(center.x, center.y), radius);
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
