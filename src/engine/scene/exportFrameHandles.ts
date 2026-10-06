// Resize handles for a selected Export Frame. Owns the eight guide-layer
// handle squares (corners + edge midpoints); the engine refreshes them on
// notify, and the pointer controller hit-tests and drags them.
// Handles are guide-flagged non-content, so they never select, snap, save,
// or print — the same convention as centroid markers.

type Item = any;

export type ExportFrameHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const EXPORT_FRAME_HANDLES: ExportFrameHandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Handle square edge length in document points. */
export const HANDLE_SIZE = 8;

export interface ExportFrameHandleHost {
  scope(): { Path: any; Point: any; Size: any; Color: any };
  mount(item: Item): void;
  unmount(item: Item): void;
}

function handlePoint(id: ExportFrameHandleId, b: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
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
  }
}

export class ExportFrameHandles {
  private readonly host: ExportFrameHandleHost;
  private items: { id: ExportFrameHandleId; item: Item }[] = [];
  private frameItem: Item | null = null;
  private frameKey = '';

  constructor(host: ExportFrameHandleHost) {
    this.host = host;
  }

  get handleItems(): Item[] { return this.items.map((entry) => entry.item); }

  /** Rebuild handles for the frame, or clear them when null. Skips work
   * when the same frame with the same bounds is already handled. */
  refresh(frame: Item | null): void {
    let key = '';
    if (frame) {
      try {
        const b = frame.bounds;
        if (b && b.width > 0 && b.height > 0) {
          key = `${b.x},${b.y},${b.width},${b.height}`;
        }
      } catch { /* Detached already. */ }
    }
    if (frame === this.frameItem && key === this.frameKey) return;
    this.clear();
    if (!frame || !key) return;
    const scope = this.host.scope();
    let bounds: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const b = frame.bounds;
      bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch { /* Detached already. */ }
    if (!bounds) return;
    const half = HANDLE_SIZE / 2;
    for (const id of EXPORT_FRAME_HANDLES) {
      try {
        const p = handlePoint(id, bounds);
        const square = new scope.Path.Rectangle({
          point: new scope.Point(p.x - half, p.y - half),
          size: new scope.Size(HANDLE_SIZE, HANDLE_SIZE),
        });
        square.fillColor = new scope.Color(1, 1, 1);
        square.strokeColor = new scope.Color(0.2, 0.2, 0.22);
        square.strokeWidth = 1;
        square.guide = true;
        square.locked = true;
        if (!square.data) square.data = {};
        square.data.isFrameHandle = true;
        square.data.frameHandleId = id;
        this.host.mount(square);
        this.items.push({ id, item: square });
      } catch { /* Detached mid-refresh. */ }
    }
    this.frameItem = frame;
    this.frameKey = key;
  }

  /** Handle id under the document point, or null. Tolerance is in
   * document points; callers scale it by the inverse view zoom. */
  handleAt(point: { x: number; y: number }, tolerance: number): ExportFrameHandleId | null {
    for (const entry of this.items) {
      try {
        const b = entry.item.bounds;
        if (!b) continue;
        const pad = HANDLE_SIZE / 2 + tolerance;
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        if (Math.abs(point.x - cx) <= pad && Math.abs(point.y - cy) <= pad) return entry.id;
      } catch { /* Detached already. */ }
    }
    return null;
  }

  clear(): void {
    for (const entry of this.items) {
      try { this.host.unmount(entry.item); } catch { /* Already gone. */ }
    }
    this.items = [];
    this.frameItem = null;
    this.frameKey = '';
  }
}

/** Bounds of the frame after dragging `handle` to `point`, anchored at
 * the opposite corner or edge. Pure geometry, unit-tested. */
export function resizedBounds(
  handle: ExportFrameHandleId,
  anchor: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  minSize = 1,
): { x: number; y: number; width: number; height: number } {
  const minX = anchor.x;
  const maxX = anchor.x + anchor.width;
  const minY = anchor.y;
  const maxY = anchor.y + anchor.height;
  let left = minX;
  let right = maxX;
  let top = minY;
  let bottom = maxY;
  if (handle.includes('w')) left = Math.min(point.x, right - minSize);
  if (handle.includes('e')) right = Math.max(point.x, left + minSize);
  if (handle.includes('n')) top = Math.min(point.y, bottom - minSize);
  if (handle.includes('s')) bottom = Math.max(point.y, top + minSize);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
