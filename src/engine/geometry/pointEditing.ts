// Point editing: pure operations over Bézier segment lists.
// Segments use the model's convention (geometryResolution.ts):
// every anchor carries handleIn/handleOut as offsets relative to
// the anchor. All functions return new arrays and never mutate
// their input, so callers can snapshot cheaply for undo.
// A "contour" here is one path's segments plus its closed flag;
// indices wrap on closed contours for edge operations.
// Tested from tests/point-editing.test.mjs.
import type { BezierSegment, Vec2 } from '../model/geometryResolution';
import type { NGBezierPath } from '../model/NGPath';
import type { NGDrawable, NGPathDrawable } from '../model/NGDrawable';
import { resolveDrawableGeometry } from './pathResolver';

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
const neg = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y });
const cloneSeg = (s: BezierSegment): BezierSegment => ({
  point: { ...s.point }, handleIn: { ...s.handleIn }, handleOut: { ...s.handleOut },
});
export const cloneSegments = (segments: readonly BezierSegment[]): BezierSegment[] => segments.map(cloneSeg);

function at(segments: readonly BezierSegment[], index: number, closed: boolean): number {
  const n = segments.length;
  if (n === 0) return -1;
  if (closed) return ((index % n) + n) % n;
  return index >= 0 && index < n ? index : -1;
}

/** Move an anchor; its relative handles travel with it. */
export function moveAnchor(
  segments: readonly BezierSegment[], index: number, to: Vec2, closed = false,
): BezierSegment[] {
  const i = at(segments, index, closed);
  const out = cloneSegments(segments);
  if (i < 0) return out;
  out[i].point = { ...to };
  return out;
}

/**
 * Move one handle of an anchor to an absolute position.
 * Coupled (a smooth point): the opposite handle mirrors through
 * the anchor, keeping direction and length equal — the classic
 * smooth-point drag. Broken: only the named handle moves.
 */
export function moveHandle(
  segments: readonly BezierSegment[],
  index: number,
  which: 'in' | 'out',
  toAbsolute: Vec2,
  opts: { coupled?: boolean; closed?: boolean } = {},
): BezierSegment[] {
  const i = at(segments, index, opts.closed ?? false);
  const out = cloneSegments(segments);
  if (i < 0) return out;
  const offset = sub(toAbsolute, out[i].point);
  if (which === 'out') {
    out[i].handleOut = offset;
    if (opts.coupled) out[i].handleIn = neg(offset);
  } else {
    out[i].handleIn = offset;
    if (opts.coupled) out[i].handleOut = neg(offset);
  }
  return out;
}

/** True when a point's handles are collinear and non-zero (smooth). */
export function isSmoothPoint(segments: readonly BezierSegment[], index: number, closed = false): boolean {
  const i = at(segments, index, closed);
  if (i < 0) return false;
  const { handleIn, handleOut } = segments[i];
  if ((handleIn.x === 0 && handleIn.y === 0) || (handleOut.x === 0 && handleOut.y === 0)) return false;
  const cross = handleIn.x * handleOut.y - handleIn.y * handleOut.x;
  const dot = handleIn.x * handleOut.x + handleIn.y * handleOut.y;
  return Math.abs(cross) < 1e-9 && dot < 0;
}

/** Move the edge between anchor `index` and the next anchor. */
export function moveEdge(
  segments: readonly BezierSegment[], index: number, delta: Vec2, closed = false,
): BezierSegment[] {
  const i = at(segments, index, closed);
  const j = at(segments, index + 1, closed);
  const out = cloneSegments(segments);
  if (i < 0 || j < 0 || i === j) return out;
  out[i].point = add(out[i].point, delta);
  out[j].point = add(out[j].point, delta);
  return out;
}

/**
 * Split the cubic from anchor `index` to the next anchor at
 * parameter t (0..1), inserting a new anchor there. De Casteljau:
 * the curve's shape is unchanged; the two halves carry exact
 * subdivided control points. Returns segments with one more entry.
 */
export function insertPointOnSegment(
  segments: readonly BezierSegment[], index: number, t: number, closed = false,
): BezierSegment[] {
  const i = at(segments, index, closed);
  const j = at(segments, index + 1, closed);
  const out = cloneSegments(segments);
  if (i < 0 || j < 0 || i === j) return out;
  const tt = Math.min(1 - 1e-6, Math.max(1e-6, t));
  const p0 = segments[i].point;
  const p1 = add(p0, segments[i].handleOut);
  const p3 = segments[j].point;
  const p2 = add(p3, segments[j].handleIn);
  const lerp = (a: Vec2, b: Vec2): Vec2 => add(scale(a, 1 - tt), scale(b, tt));
  const q0 = lerp(p0, p1); const q1 = lerp(p1, p2); const q2 = lerp(p2, p3);
  const r0 = lerp(q0, q1); const r1 = lerp(q1, q2);
  const m = lerp(r0, r1);
  out[i].handleOut = sub(q0, p0);
  const inserted: BezierSegment = {
    point: m,
    handleIn: sub(r0, m),
    handleOut: sub(r1, m),
  };
  out[j].handleIn = sub(q2, p3);
  out.splice(j <= i ? out.length : j, 0, inserted);
  // Closed wrap case (last -> first): the inserted point belongs at
  // the end of the list, which splice position out.length gives.
  return out;
}

