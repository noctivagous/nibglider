// Pure Euler-spiral (clothoid) G1 segment fitting with cubic Bezier output.
//
// A clothoid has linearly varying curvature k(s) = k0 + a*s, so straight
// runs (k = 0) hand off to curves without the curvature jump a Bezier
// forces you to manage by hand. Single-span G1 Hermite interpolation
// (endpoint positions + endpoint headings) is solved in a
// scale-normalized frame with damped Newton iterations from circular-arc
// seeds; spans that refuse to converge split recursively, bottoming out
// at a straight line. Output is ordinary cubic Bezier runs within
// tolerance — the libspiro pattern — so renderers and export need no
// clothoid awareness. Paper-free; same SamplingOptions contract as
// sampleBSpline.
import type { Vec2 } from '../model/geometryResolution';
import type { SamplingOptions } from './splineInterpolation';
import { appendDistinct, distance } from './splineInterpolation';

export interface ClothoidBezier { p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2 }
export interface ClothoidSpan {
  beziers: ClothoidBezier[];
  /** Arc length in world units. */
  length: number;
  /** Curvature slope a in k(s) = k0 + a*s, per world unit squared. */
  sharpness: number;
}

function wrapPi(a: number): number {
  return ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

function simpson(f: (t: number) => number, a: number, b: number): number {
  const m = (a + b) / 2;
  return ((b - a) / 6) * (f(a) + 4 * f(m) + f(b));
}

/** Adaptive Simpson quadrature, iterative. Accurate for the few-oscillation
 * integrands this solver produces; not a general oscillatory integrator. */
function integrate(f: (t: number) => number, a: number, b: number, tol = 1e-12): number {
  if (a === b) return 0;
  const sign = b > a ? 1 : -1;
  const lo = Math.min(a, b); const hi = Math.max(a, b);
  type Frame = { a: number; b: number; whole: number; tol: number; depth: number };
  let total = 0;
  const stack: Frame[] = [{ a: lo, b: hi, whole: simpson(f, lo, hi), tol, depth: 0 }];
  while (stack.length) {
    const frame = stack.pop()!;
    const m = (frame.a + frame.b) / 2;
    const left = simpson(f, frame.a, m); const right = simpson(f, m, frame.b);
    if (frame.depth >= 16 || Math.abs(left + right - frame.whole) <= 15 * frame.tol) {
      total += left + right;
      continue;
    }
    stack.push({ a: m, b: frame.b, whole: right, tol: frame.tol / 2, depth: frame.depth + 1 });
    stack.push({ a: frame.a, b: m, whole: left, tol: frame.tol / 2, depth: frame.depth + 1 });
  }
  return sign * total;
}

/**
 * Cosine/sine Fresnel integrals (engineering convention: C(inf) = S(inf) =
 * 0.5). Exported for tests and callers; the fitter below integrates the
 * clothoid directly rather than routing through these.
 */
export function fresnel(t: number): { c: number; s: number } {
  if (!Number.isFinite(t)) throw new Error('Invalid Fresnel argument');
  if (t === 0) return { c: 0, s: 0 };
  const sign = t < 0 ? -1 : 1;
  const u = Math.abs(t);
  const c = integrate((v) => Math.cos((Math.PI * v * v) / 2), 0, u);
  const s = integrate((v) => Math.sin((Math.PI * v * v) / 2), 0, u);
  return { c: sign * c, s: sign * s };
}

function requireFinite(p: Vec2, h: number, what: string): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(h)) {
    throw new Error(`Invalid clothoid ${what}`);
  }
}

interface NormalizedFit { alpha: number; beta: number; lambda: number }

/** Clothoid position at normalized arclength u for heading angle rate alpha
 * and half-sharpness beta: heading(u) = alpha*u + beta*u^2. */
function clothoidXY(alpha: number, beta: number, u: number): Vec2 {
  return {
    x: integrate((v) => Math.cos(alpha * v + beta * v * v), 0, u),
    y: integrate((v) => Math.sin(alpha * v + beta * v * v), 0, u),
  };
}

/** Normalized-frame residual for unknowns (beta, lambda) with the end-angle
 * constraint folded in: alpha = (phi - beta*lambda^2) / lambda. */
