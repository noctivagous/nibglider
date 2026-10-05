// Circle-origin tagging and closed-path centroid resolution.
// Snapping and selection markers share these so a revealed centroid is the
// same point that point-snapping hits. Owns no scene state: callers map the
// returned local points through item.localToGlobal so results track moves,
// scales, and rotations applied to the item matrix.
export interface CenteredSegment {
  point: { x: number; y: number };
  handleIn: { x: number; y: number };
  handleOut: { x: number; y: number };
}
export interface CenteredShape {
  data?: any;
  closed?: boolean;
  segments?: CenteredSegment[];
  internalBounds?: { center: { x: number; y: number } };
}

function finitePoint(value: any): { x: number; y: number } | null {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return { x: value.x, y: value.y };
}

/** Stored circle origin in the item's local frame, or null. */
export function readCircleOrigin(item: CenteredShape): { x: number; y: number } | null {
  return finitePoint(item?.data?.circleOrigin);
}

/**
 * Remember the construction center of a radial shape (circle, regular
 * polygon, sector, segment, semicircle, supershape, circum issuers). The
 * center is stored in the item's local frame so localToGlobal keeps tracking
 * it across later transforms. Tag the leaf path before any shape+text
 * grouping so scene searches that recurse into groups still find it.
 */
export function tagCircleOrigin(item: any, center: { x: number; y: number }): void {
  if (!item || !center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return;
  let local = { x: center.x, y: center.y };
  try {
    if (typeof item.globalToLocal === 'function') {
      const mapped = item.globalToLocal(center);
      if (mapped && Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) {
        local = { x: mapped.x, y: mapped.y };
      }
    }
  } catch { /* Uninserted or detached; creation frame equals local frame. */ }
  if (!item.data) item.data = {};
  item.data.circleOrigin = local;
}

function handlesAreStraight(segment: CenteredSegment): boolean {
  const zero = (h: { x: number; y: number }): boolean =>
    (!h || (h.x === 0 && h.y === 0));
  return zero(segment.handleIn) && zero(segment.handleOut);
}

/** Area centroid of a simple polygon via the shoelace formula. */
export function polygonCentroid(points: Array<{ x: number; y: number }>): { x: number; y: number } | null {
  if (!points || points.length < 3) return null;
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    const cross = p.x * q.y - q.x * p.y;
    twiceArea += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) < 1e-9) return null;
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

/**
 * Local-frame centroid for marker and snap candidates: the stored circle
 * origin when present (exact for radial shapes, including segments whose
 * origin sits outside the filled region), the area centroid for straight
 * closed paths (exact circumcenter for regular polygons, unlike the bounds
 * center on odd-sided figures), else the bounds center for curved closed
 * paths. Open paths have no centroid candidate.
 */
export function localCentroidOf(item: CenteredShape): { x: number; y: number } | null {
  const origin = readCircleOrigin(item);
  if (origin) return origin;
  if (!item?.closed || !item.segments?.length) return null;
  if (item.segments.every(handlesAreStraight)) {
    const centroid = polygonCentroid(item.segments.map((s) => s.point));
    if (centroid) return centroid;
  }
  return finitePoint(item.internalBounds?.center);
}
