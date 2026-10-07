// Pure interlace weave geometry: no Paper.js dependency. Flattens member
// spines to polylines, finds ordered crossings, expands bands, and places
// peer-aligned gap footprints. Those footprints cluster crossings that share
// one daylight region. The cut itself is not the footprint: the caller
// subtracts the under-band's overlap with the padded over-band, so the cut
// edge is that band's outline at whatever overlap the strokes actually have.
import type { NGBezierPath, NGCompositePath, NGBSplinePath, NGOutlinedStrokePath } from '../model/NGPath';
import type { ResolvedPath, Vec2 } from '../model/geometryResolution';
import { resolvePath } from './pathResolver';
import { resolveOutlinedStroke } from './outlinedStroke';
import { sampleCubic } from './splineInterpolation';

export class WeaveError extends Error {
  constructor(message: string) { super(message); this.name = 'WeaveError'; }
}

/** Gap daylight beyond the over-band edge, in document points. */
export function gapPadding(underWidth: number): number {
  return Math.max(2, underWidth * 0.15);
}

export interface InterlaceGapRect { angle: number; length: number; width: number }

/** Stable crossing key: pair members in weave order plus the crossing index
 * along the earlier member's spine. Appended members never shift existing
 * pairs' keys, so per-crossing picks survive adds. */
export function crossingKey(earlierId: string, laterId: string, index: number): string {
  return `${earlierId}>${laterId}#${index}`;
}

/** Peer-aligned footprint for clustering crossings into one daylight region.
 * Length spans the under-band even at shallow angles; width clears the
 * over-band plus daylight. Padding defaults to the baked-op daylight when
 * the caller passes none. This rectangle is not the cutter — a real overlap
 * can be shorter, longer, or bent around a corner. */
export function gapRectFor(overAngle: number, overWidth: number, underWidth: number, sine: number, padding?: number): InterlaceGapRect {
  const grip = Math.min(1, Math.max(sine, 0.35));
  const pad = padding === undefined ? gapPadding(underWidth) : Math.max(0, padding);
  if (!Number.isFinite(pad)) throw new WeaveError('Invalid gap padding');
  return {
    angle: overAngle,
    length: underWidth / grip + 2 * pad,
    width: overWidth + 2 * pad,
  };
}

/** Corner-join style of a ribbon cutter. Mirrors the over-band's own
 * expansion join so the cut follows the band's outline at sharp corners
 * instead of leaving notches or stray spikes there. */
export interface RibbonJoinOptions {
  join?: 'miter' | 'bevel';
  miterLimit?: number;
}