function residual(beta: number, lambda: number, phi: number, tx: number, ty: number): Vec2 {
  const alpha = (phi - beta * lambda * lambda) / lambda;
  const p = clothoidXY(alpha, beta, lambda);
  return { x: p.x - tx, y: p.y - ty };
}

function solveSpan(phi: number, tx: number, ty: number): NormalizedFit | null {
  const arcGuess = Math.abs(phi) < 1e-12 ? 1 : phi / (2 * Math.sin(phi / 2));
  const seeds: Array<[number, number]> = [
    [0, arcGuess], [0.5, 1.2], [-0.5, 1.2], [1.5, 1.5], [-1.5, 1.5], [0, 2],
  ];
  for (const [beta0, lambda0] of seeds) {
    let beta = beta0; let lambda = lambda0;
    let r = residual(beta, lambda, phi, tx, ty);
    if (Math.hypot(r.x, r.y) < 1e-10 && lambda > 0.25 && Math.abs(beta) * lambda * lambda <= 12) {
      return { alpha: (phi - beta * lambda * lambda) / lambda, beta, lambda };
    }
    for (let iter = 0; iter < 24; iter++) {
      if (!Number.isFinite(beta) || !Number.isFinite(lambda)) break;
      const hb = 1e-6 * (1 + Math.abs(beta)); const hl = 1e-7 * (1 + Math.abs(lambda));
      const rxb = residual(beta + hb, lambda, phi, tx, ty);
      const rxm = residual(beta - hb, lambda, phi, tx, ty);
      const ryl = residual(beta, lambda + hl, phi, tx, ty);
      const rym = residual(beta, lambda - hl, phi, tx, ty);
      const j11 = (rxb.x - rxm.x) / (2 * hb); const j12 = (ryl.x - rym.x) / (2 * hl);
      const j21 = (rxb.y - rxm.y) / (2 * hb); const j22 = (ryl.y - rym.y) / (2 * hl);
      const det = j11 * j22 - j12 * j21;
      if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;
      const stepB = (r.x * j22 - r.y * j12) / det;
      const stepL = (j11 * r.y - j21 * r.x) / det;
      const norm0 = Math.hypot(r.x, r.y);
      let scale = 1; let accepted = false;
      for (let halve = 0; halve < 8; halve++) {
        const nb = beta - scale * stepB; const nl = lambda - scale * stepL;
        if (!Number.isFinite(nb) || !Number.isFinite(nl) || nl < 0.25 || nl > 10) break;
        if (Math.abs(nb) * nl * nl > 12) break;
        const nr = residual(nb, nl, phi, tx, ty);
        if (Math.hypot(nr.x, nr.y) < norm0) {
          beta = nb; lambda = nl; r = nr; accepted = true;
          break;
        }
        scale /= 2;
      }
      if (!accepted) break;
      if (Math.hypot(r.x, r.y) < 1e-10) {
        return { alpha: (phi - beta * lambda * lambda) / lambda, beta, lambda };
      }
    }
  }
  return null;
}

function lineSpan(p0: Vec2, p1: Vec2): ClothoidSpan {
  const dx = (p1.x - p0.x) / 3; const dy = (p1.y - p0.y) / 3;
  return {
    beziers: [{
      p0: { ...p0 },
      p1: { x: p0.x + dx, y: p0.y + dy },
      p2: { x: p1.x - dx, y: p1.y - dy },
      p3: { ...p1 },
    }],
    length: distance(p0, p1),
    sharpness: 0,
  };
}

interface WorldFrame { origin: Vec2; cos: number; sin: number; scale: number }

function toWorld(frame: WorldFrame, local: Vec2): Vec2 {
  return {
    x: frame.origin.x + frame.scale * (frame.cos * local.x - frame.sin * local.y),
    y: frame.origin.y + frame.scale * (frame.sin * local.x + frame.cos * local.y),
  };
}

function headingWorld(base: number, theta: number): Vec2 {
  const a = base + theta;
  return { x: Math.cos(a), y: Math.sin(a) };
}