/** Delete an anchor. Neighbouring handles are left as they were. */
export function deletePoint(
  segments: readonly BezierSegment[], index: number, closed = false,
): BezierSegment[] {
  const i = at(segments, index, closed);
  const out = cloneSegments(segments);
  if (i < 0 || out.length <= 1) return out;
  out.splice(i, 1);
  return out;
}

/**
 * Convert a point: 'corner' zeroes both handles; 'smooth' makes
 * the handles collinear along the direction to the neighbouring
 * anchors, preserving each handle's length (or deriving a length
 * from the neighbour distance when a handle is zero).
 */
export function convertPoint(
  segments: readonly BezierSegment[], index: number, to: 'corner' | 'smooth', closed = false,
): BezierSegment[] {
  const i = at(segments, index, closed);
  const out = cloneSegments(segments);
  if (i < 0) return out;
  if (to === 'corner') {
    out[i].handleIn = { x: 0, y: 0 };
    out[i].handleOut = { x: 0, y: 0 };
    return out;
  }
  const prev = at(segments, index - 1, closed);
  const next = at(segments, index + 1, closed);
  const anchor = segments[i].point;
  let dir: Vec2 = { x: 1, y: 0 };
  if (prev >= 0 && next >= 0 && prev !== i && next !== i) dir = sub(segments[next].point, segments[prev].point);
  else if (next >= 0 && next !== i) dir = sub(segments[next].point, anchor);
  else if (prev >= 0 && prev !== i) dir = sub(anchor, segments[prev].point);
  const len = Math.hypot(dir.x, dir.y);
  if (len < 1e-9) return out;
  const unit = scale(dir, 1 / len);
  const outLen = Math.hypot(out[i].handleOut.x, out[i].handleOut.y)
    || (next >= 0 ? Math.hypot(segments[next].point.x - anchor.x, segments[next].point.y - anchor.y) / 3 : 10);
  const inLen = Math.hypot(out[i].handleIn.x, out[i].handleIn.y)
    || (prev >= 0 ? Math.hypot(anchor.x - segments[prev].point.x, anchor.y - segments[prev].point.y) / 3 : 10);
  out[i].handleOut = scale(unit, outLen);
  out[i].handleIn = scale(unit, -inLen);
  return out;
}

/** Reverse a contour (for joining endpoints in matching direction). */
export function reverseSegments(segments: readonly BezierSegment[]): BezierSegment[] {
  const n = segments.length;
  const out: BezierSegment[] = [];
  for (let j = 0; j < n; j += 1) {
    const orig = segments[n - 1 - j];
    out.push({
      point: { ...orig.point },
      handleIn: { ...orig.handleOut },
      handleOut: { ...orig.handleIn },
    });
  }
  return out;
}

/**
 * Join two open contours end-to-start: the joint anchor is a's
 * last point; the outgoing handle comes from b's first segment
 * (it governed the curve leaving b's start). The caller picks
 * orientations with reverseSegments.
 */
export function joinContours(
  a: readonly BezierSegment[], b: readonly BezierSegment[],
): BezierSegment[] {
  if (a.length === 0) return cloneSegments(b);
  if (b.length === 0) return cloneSegments(a);
  const head = cloneSegments(a);
  const tail = cloneSegments(b);
  head[head.length - 1].handleOut = { ...tail[0].handleOut };
  return [...head, ...tail.slice(1)];
}

/** Join the end of contour a to the end of contour b (b reversed). */
export function joinEndToEnd(
  a: readonly BezierSegment[], b: readonly BezierSegment[],
): BezierSegment[] {
  return joinContours(a, reverseSegments(b));
}

/** Join the start of contour a to the start of contour b (a reversed). */
export function joinStartToStart(
  a: readonly BezierSegment[], b: readonly BezierSegment[],
): BezierSegment[] {
  return joinContours(reverseSegments(a), b);
}

/**
 * Lower any path/shape drawable to a plain Bézier path drawable —
 * the model bridge for point editing: semantic sources that can
 * express the edit keep their form (the caller decides); anything
 * point-edited lands here. Text/image/group drawables return null.
 * The drawable's identity, layer, style and paint fields carry over.
 */
export function lowerToBezierPath(drawable: NGDrawable): NGPathDrawable | null {
  if (drawable.kind !== 'path' && drawable.kind !== 'shape') return null;
  if (drawable.kind === 'path' && drawable.source.mode === 'bezier') {
    return structuredClone(drawable) as NGPathDrawable;
  }
  const geometry = resolveDrawableGeometry(drawable);
  const contours = geometry.kind === 'path'
    ? [{ closed: geometry.closed, segments: cloneSegments(geometry.segments) }]
    : geometry.paths.map((path) => ({ closed: path.closed, segments: cloneSegments(path.segments) }));
  const sourceId = drawable.kind === 'path' ? drawable.source.id : drawable.id;
  const source: NGBezierPath = {
    id: sourceId,
    mode: 'bezier',
    contours,
    fillRule: geometry.kind === 'compoundPath' ? geometry.fillRule : 'nonzero',
  };
  return {
    id: drawable.id,
    kind: 'path',
    layerId: drawable.layerId,
    transform: { ...drawable.transform },
    opacity: drawable.opacity,
    visible: drawable.visible,
    locked: drawable.locked,
    ...(drawable.name !== undefined ? { name: drawable.name } : {}),
    ...(drawable.styleId !== undefined ? { styleId: drawable.styleId } : {}),
    source,
  };
}
