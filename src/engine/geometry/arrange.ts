// Align & distribute math (Slice 4): pure functions over plain
// bounds rectangles. Each returns one translation delta per input
// bounds, in input order; the engine applies the deltas as a single
// move gesture. Tested from tests/arrange.test.mjs.

export interface ArrangeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrangeDelta {
  x: number;
  y: number;
}

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

function unionBounds(bounds: readonly ArrangeBounds[]): ArrangeBounds | null {
  if (bounds.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of bounds) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Deltas aligning every bounds to `reference` (the selection's own
 * union for align-to-selection, the page/artwork rect for
 * align-to-document). Edges align to edges; centres to centres.
 */
export function alignDeltas(
  bounds: readonly ArrangeBounds[],
  mode: AlignMode,
  reference: ArrangeBounds,
): ArrangeDelta[] {
  return bounds.map((b) => {
    switch (mode) {
      case 'left': return { x: reference.x - b.x, y: 0 };
      case 'right': return { x: reference.x + reference.width - (b.x + b.width), y: 0 };
      case 'centerX': return { x: reference.x + reference.width / 2 - (b.x + b.width / 2), y: 0 };
      case 'top': return { x: 0, y: reference.y - b.y };
      case 'bottom': return { x: 0, y: reference.y + reference.height - (b.y + b.height) };
      case 'centerY': return { x: 0, y: reference.y + reference.height / 2 - (b.y + b.height / 2) };
      default: return { x: 0, y: 0 };
    }
  });
}

/** Align to the selection's own bounding union. */
export function alignToSelectionDeltas(
  bounds: readonly ArrangeBounds[],
  mode: AlignMode,
): ArrangeDelta[] {
  const reference = unionBounds(bounds);
  if (!reference) return bounds.map(() => ({ x: 0, y: 0 }));
  return alignDeltas(bounds, mode, reference);
}

/**
 * Deltas distributing bounds along an axis with equal gaps between
 * neighbours: the first and last items (by position) stay put and
 * the space between them is shared evenly. Needs ≥ 3 items; with
 * fewer, nothing moves. Items keep their input order in the output.
 */
export function distributeDeltas(
  bounds: readonly ArrangeBounds[],
  axis: DistributeAxis,
): ArrangeDelta[] {
  const deltas = bounds.map(() => ({ x: 0, y: 0 }));
  if (bounds.length < 3) return deltas;
  const horizontal = axis === 'horizontal';
  const start = (b: ArrangeBounds): number => (horizontal ? b.x : b.y);
  const size = (b: ArrangeBounds): number => (horizontal ? b.width : b.height);
  const order = bounds.map((b, i) => ({ b, i })).sort((a, c) => start(a.b) - start(c.b));
  const first = order[0].b;
  const last = order[order.length - 1].b;
  const spanStart = start(first);
  const spanEnd = start(last) + size(last);
  const totalSize = order.reduce((sum, { b }) => sum + size(b), 0);
  const gap = (spanEnd - spanStart - totalSize) / (order.length - 1);
  let cursor = spanStart;
  for (const { b, i } of order) {
    const delta = cursor - start(b);
    deltas[i] = horizontal ? { x: delta, y: 0 } : { x: 0, y: delta };
    cursor += size(b) + gap;
  }
  return deltas;
}
