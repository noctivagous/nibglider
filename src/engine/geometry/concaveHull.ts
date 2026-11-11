// Hulls for a point set (Slice 13). The approach is adapted from
// the grid-paint-labs hull lab: there, convex mode collects cell
// corners into a monotone-chain hull and tight/concave mode traces
// the boundary of the active cells. NibGlider selections are point
// sets, not grid cells, so the boundary trace is replaced by the
// standard point-set concave hull — the k-nearest-neighbours
// algorithm of Moreira & Santos — over the same monotone-chain
// convex hull the lab uses. Both are pure geometry.
import type { Vec2 } from '../model/geometryResolution';

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Monotone-chain convex hull (the grid-paint-labs convex mode's
 * algorithm): the hull points in order, no duplicated closing
 * point. Collinear edge points are dropped. */
export function convexHullMonotone(points: Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const unique: Vec2[] = [];
  for (const p of sorted) {
    const last = unique[unique.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) unique.push(p);
  }
  if (unique.length <= 1) return unique;
  const lower: Vec2[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Signed polygon area (shoelace); sign follows winding. */
export function polygonArea(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  // Proper crossing only: sharing an endpoint does not count.
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * k-nearest-neighbours concave hull. Walk from the lowest point;
 * at each step consider the k nearest unused points and take the
 * one making the sharpest right-hand turn (in y-down coordinates,
 * the largest signed turn angle) whose edge back to the current
 * point crosses no hull edge already drawn. Small k follows
 * concavities tightly; large k approaches the convex hull. When
 * no candidate works, the walk restarts with k+1; the convex hull
 * is the final fallback. Returns the hull in order (no duplicated
 * closing point), or null when the set cannot ring (fewer than 3
 * distinct points, or all collinear).
 */
export function concaveHull(points: Vec2[], k: number): Vec2[] | null {
  const unique: Vec2[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ x: p.x, y: p.y });
  }
  if (unique.length < 3) return null;
  if (unique.length === 3) {
    return cross(unique[0], unique[1], unique[2]) === 0 ? null : unique;
  }
  let kk = Math.max(3, Math.floor(k) || 3);
  const maxK = Math.min(unique.length - 1, 60);
  while (kk <= maxK) {
    const hull = tryConcaveHull(unique, kk);
    if (hull) return hull;
    kk += 1;
  }
  const convex = convexHullMonotone(unique);
  return convex.length >= 3 ? convex : null;
}

function tryConcaveHull(points: Vec2[], k: number): Vec2[] | null {
  const start = points.reduce((best, p) => (
    p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best
  ), points[0]);
  const remaining = new Set(points.filter((p) => p !== start));
  const hull: Vec2[] = [start];
  let current = start;
  // The walk heads "east" first: a virtual previous point west of
  // the current one defines the incoming direction.
  let prev = { x: start.x - 1, y: start.y };
  const maxSteps = points.length * 2 + 4;
  for (let step = 0; step < maxSteps; step++) {
    // Candidates: the k nearest unused points; once the ring has
    // three points the start joins the pool as the closing
    // candidate and competes by the same turn rule.
    const pool = [...remaining];
    if (hull.length >= 3) pool.push(start);
    if (pool.length === 0) return null;
    pool.sort((a, b) => distance(current, a) - distance(current, b));
    const candidates = pool.slice(0, Math.min(k + 1, pool.length));
    const dirIn = { x: current.x - prev.x, y: current.y - prev.y };
    let best: Vec2 | null = null;
    let bestAngle = -Infinity;
    for (const cand of candidates) {
      if (cand === current) continue;
      // The new edge must not cross a hull edge (edges sharing an
      // endpoint with it are exempt by the crossing test itself).
      let crosses = false;
      for (let i = 0; i + 1 < hull.length; i++) {
        if (cand === start && i === 0) continue; // closing edge meets the first edge at the start
        if (segmentsCross(current, cand, hull[i], hull[i + 1])) { crosses = true; break; }
      }
      if (crosses) continue;
      const dirOut = { x: cand.x - current.x, y: cand.y - current.y };
      // Signed turn from the incoming to the outgoing direction;
      // the walk takes the largest one (the canonical algorithm's
      // rightmost turn, in these y-down coordinates).
      const angle = Math.atan2(
        dirIn.x * dirOut.y - dirIn.y * dirOut.x,
        dirIn.x * dirOut.x + dirIn.y * dirOut.y,
      );
      if (angle > bestAngle) { bestAngle = angle; best = cand; }
    }
    if (!best) return null;
    if (best === start) return hull;
    hull.push(best);
    remaining.delete(best);
    prev = current;
    current = best;
  }
  return null;
}
