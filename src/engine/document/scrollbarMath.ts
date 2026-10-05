// Pure scrollbar geometry for the custom canvas scrollbars. The scroll
// range on each axis is the union of the DrawingBoard span and the
// current view span, so thumbs stay on-track even when panned into
// empty space. Ratios are 0..1; callers map them to pixels.
// Tested from tests/canvas-scrollbars.test.mjs.
export interface ScrollGeometry {
  /** Fraction of the track the thumb fills (0..1). */
  sizeRatio: number;
  /** Thumb offset as a fraction of its travel (0..1). */
  offsetRatio: number;
  /** Scroll-range start in project units (board/view union). */
  rangeMin: number;
  /** Scroll-range size in project units. */
  rangeSize: number;
}

/** Smallest thumb fill so a huge board still leaves a grabbable thumb. */
export const MIN_THUMB_RATIO = 0.06;

function unionRange(aMin: number, aSize: number, bMin: number, bSize: number): { min: number; size: number } {
  const aMax = aMin + aSize;
  const bMax = bMin + bSize;
  const min = Math.min(aMin, bMin);
  return { min, size: Math.max(aMax, bMax) - min };
}

export interface ContentRect { x: number; y: number; width: number; height: number }

/** Span of two rects; either side may be null (the board or the page). */
export function unionRects(a: ContentRect | null, b: ContentRect | null): ContentRect {
  if (!a && !b) return { x: 0, y: 0, width: 0, height: 0 };
  if (!a || !b) return { ...((a ?? b) as ContentRect) };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** Thumb geometry for one axis. Degenerate input yields a full thumb. */
export function computeScrollGeometry(
  viewMin: number,
  viewSize: number,
  contentMin: number,
  contentSize: number,
): ScrollGeometry {
  if (![viewMin, viewSize, contentMin, contentSize].every(Number.isFinite)
    || viewSize <= 0 || contentSize <= 0) {
    return { sizeRatio: 1, offsetRatio: 0, rangeMin: viewMin || 0, rangeSize: Math.max(viewSize, 0) };
  }
  const { min, size } = unionRange(viewMin, viewSize, contentMin, contentSize);
  if (!(size > 0) || size <= viewSize) {
    return { sizeRatio: 1, offsetRatio: 0, rangeMin: min, rangeSize: size };
  }
  const travel = size - viewSize;
  const sizeRatio = Math.min(1, Math.max(MIN_THUMB_RATIO, viewSize / size));
  const offsetRatio = Math.min(1, Math.max(0, (viewMin - min) / travel));
  return { sizeRatio, offsetRatio, rangeMin: min, rangeSize: size };
}

/** View-center project coordinate for a thumb offset ratio. */
export function scrollCenterForOffset(
  offsetRatio: number,
  viewSize: number,
  rangeMin: number,
  rangeSize: number,
): number {
  const clamped = Math.min(1, Math.max(0, offsetRatio));
  if (![viewSize, rangeMin, rangeSize].every(Number.isFinite) || rangeSize <= viewSize) {
    return rangeMin + rangeSize / 2;
  }
  return rangeMin + clamped * (rangeSize - viewSize) + viewSize / 2;
}

/** View-center after paging by one viewport in the given direction. */
export function scrollCenterForPage(
  viewCenter: number,
  viewSize: number,
  direction: 1 | -1,
  rangeMin: number,
  rangeSize: number,
): number {
  const paged = viewCenter + direction * viewSize * 0.9;
  const lo = rangeMin + viewSize / 2;
  const hi = rangeMin + rangeSize - viewSize / 2;
  if (!(hi > lo)) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, paged));
}
