// Fit a flattened polyline back to cubics. Collinear runs collapse to a
// single straight segment with the original endpoints. Curved runs use
// Schneider fitting: every dropped sample stays within `tolerance` of the
// cubic, and any vertex whose turn is sharper than a sampled arc stays an
// anchor. That is the same tolerance the stroke flattener already spent, so
// a circle comes back as a few beziers and a polygon does not move.
import type { BezierSegment, Vec2 } from '../model/geometryResolution';

const COLLINEAR = 1e-3;
const CORNER = 0.55;

export function reducePolyline(points: Vec2[], closed: boolean, tolerance = 0.1): BezierSegment[] {
  const src = deduped(points, closed);
  if (src.length < 2) return src.map(anchor);
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) return src.map(anchor);
  const corners = cornerIndices(src, closed);
  if (!corners.length) {
    return closed ? fitClosed(src, tolerance) : fitOpen(src, tolerance);
  }
  const out: BezierSegment[] = [];
  const spans = closed ? corners.length : corners.length - 1;
  for (let k = 0; k < spans; k++) {
    const chain = sliceChain(src, corners[k], corners[(k + 1) % corners.length]);
    appendChain(out, fitOpen(chain, tolerance), closed && k === spans - 1);
  }
  return out.length >= 2 ? out : src.map(anchor);
}

function anchor(point: Vec2): BezierSegment {
  return { point: { ...point }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } };
}

function deduped(points: Vec2[], closed: boolean): Vec2[] {
  const out: Vec2[] = [];
  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 1e-9) out.push({ ...point });
  }
  if (closed && out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1e-9) {
    out.pop();
  }
  return out;
}

function turnAt(prev: Vec2, point: Vec2, next: Vec2): number {
  const ax = point.x - prev.x; const ay = point.y - prev.y;
  const bx = next.x - point.x; const by = next.y - point.y;
  const la = Math.hypot(ax, ay); const lb = Math.hypot(bx, by);
  if (la < 1e-12 || lb < 1e-12) return 0;
  return Math.abs(Math.atan2((ax * by - ay * bx) / (la * lb), (ax * bx + ay * by) / (la * lb)));
}

/** Vertices a sampled arc would not produce: miters, cut joins, polygon corners. */
function cornerIndices(points: Vec2[], closed: boolean): number[] {
  const n = points.length;
  const corners: number[] = [];
  if (!closed) corners.push(0);
  const first = closed ? 0 : 1;
  const last = closed ? n : n - 1;
  for (let i = first; i < last; i++) {
    const turn = turnAt(points[(i - 1 + n) % n], points[i], points[(i + 1) % n]);
    if (turn > CORNER) corners.push(i);
  }
  if (!closed) corners.push(n - 1);
  return corners;
}

function sliceChain(points: Vec2[], start: number, end: number): Vec2[] {
  const n = points.length;
  const chain: Vec2[] = [points[start]];
  if (start === end) {
    for (let k = 1; k <= n; k++) chain.push(points[(start + k) % n]);
    return chain;
  }
  let i = start;
  while (i !== end && chain.length <= n + 1) {
    i = (i + 1) % n;
    chain.push(points[i]);
  }
  return chain;
}

function appendChain(out: BezierSegment[], chain: BezierSegment[], closeSeam: boolean): void {
  if (!chain.length) return;
  if (!out.length) {
    out.push(...chain.map(cloneSeg));
    return;
  }
  out[out.length - 1].handleOut = { ...chain[0].handleOut };
  const last = closeSeam ? chain.length - 1 : chain.length;
  for (let i = 1; i < last; i++) out.push(cloneSeg(chain[i]));
  if (closeSeam) out[0].handleIn = { ...chain[chain.length - 1].handleIn };
}

function cloneSeg(seg: BezierSegment): BezierSegment {
  return { point: { ...seg.point }, handleIn: { ...seg.handleIn }, handleOut: { ...seg.handleOut } };
}

function fitClosed(points: Vec2[], tolerance: number): BezierSegment[] {
  if (points.length < 3) return points.map(anchor);
  // Force the seam to stay an anchor, then join the arrival handle back onto it.
  const fitted = fitOpen([...points, points[0]], tolerance);
  if (fitted.length < 3) return points.map(anchor);
  fitted[0].handleIn = { ...fitted[fitted.length - 1].handleIn };
  fitted.pop();
  return fitted;
}

