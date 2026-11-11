// Ruler guides: pure document-side model.
// A guide is a straight line across the page at a fixed coordinate:
// axis 'x' is a vertical line (constant x), axis 'y' a horizontal line
// (constant y). Guides belong to a page, persist with the document
// (native file + gallery scene payload), can be locked against
// dragging, and act as snap targets. No Paper, React, or browser
// access. Tested from tests/pages-guides-print.test.mjs.

export interface GuideRecord {
  id: string;
  axis: 'x' | 'y';
  position: number;
  locked: boolean;
}

export function createGuide(id: string, axis: 'x' | 'y', position: number): GuideRecord {
  if (typeof id !== 'string' || id.length === 0) throw new Error('guide id must be non-empty');
  if (axis !== 'x' && axis !== 'y') throw new Error('guide axis must be x or y');
  if (!Number.isFinite(position)) throw new Error('guide position must be finite');
  return { id, axis, position, locked: false };
}

/** Move a guide. Locked guides refuse to move (returns the record
 * unchanged) so drag code can call this unconditionally. */
export function moveGuide(guide: GuideRecord, position: number): GuideRecord {
  if (guide.locked) return guide;
  if (!Number.isFinite(position)) return guide;
  return { ...guide, position };
}

export function setGuideLocked(guide: GuideRecord, locked: boolean): GuideRecord {
  return { ...guide, locked };
}

export function removeGuide(guides: readonly GuideRecord[], id: string): GuideRecord[] {
  return guides.filter((guide) => guide.id !== id);
}

/** Nearest guide of each axis within `threshold` of the point, or
 * null per axis. Locked guides still snap — locking stops editing,
 * not snapping. */
export function nearestGuides(
  point: { x: number; y: number },
  guides: readonly GuideRecord[],
  threshold: number,
): { x: GuideRecord | null; y: GuideRecord | null } {
  let bestX: GuideRecord | null = null;
  let bestXDist = threshold;
  let bestY: GuideRecord | null = null;
  let bestYDist = threshold;
  for (const guide of guides) {
    const dist = guide.axis === 'x' ? Math.abs(point.x - guide.position) : Math.abs(point.y - guide.position);
    if (guide.axis === 'x' && dist <= bestXDist) { bestX = guide; bestXDist = dist; }
    if (guide.axis === 'y' && dist <= bestYDist) { bestY = guide; bestYDist = dist; }
  }
  return { x: bestX, y: bestY };
}

/** Snap a point onto guides within threshold (document points).
 * Returns the possibly-moved point plus the guides it snapped to. */
export function snapToGuides(
  point: { x: number; y: number },
  guides: readonly GuideRecord[],
  threshold: number,
): { point: { x: number; y: number }; snappedX: GuideRecord | null; snappedY: GuideRecord | null } {
  if (!(threshold > 0) || guides.length === 0) return { point: { ...point }, snappedX: null, snappedY: null };
  const near = nearestGuides(point, guides, threshold);
  return {
    point: {
      x: near.x ? near.x.position : point.x,
      y: near.y ? near.y.position : point.y,
    },
    snappedX: near.x,
    snappedY: near.y,
  };
}

/** The guide a canvas press at `point` would grab: the closest
 * unlocked guide of either axis within threshold, or null. */
export function guideAtPoint(
  point: { x: number; y: number },
  guides: readonly GuideRecord[],
  threshold: number,
): GuideRecord | null {
  let best: GuideRecord | null = null;
  let bestDist = threshold;
  for (const guide of guides) {
    if (guide.locked) continue;
    const dist = guide.axis === 'x' ? Math.abs(point.x - guide.position) : Math.abs(point.y - guide.position);
    if (dist <= bestDist) { best = guide; bestDist = dist; }
  }
  return best;
}

/** Defensively read guide records from untrusted JSON (scene payload
 * extras, native files). Invalid entries are dropped, never thrown. */
export function readGuideRecords(value: unknown): GuideRecord[] {
  if (!Array.isArray(value)) return [];
  const out: GuideRecord[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const g = entry as Partial<GuideRecord>;
    if (typeof g.id !== 'string' || g.id.length === 0) continue;
    if (g.axis !== 'x' && g.axis !== 'y') continue;
    if (typeof g.position !== 'number' || !Number.isFinite(g.position)) continue;
    out.push({ id: g.id, axis: g.axis, position: g.position, locked: g.locked === true });
  }
  return out;
}
