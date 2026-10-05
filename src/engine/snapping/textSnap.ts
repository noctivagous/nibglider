// Baseline-first move snapping for editable text. Print compositors align
// type by its baselines, not its bounding box, so a text move tries the
// baseline grid first and only then the box edges. The resolver is pure math
// over plain numbers (no Paper dependency); baseline extraction takes the
// scope so SelectionManager and the engine share one reading. Tested from
// tests/text-baseline.test.mjs.

type Item = any;

/** Snap features for one move, in project coordinates. */
export interface TextSnapFeatures {
  baselines: number[];
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** A baseline origin (global) with its run direction (unit). Paper draws
 * each PointText line from its local origin, so the first line's baseline
 * is local y = 0 and later lines sit at multiples of the leading. */
export interface BaselineGuide {
  point: Item;
  dir: Item;
}

/** Snap reach: half a grid cell, capped so coarse grids stay predictable. */
export function gridSnapThreshold(spacing: number): number {
  if (!(spacing > 0)) return 0;
  return Math.min(12, spacing / 2);
}

export function nearestGridLine(value: number, spacing: number): number {
  return Math.round(value / spacing) * spacing;
}

/** Adjust a move delta so the features land on grid lines. Vertical moves
 * try baselines first, then the box top/bottom; horizontal moves use the
 * box left/right. Non-finite features never match. */
export function resolveTextMoveDelta(
  features: TextSnapFeatures,
  dx: number,
  dy: number,
  spacing: number,
): { dx: number; dy: number } {
  if (!(spacing > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return { dx, dy };
  const threshold = gridSnapThreshold(spacing);
  const snapAxis = (values: number[], delta: number): { value: number; snapped: boolean } => {
    let best = delta;
    let bestDist = Infinity;
    let snapped = false;
    for (const candidate of values) {
      if (!Number.isFinite(candidate)) continue;
      const moved = candidate + delta;
      const residual = nearestGridLine(moved, spacing) - moved;
      const dist = Math.abs(residual);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        best = delta + residual;
        snapped = true;
      }
    }
    return { value: best, snapped };
  };
  const vertical = snapAxis(features.baselines, dy);
  const outY = vertical.snapped
    ? vertical.value
    : snapAxis([features.top, features.bottom], dy).value;
  const outX = snapAxis([features.left, features.right], dx).value;
  return { dx: outX, dy: outY };
}

/** Global baseline origins for an editable root's PointText lines. */
export function editableBaselines(scope: Item, root: Item): BaselineGuide[] {
  const lines: Item[] = !root
    ? []
    : root.className === 'PointText'
      ? [root]
      : Array.isArray(root.children)
        ? root.children.filter((child: Item) => child && child.className === 'PointText')
        : [];
  const out: BaselineGuide[] = [];
  for (const line of lines) {
    try {
      const point = line.localToGlobal(new scope.Point(0, 0));
      const along = line.localToGlobal(new scope.Point(1, 0));
      const dir = along.subtract(point);
      if (dir && dir.length > 1e-9) out.push({ point, dir: dir.normalize() });
    } catch { /* Skip unreadable lines. */ }
  }
  return out;
}
