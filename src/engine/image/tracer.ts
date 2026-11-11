// Trace to Vector (Tier Two, Slice 8): a self-contained
// threshold + marching-squares + polygon-simplify tracer.
// No external dependency: the bitmap is binarized by luminance,
// marching squares emits edge segments on the pixel lattice, the
// segments join into closed contours, and Douglas–Peucker with the
// smoothing tolerance reduces them to editable polygon paths.
// Holes come out as their own contours; the caller fills the set
// with the even-odd rule so counters punch through.
import type { Vec2 } from '../model/geometryResolution';

export interface BitmapInput {
  /** RGBA bytes, row-major, width*height*4 long. */
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

export interface TraceOptions {
  /** Luminance at or below this (0–255) is foreground. */
  threshold: number;
  /** Douglas–Peucker tolerance in pixels (0 keeps every step). */
  smoothing: number;
  /** Trace light-on-dark instead of dark-on-light. */
  invert?: boolean;
}

export interface TraceContour {
  points: Vec2[];
  /** Signed area in y-down pixel space: positive = outer contour
   * (clockwise on screen), negative = hole. */
  area: number;
}

/** Binarize into a foreground field, padded by one background
 * pixel so border-touching shapes still close their contours. */
function foregroundField(bitmap: BitmapInput, threshold: number, invert: boolean): Uint8Array {
  const { width, height, data } = bitmap;
  const field = new Uint8Array((width + 2) * (height + 2));
  const stride = width + 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] ?? 255;
      const lum = 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
      let fg = alpha >= 128 && lum <= threshold;
      if (invert) fg = alpha >= 128 && !fg;
      if (fg) field[(y + 1) * stride + (x + 1)] = 1;
    }
  }
  return field;
}

// Marching squares segment table. Corners of a cell: TL TR BR BL
// (bit 0..3). Edge midpoints: T(0), R(1), B(2), L(3). Each case
// lists segment endpoint edge pairs. Ambiguous cases 5 and 10 use
// the asymptotic decider via the centre average (approximated by
// the corner sum: case 5/10 have two set corners either way, so the
// pairing below picks the saddle that keeps foreground connected).
const CASE_SEGMENTS: Record<number, Array<[number, number]>> = {
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  5: [[3, 2], [0, 1]],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]],
  9: [[0, 2]],
  10: [[0, 3], [1, 2]],
  11: [[1, 2]],
  12: [[1, 3]],
  13: [[0, 1]],
  14: [[0, 3]],
};

function edgePoint(cx: number, cy: number, edge: number): Vec2 {
  // Cell (cx, cy) spans [cx, cx+1] x [cy, cy+1] in lattice space.
  switch (edge) {
    case 0: return { x: cx + 0.5, y: cy };
    case 1: return { x: cx + 1, y: cy + 0.5 };
    case 2: return { x: cx + 0.5, y: cy + 1 };
    default: return { x: cx, y: cy + 0.5 };
  }
}

const key = (p: Vec2): string => `${p.x},${p.y}`;

/** Join marching-squares segments into closed contours. Segments
 * may be traversed either way; only fully closed loops are kept. */
function joinSegments(segments: Array<[Vec2, Vec2]>): Vec2[][] {
  const byPoint = new Map<string, number[]>();
  segments.forEach((seg, i) => {
    for (const p of seg) {
      const list = byPoint.get(key(p)) ?? [];
      list.push(i);
      byPoint.set(key(p), list);
    }
  });
  const used = new Uint8Array(segments.length);
  const contours: Vec2[][] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const [a, b] = segments[start];
    const loop: Vec2[] = [a, b];
    let closed = false;
    let guard = segments.length + 2;
    while (guard-- > 0) {
      const end = loop[loop.length - 1];
      if (key(end) === key(loop[0])) { closed = true; break; }
      const candidates = byPoint.get(key(end)) ?? [];
      const nextIdx = candidates.find((i) => !used[i]);
      if (nextIdx === undefined) break;
      used[nextIdx] = 1;
      const seg = segments[nextIdx];
      loop.push(key(seg[0]) === key(end) ? seg[1] : seg[0]);
    }
    if (closed) {
      loop.pop();
      if (loop.length >= 3) contours.push(loop);
    }
  }
  return contours;
}

function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function signedArea(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Douglas–Peucker simplification of a closed polygon. */
function simplifyClosed(points: Vec2[], tolerance: number): Vec2[] {
  if (tolerance <= 0 || points.length <= 3) return points;
  // Open the ring at its first point and simplify as a polyline
  // whose ends meet: run DP on the doubled-start chain.
  const chain = [...points, points[0]];
  const keep = new Uint8Array(chain.length);
  keep[0] = 1;
  keep[chain.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, chain.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop() as [number, number];
    if (hi <= lo + 1) continue;
    const a = chain[lo];
    const b = chain[hi];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const p = chain[i];
      const dist = len > 1e-9
        ? Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
        : Math.hypot(p.x - a.x, p.y - a.y);
      if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }
    if (maxIdx >= 0 && maxDist > tolerance) {
      keep[maxIdx] = 1;
      stack.push([lo, maxIdx], [maxIdx, hi]);
    }
  }
  const out: Vec2[] = [];
  for (let i = 0; i < chain.length - 1; i++) if (keep[i]) out.push(chain[i]);
  return out.length >= 3 ? out : points;
}

/**
 * Trace a bitmap into polygon contours in PIXEL coordinates
 * (origin at the bitmap's top-left, y down). Contours smaller than
 * the smoothing scale are dropped as noise.
 */
export function traceBitmap(bitmap: BitmapInput, options: TraceOptions): TraceContour[] {
  const { width, height } = bitmap;
  if (!(width > 0) || !(height > 0) || bitmap.data.length < width * height * 4) return [];
  const threshold = Math.max(0, Math.min(255, options.threshold));
  const smoothing = Math.max(0, options.smoothing);
  const field = foregroundField(bitmap, threshold, !!options.invert);
  const stride = width + 2;
  const segments: Array<[Vec2, Vec2]> = [];
  for (let cy = 0; cy < height + 1; cy++) {
    for (let cx = 0; cx < width + 1; cx++) {
      const tl = field[cy * stride + cx];
      const tr = field[cy * stride + cx + 1];
      const br = field[(cy + 1) * stride + cx + 1];
      const bl = field[(cy + 1) * stride + cx];
      const code = tl | (tr << 1) | (br << 2) | (bl << 3);
      const pairs = CASE_SEGMENTS[code];
      if (!pairs) continue;
      for (const [e1, e2] of pairs) {
        // Shift back by the 1px padding: lattice (0,0) is bitmap (-1,-1).
        const a = edgePoint(cx - 1, cy - 1, e1);
        const b = edgePoint(cx - 1, cy - 1, e2);
        segments.push([a, b]);
      }
    }
  }
  const minArea = Math.max(0.75, smoothing * smoothing);
  const loops = joinSegments(segments).filter((raw) => Math.abs(signedArea(raw)) >= minArea);
  const contours: TraceContour[] = [];
  for (const raw of loops) {
    const points = simplifyClosed(raw, smoothing);
    if (points.length < 3) continue;
    // A loop whose first point sits inside another loop is a hole.
    // Normalize winding: outers positive, holes negative (y-down).
    const isHole = loops.some((other) => other !== raw && pointInPolygon(raw[0], other));
    let area = signedArea(points);
    if ((isHole && area > 0) || (!isHole && area < 0)) {
      points.reverse();
      area = -area;
    }
    contours.push({ points, area });
  }
  return contours;
}
