// Douglas–Peucker polyline simplification, shared by the bitmap
// tracer and the Simplify operation (Slice 12; factored out of the
// tracer, where the closed-ring version began). The guarantee DP
// gives: every dropped point lies within `tolerance` of the kept
// polyline.
import type { Vec2 } from '../model/geometryResolution';

function dpChain(chain: Vec2[], tolerance: number): Vec2[] {
  if (tolerance <= 0 || chain.length <= 2) return [...chain];
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
  for (let i = 0; i < chain.length; i++) if (keep[i]) out.push(chain[i]);
  return out;
}

/** Simplify an open polyline; endpoints always survive. */
export function douglasPeucker(points: Vec2[], tolerance: number): Vec2[] {
  return dpChain(points, tolerance);
}

/** Simplify a closed ring (no duplicated closing point in the
 * input). The ring is opened at its first point and simplified as
 * a polyline whose ends meet; falls back to the input when DP
 * would leave fewer than 3 points. */
export function douglasPeuckerClosed(points: Vec2[], tolerance: number): Vec2[] {
  if (tolerance <= 0 || points.length <= 3) return points;
  const chain = [...points, points[0]];
  const out = dpChain(chain, tolerance);
  const ring = out.slice(0, -1);
  return ring.length >= 3 ? ring : points;
}
