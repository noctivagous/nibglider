// Zoom and pan are view state. They never change page coordinates or dirty the
// document. PointerController provides Paper project points for pan gestures.
/** One zoom step never exceeds this factor per event, so a spiky delta
 * cannot jump the view. */
export const MAX_ZOOM_STEP = 1.3;
/** One pan event never shifts more than this many screen pixels per axis. */
export const MAX_PAN_STEP_PX = 200;
/** Pan keeps at least this much artwork (project points) on screen. */
export const PAN_EDGE_MARGIN = 40;

/** Clamp one center axis so at least margin m of [lo, hi] stays on screen.
 * Deliberately not pinned when the content is smaller than the view: this
 * is a drawing canvas, and panning into empty space to draw must stay
 * possible. Reachability (never losing the artwork) is what is kept. */
function clampAxis(c: number, lo: number, hi: number, v: number, m: number): number {
  const min = lo + m - v / 2;
  const max = hi - m + v / 2;
  if (min >= max) return (lo + hi) / 2;
  return Math.min(max, Math.max(min, c));
}

export class ViewportManager {
  private readonly scope: paper.PaperScope;
  private readonly changed: () => void;
  private readonly contentBounds: (() => paper.Rectangle | null) | null;
  private panCenter: paper.Point | null = null;
  private panPoint: paper.Point | null = null;
  private panning = false;
  readonly minZoom = 0.1;
  readonly maxZoom = 16;

  constructor(
    scope: paper.PaperScope,
    changed: () => void = () => {},
    contentBounds: (() => paper.Rectangle | null) | null = null,
  ) {
    this.scope = scope; this.changed = changed; this.contentBounds = contentBounds;
  }
  get zoom(): number { return this.scope.view.zoom || 1; }
  get center(): paper.Point { return this.scope.view.center.clone(); }
  get isPanning(): boolean { return this.panning; }

  stepZoom(direction: 1 | -1): boolean {
    return this.setZoom(this.zoom * (direction > 0 ? 1.25 : 1 / 1.25));
  }
  resetZoom(): boolean { return this.setZoom(1); }
  zoomForWheel(deltaY: number, viewPoint: paper.Point): boolean {
    if (!Number.isFinite(deltaY) || deltaY === 0) return false;
    return this.zoomByFactor(Math.exp(-deltaY * 0.002), viewPoint);
  }
  /** Cursor-anchored zoom by an explicit factor (pinch ratio, Safari
   * gesture scale). The factor is capped per event. */
  zoomByFactor(factor: number, viewPoint: paper.Point): boolean {
    if (!Number.isFinite(factor) || factor <= 0) return false;
    const capped = Math.min(MAX_ZOOM_STEP, Math.max(1 / MAX_ZOOM_STEP, factor));
    const view = this.scope.view;
    const next = this.clamp(this.zoom * capped);
    if (next === this.zoom) return false;
    const before = view.viewToProject(viewPoint);
    view.zoom = next;
    const after = view.viewToProject(viewPoint);
    view.center = view.center.add(before.subtract(after));
    this.changed();
    return true;
  }
  beginPan(point: paper.Point): void {
    this.panCenter = this.center;
    this.panPoint = point.clone();
    this.panning = true;
  }
  panTo(point: paper.Point, delta: paper.Point): void {
    if (!this.panning) return;
    const view = this.scope.view;
    if (this.panCenter && this.panPoint) {
      const offset = point.subtract(view.center).subtract(this.panPoint.subtract(this.panCenter));
      view.center = this.panCenter.subtract(offset);
    } else view.center = view.center.subtract(delta);
    this.clampCenter();
    this.changed();
  }
  endPan(): void { this.panning = false; this.panCenter = null; this.panPoint = null; }
  /** Two-finger trackpad pan: screen-pixel deltas shift the view, honoring
   * zoom. Content follows the fingers, like drag-pan without the button.
   * Each axis is capped per event so a spike cannot fling the view. */
  panByScreen(dx: number, dy: number): boolean {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return false;
    const cx = Math.max(-MAX_PAN_STEP_PX, Math.min(MAX_PAN_STEP_PX, dx));
    const cy = Math.max(-MAX_PAN_STEP_PX, Math.min(MAX_PAN_STEP_PX, dy));
    const view = this.scope.view;
    view.center = view.center.subtract(new this.scope.Point(cx / this.zoom, cy / this.zoom));
    this.clampCenter();
    this.changed();
    return true;
  }
  /**
   * Keep artwork reachable: panning (drag, Pan-Lock, trackpad) always
   * leaves PAN_EDGE_MARGIN of the artwork on screen. An empty canvas
   * pans free.
   */
  private clampCenter(): void {
    if (!this.contentBounds) return;
    const content = this.contentBounds();
    if (!content) return;
    const view = this.scope.view;
    const vw = view.bounds.width;
    const vh = view.bounds.height;
    if (!(vw > 0) || !(vh > 0)) return;
    const m = PAN_EDGE_MARGIN;
    const center = view.center;
    view.center = new this.scope.Point(
      clampAxis(center.x, content.left, content.right, vw, m),
      clampAxis(center.y, content.top, content.bottom, vh, m),
    );
  }
  private setZoom(value: number): boolean {
    const next = this.clamp(value);
    if (next === this.zoom) return false;
    this.scope.view.zoom = next;
    this.changed();
    return true;
  }
  private clamp(value: number): number { return Math.min(this.maxZoom, Math.max(this.minZoom, value)); }
}
