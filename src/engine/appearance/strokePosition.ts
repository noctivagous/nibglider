// Canvas implementation of semantic stroke alignment. Paper has no native
// stroke-position style, so we retain its stroker and clip the result during
// the item's normal draw pass. This keeps paths editable and does not require
// a second rendering backend.
import type { StrokePosition } from '../types';

type Item = any;

const DATA_KEY = 'nibglider.strokePosition';
const PATCH_KEY = '__nibgliderStrokePositionPatched';

export function strokePositionOf(item: Item): StrokePosition {
  const value = item?.data?.[DATA_KEY];
  return value === 'inside' || value === 'outside' ? value : 'center';
}

export function setStrokePosition(item: Item, position: StrokePosition): void {
  if (!item) return;
  item.data ??= {};
  item.data[DATA_KEY] = position;
}

/** Install once per Paper scope. It affects only items tagged by
 * setStrokePosition(), leaving all ordinary Paper paths untouched. */
export function installStrokePositionRenderer(scope: paper.PaperScope): void {
  for (const ctor of [scope.Path, scope.CompoundPath]) {
    const prototype = ctor?.prototype as Item | undefined;
    if (!prototype || prototype[PATCH_KEY]) continue;
    // Keep the public API on the Paper item, while the value itself lives in
    // `data` so it survives Paper clones and remains out of its native style.
    Object.defineProperty(prototype, 'strokePosition', {
      configurable: true,
      get(this: Item): StrokePosition { return strokePositionOf(this); },
      set(this: Item, value: unknown): void {
        setStrokePosition(this, value === 'inside' || value === 'outside' ? value : 'center');
      },
    });
    const draw = prototype._draw;
    if (typeof draw !== 'function') continue;
    prototype[PATCH_KEY] = true;
    prototype._draw = function strokePositionDraw(
      this: Item, ctx: CanvasRenderingContext2D, param: Item,
      viewMatrix: Item, strokeMatrix: Item,
    ): void {
      const position = strokePositionOf(this);
      if (position === 'center' || !hasClosedContour(this) || !this.getStyle?.().hasStroke?.()) {
        draw.call(this, ctx, param, viewMatrix, strokeMatrix);
        return;
      }

      // Fill first, then draw the same centered Canvas stroke under a clip.
      // Temporarily changing Paper style properties is safe here: this is a
      // synchronous paint pass and both values are restored before return.
      const fill = this.fillColor;
      const stroke = this.strokeColor;
      this.strokeColor = null;
      try {
        draw.call(this, ctx, param, viewMatrix, strokeMatrix);
      } finally {
        this.strokeColor = stroke;
      }

      ctx.save();
      try {
        // Paper's clip mode emits this item's fill contour without painting.
        draw.call(this, ctx, param.extend({ clip: true }), viewMatrix, strokeMatrix);
        if (position === 'outside') {
          // With even-odd filling, adding an enclosing rectangle turns the
          // path into its complement. The margin covers the entire current
          // stroke even for a large miter.
          // The context can be in stroke-matrix coordinates when stroke
          // scaling is disabled. A deliberately huge rect avoids mixing
          // local and view coordinates here.
          ctx.rect(-1e9, -1e9, 2e9, 2e9);
          ctx.clip('evenodd');
        } else {
          ctx.clip(this.getFillRule?.() || 'nonzero');
        }
        this.fillColor = null;
        draw.call(this, ctx, param, viewMatrix, strokeMatrix);
      } finally {
        this.fillColor = fill;
        ctx.restore();
      }
    };
  }
}

function hasClosedContour(item: Item): boolean {
  if (typeof item.closed === 'boolean') return item.closed;
  const children = item.children;
  return Array.isArray(children) && children.length > 0 && children.every((child) => child.closed);
}
