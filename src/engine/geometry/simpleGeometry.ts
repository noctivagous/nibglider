// Pure geometry for the standalone Line / Ellipse / Arc tools
// (Tier Two, Slice 7). Vec2 in, Bézier segments out — the same
// resolved-geometry shape the path resolver produces, so deposits
// render identically whether they come from the model or a session.
import type { BezierSegment, Vec2 } from '../model/geometryResolution';

function seg(point: Vec2, handleIn: Vec2 = { x: 0, y: 0 }, handleOut: Vec2 = { x: 0, y: 0 }): BezierSegment {
  return { point: { ...point }, handleIn: { ...handleIn }, handleOut: { ...handleOut } };
}

/** Ellipse as four kappa arcs. rx/ry are radii (signs ignored). */
export function ellipseSegments(center: Vec2, rx: number, ry: number): BezierSegment[] {
  const x = Math.abs(rx);
  const y = Math.abs(ry);
  if (!(x > 0) || !(y > 0)) return [];
  const k = 0.5522847498307936;
  const right = { x: center.x + x, y: center.y };
  const bottom = { x: center.x, y: center.y + y };
  const left = { x: center.x - x, y: center.y };
  const top = { x: center.x, y: center.y - y };
  return [
    seg(right, { x: 0, y: -k * y }, { x: 0, y: k * y }),
    seg(bottom, { x: k * x, y: 0 }, { x: -k * x, y: 0 }),
    seg(left, { x: 0, y: k * y }, { x: 0, y: -k * y }),
    seg(top, { x: -k * x, y: 0 }, { x: k * x, y: 0 }),
  ];
}

export interface ArcInfo {
  center: Vec2;
  radius: number;
  /** Start/end angles in radians (canvas orientation, y down). */
  startAngle: number;
  endAngle: number;
  /** Signed sweep from start to end through the middle point. */
  sweep: number;
}

/** The circle through three points, or null when they are
 * (near-)collinear. The arc runs start → through → end. */
export function arcThroughPoints(a: Vec2, b: Vec2, c: Vec2): ArcInfo | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  const radius = Math.hypot(a.x - center.x, a.y - center.y);
  if (!(radius > 0)) return null;
  const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
  const midAngle = Math.atan2(b.y - center.y, b.x - center.x);
  const endAngle = Math.atan2(c.y - center.y, c.x - center.x);
  // Sweep from start to end in the direction that passes mid.
  const twoPi = Math.PI * 2;
  const norm = (v: number): number => ((v % twoPi) + twoPi) % twoPi;
  const cw = norm(endAngle - startAngle); // increasing-angle sweep
  const midCw = norm(midAngle - startAngle);
  const sweep = midCw <= cw ? cw : cw - twoPi;
  if (Math.abs(sweep) < 1e-9) return null;
  return { center, radius, startAngle, endAngle, sweep };
}

/** Cubic approximation of an arc, split into ≤90° spans (kappa). */
export function arcSegments(info: ArcInfo): BezierSegment[] {
  const spans = Math.max(1, Math.ceil(Math.abs(info.sweep) / (Math.PI / 2)));
  const step = info.sweep / spans;
  // Unsigned kappa with the travel-flipped tangent below: a signed
  // kappa would cancel the flip and bulge the arc the wrong way.
  const kappa = (4 / 3) * Math.tan(Math.abs(step) / 4);
  const pointAt = (angle: number): Vec2 => ({
    x: info.center.x + info.radius * Math.cos(angle),
    y: info.center.y + info.radius * Math.sin(angle),
  });
  const tangentAt = (angle: number): Vec2 => {
    // Derivative direction for increasing angle; flip for negative sweep.
    const dir = info.sweep >= 0 ? 1 : -1;
    return { x: -Math.sin(angle) * dir, y: Math.cos(angle) * dir };
  };
  const segments: BezierSegment[] = [];
  for (let i = 0; i <= spans; i++) {
    const angle = info.startAngle + step * i;
    const point = pointAt(angle);
    const tangent = tangentAt(angle);
    const handle = info.radius * kappa;
    segments.push(seg(
      point,
      i === 0 ? { x: 0, y: 0 } : { x: -tangent.x * handle, y: -tangent.y * handle },
      i === spans ? { x: 0, y: 0 } : { x: tangent.x * handle, y: tangent.y * handle },
    ));
  }
  return segments;
}
