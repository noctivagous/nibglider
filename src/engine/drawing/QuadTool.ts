// Four-point quad. The fourth point closes and deposits; earlier points stay live.
// When a non-rectangle Rect Keys shape is selected, the quad frame instead
// carries that fitted shape: the preview appears once three corners are fixed
// (the fourth still live) and the fourth press deposits the fitted shape.
import type { DrawingHost } from './DrawingHost';

type Item = any;

export class QuadTool {
  private readonly host: DrawingHost;
  constructor(host: DrawingHost) { this.host = host; }

  get active(): boolean { return this.host.session.isDrawingQuad; }

  /** Plain quad when the Rect Keys setting is 'rectangle'. */
  private get shapeMode(): boolean {
    return this.host.rectangleInnerShapeType() !== 'rectangle';
  }

  /** Add the point under the cursor. The fourth point deposits and ends the session. */
  addPoint(): 'deposited' | 'added' | 'noop' {
    const session = this.host.session;
    if (!session.mousePt) return 'noop';
    const scope = this.host.scope();
    if (!session.quadPath) {
      session.quadPath = new scope.Path({
        segments: [session.mousePt],
        strokeColor: this.host.globalStrokeColor(),
        strokeWidth: this.host.globalStrokeWidth(),
        fullySelected: true,
      });
      this.host.applyStrokeGeometry(session.quadPath);
      session.quadPointCount = 1;
      session.quadFixed = [session.mousePt.clone()];
      session.isDrawingQuad = true;
      session.resetLiveAdjust();
      return 'added';
    }
    session.quadPath.add(session.mousePt);
    session.quadFixed.push(session.mousePt.clone());
    session.quadPointCount++;
    if (session.quadPointCount !== 4) {
      this.refreshPreview();
      return 'added';
    }
    const fitted = this.shapeMode
      ? this.host.createQuadFrameShape('stroke', session.quadFixed.slice(0, 4))
      : null;
    if (fitted) {
      this.host.applyCurrentStyles(this.host.shapePartOf(fitted));
      fitted.closed = true;
      fitted.selected = false;
      const placed = this.host.place(fitted);
      session.quadPath.remove();
      session.releaseQuad();
      session.resetLiveAdjust();
      this.lastPlaced = placed;
      return 'deposited';
    }
    this.host.applyCurrentStyles(session.quadPath);
    session.quadPath.closed = true;
    session.quadPath.selected = false;
    const placed = this.host.place(session.quadPath);
    session.quadPath = null;
    session.releaseQuad();
    session.resetLiveAdjust();
    this.lastPlaced = placed;
    return 'deposited';
  }

  lastPlaced: Item = null;

  track(): void {
    const path = this.host.session.quadPath;
    const point = this.host.session.mousePt;
    if (!this.host.session.isDrawingQuad || !path || !point) return;
    if (path.segments.length === 1) path.add(point);
    if (path.segments.length > 1) {
      path.removeSegment(path.segments.length - 1);
      path.add(point);
    }
    this.refreshPreview();
  }

  /**
   * Fitted-shape overlay for the in-progress quad. Visible only once three
   * corners are fixed and the live fourth corner has moved away from the
   * third; the raw rubber-band quad stays visible underneath, as with the
   * rect keys' frame plus inner-shape preview.
   */
  private refreshPreview(): void {
    const session = this.host.session;
    const clear = (): void => {
      if (session.previewInner) {
        session.previewInner.remove();
        session.previewInner = null;
      }
    };
    if (!this.active || !this.shapeMode || session.quadPointCount !== 3) {
      clear();
      return;
    }
    const fixed = session.quadFixed.slice(0, 3);
    const live = session.mousePt;
    if (fixed.length !== 3 || !live) {
      clear();
      return;
    }
    const dx = live.x - fixed[2].x;
    const dy = live.y - fixed[2].y;
    if (dx * dx + dy * dy < 1e-12) {
      clear();
      return;
    }
    const shape = this.host.createQuadFrameShape('preview', [...fixed, live]);
    if (!shape) {
      clear();
      return;
    }
    clear();
    this.host.addPreviewShadow(shape);
    session.previewInner = shape;
    this.host.addToActive(shape);
  }

  stamp(): void {
    const path = this.host.session.quadPath;
    if (!this.active || !path) return;
    const session = this.host.session;
    if (this.shapeMode && session.quadPointCount === 3 && session.mousePt) {
      const fixed = session.quadFixed.slice(0, 3);
      const live = session.mousePt;
      const dx = live.x - fixed[2].x;
      const dy = live.y - fixed[2].y;
      if (dx * dx + dy * dy >= 1e-12) {
        const stamped = this.host.createQuadFrameShape('stroke', [...fixed, live]);
        if (stamped) {
          this.host.applyCurrentStyles(this.host.shapePartOf(stamped));
          stamped.closed = true;
          stamped.selected = false;
          const placed = this.host.place(stamped, { front: true, opacity: 1 });
          if (placed) placed.selected = false;
          return;
        }
      }
    }
    const stamped = path.clone();
    this.host.applyCurrentStyles(stamped);
    stamped.closed = true;
    stamped.selected = false;
    const placed = this.host.place(stamped, { front: true, opacity: 1 });
    if (placed) placed.selected = false;
  }

  finish(): Item | null {
    const session = this.host.session;
    if (!session.isDrawingQuad || !session.quadPath) return null;
    if (this.shapeMode && session.quadPointCount >= 3) {
      const fixed = session.quadFixed.slice(0, 3);
      const live = session.quadPointCount >= 4
        ? session.quadFixed[3]
        : session.mousePt;
      if (live) {
        const fitted = this.host.createQuadFrameShape('stroke', [...fixed, live]);
        if (fitted) {
          this.host.applyCurrentStyles(this.host.shapePartOf(fitted));
          fitted.closed = true;
          fitted.selected = false;
          const placed = this.host.place(fitted);
          session.quadPath.remove();
          session.releaseQuad();
          session.resetLiveAdjust();
          return placed;
        }
      }
    }
    this.host.applyCurrentStyles(session.quadPath);
    session.quadPath.closed = true;
    session.quadPath.selected = false;
    const placed = this.host.place(session.quadPath);
    session.releaseQuad();
    session.resetLiveAdjust();
    return placed;
  }

  scaleLive(factor: number): boolean {
    const path = this.host.session.quadPath;
    if (!this.host.session.isDrawingQuad || !path?.segments?.length) return false;
    path.scale(factor, path.segments[0].point);
    this.scaleFixed(path.segments[0].point, factor);
    this.refreshPreview();
    return true;
  }

  rotateLive(degrees: number): boolean {
    const path = this.host.session.quadPath;
    if (!this.host.session.isDrawingQuad || !path?.segments?.length) return false;
    path.rotate(degrees, path.segments[0].point);
    this.rotateFixed(path.segments[0].point, degrees);
    this.refreshPreview();
    return true;
  }

  cancel(): void {
    if (this.active) this.host.session.clearQuad();
  }

  private scaleFixed(pivot: Item, factor: number): void {
    for (const pt of this.host.session.quadFixed) {
      pt.x = pivot.x + (pt.x - pivot.x) * factor;
      pt.y = pivot.y + (pt.y - pivot.y) * factor;
    }
  }

  private rotateFixed(pivot: Item, degrees: number): void {
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (const pt of this.host.session.quadFixed) {
      const dx = pt.x - pivot.x;
      const dy = pt.y - pivot.y;
      pt.x = pivot.x + dx * cos - dy * sin;
      pt.y = pivot.y + dx * sin + dy * cos;
    }
  }
}