function ribbonLineIntersection(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const denom = d.x * e.y - d.y * e.x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / denom;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

/** Closed offset polygon hugging one centerline: side edges run parallel
 * to the samples (curved when the peer curves), ends are butt caps
 * perpendicular to the end tangents. Interior vertices use true miter
 * intersections (capped by the miter limit, bevel fallback). A finite
 * window of this polygon is not a gap cutter: its butt ends and inner
 * miter land inside the under-band whenever the overlap is not that
 * window, and the boolean leftover is a stray point. */
export function ribbonPolygon(centerline: Vec2[], halfWidth: number, opts?: RibbonJoinOptions): Vec2[] {
  if (!Array.isArray(centerline) || centerline.length < 2) throw new WeaveError('Ribbon needs at least two samples');
  if (!(halfWidth > 0) || !Number.isFinite(halfWidth)) throw new WeaveError('Ribbon needs a positive half width');
  const join = opts?.join === 'bevel' ? 'bevel' : 'miter';
  const miterLimit = opts?.miterLimit !== undefined
    && Number.isFinite(opts.miterLimit) && opts.miterLimit >= 1 ? opts.miterLimit : 10;
  const pts: Vec2[] = [];
  for (const p of centerline) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new WeaveError('Ribbon samples must be finite');
    distinct(pts, { ...p });
  }
  if (pts.length < 2) throw new WeaveError('Ribbon samples are degenerate');
  const h = halfWidth;
  const dirs: Vec2[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1].x - pts[i].x; const dy = pts[i + 1].y - pts[i].y;
    const l = Math.hypot(dx, dy);
    dirs.push(l > 1e-9 ? { x: dx / l, y: dy / l }
      : dirs.length ? { ...dirs[dirs.length - 1] } : { x: 1, y: 0 });
  }
  const off = (p: Vec2, n: Vec2, s: number): Vec2 => ({ x: p.x + n.x * s * h, y: p.y + n.y * s * h });
  const left: Vec2[] = []; const right: Vec2[] = [];
  const push = (list: Vec2[], p: Vec2): void => {
    const last = list[list.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > DEDUPE_EPS) list.push({ ...p });
  };
  const n0 = { x: -dirs[0].y, y: dirs[0].x };
  push(left, off(pts[0], n0, 1)); push(right, off(pts[0], n0, -1));
  for (let i = 1; i + 1 < pts.length; i++) {
    const nPrev = { x: -dirs[i - 1].y, y: dirs[i - 1].x };
    const nNext = { x: -dirs[i].y, y: dirs[i].x };
    const cross = dirs[i - 1].x * dirs[i].y - dirs[i - 1].y * dirs[i].x;
    const leftIsInner = cross > 0;
    // Inner side: plain offset-line intersection, matching the band's own
    // expansion. Guarded by the miter limit so hairpins cannot throw a
    // spike across the centerline.
    const inSign = leftIsInner ? 1 : -1;
    const qInPrev = off(pts[i], nPrev, inSign);
    const qInNext = off(pts[i], nNext, inSign);
    const innerHit = Math.abs(cross) < 1e-12 ? qInPrev
      : ribbonLineIntersection(qInPrev, dirs[i - 1], qInNext, dirs[i]) ?? qInPrev;
    const inner = Math.hypot(innerHit.x - pts[i].x, innerHit.y - pts[i].y) <= miterLimit * 2 * h
      ? innerHit : qInPrev;
    // Outer side: styled join — miter capped by the limit, bevel fallback.
    const outSign = -inSign;
    const qOutPrev = off(pts[i], nPrev, outSign);
    const qOutNext = off(pts[i], nNext, outSign);
    let outer: Vec2[];
    if (Math.abs(cross) < 1e-12) {
      outer = [qOutPrev];
    } else if (join === 'bevel') {
      outer = [qOutPrev, qOutNext];
    } else {
      const miter = ribbonLineIntersection(qOutPrev, dirs[i - 1], qOutNext, dirs[i]);
      const ratio = miter ? Math.hypot(miter.x - pts[i].x, miter.y - pts[i].y) / (2 * h) : Infinity;
      outer = miter && ratio <= miterLimit ? [miter] : [qOutPrev, qOutNext];
    }
    const innerList = leftIsInner ? left : right;
    const outerList = leftIsInner ? right : left;
    push(innerList, inner);
    for (const p of outer) push(outerList, p);
  }
  const n1 = { x: -dirs[dirs.length - 1].y, y: dirs[dirs.length - 1].x };
  const last = pts[pts.length - 1];
  push(left, off(last, n1, 1)); push(right, off(last, n1, -1));
  return [...left, ...right.reverse()];
}

/** One crossing's cutter footprint for overlap clustering: center plus the
 * half-length of its gap window along the over-spine. */
export interface CrossingSlot {
  center: Vec2;
  halfLen: number;
}

/** Group crossing slots whose gap windows overlap into single cuts. Slots
 * arrive in spine order; a slot joins the open cluster when its window
 * overlaps any member's, otherwise it starts a new one. Returns index
 * groups in order. Overlapping windows cannot weave independently — one
 * connected daylight region admits a single over side — so each group cuts
 * once. Well-separated crossings always group alone and keep their keys. */
