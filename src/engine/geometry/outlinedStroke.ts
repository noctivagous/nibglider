// Pure stroke expansion for the outlined-stroke path mode. The spine stays
// editable authoring truth; resolution renders the expanded stroke band in
// its place. Cap/join/miter/dash/position mirror the ordinary stroke style
// features (see StyleManager and types.ts). No Paper.js dependency.
import type { NGBezierContour, NGOutlinedStrokePath } from '../model/NGPath';
import type { BezierSegment, ResolvedVectorGeometry, Vec2 } from '../model/geometryResolution';
import { validatePath } from '../model/serialization';
import { resolveCompositePath } from './compositeExpansion';
import { sampleBSpline, sampleCubic, type SamplingOptions } from './splineInterpolation';

const DEDUPE_EPS = 1e-9;

function distinct(points: Vec2[], point: Vec2): void {
  const last = points[points.length - 1];
  if (!last || Math.hypot(last.x - point.x, last.y - point.y) > DEDUPE_EPS) points.push({ ...point });
}

function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
function mul(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s }; }
function len(v: Vec2): number { return Math.hypot(v.x, v.y); }
function leftNormal(d: Vec2): Vec2 { return { x: -d.y, y: d.x }; }

/** Intersection of line (p + t*d) with line (q + u*e), or null when parallel. */
function lineIntersection(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const cross = d.x * e.y - d.y * e.x;
  if (Math.abs(cross) < 1e-12) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / cross;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

function arcSteps(radius: number, sweep: number, tolerance: number): number {
  if (!(radius > 0) || !(Math.abs(sweep) > 0)) return 0;
  const ratio = Math.min(1, Math.max(1e-6, tolerance / radius));
  const step = 2 * Math.acos(1 - ratio);
  return Math.max(1, Math.ceil(Math.abs(sweep) / step));
}

/** Points along an arc from angle a0 sweeping to a1 (exclusive of start). */
function arcPoints(center: Vec2, radius: number, a0: number, sweep: number, tolerance: number): Vec2[] {
  const points: Vec2[] = [];
  const steps = arcSteps(radius, sweep, tolerance);
  for (let i = 1; i <= steps; i++) {
    const a = a0 + sweep * i / steps;
    points.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return points;
}

function signedArea(loop: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]; const b = loop[(i + 1) % loop.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function flattenContour(contour: NGBezierContour, tolerance: number): Vec2[] {
  const points: Vec2[] = [];
  const n = contour.segments.length;
  if (!n) return points;
  for (let i = 0; i < (contour.closed ? n : n - 1); i++) {
    const s = contour.segments[i]; const t = contour.segments[(i + 1) % n];
    const from = s.point; const to = t.point;
    const c1 = { x: from.x + s.handleOut.x, y: from.y + s.handleOut.y };
    const c2 = { x: to.x + t.handleIn.x, y: to.y + t.handleIn.y };
    for (const p of sampleCubic(from, c1, c2, to, { tolerance })) distinct(points, p);
  }
  if (!contour.closed && n === 1) distinct(points, contour.segments[0].point);
  if (contour.closed && points.length > 1) {
    const first = points[0]; const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= DEDUPE_EPS) points.pop();
  }
  return points;
}

/** Flattened spine centerlines, one entry per contour/loop. */
function flattenSpine(path: NGOutlinedStrokePath, tolerance: number): Array<{ points: Vec2[]; closed: boolean }> {
  const spine = path.spine;
  if (spine.mode === 'bezier') {
    return spine.contours.map((contour) => ({ points: flattenContour(contour, tolerance), closed: contour.closed }));
  }
  if (spine.mode === 'ngComposite') {
    const resolved = resolveCompositePath(spine, { tolerance });
    return [{ points: resolved.segments.map((s) => ({ ...s.point })), closed: resolved.closed }];
  }
  const samples = sampleBSpline(spine.points, spine.closed, { tolerance });
  return [{ points: samples, closed: spine.closed }];
}

export interface ExpansionStyle {
  join: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  cap: 'butt' | 'round' | 'square';
  tolerance: number;
}

interface Sides { left: Vec2[]; right: Vec2[]; }

/** Styled outer join plus plain inner intersection for one interior vertex. */
function joinVertex(center: Vec2, dPrev: Vec2, dNext: Vec2, half: number, style: ExpansionStyle): { inner: Vec2; outer: Vec2[]; leftIsInner: boolean } {
  const nPrev = leftNormal(dPrev); const nNext = leftNormal(dNext);
  const cross = dPrev.x * dNext.y - dPrev.y * dNext.x;
  const leftIsInner = cross > 0;
  const inOff = leftIsInner ? mul(nPrev, half) : mul(nPrev, -half);
  const outOffPrev = leftIsInner ? mul(nPrev, -half) : mul(nPrev, half);
  const outOffNext = leftIsInner ? mul(nNext, -half) : mul(nNext, half);
  const qInPrev = { x: center.x + inOff.x, y: center.y + inOff.y };
  const qOutPrev = { x: center.x + outOffPrev.x, y: center.y + outOffPrev.y };
  const qOutNext = { x: center.x + outOffNext.x, y: center.y + outOffNext.y };
  const inner = lineIntersection(qInPrev, dPrev, { x: center.x + (leftIsInner ? nNext.x * half : -nNext.x * half),
    y: center.y + (leftIsInner ? nNext.y * half : -nNext.y * half) }, dNext) ?? qInPrev;
  if (Math.abs(cross) < 1e-12) return { inner: qInPrev, outer: [qOutPrev], leftIsInner };
  let outer: Vec2[];
  if (style.join === 'bevel') {
    outer = [qOutPrev, qOutNext];
  } else if (style.join === 'round') {
    const a0 = Math.atan2(qOutPrev.y - center.y, qOutPrev.x - center.x);
    let sweep = Math.atan2(qOutNext.y - center.y, qOutNext.x - center.x) - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    // Both offset normals rotate rigidly with the centerline, so the
    // normalized sweep already spans the outer corner.
    outer = [qOutPrev, ...arcPoints(center, half, a0, sweep, style.tolerance)];
  } else {
    const miter = lineIntersection(qOutPrev, dPrev, qOutNext, dNext);
    const ratio = miter ? Math.hypot(miter.x - center.x, miter.y - center.y) / (2 * half) : Infinity;
    outer = miter && ratio <= style.miterLimit ? [miter] : [qOutPrev, qOutNext];
  }
  return { inner, outer, leftIsInner };
}

/** Closed band loop for one open centerline piece. */
function expandOpenPiece(pts: Vec2[], half: number, style: ExpansionStyle): Vec2[] {
  const n = pts.length;
  const dirs: Vec2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const d = sub(pts[i + 1], pts[i]); const l = len(d);
    dirs.push(l > DEDUPE_EPS ? mul(d, 1 / l) : { x: 1, y: 0 });
  }
  const sides: Sides = { left: [], right: [] };
  const push = (list: Vec2[], p: Vec2) => distinct(list, p);
  const n0 = leftNormal(dirs[0]); const n1 = leftNormal(dirs[dirs.length - 1]);
  push(sides.left, { x: pts[0].x + n0.x * half, y: pts[0].y + n0.y * half });
  push(sides.right, { x: pts[0].x - n0.x * half, y: pts[0].y - n0.y * half });
  for (let i = 1; i < n - 1; i++) {
    const j = joinVertex(pts[i], dirs[i - 1], dirs[i], half, style);
    const innerList = j.leftIsInner ? sides.left : sides.right;
    const outerList = j.leftIsInner ? sides.right : sides.left;
    push(innerList, j.inner);
    for (const p of j.outer) push(outerList, p);
  }
  push(sides.left, { x: pts[n - 1].x + n1.x * half, y: pts[n - 1].y + n1.y * half });
  push(sides.right, { x: pts[n - 1].x - n1.x * half, y: pts[n - 1].y - n1.y * half });

  const loop: Vec2[] = [];
  if (style.cap === 'square') {
    const d0 = dirs[0];
    loop.push({ x: pts[0].x - d0.x * half + n0.x * half, y: pts[0].y - d0.y * half + n0.y * half });
  }
  for (const p of sides.left) distinct(loop, p);
  const tip = pts[n - 1];
  if (style.cap === 'round') {
    const a0 = Math.atan2(n1.y, n1.x);
    for (const p of arcPoints(tip, half, a0, -Math.PI, style.tolerance)) distinct(loop, p);
  } else if (style.cap === 'square') {
    const d1 = dirs[dirs.length - 1];
    distinct(loop, { x: tip.x + d1.x * half + n1.x * half, y: tip.y + d1.y * half + n1.y * half });
    distinct(loop, { x: tip.x + d1.x * half - n1.x * half, y: tip.y + d1.y * half - n1.y * half });
  }
  for (let i = sides.right.length - 1; i >= 0; i--) distinct(loop, sides.right[i]);
  const base = pts[0];
  if (style.cap === 'round') {
    const a0 = Math.atan2(-n0.y, -n0.x);
    for (const p of arcPoints(base, half, a0, -Math.PI, style.tolerance)) distinct(loop, p);
  } else if (style.cap === 'square') {
    const d0 = dirs[0];
    distinct(loop, { x: base.x - d0.x * half - n0.x * half, y: base.y - d0.y * half - n0.y * half });
  }
  return loop;
}

/** Offset loops for one closed centerline. Left/right assignment follows winding. */
function expandClosedCenterline(pts: Vec2[], half: number, style: ExpansionStyle): { left: Vec2[]; right: Vec2[] } {
  const n = pts.length;
  const dirs: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const d = sub(pts[(i + 1) % n], pts[i]); const l = len(d);
    dirs.push(l > DEDUPE_EPS ? mul(d, 1 / l) : { x: 1, y: 0 });
  }
  const left: Vec2[] = []; const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const j = joinVertex(pts[i], dirs[(i - 1 + n) % n], dirs[i], half, style);
    const innerList = j.leftIsInner ? left : right;
    const outerList = j.leftIsInner ? right : left;
    distinct(innerList, j.inner);
    for (const p of j.outer) distinct(outerList, p);
  }
  return { left, right };
}