function fitOpen(points: Vec2[], tolerance: number): BezierSegment[] {
  if (points.length < 2) return points.map(anchor);
  const segments: BezierSegment[] = [anchor(points[0])];
  const tan1 = dir(points[0], points[1]);
  const tan2 = dir(points[points.length - 2], points[points.length - 1]);
  fitCubic(points, segments, tolerance, 0, points.length - 1, tan1, { x: -tan2.x, y: -tan2.y });
  return segments;
}

function dir(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  return l > 1e-12 ? { x: dx / l, y: dy / l } : { x: 1, y: 0 };
}

function chordDeviation(points: Vec2[], first: number, last: number): number {
  const a = points[first]; const b = points[last];
  let max = 0;
  for (let i = first + 1; i < last; i++) max = Math.max(max, chordDistance(points[i], a, b));
  return max;
}

function chordDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function fitCubic(points: Vec2[], segments: BezierSegment[], error: number,
  first: number, last: number, tan1: Vec2, tan2: Vec2): void {
  if (last <= first) return;
  if (chordDeviation(points, first, last) <= COLLINEAR) {
    addLine(segments, points[last]);
    return;
  }
  if (last - first === 1) {
    addLine(segments, points[last]);
    return;
  }
  const u = chordLengths(points, first, last);
  let split = Math.floor((first + last) / 2);
  for (let iter = 0; iter <= 4; iter++) {
    const curve = generateBezier(points, first, last, u, tan1, tan2);
    const max = maxError(points, first, last, curve, u);
    split = max.index;
    if (max.error < error) {
      addCurve(segments, curve);
      return;
    }
    if (max.error >= Math.max(error, error * error) && iter > 0) break;
    if (!reparameterize(points, first, last, u, curve)) break;
  }
  if (split <= first || split >= last) split = Math.max(first + 1, Math.min(last - 1, split));
  const center = dir(points[Math.max(first, split - 1)], points[Math.min(last, split + 1)]);
  fitCubic(points, segments, error, first, split, tan1, { x: -center.x, y: -center.y });
  fitCubic(points, segments, error, split, last, center, tan2);
}

function addLine(segments: BezierSegment[], point: Vec2): void {
  const prev = segments[segments.length - 1];
  if (prev && Math.hypot(prev.point.x - point.x, prev.point.y - point.y) <= 1e-9) return;
  segments.push(anchor(point));
}

function addCurve(segments: BezierSegment[], curve: [Vec2, Vec2, Vec2, Vec2]): void {
  const prev = segments[segments.length - 1];
  prev.handleOut = { x: curve[1].x - curve[0].x, y: curve[1].y - curve[0].y };
  segments.push({
    point: { ...curve[3] },
    handleIn: { x: curve[2].x - curve[3].x, y: curve[2].y - curve[3].y },
    handleOut: { x: 0, y: 0 },
  });
}

