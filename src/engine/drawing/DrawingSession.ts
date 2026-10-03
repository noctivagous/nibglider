// Shared live-drawing state for path, shape, and quad sessions.
// Tools mutate this session. It does not build geometry or record history.
import type { ShapeType } from '../types';

type Item = any;

export class DrawingSession {
  isDrawingPath = false;
  isDrawingShape = false;
  isDrawingQuad = false;
  shapeType: ShapeType | null = null;
  shapeStartPoint: Item = null;
  shapePt2: Item = null;
  shapeWidth = 90;
  quadPath: Item = null;
  quadPointCount = 0;
  shapeGuideAngle = 0;
  liveScale = 1;
  liveRotateOffset = 0;
  radialStampBaseRadius = 45;
  radialStampLockedRadius: number | null = null;
  previewInner: Item = null;
  previewSplineText: Item = null;
  previewShape: Item = null;
  previewLine: Item = null;
  previewPath: Item = null;
  previewRect: Item = null;
  path: Item = null;
  mousePt: Item = null;
  lastMousePt: Item = null;

  get isLive(): boolean {
    return this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad;
  }

  /** Current overlay items. Callers must read this live; identities change during a session. */
  previewRefs(): Item[] {
    return [this.previewInner, this.previewSplineText, this.previewShape,
      this.previewLine, this.previewPath, this.previewRect];
  }

  resetLiveAdjust(): void {
    this.liveScale = 1;
    this.liveRotateOffset = 0;
    this.radialStampLockedRadius = null;
  }

  clearPath(): void {
    this.detach(this.path);
    this.releasePath();
  }

  /** Drop the live reference without removing a path that was just deposited. */
  releasePath(): void {
    this.path = null;
    this.isDrawingPath = false;
    this.detach(this.previewSplineText);
    this.previewSplineText = null;
  }

  clearShape(): void {
    this.detach(this.previewShape);
    this.detach(this.previewLine);
    this.detach(this.previewPath);
    this.detach(this.previewRect);
    this.detach(this.previewInner);
    this.previewShape = null;
    this.previewLine = null;
    this.previewPath = null;
    this.previewRect = null;
    this.previewInner = null;
    this.isDrawingShape = false;
    this.shapeType = null;
    this.shapeStartPoint = null;
    this.shapePt2 = null;
  }

  clearQuad(): void {
    this.detach(this.quadPath);
    this.releaseQuad();
  }

  /** Drop the live reference without removing a quad that was just deposited. */
  releaseQuad(): void {
    this.quadPath = null;
    this.isDrawingQuad = false;
    this.quadPointCount = 0;
  }

  /** Drop every live drawing item and return to idle. Drag-lock and UI notify stay with the caller. */
  cancel(): void {
    this.detach(this.previewInner);
    this.previewInner = null;
    this.detach(this.previewSplineText);
    this.previewSplineText = null;
    if (this.isDrawingPath) this.clearPath();
    if (this.isDrawingShape) this.clearShape();
    if (this.isDrawingQuad) this.clearQuad();
    this.resetLiveAdjust();
  }

  private detach(item: Item): void {
    if (!item) return;
    try {
      if (item.parent != null) item.remove();
    } catch {
      // Already detached.
    }
  }
}