export function clusterSlots(slots: CrossingSlot[]): number[][] {
  const clusters: number[][] = [];
  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s];
    if (!slot || !slot.center || !Number.isFinite(slot.center.x) || !Number.isFinite(slot.center.y)
      || !(slot.halfLen > 0) || !Number.isFinite(slot.halfLen)) {
      throw new WeaveError('Clustering needs finite centers and positive half lengths');
    }
    const open = clusters[clusters.length - 1];
    const joins = open?.some((m) =>
      Math.hypot(slot.center.x - slots[m].center.x, slot.center.y - slots[m].center.y)
        < slot.halfLen + slots[m].halfLen) ?? false;
    if (open && joins) open.push(s);
    else clusters.push([s]);
  }
  return clusters;
}

export type WeaveSpine = NGBezierPath | NGCompositePath | NGBSplinePath | NGOutlinedStrokePath;

export interface WeaveStroke {
  width: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  dashLength: number;
  gapLength: number;
  position: 'center' | 'inside' | 'outside';
}

/** Canvas stroke settings of a Paper path as weave input, or null when the
 * item paints no stroke. Reads only; never touches the scene. */
export function canvasStrokeOf(item: any): WeaveStroke | null {
  const width = Number(item?.strokeWidth);
  if (!(width > 0) || item?.strokeColor == null) return null;
  const dash = item.dashArray ?? item.strokeDashArray ?? [];
  return {
    width,
    cap: item.strokeCap === 'round' || item.strokeCap === 'square' ? item.strokeCap : 'butt',
    join: item.strokeJoin === 'bevel' || item.strokeJoin === 'round' ? item.strokeJoin : 'miter',
    miterLimit: Number.isFinite(item.miterLimit) && item.miterLimit >= 1 ? item.miterLimit : 10,
    dashLength: Math.max(0, Number(dash[0]) || 0),
    gapLength: Math.max(0, Number(dash[1]) || 0),
    position: 'center',
  };
}

/** One weave member. Width/style are explicit: callers mirror the record
 * values, including outlined-stroke records (whose own spine resolves). */
export interface WeaveMember {
  id: string;
  source: WeaveSpine;
  stroke: WeaveStroke;
}

export interface WeaveGap extends InterlaceGapRect { targetId: string; center: Vec2 }
export interface WeaveBand { memberId: string; loops: Vec2[][] }
export interface InterlaceWeave { order: [string, string]; bands: WeaveBand[]; gaps: WeaveGap[] }

interface Crossing { point: Vec2; offset: number; tanA: Vec2; tanB: Vec2 }

const DEDUPE_EPS = 1e-9;

function distinct(points: Vec2[], point: Vec2): void {
  const last = points[points.length - 1];
  if (!last || Math.hypot(last.x - point.x, last.y - point.y) > DEDUPE_EPS) points.push({ ...point });
}

/** Straight-line samples of one resolved path (Bézier spans flattened). */
function flattenResolved(geometry: ResolvedPath, tolerance: number): Vec2[] {
  const points: Vec2[] = [];
  const n = geometry.segments.length;
  if (!n) return points;
  for (let i = 0; i < (geometry.closed ? n : n - 1); i++) {
    const s = geometry.segments[i]; const t = geometry.segments[(i + 1) % n];
    const c1 = { x: s.point.x + s.handleOut.x, y: s.point.y + s.handleOut.y };
    const c2 = { x: t.point.x + t.handleIn.x, y: t.point.y + t.handleIn.y };
    for (const p of sampleCubic(s.point, c1, c2, t.point, { tolerance })) distinct(points, p);
  }
  if (!geometry.closed && n === 1) distinct(points, geometry.segments[0].point);
  if (geometry.closed && points.length > 1) {
    const first = points[0]; const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= DEDUPE_EPS) points.pop();
  }
  return points;
}

function centerline(member: WeaveMember, tolerance: number): { points: Vec2[]; closed: boolean } {
  const spine = member.source.mode === 'outlinedStroke' ? member.source.spine : member.source;
  const geometry = resolvePath(spine, { tolerance });
  if (geometry.kind !== 'path') throw new WeaveError(`Member ${member.id} spine must resolve to one path`);
  const points = flattenResolved(geometry, tolerance);
  if (points.length < 2) throw new WeaveError(`Member ${member.id} spine is degenerate`);
  return { points, closed: geometry.closed };
}

