// Arrowheads on stroked paths (Tier Two, Slice 7).
// Pure geometry: given an endpoint, the path's travel direction
// there, a style and the stroke width, produce the arrowhead shape
// in document points. The engine turns the geometry into Paper
// items grouped with the spine, so the head is part of the path's
// derived item (moves, saves and prints with it).
import type { Vec2 } from '../model/geometryResolution';

export type ArrowheadStyle = 'none' | 'triangle' | 'barb' | 'dot';

export const ARROWHEAD_STYLES: ArrowheadStyle[] = ['none', 'triangle', 'barb', 'dot'];

export function isArrowheadStyle(v: unknown): v is ArrowheadStyle {
  return v === 'none' || v === 'triangle' || v === 'barb' || v === 'dot';
}

/** Arrow length for a stroke width: ~3.5× the width, clamped so
 * hairlines still read and heavy strokes don't grow monsters. */
export function arrowLength(strokeWidth: number): number {
  const w = Number.isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 1;
  return Math.max(7, Math.min(64, w * 3.5));
}

export interface ArrowheadGeometry {
  /** Filled polygon (triangle/dot outline), when the style fills. */
  polygon: Vec2[] | null;
  /** Open polyline (barb wings through the tip), when it strokes. */
  polyline: Vec2[] | null;
  /** Dot radius (dot draws as a circle), 0 otherwise. */
  dotRadius: number;
  /** The tip point (the path endpoint itself). */
  tip: Vec2;
}

/**
 * Geometry for one arrowhead. `dir` is the direction of travel AT
 * the endpoint (for a start arrowhead, pass the reversed tangent —
 * the head points back along the path). The tip sits on the
 * endpoint; the body extends opposite `dir`.
 */
export function arrowheadGeometry(
  tip: Vec2,
  dir: Vec2,
  style: ArrowheadStyle,
  strokeWidth: number,
): ArrowheadGeometry {
  const len = Math.hypot(dir.x, dir.y);
  const d = len > 1e-9 ? { x: dir.x / len, y: dir.y / len } : { x: 1, y: 0 };
  const n = { x: -d.y, y: d.x };
  const length = arrowLength(strokeWidth);
  const halfWidth = Math.max(2.5, length * 0.32);
  const base = { x: tip.x - d.x * length, y: tip.y - d.y * length };
  const wing = (side: 1 | -1): Vec2 => ({
    x: base.x + n.x * halfWidth * side,
    y: base.y + n.y * halfWidth * side,
  });
  switch (style) {
    case 'triangle':
      return { polygon: [{ ...tip }, wing(1), wing(-1)], polyline: null, dotRadius: 0, tip: { ...tip } };
    case 'barb': {
      // Wings sweep back a little past the base for the classic
      // open-arrow look.
      const back = { x: base.x - d.x * length * 0.25, y: base.y - d.y * length * 0.25 };
      const w1 = { x: back.x + n.x * halfWidth * 1.05, y: back.y + n.y * halfWidth * 1.05 };
      const w2 = { x: back.x - n.x * halfWidth * 1.05, y: back.y - n.y * halfWidth * 1.05 };
      return { polygon: null, polyline: [w1, { ...tip }, w2], dotRadius: 0, tip: { ...tip } };
    }
    case 'dot': {
      const radius = Math.max(2, strokeWidth * 0.85);
      const center = { x: tip.x - d.x * radius * 0.4, y: tip.y - d.y * radius * 0.4 };
      const polygon: Vec2[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        polygon.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
      }
      return { polygon, polyline: null, dotRadius: radius, tip: { ...tip } };
    }
    default:
      return { polygon: null, polyline: null, dotRadius: 0, tip: { ...tip } };
  }
}
