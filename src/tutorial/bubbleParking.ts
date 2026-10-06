// Parking geometry for the tutorial bubble.
// Pure functions only: no DOM access, so the choice of corner is unit
// testable. The overlay supplies viewport/bubble size plus the rects the
// bubble must avoid (demo footprint, named avoid targets, screen chrome)
// and this module picks the corner with the least overlap. An authored
// anchor corner always wins: sitting on top of an element is allowed when
// the step deliberately asks for it.

import type { DemoAction } from './tutorialSchema';

export type BubbleCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ParkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParkViewport {
  width: number;
  height: number;
}

export interface BubbleSize {
  width: number;
  height: number;
}

/** Margin between a parked bubble and the viewport edge. */
export const BUBBLE_PARK_GAP = 12;
/** Matches the .tutorial-bubble CSS width; used before measuring. */
export const BUBBLE_DEFAULT_WIDTH = 320;
/** Pre-measure height estimate so the first paint already parks sanely. */
export const BUBBLE_ESTIMATED_HEIGHT = 260;

const CORNER_ORDER: readonly BubbleCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** Pixel position of a corner slot, clamped so the bubble stays on screen. */
export function cornerPosition(
  corner: BubbleCorner,
  viewport: ParkViewport,
  size: BubbleSize,
  gap: number = BUBBLE_PARK_GAP,
): { left: number; top: number } {
  const left =
    corner === 'top-left' || corner === 'bottom-left'
      ? gap
      : Math.max(gap, viewport.width - size.width - gap);
  const top =
    corner === 'top-left' || corner === 'top-right'
      ? gap
      : Math.max(gap, viewport.height - size.height - gap);
  return { left, top };
}

/** Area of the intersection of two rects; 0 when they do not overlap. */
export function overlapArea(a: ParkRect, b: ParkRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

/** Total area of `rect` covered by any of the avoid rects. */
export function totalOverlap(rect: ParkRect, avoid: readonly ParkRect[]): number {
  let total = 0;
  for (const other of avoid) total += overlapArea(rect, other);
  return total;
}

function cornerRect(corner: BubbleCorner, viewport: ParkViewport, size: BubbleSize): ParkRect {
  const pos = cornerPosition(corner, viewport, size);
  return { x: pos.left, y: pos.top, width: size.width, height: size.height };
}

/**
 * Pick the corner whose bubble rect overlaps the avoid rects least.
 * A preferred (authored) corner wins outright: overlap there is deliberate.
 * Without a preference, ties resolve in fixed corner order (deterministic).
 */
export function chooseParkCorner(
  viewport: ParkViewport,
  size: BubbleSize,
  avoid: readonly ParkRect[],
  preferred?: BubbleCorner,
): BubbleCorner {
  if (preferred && CORNER_ORDER.includes(preferred)) return preferred;
  let best: BubbleCorner = CORNER_ORDER[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const corner of CORNER_ORDER) {
    const score = totalOverlap(cornerRect(corner, viewport, size), avoid);
    if (score < bestScore) {
      bestScore = score;
      best = corner;
    }
  }
  return best;
}

/**
 * Screen rects a step's demo script will touch, so the bubble can park
 * clear of the whole performance before it starts (no chasing the cursor).
 * Canvas fractions map onto the canvas rect; key presses and popovers map
 * onto the `key-<k>` keycap; point-at/move-cursor resolve through the
 * shared data-tutorial-id namespace. Unresolvable targets are skipped.
 */
export function demoFootprint(
  actions: readonly DemoAction[],
  resolve: (targetId: string) => ParkRect | null,
  canvasRect: ParkRect | null,
  pad = 90,
): ParkRect[] {
  const out: ParkRect[] = [];
  const push = (rect: ParkRect | null): void => {
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return;
    if (out.some((r) => r.x === rect.x && r.y === rect.y && r.width === rect.width && r.height === rect.height)) {
      return;
    }
    out.push(rect);
  };
  const padded = (x: number, y: number): ParkRect => ({ x: x - pad, y: y - pad, width: pad * 2, height: pad * 2 });
  for (const action of actions) {
    switch (action.kind) {
      case 'move-cursor-xy':
        if (canvasRect) {
          push(padded(canvasRect.x + action.x * canvasRect.width, canvasRect.y + action.y * canvasRect.height));
        }
        break;
      case 'move-cursor':
        if (action.to === 'canvas' && canvasRect) {
          push({ ...canvasRect });
        } else {
          push(resolve(action.to));
        }
        break;
      case 'press-key':
      case 'open-popover':
        push(resolve(`key-${action.key.toLowerCase()}`));
        break;
      case 'point-at':
        push(resolve(action.target));
        break;
      case 'set-param':
      case 'close-popover':
      case 'wait':
      case 'narrate':
        break;
    }
  }
  return out;
}