function segCross(p: Vec2, p2: Vec2, q: Vec2, q2: Vec2): { t: number; u: number } | null {
  const dx1 = p2.x - p.x; const dy1 = p2.y - p.y;
  const dx2 = q2.x - q.x; const dy2 = q2.y - q.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((q.x - p.x) * dy2 - (q.y - p.y) * dx2) / denom;
  const u = ((q.x - p.x) * dy1 - (q.y - p.y) * dx1) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)) };
}

/** Crossings ordered along polyline A by arc length. Closed polylines
 * include their closing segment, so a crossing on the last edge of a
 * polygon spine (a hexagon edge back to the start vertex) is found. */
function weaveCrossings(polyA: Vec2[], closedA: boolean, polyB: Vec2[], closedB: boolean): Crossing[] {
  const segCountA = polyA.length - 1 + (closedA && polyA.length > 2 ? 1 : 0);
  const segCountB = polyB.length - 1 + (closedB && polyB.length > 2 ? 1 : 0);
  const lengthsA: number[] = [0];
  for (let i = 0; i < segCountA; i++) {
    const p = polyA[i]; const q = polyA[(i + 1) % polyA.length];
    lengthsA.push(lengthsA[i] + Math.hypot(q.x - p.x, q.y - p.y));
  }
  const found: Crossing[] = [];
  for (let i = 0; i < segCountA; i++) {
    const a0 = polyA[i]; const a1 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < segCountB; j++) {
      const b0 = polyB[j]; const b1 = polyB[(j + 1) % polyB.length];
      const hit = segCross(a0, a1, b0, b1);
      if (!hit) continue;
      const spanA = lengthsA[i + 1] - lengthsA[i] || 1;
      found.push({
        point: { x: a0.x + (a1.x - a0.x) * hit.t, y: a0.y + (a1.y - a0.y) * hit.t },
        offset: lengthsA[i] + spanA * hit.t,
        tanA: { x: a1.x - a0.x, y: a1.y - a0.y },
        tanB: { x: b1.x - b0.x, y: b1.y - b0.y },
      });
    }
  }
  found.sort((p, q) => p.offset - q.offset);
  return found.filter((entry, index) => index === 0
    || Math.hypot(entry.point.x - found[index - 1].point.x, entry.point.y - found[index - 1].point.y) > 1e-4);
}

function bandLoops(member: WeaveMember, tolerance: number): Vec2[][] {
  const spine = member.source.mode === 'outlinedStroke' ? member.source.spine : member.source;
  const geometry = resolveOutlinedStroke({ id: `${member.id}-band`, mode: 'outlinedStroke',
    spine, width: member.stroke.width, cap: member.stroke.cap, join: member.stroke.join,
    miterLimit: member.stroke.miterLimit, dashLength: member.stroke.dashLength,
    gapLength: member.stroke.gapLength, position: member.stroke.position }, { tolerance });
  const loops = geometry.kind === 'path' ? [geometry] : geometry.paths;
  return loops.map((loop) => loop.segments.map((s) => ({ ...s.point })));
}

function checkMember(member: WeaveMember): void {
  if (!member || typeof member.id !== 'string' || !member.id) throw new WeaveError('Weave members need string IDs');
  if (!member.source || typeof member.source !== 'object') throw new WeaveError(`Member ${member.id} needs a path source`);
  if (member.source.mode !== 'bezier' && member.source.mode !== 'bSpline'
    && member.source.mode !== 'ngComposite' && member.source.mode !== 'outlinedStroke') {
    throw new WeaveError(`Member ${member.id} spine mode is not weavable yet`);
  }
  const stroke = member.stroke;
  if (!(stroke.width > 0) || !Number.isFinite(stroke.width)) throw new WeaveError(`Member ${member.id} needs a positive width`);
  if (!(stroke.miterLimit >= 1) || !Number.isFinite(stroke.miterLimit)) throw new WeaveError(`Member ${member.id} needs a miter limit`);
  for (const [key, values] of [['cap', ['butt', 'round', 'square']], ['join', ['miter', 'round', 'bevel']],
    ['position', ['center', 'inside', 'outside']]] as Array<[keyof WeaveStroke, string[]]>) {
    if (!values.includes(stroke[key] as string)) throw new WeaveError(`Member ${member.id} has an invalid ${key}`);
  }
  for (const key of ['dashLength', 'gapLength'] as const) {
    if (!(stroke[key] >= 0) || !Number.isFinite(stroke[key])) throw new WeaveError(`Member ${member.id} has an invalid ${key}`);
  }
}