function arcToBeziers(
  fit: NormalizedFit, frame: WorldFrame, base: number,
  tolerance: number, maxDepth: number, out: ClothoidBezier[],
): void {
  type Range = { u0: number; u1: number; depth: number };
  const stack: Range[] = [{ u0: 0, u1: fit.lambda, depth: 0 }];
  const pointAt = (u: number): Vec2 => {
    const local = clothoidXY(fit.alpha, fit.beta, u);
    return toWorld(frame, local);
  };
  while (stack.length) {
    const { u0, u1, depth } = stack.pop()!;
    const p0 = pointAt(u0); const p1 = pointAt(u1);
    const h = (u1 - u0) * frame.scale;
    const t0 = headingWorld(base, fit.alpha * u0 + fit.beta * u0 * u0);
    const t1 = headingWorld(base, fit.alpha * u1 + fit.beta * u1 * u1);
    const c1 = { x: p0.x + (t0.x * h) / 3, y: p0.y + (t0.y * h) / 3 };
    const c2 = { x: p1.x - (t1.x * h) / 3, y: p1.y - (t1.y * h) / 3 };
    const um = (u0 + u1) / 2;
    const pmid: Vec2 = {
      x: (p0.x + 3 * c1.x + 3 * c2.x + p1.x) / 8,
      y: (p0.y + 3 * c1.y + 3 * c2.y + p1.y) / 8,
    };
    const mid = pointAt(um);
    if (distance(pmid, mid) <= tolerance || depth >= maxDepth) {
      out.push({ p0, p1: c1, p2: c2, p3: p1 });
      continue;
    }
    stack.push({ u0: um, u1, depth: depth + 1 });
    stack.push({ u0, u1: um, depth: depth + 1 });
  }
}

/**
 * Fit one G1 clothoid span: positions p0/p1 with endpoint headings (radians).
 * Returns ordinary cubic Beziers within tolerance plus arc length and world
 * sharpness. Degenerate (coincident) endpoints yield an empty span; only
 * non-finite input throws.
 */
export function fitClothoidG1(p0: Vec2, heading0: number, p1: Vec2, heading1: number, options: SamplingOptions = {}): ClothoidSpan {
  requireFinite(p0, heading0, 'start');
  requireFinite(p1, heading1, 'end');
  const tolerance = options.tolerance ?? 0.25;
  const maxDepth = options.maxDepth ?? 12;
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Sampling tolerance must be positive');
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 20) throw new Error('Invalid sampling depth');
  const dx = p1.x - p0.x; const dy = p1.y - p0.y;
  const chord = Math.hypot(dx, dy);
  if (chord <= 1e-12) return { beziers: [], length: 0, sharpness: 0 };
  return fitWithDepth(p0, heading0, p1, heading1, tolerance, maxDepth, 0);
}

function fitWithDepth(p0: Vec2, heading0: number, p1: Vec2, heading1: number, tolerance: number, maxDepth: number, depth: number): ClothoidSpan {
  const dx = p1.x - p0.x; const dy = p1.y - p0.y;
  const chord = Math.hypot(dx, dy);
  if (chord <= 1e-12 || depth >= 8) return lineSpan(p0, p1);
  const psi = Math.atan2(dy, dx);
  if (Math.abs(wrapPi(heading0 - psi)) < 1e-12 && Math.abs(wrapPi(heading1 - psi)) < 1e-12) {
    return lineSpan(p0, p1);
  }
  const phi = wrapPi(heading1 - heading0);
  const psiRel = wrapPi(psi - heading0);
  const fit = solveSpan(phi, Math.cos(psiRel), Math.sin(psiRel));
  const frame: WorldFrame = { origin: { ...p0 }, cos: Math.cos(heading0), sin: Math.sin(heading0), scale: chord };
  if (!fit) return splitSpan(p0, heading0, p1, heading1, tolerance, maxDepth, depth);
  const beziers: ClothoidBezier[] = [];
  arcToBeziers(fit, frame, heading0, tolerance, maxDepth, beziers);
  return { beziers, length: fit.lambda * chord, sharpness: (2 * fit.beta) / (chord * chord) };
}

