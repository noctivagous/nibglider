// Zoom and pan are view state. They never change page coordinates or dirty the
// document. PointerController provides Paper project points for pan gestures.
export class ViewportManager {
  private readonly scope: paper.PaperScope;
  private readonly changed: () => void;
  private panCenter: paper.Point | null = null;
  private panPoint: paper.Point | null = null;
  private panning = false;
  readonly minZoom = 0.1;
  readonly maxZoom = 16;

  constructor(scope: paper.PaperScope, changed: () => void = () => {}) {
    this.scope = scope; this.changed = changed;
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
    const view = this.scope.view;
    const next = this.clamp(this.zoom * Math.exp(-deltaY * 0.002));
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
    this.changed();
  }
  endPan(): void { this.panning = false; this.panCenter = null; this.panPoint = null; }
  /** Two-finger trackpad pan: screen-pixel deltas shift the view, honoring
   * zoom. Content follows the fingers, like drag-pan without the button. */
  panByScreen(dx: number, dy: number): boolean {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return false;
    const view = this.scope.view;
    view.center = view.center.subtract(new this.scope.Point(dx / this.zoom, dy / this.zoom));
    this.changed();
    return true;
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
