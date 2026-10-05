// Rectangle diagonal, two-edges, and centerline. Frame fitting stays on the
// host; this tool owns the session and when a shape is placed.
import type { DrawingHost } from './DrawingHost';
import { stampVisibleFrame } from './stampFrame';

type Item = any;
export type RectStart = 'finish' | 'advance' | 'started' | 'noop';

export class RectangleTool {
  private readonly host: DrawingHost;
  constructor(host: DrawingHost) { this.host = host; }

  get active(): boolean {
    const type = this.host.session.shapeType;
    return type != null && type.startsWith('rectangle_');
  }

  beginCenterline(): RectStart {
    const session = this.host.session;
    if (session.shapeType === 'rectangle_centerline') return 'finish';
    if (session.isDrawingShape) this.host.cancelDrawing();
    if (!session.mousePt) return 'noop';
    const scope = this.host.scope();
    session.resetLiveAdjust();
    session.shapeStartPoint = session.mousePt.clone();
    session.shapeType = 'rectangle_centerline';
    session.shapeWidth = this.host.lastCenterlineWidth();
    session.isDrawingShape = true;
    session.previewShape = null;
    session.previewPath = null;
    session.previewLine = new scope.Path({
      segments: [session.shapeStartPoint, session.shapeStartPoint],
      strokeColor: new scope.Color(0.5), strokeWidth: 1, strokeDasharray: [4, 4],
    });
    this.host.addToActive(session.previewLine);
    session.previewRect = new scope.Path({
      segments: [session.shapeStartPoint, session.shapeStartPoint, session.shapeStartPoint, session.shapeStartPoint],
      closed: true, strokeColor: this.host.globalStrokeColor(), strokeWidth: this.host.globalStrokeWidth(),
    });
    this.host.addToActive(session.previewRect);
    this.host.stylePreviewFrame(session.previewRect, 1);
    this.host.applyStrokeGeometry(session.previewRect);
    return 'started';
  }

  beginTwoEdges(): RectStart {
    const session = this.host.session;
    if (session.shapeType === 'rectangle_two_edges') {
      if (session.shapePt2 === null) {
        this.armSecondEdge();
        return 'advance';
      }
      return 'finish';
    }
    if (session.isDrawingShape || !session.mousePt) return 'noop';
    const scope = this.host.scope();
    session.resetLiveAdjust();
    session.shapeStartPoint = session.mousePt.clone();
    session.shapeType = 'rectangle_two_edges';
    session.shapePt2 = null;
    session.isDrawingShape = true;
    session.previewPath = new scope.Path({
      segments: [session.shapeStartPoint],
      strokeColor: this.host.globalStrokeColor(),
      strokeWidth: this.host.globalStrokeWidth(),
    });
    this.host.applyStrokeGeometry(session.previewPath);
    this.host.addToActive(session.previewPath);
    session.previewLine = new scope.Path({
      segments: [session.shapeStartPoint, session.shapeStartPoint],
      strokeColor: new scope.Color(0.5), strokeWidth: 1, strokeDasharray: [4, 4],
    });
    this.host.addToActive(session.previewLine);
    return 'started';
  }

  beginSelect(): RectStart {
    const session = this.host.session;
    if (session.shapeType === 'rectangle_select') return 'finish';
    if (session.isDrawingShape || !session.mousePt) return 'noop';
    const scope = this.host.scope();
    session.resetLiveAdjust();
    session.shapeStartPoint = session.mousePt.clone();
    session.shapeType = 'rectangle_select';
    session.isDrawingShape = true;
    session.previewShape = new scope.Shape.Rectangle(session.shapeStartPoint, new scope.Size(0, 0));
    this.host.stylePreviewFrame(session.previewShape, 1);
    this.host.addToActive(session.previewShape);
    session.previewLine = new scope.Path({
      segments: [session.shapeStartPoint, session.shapeStartPoint],
      strokeColor: new scope.Color(0.5), strokeWidth: 1, strokeDasharray: [4, 4],
    });
    this.host.addToActive(session.previewLine);
    return 'started';
  }

  /** Export frame: first press starts the rect drag, second press deposits. */
  beginExportFrame(): RectStart {
    const session = this.host.session;
    if (session.shapeType === 'rectangle_export_frame') return 'finish';
    if (session.isDrawingShape || !session.mousePt) return 'noop';
    const scope = this.host.scope();
    session.resetLiveAdjust();
    session.shapeStartPoint = session.mousePt.clone();
    session.shapeType = 'rectangle_export_frame';
    session.isDrawingShape = true;
    session.previewShape = new scope.Shape.Rectangle(session.shapeStartPoint, new scope.Size(0, 0));
    this.host.stylePreviewFrame(session.previewShape, 1);
    this.host.addToActive(session.previewShape);
    session.previewLine = new scope.Path({
      segments: [session.shapeStartPoint, session.shapeStartPoint],
      strokeColor: new scope.Color(0.5), strokeWidth: 1, strokeDashArray: [4, 4],
    });
    this.host.addToActive(session.previewLine);
    return 'started';
  }

