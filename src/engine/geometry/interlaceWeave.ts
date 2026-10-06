// Pure interlace weave geometry: no Paper.js dependency. Flattens member
// spines to polylines, finds ordered crossings, expands bands, and places
// peer-aligned gap footprints. Both the baked Paper-side op and the live
// group resolver build on these pieces; boolean cutting stays with the
// caller (Paper subtract for the baked op, the renderer for groups).
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

/** Peer-aligned gap footprint: long sides run parallel to the over-band, so
 * the under-band's cut ends parallel the peer. Length spans the under-band
 * even at shallow crossing angles; width clears the over-band plus daylight.
 * Padding defaults to the baked-op daylight when the caller passes none. */
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

function centerline(member: WeaveMember, tolerance: number): Vec2[] {
  const spine = member.source.mode === 'outlinedStroke' ? member.source.spine : member.source;
  const geometry = resolvePath(spine, { tolerance });
  if (geometry.kind !== 'path') throw new WeaveError(`Member ${member.id} spine must resolve to one path`);
  const points = flattenResolved(geometry, tolerance);
  if (points.length < 2) throw new WeaveError(`Member ${member.id} spine is degenerate`);
  return points;
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

/** Crossings ordered along polyline A by arc length. */
function weaveCrossings(polyA: Vec2[], polyB: Vec2[]): Crossing[] {
  const lengthsA: number[] = [0];
  for (let i = 1; i < polyA.length; i++) {
    lengthsA.push(lengthsA[i - 1] + Math.hypot(polyA[i].x - polyA[i - 1].x, polyA[i].y - polyA[i - 1].y));
  }
  const found: Crossing[] = [];
  for (let i = 0; i + 1 < polyA.length; i++) {
    for (let j = 0; j + 1 < polyB.length; j++) {
      const hit = segCross(polyA[i], polyA[i + 1], polyB[j], polyB[j + 1]);
      if (!hit) continue;
      const spanA = lengthsA[i + 1] - lengthsA[i] || 1;
      found.push({
        point: { x: polyA[i].x + (polyA[i + 1].x - polyA[i].x) * hit.t,
          y: polyA[i].y + (polyA[i + 1].y - polyA[i].y) * hit.t },
        offset: lengthsA[i] + spanA * hit.t,
        tanA: { x: polyA[i + 1].x - polyA[i].x, y: polyA[i + 1].y - polyA[i].y },
        tanB: { x: polyB[j + 1].x - polyB[j].x, y: polyB[j + 1].y - polyB[j].y },
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
 * alternate over/under from phase. Throws WeaveError when unresolvable. */
export function resolveInterlaceGroup(
  members: [WeaveMember, WeaveMember],
  params: { phase: 0 | 1; padding: number; firstId: string },
  tolerance = 0.1,
): InterlaceWeave {
  if (!Array.isArray(members) || members.length !== 2) throw new WeaveError('Interlace groups hold exactly two members');
  for (const member of members) checkMember(member);
  if (members[0].id === members[1].id) throw new WeaveError('Interlace members must differ');
  if (params.phase !== 0 && params.phase !== 1) throw new WeaveError('Interlace phase must be 0 or 1');
  if (!(params.padding >= 0) || !Number.isFinite(params.padding)) throw new WeaveError('Interlace padding must be finite');
  const first = members.find((member) => member.id === params.firstId) ?? members[0];
  const second = first === members[0] ? members[1] : members[0];
  const polyFirst = centerline(first, tolerance);
  const polySecond = centerline(second, tolerance);
  const crossings = weaveCrossings(polyFirst, polySecond);
  if (!crossings.length) throw new WeaveError('Members do not cross');
  const gaps: WeaveGap[] = crossings.map((crossing, i) => {
    const overFirst = (i + params.phase) % 2 === 0;
    const over = overFirst ? first : second;
    const under = overFirst ? second : first;
    const overTan = overFirst ? crossing.tanA : crossing.tanB;
    const underTan = overFirst ? crossing.tanB : crossing.tanA;
    const lo = Math.hypot(overTan.x, overTan.y); const lu = Math.hypot(underTan.x, underTan.y);
    const sine = lo > 1e-9 && lu > 1e-9
      ? Math.abs(overTan.x * underTan.y - overTan.y * underTan.x) / (lo * lu) : 1;
    const rect = gapRectFor(Math.atan2(overTan.y, overTan.x), over.stroke.width, under.stroke.width, sine, params.padding);
    return { targetId: under.id, center: crossing.point, ...rect };
  });
  return {
    order: [first.id, second.id],
    bands: [first, second].map((member) => ({ memberId: member.id, loops: bandLoops(member, tolerance) })),
    gaps,
  };
}
