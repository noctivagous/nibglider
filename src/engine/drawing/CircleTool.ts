// Circle-by-radius, circle-by-diameter, and radial stamp. Builds the guide
// and asks the host for inner geometry, placement, and history.
import type { DrawingHost } from './DrawingHost';
import { stampVisibleFrame } from './stampFrame';

type Item = any;
export type CircleStart = 'finish' | 'stamp' | 'started' | 'noop';

export class CircleTool {
  private readonly host: DrawingHost;
  constructor(host: DrawingHost) { this.host = host; }

  get active(): boolean {
    const type = this.host.session.shapeType;
    return type != null && type.startsWith('circle_');
  }

  start(mode: string): CircleStart {
    const session = this.host.session;
    if (session.shapeType != null && session.shapeType.startsWith('circle_')) return 'finish';
    if (session.isDrawingShape || !session.mousePt) return 'noop';
    this.begin(('circle_' + mode) as 'circle_radius' | 'circle_diameter');
    return 'started';
  }

  startRadial(): CircleStart {
    const session = this.host.session;
    if (session.shapeType === 'circle_radial_stamp') return 'stamp';
    if (session.shapeType != null && session.shapeType.startsWith('circle_')) return 'finish';
    if (session.isDrawingShape || !session.mousePt) return 'noop';
    this.begin('circle_radial_stamp');
    return 'started';
  }

  toggleRadiusLock(): void {
    const session = this.host.session;
    if (!session.isDrawingShape || session.shapeType !== 'circle_radial_stamp') return;
    session.radialStampLockedRadius = session.radialStampLockedRadius != null
      ? null
      : (session.previewShape ? session.previewShape.radius : 0);
    this.update();
    this.host.updateTextContent();
    this.host.notify();
  }

  update(): void {
    const session = this.host.session;
    const endPt = session.mousePt;
    if (session.shapeType === 'circle_radius') {
      if (this.host.circleRadiusAnchor() === 'circumference') {
        session.previewShape.position = endPt;
        session.previewShape.radius = session.shapeStartPoint.getDistance(endPt);
      } else {
        session.previewShape.position = session.shapeStartPoint;
        session.previewShape.radius = session.shapeStartPoint.getDistance(endPt);
      }
      session.shapeGuideAngle = session.mousePt.subtract(session.previewShape.position).angle;
    } else if (session.shapeType === 'circle_radial_stamp') {
      session.previewShape.position = session.shapeStartPoint;
      session.previewShape.radius = session.radialStampLockedRadius == null
        ? session.shapeStartPoint.getDistance(endPt)
        : session.radialStampLockedRadius;
      if (session.shapeStartPoint.getDistance(session.mousePt) > 0) {
        session.shapeGuideAngle = session.mousePt.subtract(session.shapeStartPoint).angle;
      }
    } else if (session.shapeType === 'circle_diameter') {
      session.previewShape.position = session.shapeStartPoint.add(endPt).divide(2);
      session.previewShape.radius = session.shapeStartPoint.getDistance(endPt) / 2;
      session.shapeGuideAngle = session.mousePt.subtract(session.previewShape.position).angle;
    }
    if (session.previewLine) {
      session.previewLine.firstSegment.point = session.shapeStartPoint;
      session.previewLine.lastSegment.point = session.shapeType === 'circle_radial_stamp'
        ? this.tangentPoint()
        : endPt;
    }
    if (session.previewInner) {
      session.previewInner.remove();
      session.previewInner = null;
    }
    if (session.shapeType === 'circle_radial_stamp') {
      this.refreshRadial();
      return;
    }
    if (!(session.isDrawingShape && this.host.innerShapeType() !== 'none')) return;
    if (session.previewShape && session.previewShape.radius > 0) {
      const pradius = (session.previewShape.radius - session.previewShape.strokeWidth / 2) * session.liveScale;
      if (pradius > 0) {
        session.previewInner = this.host.createInnerShape(
          session.previewShape.position, pradius, 'preview',
          session.shapeGuideAngle + session.liveRotateOffset);
        if (session.previewInner) {
          this.host.addPreviewShadow(session.previewInner);
          this.host.addToActive(session.previewInner);
        }
      }
    } else if (session.previewShape?.bounds && session.previewShape.bounds.width > 0 && session.previewShape.bounds.height > 0) {
      this.inscribe(session.previewShape);
    }
  }

  /** Deposit the riding inner shape and keep the guide. Returns false when this tool is idle. */
  stamp(): boolean {
    if (!this.active) return false;
    const session = this.host.session;
    if (session.previewShape && session.previewShape.radius > 0) {
      const isRadial = session.shapeType === 'circle_radial_stamp';
      const center = isRadial ? this.tangentPoint() : session.previewShape.position;
      const strokeW = this.host.strokeEnabled() ? this.host.globalStrokeWidth() : 0;
      const iradius = isRadial
        ? session.radialStampBaseRadius * session.liveScale
        : Math.max(0, session.previewShape.radius - strokeW / 2) * session.liveScale;
      const rotation = isRadial ? this.rotation() : session.shapeGuideAngle + session.liveRotateOffset;
      if (center && iradius > 0) this.depositInner(center, iradius, rotation, true);
      return true;
    }
    stampVisibleFrame(this.host);
    return true;
  }

