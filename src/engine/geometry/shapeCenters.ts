// Circle-origin tagging and closed-path centroid resolution.
// Snapping and selection markers share these so a revealed centroid is the
// same point that point-snapping hits. Owns no scene state: readers map the
// returned local points through item.localToGlobal at query time.
//
// Paper bakes position/scale/rotate into segment points (applyMatrix) while
// leaving the item matrix identity, so a stored local origin does NOT follow
// later transforms on its own. Every mutation that moves geometry must carry
// the tag along via shiftCircleOrigins/remapCircleOrigins below; readers must
// never adjust the tag themselves.
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

/** Global-point mapper for remapCircleOrigins: scale about a center. */
export function scaleAboutMapper(
  center: { x: number; y: number }, factor: number,
): (point: { x: number; y: number }) => { x: number; y: number } {
  return (point) => ({
    x: center.x + (point.x - center.x) * factor,
    y: center.y + (point.y - center.y) * factor,
  });
}

/** Global-point mapper for remapCircleOrigins: non-uniform scale about a center. */
export function scaleXYAboutMapper(
  center: { x: number; y: number }, fx: number, fy: number,
): (point: { x: number; y: number }) => { x: number; y: number } {
  return (point) => ({
    x: center.x + (point.x - center.x) * fx,
    y: center.y + (point.y - center.y) * fy,
  });
}

/** Global-point mapper for remapCircleOrigins: shear about a center.
 * Horizontal shears x by the y offset (x' = x + k·(y−cy)); vertical
 * shears y by the x offset. Matches the Paper matrix applied in
 * TransformManager. */
export function shearAboutMapper(
  center: { x: number; y: number }, horizontal: boolean, k: number,
): (point: { x: number; y: number }) => { x: number; y: number } {
  return (point) => horizontal
    ? { x: point.x + k * (point.y - center.y), y: point.y }
    : { x: point.x, y: point.y + k * (point.x - center.x) };
}

/** Global-point mapper for remapCircleOrigins: Paper-clockwise rotation. */
export function rotateAboutMapper(
  center: { x: number; y: number }, degrees: number,
): (point: { x: number; y: number }) => { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return (point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  };
}

/**
 * Carry stored circle origins along a translation applied to a (possibly
 * grouped) item: shift every tagged descendant by the same global delta.
 * No-op for untagged subtrees. Call with the same delta as the geometry
 * move so the tag and the baked segment points stay in the same frame.
 */
export function shiftCircleOrigins(root: any, dx: number, dy: number): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return;
  remapCircleOrigins(root, (point) => ({ x: point.x + dx, y: point.y + dy }));
}

/**
 * Carry stored circle origins along an arbitrary global-point transform
 * (scale/rotate about a center) applied to a (possibly grouped) item.
 * Each tagged leaf is re-read in its own local frame, so nesting under
 * transformed groups stays exact. Leaves whose mapping fails keep their
 * previous tag rather than recording garbage.
 */
export function remapCircleOrigins(
  root: any, map: (point: { x: number; y: number }) => { x: number; y: number } | null,
): void {
  if (!root || typeof map !== 'function') return;
  const children = root.children;
  if (Array.isArray(children) && children.length > 0) {
    for (const child of children) remapCircleOrigins(child, map);
    return;
  }
  const origin = readCircleOrigin(root);
  if (!origin) return;
  let next: { x: number; y: number } | null = null;
  try {
    const global = root.localToGlobal({ x: origin.x, y: origin.y });
    if (!global || !Number.isFinite(global.x) || !Number.isFinite(global.y)) return;
    next = map({ x: global.x, y: global.y });
  } catch { return; }
  if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.y)) return;
  tagCircleOrigin(root, next);
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