/** Split an open polyline into on-dash runs by arc length. Empty when solid. */
function dashRuns(pts: Vec2[], dash: number, gap: number): Vec2[][] {
  if (!(dash > 0)) return [];
  const lengths: number[] = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = lengths[lengths.length - 1];
  if (!(total > 0)) return [];
  const at = (s: number): Vec2 => {
    const clamped = Math.max(0, Math.min(total, s));
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < clamped) i++;
    const span = lengths[i] - lengths[i - 1] || 1;
    const t = (clamped - lengths[i - 1]) / span;
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
  };
  const runs: Vec2[][] = [];
  const period = dash + Math.max(0, gap);
  for (let s = 0; s < total; s += period) {
    const run: Vec2[] = [];
    const end = Math.min(total, s + dash);
    distinct(run, at(s));
    // Preserve intermediate vertices inside the run.
    for (let i = 1; i < pts.length - 1; i++) {
      if (lengths[i] > s && lengths[i] < end) distinct(run, pts[i]);
    }
    distinct(run, at(end));
    if (run.length >= 2) runs.push(run);
  }
  return runs;
}

function toSegments(loop: Vec2[]): BezierSegment[] {
  return loop.map((point) => ({ point: { ...point }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } }));
}

export function resolveOutlinedStroke(path: NGOutlinedStrokePath, options: SamplingOptions = {}): ResolvedVectorGeometry {
  validatePath(path);
  const spineMode = (path.spine as { mode: string }).mode;
  if (spineMode === 'outlinedStroke' || spineMode === 'smoothedPolyline') {
    throw new Error(`Interpolation for ${spineMode} spine is not implemented yet`);
  }
  const tolerance = options.tolerance ?? 0.1;
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Sampling tolerance must be positive');
  const half = path.width / 2;
  const style: ExpansionStyle = { join: path.join, miterLimit: path.miterLimit, cap: path.cap, tolerance };
  const loops: Vec2[][] = [];
  for (const { points, closed } of flattenSpine(path, tolerance)) {
    if (points.length === 1) {
      // A lone control renders as a dot only with a round cap.
      if (!closed && path.cap === 'round') {
        const c = points[0];
        const dot: Vec2[] = [];
        for (const p of arcPoints(c, half, 0, 2 * Math.PI, tolerance)) distinct(dot, p);
        if (dot.length >= 3) loops.push(dot);
      }
      continue;
    }
    if (points.length < 2) continue;
    if (closed && points.length >= 3) {
      const dashed = dashRuns(points.concat([points[0]]), path.dashLength, path.gapLength);
      if (dashed.length) {
        for (const run of dashed) {
          const loop = expandOpenPiece(run, half, style);
          if (loop.length >= 3) loops.push(loop);
        }
        continue;
      }
      const { left, right } = expandClosedCenterline(points, half, style);
      const outer = Math.abs(signedArea(left)) >= Math.abs(signedArea(right)) ? left : right;
      const inner = outer === left ? right : left;
      if (path.position === 'center') {
        if (outer.length >= 3) loops.push(outer);
        if (inner.length >= 3) loops.push(inner);
      } else if (path.position === 'outside') {
        if (outer.length >= 3) loops.push(outer);
        loops.push(points.map((p) => ({ ...p })));
      } else {
        loops.push(points.map((p) => ({ ...p })));
        if (inner.length >= 3) loops.push(inner);
      }
    } else {
      const runs = dashRuns(points, path.dashLength, path.gapLength);
      const pieces = runs.length ? runs : [points];
      for (const run of pieces) {
        const loop = expandOpenPiece(run, half, style);
        if (loop.length >= 3) loops.push(loop);
      }
    }
  }
  if (loops.length === 0) return { kind: 'path', closed: false, segments: [] };
  if (loops.length === 1 && path.position === 'center') {
    return { kind: 'path', closed: true, segments: toSegments(loops[0]) };
  }
  return { kind: 'compoundPath', paths: loops.map((loop) => ({ kind: 'path' as const, closed: true, segments: toSegments(loop) })), fillRule: 'evenodd' };
}