/** Resolve two member records to band loops plus ordered gap footprints.
 * Exactly two members in v1; crossings sort along the first-role spine and
 * alternate over/under from phase, unless an override names the over member
 * for that crossing key. Crossings whose gap windows overlap (a corner
 * region crossed twice, like a bar through neighboring hexagon edges) merge
 * into one cut under the first member's roles, with the window spanning
 * every member site — one connected daylight region admits a single over
 * side. Throws WeaveError when unresolvable. */
export function resolveInterlaceGroup(
  members: [WeaveMember, WeaveMember],
  params: { phase: 0 | 1; padding: number; firstId: string; overrides?: Record<string, string> },
  tolerance = 0.1,
): InterlaceWeave {
  if (!Array.isArray(members) || members.length !== 2) throw new WeaveError('Interlace groups hold exactly two members');
  for (const member of members) checkMember(member);
  if (members[0].id === members[1].id) throw new WeaveError('Interlace members must differ');
  if (params.phase !== 0 && params.phase !== 1) throw new WeaveError('Interlace phase must be 0 or 1');
  if (!(params.padding >= 0) || !Number.isFinite(params.padding)) throw new WeaveError('Interlace padding must be finite');
  const first = members.find((member) => member.id === params.firstId) ?? members[0];
  const second = first === members[0] ? members[1] : members[0];
  const lineFirst = centerline(first, tolerance);
  const lineSecond = centerline(second, tolerance);
  const crossings = weaveCrossings(lineFirst.points, lineFirst.closed,
    lineSecond.points, lineSecond.closed);
  if (!crossings.length) throw new WeaveError('Members do not cross');
  const overrides = params.overrides ?? {};
  const solo = crossings.map((crossing, i) => {
    const key = crossingKey(first.id, second.id, i);
    const explicit = overrides[key];
    const overFirst = explicit === first.id ? true
      : explicit === second.id ? false
      : (i + params.phase) % 2 === 0;
    const over = overFirst ? first : second;
    const under = overFirst ? second : first;
    const overTan = overFirst ? crossing.tanA : crossing.tanB;
    const underTan = overFirst ? crossing.tanB : crossing.tanA;
    const lo = Math.hypot(overTan.x, overTan.y); const lu = Math.hypot(underTan.x, underTan.y);
    const sine = lo > 1e-9 && lu > 1e-9
      ? Math.abs(overTan.x * underTan.y - overTan.y * underTan.x) / (lo * lu) : 1;
    const halfLen = gapRectFor(0, over.stroke.width, under.stroke.width, sine, params.padding).length / 2;
    return { key, over, under, overTan, sine, halfLen, center: crossing.point };
  });
  // Overlapping windows share one daylight region and one over side, so
  // each cluster cuts once: the first member's roles stand, and the window
  // spans every member site. Lone crossings cluster alone, unchanged.
  const gaps: WeaveGap[] = clusterSlots(solo).map((group) => {
    const head = solo[group[0]];
    let span = 0;
    for (const m of group) {
      span = Math.max(span, solo[m].halfLen + Math.hypot(solo[m].center.x - head.center.x,
        solo[m].center.y - head.center.y));
    }
    const rect = gapRectFor(Math.atan2(head.overTan.y, head.overTan.x),
      head.over.stroke.width, head.under.stroke.width, head.sine, params.padding);
    rect.length = Math.max(rect.length, 2 * span);
    return { targetId: head.under.id, center: head.center, ...rect };
  });
  return {
    order: [first.id, second.id],
    bands: [first, second].map((member) => ({ memberId: member.id, loops: bandLoops(member, tolerance) })),
    gaps,
  };
}