  beginDiagonal(): RectStart {
    const session = this.host.session;
    if (session.shapeType === 'rectangle_diagonal') return 'finish';
    if (session.isDrawingShape || !session.mousePt) return 'noop';
    const scope = this.host.scope();
    session.resetLiveAdjust();
    session.shapeStartPoint = session.mousePt.clone();
    session.shapeType = 'rectangle_diagonal';
    session.isDrawingShape = true;
    session.previewShape = new scope.Shape.Rectangle(session.shapeStartPoint, new scope.Size(0, 0));
    this.host.stylePreviewFrame(session.previewShape, 1);
    this.host.addToActive(session.previewShape);
    session.previewLine = new scope.Path({
      segments: [session.shapeStartPoint, session.shapeStartPoint],
      strokeColor: new scope.Color(0.5), strokeWidth: 1, strokeDashArray: [4, 4],
    });
    this.host.addToActive(session.previewLine);
    return 'started';
  }

  update(): void {
    const session = this.host.session;
    const scope = this.host.scope();
    if (session.shapeType === 'rectangle_two_edges') {
      if (session.shapePt2 === null) {
        session.previewLine.firstSegment.point = session.shapeStartPoint;
        session.previewLine.lastSegment.point = session.mousePt;
        if (session.previewPath.segments.length > 1) session.previewPath.removeSegment(1);
        session.previewPath.add(session.mousePt);
        if (session.previewInner) { session.previewInner.remove(); session.previewInner = null; }
      } else {
        session.previewLine.firstSegment.point = session.shapePt2;
        session.previewLine.lastSegment.point = session.mousePt;
        const corners = this.twoEdgeCorners();
        if (corners) this.refreshFrame(corners, session.previewRect);
      }
      return;
    }
    if (session.shapeType === 'rectangle_centerline') {
      const pt1 = session.shapeStartPoint;
      const pt2 = session.mousePt;
      session.previewLine.firstSegment.point = pt1;
      session.previewLine.lastSegment.point = pt2;
      const center = pt1.add(pt2).divide(2);
      const dir = pt2.subtract(pt1);
      const halfLen = dir.length / 2;
      const unitDir = dir.normalize();
      const perp = new scope.Point(-unitDir.y, unitDir.x);
      const halfW = this.host.centerlineWidthForLength(dir.length) / 2;
      this.refreshFrame([
        center.add(unitDir.multiply(halfLen)).add(perp.multiply(halfW)),
        center.add(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW)),
        center.subtract(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW)),
        center.subtract(unitDir.multiply(halfLen)).add(perp.multiply(halfW)),
      ], session.previewRect);
      return;
    }
    if (session.shapeType !== 'rectangle_diagonal'
      && session.shapeType !== 'rectangle_select'
      && session.shapeType !== 'rectangle_export_frame') return;
    const k = session.shapeType === 'rectangle_select' || session.shapeType === 'rectangle_export_frame'
      ? 1
      : this.host.rectDiagonalScale();
    const dx = (session.mousePt.x - session.shapeStartPoint.x) * k;
    const dy = (session.mousePt.y - session.shapeStartPoint.y) * k;
    const farPt = session.shapeStartPoint.add(new scope.Point(dx, dy));
    session.previewShape.position = session.shapeStartPoint.add(farPt).divide(2);
    session.previewShape.size = new scope.Size(Math.abs(dx), Math.abs(dy));
    if (session.previewLine) {
      session.previewLine.firstSegment.point = session.shapeStartPoint;
      session.previewLine.lastSegment.point = session.mousePt;
    }
    this.refreshFrame(null, session.previewShape);
  }

  /** Live frame rect from the drag preview, or null when degenerate. */
  private previewFrameRect(): { x: number; y: number; width: number; height: number } | null {
    const session = this.host.session;
    const preview = session.previewShape;
    if (!preview?.bounds) return null;
    const b = preview.bounds;
    if (!(b.width > 0) || !(b.height > 0)) return null;
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }

  stamp(): boolean {
    if (!this.active) return false;
    if (this.host.session.shapeType === 'rectangle_export_frame') {
      const rect = this.previewFrameRect();
      if (!rect) return true;
      const placed = this.host.depositExportFrame(rect);
      if (placed) placed.selected = false;
      return true;
    }
    if (this.host.rectangleInnerShapeType() !== 'rectangle') {
      const stamped = this.host.createRectFrameShape('stroke');
      if (stamped) {
        this.host.applyCurrentStyles(this.host.shapePartOf(stamped));
        stamped.selected = false;
        const placed = this.host.place(stamped, { front: true });
        if (placed) placed.selected = false;
      }
      return true;
    }
    stampVisibleFrame(this.host);
    return true;
  }

  finish(): Item[] {
    if (!this.active) return [];
    const session = this.host.session;
    const scope = this.host.scope();
    if (session.shapeType === 'rectangle_export_frame') {
      const rect = this.previewFrameRect();
      const placed = rect ? this.host.depositExportFrame(rect) : null;
      this.host.session.clearShape();
      this.host.session.resetLiveAdjust();
      this.host.updateTextContent();
      this.host.notify();
      return placed ? [placed] : [];
    }
    const shapeOnly = this.host.rectangleInnerShapeType() !== 'rectangle';
    let finalPath: Item = null;
    if (session.shapeType === 'rectangle_diagonal') {
      finalPath = shapeOnly ? this.host.createRectFrameShape('stroke') : new scope.Path.Rectangle({
        center: session.previewShape.position, size: session.previewShape.size,
      });
      if (finalPath) this.host.applyCurrentStyles(this.host.shapePartOf(finalPath));
    } else if (session.shapeType === 'rectangle_two_edges') {
      if (shapeOnly) finalPath = this.host.createRectFrameShape('stroke');
      else {
        const corners = this.twoEdgeCorners();
        if (corners) finalPath = new scope.Path({ segments: corners, closed: true });
      }
      if (finalPath) this.host.applyCurrentStyles(this.host.shapePartOf(finalPath));
    } else if (session.shapeType === 'rectangle_centerline') {
      if (shapeOnly) finalPath = this.host.createRectFrameShape('stroke');
      else {
        const pt1 = session.shapeStartPoint;
        const pt2 = session.mousePt;
        const center = pt1.add(pt2).divide(2);
        const dir = pt2.subtract(pt1);
        const halfLen = dir.length / 2;
        const unitDir = dir.normalize();
        const perp = new scope.Point(-unitDir.y, unitDir.x);
        const halfW = this.host.centerlineWidthForLength(dir.length) / 2;
        finalPath = new scope.Path({
          segments: [
            center.add(unitDir.multiply(halfLen)).add(perp.multiply(halfW)),
            center.add(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW)),
            center.subtract(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW)),
            center.subtract(unitDir.multiply(halfLen)).add(perp.multiply(halfW)),
          ],
          closed: true,
        });
      }
      if (finalPath) this.host.applyCurrentStyles(this.host.shapePartOf(finalPath));
    }
    if (session.shapeType === 'rectangle_centerline') this.host.setLastCenterlineWidth(session.shapeWidth);
    const placed: Item[] = [];
    if (finalPath) {
      finalPath.selected = false;
      const placedFinal = this.host.place(finalPath);
      if (placedFinal) {
        placedFinal.selected = false;
        placed.push(placedFinal);
        if (!shapeOnly) this.host.drawInnerShape(placedFinal, 'stroke');
      }
    }
    this.host.session.clearShape();
    this.host.session.resetLiveAdjust();
    this.host.updateTextContent();
    this.host.notify();
    return placed;
  }

  cancel(): void {
    if (this.active) this.host.session.clearShape();
  }

  private armSecondEdge(): void {
    const session = this.host.session;
    const scope = this.host.scope();
    session.shapePt2 = session.mousePt.clone();
    if (session.previewPath) session.previewPath.add(session.shapePt2);
    session.previewLine.firstSegment.point = session.shapePt2;
    session.previewLine.lastSegment.point = session.shapePt2;
    const corners = this.twoEdgeCorners();
    if (!corners) return;
    session.previewRect = new scope.Path({
      segments: corners, closed: true,
      strokeColor: this.host.globalStrokeColor(), strokeWidth: this.host.globalStrokeWidth(),
    });
    this.host.addToActive(session.previewRect);
    this.host.stylePreviewFrame(session.previewRect, 1);
    this.host.applyStrokeGeometry(session.previewRect);
  }

  private twoEdgeCorners(): [Item, Item, Item, Item] | null {
    const session = this.host.session;
    if (!session.shapeStartPoint || !session.shapePt2 || !session.mousePt) return null;
    const pt1 = session.shapeStartPoint;
    const pt2 = session.shapePt2;
    const dir1 = pt2.subtract(pt1).normalize();
    const v2 = session.mousePt.subtract(pt2);
    const perpVec = v2.subtract(dir1.multiply(v2.dot(dir1)));
    return [pt1, pt2, pt2.add(perpVec), pt1.add(perpVec)];
  }

  private refreshFrame(corners: [Item, Item, Item, Item] | null, frameItem: Item): void {
    if (frameItem) {
      frameItem.visible = true;
      if (corners && frameItem.segments) {
        for (let i = 0; i < 4; i++) frameItem.segments[i].point = corners[i];
      }
    }
    const session = this.host.session;
    if (session.previewInner) { session.previewInner.remove(); session.previewInner = null; }
    if (this.host.rectangleInnerShapeType() === 'rectangle') return;
    const shape = this.host.createRectFrameShape('preview');
    if (!shape) return;
    this.host.addPreviewShadow(shape);
    session.previewInner = shape;
    this.host.addToActive(shape);
  }
}