function splitSpan(p0: Vec2, heading0: number, p1: Vec2, heading1: number, tolerance: number, maxDepth: number, depth = 0): ClothoidSpan {
  const chord = Math.max(distance(p0, p1), 1e-12);
  const m0 = { x: Math.cos(heading0) * chord, y: Math.sin(heading0) * chord };
  const m1 = { x: Math.cos(heading1) * chord, y: Math.sin(heading1) * chord };
  // Cubic Hermite midpoint and midpoint tangent.
  const mid = {
    x: (p0.x + p1.x) / 2 + (m0.x - m1.x) / 8,
    y: (p0.y + p1.y) / 2 + (m0.y - m1.y) / 8,
  };
  const midT = {
    x: (3 * (p1.x - p0.x)) / 2 - (m0.x + m1.x) / 4,
    y: (3 * (p1.y - p0.y)) / 2 - (m0.y + m1.y) / 4,
  };
  const midHeading = Math.hypot(midT.x, midT.y) > 1e-12 ? Math.atan2(midT.y, midT.x) : heading0;
  if (depth >= 8 || distance(p0, mid) <= 1e-12 || distance(mid, p1) <= 1e-12) {
    return lineSpan(p0, p1);
  }
  const left = fitWithDepth(p0, heading0, mid, midHeading, tolerance, maxDepth, depth + 1);
  const right = fitWithDepth(mid, midHeading, p1, heading1, tolerance, maxDepth, depth + 1);
  // Average sharpness weighted by arc length; length adds.
  const total = left.length + right.length;
  return {
    beziers: [...left.beziers, ...right.beziers],
    length: total,
    sharpness: total > 0 ? (left.sharpness * left.length + right.sharpness * right.length) / total : 0,
  };
}

function estimateHeading(prev: Vec2, next: Vec2, fallback: number): number {
  const dx = next.x - prev.x; const dy = next.y - prev.y;
  if (Math.hypot(dx, dy) <= 1e-12) return fallback;
  return Math.atan2(dy, dx);
}

/**
 * Sample a clothoid run through on-curve points, estimating endpoint
 * headings from neighbors (interior: angle of next-minus-prev; ends: chord
 * angle; closed: wrapped). Mirrors the sampleBSpline contract: deduplicated
 * output interpolating open endpoints, seam-popped when closed.
 */
export function sampleClothoid(points: Vec2[], closed = false, options: SamplingOptions = {}): Vec2[] {
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error('Invalid clothoid point');
  }
  if (points.length <= 1) return points.map((p) => ({ ...p }));
  const loop = closed && points.length >= 3;
  const n = points.length;
  const headingAt = (i: number): number => {
    if (loop) {
      const prev = points[(i - 1 + n) % n]; const next = points[(i + 1) % n];
      if (distance(prev, next) > 1e-12) return Math.atan2(next.y - prev.y, next.x - prev.x);
      return Math.atan2(points[(i + 1) % n].y - points[i].y, points[(i + 1) % n].x - points[i].x);
    }
    if (i === 0) return estimateHeading(points[0], points[1], 0);
    if (i === n - 1) return estimateHeading(points[n - 2], points[n - 1], 0);
    const h = estimateHeading(points[i - 1], points[i + 1], NaN);
    return Number.isNaN(h) ? estimateHeading(points[i], points[i + 1], 0) : h;
  };
  const spans = loop ? n : n - 1;
  const out: Vec2[] = [];
  for (let s = 0; s < spans; s++) {
    const a = points[s]; const b = points[(s + 1) % n];
    const span = fitClothoidG1(a, headingAt(s), b, headingAt((s + 1) % n), options);
    for (const bez of span.beziers) {
      for (const t of [0, 1 / 3, 2 / 3]) {
        const u = 1 - t;
        appendDistinct(out, {
          x: u ** 3 * bez.p0.x + 3 * u * u * t * bez.p1.x + 3 * u * t * t * bez.p2.x + t ** 3 * bez.p3.x,
          y: u ** 3 * bez.p0.y + 3 * u * u * t * bez.p1.y + 3 * u * t * t * bez.p2.y + t ** 3 * bez.p3.y,
        });
      }
    }
    if (s === spans - 1) {
      const last = span.beziers.at(-1);
      appendDistinct(out, last ? { ...last.p3 } : { ...b });
    }
  }
  if (loop && out.length > 1 && distance(out[0], out[out.length - 1]) <= 1e-9) out.pop();
  return out;
}
