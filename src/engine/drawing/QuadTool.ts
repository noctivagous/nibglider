// Four-point quad. The fourth point closes and deposits; earlier points stay live.
import type { DrawingHost } from './DrawingHost';

type Item = any;

export class QuadTool {
  private readonly host: DrawingHost;
  constructor(host: DrawingHost) { this.host = host; }

  get active(): boolean { return this.host.session.isDrawingQuad; }

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
      session.isDrawingQuad = true;
      session.resetLiveAdjust();
      return 'added';
    }
    session.quadPath.add(session.mousePt);
    session.quadPointCount++;
    if (session.quadPointCount !== 4) return 'added';
    this.host.applyCurrentStyles(session.quadPath);
    session.quadPath.closed = true;
    session.quadPath.selected = false;
    const placed = this.host.place(session.quadPath);
    session.quadPath = null;
    session.isDrawingQuad = false;
    session.quadPointCount = 0;
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
  }

  stamp(): void {
    const path = this.host.session.quadPath;
    if (!this.active || !path) return;
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
    return true;
  }

  rotateLive(degrees: number): boolean {
    const path = this.host.session.quadPath;
    if (!this.host.session.isDrawingQuad || !path?.segments?.length) return false;
    path.rotate(degrees, path.segments[0].point);
    return true;
  }

  cancel(): void {
    if (this.active) this.host.session.clearQuad();
  }
}
