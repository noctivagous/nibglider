// Pure cubic B-spline evaluation and adaptive sampling. Clamped open runs
// interpolate their endpoints; periodic runs close without a duplicated seam.
// Repeated INPUT controls intentionally encode corners. OUTPUT is deduplicated.
import type { Vec2 } from '../model/geometryResolution';

export interface SamplingOptions { tolerance?: number; maxDepth?: number }
export function distance(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
export function appendDistinct(points: Vec2[], point: Vec2): void {
  if (!points.length || distance(points[points.length - 1], point) > 1e-9) points.push({ ...point });
}
function chordDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function sampleCurve(evaluate: (t: number) => Vec2, breaks: number[], options: SamplingOptions = {}): Vec2[] {
  const tolerance = options.tolerance ?? 0.25;
  const maxDepth = options.maxDepth ?? 12;
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Sampling tolerance must be positive');
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 20) throw new Error('Invalid sampling depth');
  const result: Vec2[] = [];
  function span(a: number, b: number, p: Vec2, q: Vec2, depth: number): void {
    const middle = (a + b) / 2;
    const m = evaluate(middle);
    const deviation = Math.max(chordDistance(m, p, q),
      chordDistance(evaluate((3 * a + b) / 4), p, q), chordDistance(evaluate((a + 3 * b) / 4), p, q));
    if (deviation > tolerance && depth < maxDepth) {
      span(a, middle, p, m, depth + 1); span(middle, b, m, q, depth + 1);
    } else appendDistinct(result, q);
  }
  if (!breaks.length) return result;
  appendDistinct(result, evaluate(breaks[0]));
  for (let i = 1; i < breaks.length; i++) span(breaks[i - 1], breaks[i], evaluate(breaks[i - 1]), evaluate(breaks[i]), 0);
  return result;
}

export function sampleBSpline(controls: Vec2[], closed = false, options: SamplingOptions = {}): Vec2[] {
  if (controls.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Invalid spline control');
  if (!controls.length) return [];
  if (controls.length === 1) return [{ ...controls[0] }];
  if (closed && controls.length >= 3) {
    const n = controls.length;
    const get = (i: number) => controls[(i % n + n) % n];
    const evaluate = (value: number): Vec2 => {
      const i = Math.floor(value); const t = value - i;
      const weights = [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6,
        (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
      const p = { x: 0, y: 0 };
      weights.forEach((w, j) => { p.x += get(i + j - 1).x * w; p.y += get(i + j - 1).y * w; });
      return p;
    };
    const samples = sampleCurve(evaluate, Array.from({ length: n + 1 }, (_, i) => i), options);
    if (samples.length > 1 && distance(samples[0], samples[samples.length - 1]) <= 1e-9) samples.pop();
    return samples;
  }
  const n = controls.length;
  const degree = Math.min(3, n - 1);
  const end = n - degree;
  const knots = Array.from({ length: n + degree + 1 }, (_, i) => i <= degree ? 0 : i >= n ? end : i - degree);
  const evaluate = (t: number): Vec2 => {
    const k = t >= end ? n - 1 : degree + Math.floor(t);
    const d = Array.from({ length: degree + 1 }, (_, j) => ({ ...controls[k - degree + j] }));
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const left = knots[k - degree + j]; const right = knots[k + 1 + j - r];
        const alpha = right === left ? 0 : (t - left) / (right - left);
        d[j] = { x: (1 - alpha) * d[j - 1].x + alpha * d[j].x, y: (1 - alpha) * d[j - 1].y + alpha * d[j].y };
      }
    }
    return d[degree];
  };
  return sampleCurve(evaluate, Array.from({ length: end + 1 }, (_, i) => i), options);
}

export function sampleCubic(from: Vec2, control1: Vec2, control2: Vec2, to: Vec2, options: SamplingOptions = {}): Vec2[] {
  return sampleCurve((t) => {
    const u = 1 - t;
    return { x: u ** 3 * from.x + 3 * u * u * t * control1.x + 3 * u * t * t * control2.x + t ** 3 * to.x,
      y: u ** 3 * from.y + 3 * u * u * t * control1.y + 3 * u * t * t * control2.y + t ** 3 * to.y };
  }, [0, 1], options);
}