  finish(): Item[] {
    const session = this.host.session;
    if (!this.active) return [];
    if (!session.previewShape || session.previewShape.radius === 0) return [];
    const isRadial = session.shapeType === 'circle_radial_stamp';
    const center = isRadial ? this.tangentPoint() : session.previewShape.position;
    if (!center) return [];
    const placed: Item[] = [];
    const strokeW = this.host.strokeEnabled() ? this.host.globalStrokeWidth() : 0;
    const iradius = isRadial
      ? session.radialStampBaseRadius * session.liveScale
      : Math.max(0, session.previewShape.radius - strokeW / 2) * session.liveScale;
    const rotation = isRadial ? this.rotation() : session.shapeGuideAngle + session.liveRotateOffset;
    if (iradius > 0) {
      const item = this.depositInner(center, iradius, rotation, false);
      if (item) placed.push(item);
    }
    this.closeSession();
    return placed;
  }

  cancel(): void {
    if (this.active) this.host.session.clearShape();
  }

  private begin(type: 'circle_radius' | 'circle_diameter' | 'circle_radial_stamp'): void {
    const host = this.host;
    const scope = host.scope();
    const session = host.session;
    session.resetLiveAdjust();
    session.shapeStartPoint = session.mousePt.clone();
    session.shapeType = type;
    session.isDrawingShape = true;
    session.previewShape = new scope.Shape.Circle(session.shapeStartPoint, 0);
    host.stylePreviewFrame(session.previewShape);
    host.addToActive(session.previewShape);
    session.previewLine = new scope.Path({
      segments: [session.shapeStartPoint, session.shapeStartPoint],
      strokeColor: new scope.Color(0.5),
      strokeWidth: 1,
      strokeDashArray: [4, 4],
    });
    host.addToActive(session.previewLine);
  }

  private depositInner(center: Item, radius: number, rotation: number, front: boolean): Item | null {
    const inner = this.host.createInnerShape(center, radius, 'stroke', rotation);
    if (!inner) return null;
    this.host.applyCurrentStyles(this.host.shapePartOf(inner));
    inner.selected = false;
    const placed = this.host.place(inner, front ? { front: true } : undefined);
    if (placed) placed.selected = false;
    return placed;
  }

  private refreshRadial(): void {
    const session = this.host.session;
    if (!session.isDrawingShape || session.shapeType !== 'circle_radial_stamp' || !session.mousePt) return;
    if (this.host.innerShapeType() === 'none') return;
    if (!session.previewShape || !(session.previewShape.radius > 0)) return;
    const radius = session.radialStampBaseRadius * session.liveScale;
    if (!(radius > 0)) return;
    session.previewInner = this.host.createInnerShape(this.tangentPoint(), radius, 'preview', this.rotation());
    if (session.previewInner) {
      this.host.addPreviewShadow(session.previewInner);
      this.host.addToActive(session.previewInner);
    }
  }

  private inscribe(framePreview: Item): void {
    const scope = this.host.scope();
    const inset = this.host.globalStrokeWidth() * 1.5;
    const bounds = framePreview.bounds;
    const pBounds = new scope.Rectangle(
      bounds.x + inset, bounds.y + inset, bounds.width - 2 * inset, bounds.height - 2 * inset);
    if (!(pBounds.width > 0) || !(pBounds.height > 0)) return;
    const session = this.host.session;
    session.previewInner = this.host.createInnerShape(
      pBounds.center, (Math.min(pBounds.width, pBounds.height) / 2) * 0.9, 'preview');
    if (session.previewInner) {
      this.host.addPreviewShadow(session.previewInner);
      this.host.addToActive(session.previewInner);
    }
  }

  private tangentPoint(): Item {
    const session = this.host.session;
    if (session.radialStampLockedRadius == null || !session.shapeStartPoint || !session.mousePt) {
      return session.mousePt ? session.mousePt.clone() : null;
    }
    const vec = session.mousePt.subtract(session.shapeStartPoint);
    if (!(vec.length > 0)) return session.shapeStartPoint.clone();
    return session.shapeStartPoint.add(vec.normalize().multiply(session.radialStampLockedRadius));
  }

  private rotation(): number {
    return this.host.session.shapeGuideAngle + 90 + this.host.session.liveRotateOffset;
  }

  private closeSession(): void {
    this.host.session.clearShape();
    this.host.session.resetLiveAdjust();
    this.host.updateTextContent();
    this.host.notify();
  }
}
