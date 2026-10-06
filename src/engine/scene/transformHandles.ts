// Transform-controls overlay for the selection. Owns the bounding-box
// outline, eight scale handles, and one rotate handle above the box.
// The engine refreshes it on notify while transform mode is on; the
// pointer controller hit-tests and drags the handles. Items are
// guide-flagged non-content, so they never select, snap, save, or
// print — the same convention as export-frame handles and centroid
// markers.

type Item = any;

export type TransformScaleHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type TransformHandleId = TransformScaleHandleId | 'rotate';

export const TRANSFORM_SCALE_HANDLES: TransformScaleHandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Handle square edge length in document points. */
export const TRANSFORM_HANDLE_SIZE = 8;
/** Rotate-handle diameter in document points. */
export const TRANSFORM_ROTATE_SIZE = 10;
/** Gap between the box top edge and the rotate handle, document points. */
export const TRANSFORM_ROTATE_OFFSET = 24;
/** Box outline color: blue reads against the green centroid markers. */
const BOX_STROKE = '#4dabf7';

export interface TransformBounds { x: number; y: number; width: number; height: number }

export interface TransformHandleHost {
  scope(): { Path: any; Point: any; Size: any; Color: any };
  mount(item: Item): void;
  unmount(item: Item): void;
}

export function transformHandlePoint(id: TransformHandleId, b: TransformBounds): { x: number; y: number } {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  switch (id) {
    case 'nw': return { x: b.x, y: b.y };
    case 'n': return { x: cx, y: b.y };
    case 'ne': return { x: b.x + b.width, y: b.y };
    case 'e': return { x: b.x + b.width, y: cy };
    case 'se': return { x: b.x + b.width, y: b.y + b.height };
    case 's': return { x: cx, y: b.y + b.height };
    case 'sw': return { x: b.x, y: b.y + b.height };
    case 'w': return { x: b.x, y: cy };
    case 'rotate': return { x: cx, y: b.y - TRANSFORM_ROTATE_OFFSET };
  }
}

/** Opposite anchor for a scale drag: the fixed point of the gesture. */
export function transformScaleAnchor(id: TransformScaleHandleId, b: TransformBounds): { x: number; y: number } {
  const opposite: Record<TransformScaleHandleId, TransformScaleHandleId> = {
    nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e',
  };
  return transformHandlePoint(opposite[id], b);
}

export class TransformHandles {
  private readonly host: TransformHandleHost;
  private items: { id: TransformHandleId | 'box' | 'stem'; item: Item }[] = [];
  private boundsKey = '';

  constructor(host: TransformHandleHost) {
    this.host = host;
  }

  get handleItems(): Item[] { return this.items.map((entry) => entry.item); }

  /** Rebuild the overlay for the bounds, or clear it when null. Skips
   * work when the same bounds are already drawn. */
  refresh(bounds: TransformBounds | null): void {
    const key = bounds && bounds.width > 0 && bounds.height > 0
      ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : '';
    if (key === this.boundsKey) return;
    this.clear();
    if (!bounds || !key) return;
    const scope = this.host.scope();
    try {
      const box = new scope.Path.Rectangle({
        point: new scope.Point(bounds.x, bounds.y),
        size: new scope.Size(bounds.width, bounds.height),
      });
      box.fillColor = null;
      box.strokeColor = new scope.Color(BOX_STROKE);
      box.strokeWidth = 1;
      this.flag(box, 'box');
      this.host.mount(box);
      this.items.push({ id: 'box', item: box });
      const top = { x: bounds.x + bounds.width / 2, y: bounds.y };
      const grip = transformHandlePoint('rotate', bounds);
      const stem = new scope.Path.Line(new scope.Point(top.x, top.y), new scope.Point(grip.x, grip.y));
      stem.strokeColor = new scope.Color(BOX_STROKE);
      stem.strokeWidth = 1;
      this.flag(stem, 'stem');
      this.host.mount(stem);
      this.items.push({ id: 'stem', item: stem });
    } catch { /* Detached mid-refresh. */ }
    const half = TRANSFORM_HANDLE_SIZE / 2;
    for (const id of TRANSFORM_SCALE_HANDLES) {
      try {
        const p = transformHandlePoint(id, bounds);
        const square = new scope.Path.Rectangle({
          point: new scope.Point(p.x - half, p.y - half),
          size: new scope.Size(TRANSFORM_HANDLE_SIZE, TRANSFORM_HANDLE_SIZE),
        });
        square.fillColor = new scope.Color(1, 1, 1);
        square.strokeColor = new scope.Color(BOX_STROKE);
        square.strokeWidth = 1.5;
        this.flag(square, id);
        this.host.mount(square);
        this.items.push({ id, item: square });
      } catch { /* Detached mid-refresh. */ }
    }
    try {
      const grip = transformHandlePoint('rotate', bounds);
      const knob = new scope.Path.Circle(new scope.Point(grip.x, grip.y), TRANSFORM_ROTATE_SIZE / 2);
      knob.fillColor = new scope.Color(1, 1, 1);
      knob.strokeColor = new scope.Color(BOX_STROKE);
      knob.strokeWidth = 1.5;
      this.flag(knob, 'rotate');
      this.host.mount(knob);
      this.items.push({ id: 'rotate', item: knob });
    } catch { /* Detached mid-refresh. */ }
    this.boundsKey = key;
  }

  /** Handle id under the document point, or null. Tolerance is in
   * document points; callers scale it by the inverse view zoom. */
  handleAt(point: { x: number; y: number }, tolerance: number): TransformHandleId | null {
    let best: TransformHandleId | null = null;
    let bestDist = Infinity;
    const ids: TransformHandleId[] = [...TRANSFORM_SCALE_HANDLES, 'rotate'];
    for (const id of ids) {
      const entry = this.items.find((e) => e.id === id);
      if (!entry) continue;
      try {
        const b = entry.item.bounds;
        if (!b) continue;
        const pad = (id === 'rotate' ? TRANSFORM_ROTATE_SIZE : TRANSFORM_HANDLE_SIZE) / 2 + tolerance;
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const dist = Math.max(Math.abs(point.x - cx), Math.abs(point.y - cy));
        if (dist <= pad && dist < bestDist) { best = id; bestDist = dist; }
      } catch { /* Detached already. */ }
    }
    return best;
  }

  clear(): void {
    for (const entry of this.items) {
      try { this.host.unmount(entry.item); } catch { /* Already gone. */ }
    }
    this.items = [];
    this.boundsKey = '';
  }

  private flag(item: Item, id: TransformHandleId | 'box' | 'stem'): void {
    item.guide = true;
    item.locked = true;
    if (!item.data) item.data = {};
    item.data.isTransformHandle = true;
    item.data.transformHandleId = id;
  }
}