function chordLengths(points: Vec2[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) {
    u.push(u[u.length - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = u[u.length - 1] || 1;
  return u.map((value) => value / total);
}

function generateBezier(points: Vec2[], first: number, last: number, u: number[], tan1: Vec2, tan2: Vec2): [Vec2, Vec2, Vec2, Vec2] {
  const p0 = points[first]; const p3 = points[last];
  let c00 = 0; let c01 = 0; let c11 = 0; let x0 = 0; let x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i]; const s = 1 - t;
    const b = 3 * t * s;
    const b0 = s * s * s; const b1 = b * s; const b2 = b * t; const b3 = t * t * t;
    const a1 = { x: tan1.x * b1, y: tan1.y * b1 };
    const a2 = { x: tan2.x * b2, y: tan2.y * b2 };
    const sample = points[first + i];
    const tmp = {
      x: sample.x - p0.x * (b0 + b1) - p3.x * (b2 + b3),
      y: sample.y - p0.y * (b0 + b1) - p3.y * (b2 + b3),
    };
    c00 += a1.x * a1.x + a1.y * a1.y;
    c01 += a1.x * a2.x + a1.y * a2.y;
    c11 += a2.x * a2.x + a2.y * a2.y;
    x0 += a1.x * tmp.x + a1.y * tmp.y;
    x1 += a2.x * tmp.x + a2.y * tmp.y;
  }
  const det = c00 * c11 - c01 * c01;
  let alpha1: number; let alpha2: number;
  if (Math.abs(det) > 1e-12) {
    alpha1 = (x0 * c11 - c01 * x1) / det;
    alpha2 = (c00 * x1 - x0 * c01) / det;
  } else {
    const c0 = c00 + c01; const c1 = c01 + c11;
    alpha1 = alpha2 = Math.abs(c0) > 1e-12 ? x0 / c0 : Math.abs(c1) > 1e-12 ? x1 / c1 : 0;
  }
  const seg = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (!(alpha1 > 1e-12 * seg) || !(alpha2 > 1e-12 * seg)) {
    alpha1 = alpha2 = seg / 3;
  }
  return [
    p0,
    { x: p0.x + tan1.x * alpha1, y: p0.y + tan1.y * alpha1 },
    { x: p3.x + tan2.x * alpha2, y: p3.y + tan2.y * alpha2 },
    p3,
  ];
}

function cubicAt(curve: [Vec2, Vec2, Vec2, Vec2], t: number): Vec2 {
  const s = 1 - t;
  const b0 = s * s * s; const b1 = 3 * s * s * t; const b2 = 3 * s * t * t; const b3 = t * t * t;
  return {
    x: b0 * curve[0].x + b1 * curve[1].x + b2 * curve[2].x + b3 * curve[3].x,
    y: b0 * curve[0].y + b1 * curve[1].y + b2 * curve[2].y + b3 * curve[3].y,
  };
}

function maxError(points: Vec2[], first: number, last: number, curve: [Vec2, Vec2, Vec2, Vec2], _u: number[]): { error: number; index: number } {
  let error = 0;
  let index = Math.floor((first + last) / 2);
  for (let i = first + 1; i < last; i++) {
    const dist = pointCurveDistance(curve, points[i]);
    if (dist >= error) { error = dist; index = i; }
  }
  return { error, index };
}

function pointCurveDistance(curve: [Vec2, Vec2, Vec2, Vec2], point: Vec2): number {
  let best = Infinity;
  let seed = 0;
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const hit = cubicAt(curve, t);
    const dist = Math.hypot(hit.x - point.x, hit.y - point.y);
    if (dist < best) { best = dist; seed = t; }
  }
  let t = seed;
  for (let k = 0; k < 4; k++) t = newton(curve, point, t);
  const hit = cubicAt(curve, t);
  return Math.hypot(hit.x - point.x, hit.y - point.y);
}

function reparameterize(points: Vec2[], first: number, last: number, u: number[], curve: [Vec2, Vec2, Vec2, Vec2]): boolean {
  for (let i = first; i <= last; i++) u[i - first] = newton(curve, points[i], u[i - first]);
  for (let i = 1; i < u.length; i++) if (!(u[i] > u[i - 1])) return false;
  return true;
}

function newton(curve: [Vec2, Vec2, Vec2, Vec2], point: Vec2, u: number): number {
  const t = Math.max(0, Math.min(1, u));
  const pt = cubicAt(curve, t);
  const d1 = cubicDeriv(curve, t);
  const d2 = cubicSecond(curve, t);
  const diff = { x: pt.x - point.x, y: pt.y - point.y };
  const denom = d1.x * d1.x + d1.y * d1.y + diff.x * d2.x + diff.y * d2.y;
  if (Math.abs(denom) < 1e-12) return t;
  return Math.max(0, Math.min(1, t - (diff.x * d1.x + diff.y * d1.y) / denom));
}

function cubicDeriv(curve: [Vec2, Vec2, Vec2, Vec2], t: number): Vec2 {
  const s = 1 - t;
  const c0 = { x: 3 * (curve[1].x - curve[0].x), y: 3 * (curve[1].y - curve[0].y) };
  const c1 = { x: 3 * (curve[2].x - curve[1].x), y: 3 * (curve[2].y - curve[1].y) };
  const c2 = { x: 3 * (curve[3].x - curve[2].x), y: 3 * (curve[3].y - curve[2].y) };
  return {
    x: s * s * c0.x + 2 * s * t * c1.x + t * t * c2.x,
    y: s * s * c0.y + 2 * s * t * c1.y + t * t * c2.y,
  };
}

function cubicSecond(curve: [Vec2, Vec2, Vec2, Vec2], t: number): Vec2 {
  const q0 = { x: 6 * (curve[2].x - 2 * curve[1].x + curve[0].x), y: 6 * (curve[2].y - 2 * curve[1].y + curve[0].y) };
  const q1 = { x: 6 * (curve[3].x - 2 * curve[2].x + curve[1].x), y: 6 * (curve[3].y - 2 * curve[2].y + curve[1].y) };
  return { x: (1 - t) * q0.x + t * q1.x, y: (1 - t) * q0.y + t * q1.y };
}
