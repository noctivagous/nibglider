// Pointer routing for the canvas.
//
// Owns: hit-testing, pan, selection clicks, drag-lock movement, and the
//   mouse-down / move / drag / up decisions.
// May read: drawing session, snap settings, and guide items through PointerHost.
// May mutate: the view center while panning, selection membership, and the
//   live preview point. Shape construction stays on the engine.
// Public methods: onMouseDown, onMouseMove, onMouseDrag, releasePointer,
//   hitTestUnderCursor.
// Events: none. Host methods record history and refresh previews.
// Tests: blank mousedown pans, a hit toggles selection, mouseup commits
//   the move, and drag-lock follows the cursor. See
//   refs/engine-smoke-checklist.md.

type Item = any;

export interface PointerHost {
  scope(): paper.PaperScope;
  isDrawingPath(): boolean;
  isDrawingShape(): boolean;
  isDrawingQuad(): boolean;
  shapeType(): string | null;
  shapeStartPoint(): Item;
  shapePt2(): Item;
  isAngleSnappingEnabled(): boolean;
  isLengthSnappingEnabled(): boolean;
  isAspectSnappingEnabled(): boolean;
  path(): Item;
  pathSnapBase(): Item;
  updateLivePath(point: Item): boolean;
  isCompositePathDrawing(): boolean;
  quadPath(): Item;
  selectedItems(): Item[];
  isInDragLock(): boolean;
  mousePt(): Item;
  setMousePt(v: Item): void;
  lastMousePt(): Item;
  setLastMousePt(v: Item): void;
  isPanning(): boolean;
  setIsPanning(v: boolean): void;
  panAnchorCenter(): Item;
  setPanAnchorCenter(v: Item): void;
  panAnchorPoint(): Item;
  setPanAnchorPoint(v: Item): void;
  snapToGrid(point: Item): Item;
  applyAngleSnapping(base: Item, target: Item): Item;
  applyLengthSnapping(base: Item, target: Item): Item;
  applyPathSnapping(original: Item): void;
  applyPointSnapping(original: Item): void;
  applyAspectSnapping(base: Item, target: Item): Item;
  snapAspectSecond(first: number, second: number): number;
  afterViewChange(): void;
  updateGridCursor(): void;
  refreshSplineTextPreview(): void;
  updateShapePreview(): void;
  updateTextContent(): void;
  notify(): void;
  clearOutSelection(): void;
  beginMoveGesture(): void;
  commitMoveGesture(): void;
  clearMoveGesture(): void;
  topUserGroupOf(item: Item): Item;
  isNonContentItem(item: Item): boolean;
}

export class PointerController {
  private readonly host: PointerHost;

  constructor(host: PointerHost) {
    this.host = host;
  }

  onMouseDown(event: paper.MouseEvent): void {
    const host = this.host;
    host.setMousePt(event.point);
    if (host.isDrawingPath() || host.isDrawingShape() || host.isDrawingQuad()) return;
    const hit = this.hitTestContent(host.mousePt());
    if (!hit || !hit.item) {
      host.clearOutSelection();
      host.clearMoveGesture();
      host.setIsPanning(true);
      host.setPanAnchorCenter(host.scope().view.center.clone());
      host.setPanAnchorPoint(event.point.clone());
      this.setCanvasCursor('grabbing');
      host.updateTextContent();
      return;
    }
    host.setIsPanning(false);
    this.applyHitSelection(hit);
    host.beginMoveGesture();
  }

  onMouseMove(event: paper.MouseEvent): void {
    const host = this.host;
    const originalPoint = event.point;
    const shapeType = host.shapeType();
    host.setMousePt(host.snapToGrid(event.point));
    if (host.isAngleSnappingEnabled() || host.isLengthSnappingEnabled()) {
      let snapBase: Item = null;
      if (host.isDrawingPath()) {
        snapBase = host.pathSnapBase();
      } else if (
        host.isDrawingShape() &&
        shapeType != null &&
        shapeType.startsWith('circle_') &&
        host.shapeStartPoint()
      ) {
        snapBase = host.shapeStartPoint();
      } else if (
        host.isDrawingShape() &&
        shapeType != null &&
        shapeType.startsWith('rectangle_') &&
        host.shapeStartPoint()
      ) {
        snapBase = host.shapeStartPoint();
        if (shapeType === 'rectangle_two_edges' && host.shapePt2()) {
          snapBase = host.shapePt2();
        }
      }
      if (snapBase) {
        if (host.isAngleSnappingEnabled()) {
          host.setMousePt(host.applyAngleSnapping(snapBase, host.mousePt()));
        }
        if (host.isLengthSnappingEnabled()) {
          host.setMousePt(host.applyLengthSnapping(snapBase, host.mousePt()));
        }
      }
    }
    host.applyPathSnapping(originalPoint);
    // Exact points take precedence over curve proximity.
    host.applyPointSnapping(originalPoint);
    if (
      host.isAspectSnappingEnabled() &&
      host.isDrawingShape() &&
      shapeType != null &&
      shapeType.startsWith('rectangle_') &&
      host.shapeStartPoint()
    ) {
      if (shapeType === 'rectangle_diagonal') {
        host.setMousePt(host.applyAspectSnapping(host.shapeStartPoint(), host.mousePt()));
      } else if (shapeType === 'rectangle_two_edges' && host.shapePt2()) {
        const edge = host.shapePt2().subtract(host.shapeStartPoint());
        if (edge.length > 0) {
          const dir1 = edge.normalize();
          const v2 = host.mousePt().subtract(host.shapePt2());
          const perpVec = v2.subtract(dir1.multiply(v2.dot(dir1)));
          if (perpVec.length > 0) {
            const snapped = host.snapAspectSecond(edge.length, perpVec.length);
            host.setMousePt(host.shapePt2().add(perpVec.normalize().multiply(snapped)));
          }
        }
      }
    }
    host.updateGridCursor();
    this.handleDragLock();
    if (host.isDrawingPath() && !host.updateLivePath(host.mousePt()) && host.path()) {
      if (host.path().segments.length === 1) host.path().add(host.mousePt());
      if (host.path().segments.length > 1) {
        host.path().removeSegment(host.path().segments.length - 1);
        host.path().add(host.mousePt());
      }
      host.refreshSplineTextPreview();
    }
    if (host.isDrawingShape()) {
      host.updateShapePreview();
      if (
        host.isAspectSnappingEnabled() &&
        shapeType != null &&
        shapeType.startsWith('rectangle_')
      ) {
        host.updateTextContent();
      }
    }
    if (host.isDrawingQuad() && host.quadPath()) {
      if (host.quadPath().segments.length === 1) host.quadPath().add(host.mousePt());
      if (host.quadPath().segments.length > 1) {
        host.quadPath().removeSegment(host.quadPath().segments.length - 1);
        host.quadPath().add(host.mousePt());
      }
    }
  }

  onMouseDrag(event: paper.MouseEvent): void {
    const host = this.host;
    if (host.isCompositePathDrawing()) {
      this.onMouseMove(event);
      return;
    }
    if (host.isPanning()) {
      const view = host.scope().view;
      if (host.panAnchorCenter() !== null && host.panAnchorPoint() !== null) {
        // Pointer travel since pan start, in project units. Subtracting
        // the center out of each point cancels the view translation, so
        // this measures pure pointer travel regardless of how center has
        // moved between events (unlike event.delta, which mixes frames).
        const offset = event.point
          .subtract(view.center)
          .subtract(host.panAnchorPoint().subtract(host.panAnchorCenter()));
        view.center = host.panAnchorCenter().subtract(offset);
      } else {
        view.center = view.center.subtract(event.delta);
      }
      host.afterViewChange();
      return;
    }
    host.setMousePt(host.snapToGrid(event.point));
    if (host.lastMousePt() === null) host.setLastMousePt(host.mousePt());
    const delta = host.mousePt().subtract(host.lastMousePt());
    for (let i = 0; i < host.selectedItems().length; i++) {
      host.selectedItems()[i].position = host.selectedItems()[i].position.add(delta);
    }
    host.setLastMousePt(host.mousePt());
  }

  releasePointer(): void {
    this.endPan();
    this.host.commitMoveGesture();
  }

  hitTestUnderCursor(): void {
    const host = this.host;
    if (host.isDrawingPath() || host.isDrawingShape() || host.isDrawingQuad()) return;
    this.applyHitSelection(this.hitTestContent(host.mousePt()));
  }

  private endPan(): void {
    const host = this.host;
    if (!host.isPanning()) return;
    host.setIsPanning(false);
    host.setPanAnchorCenter(null);
    host.setPanAnchorPoint(null);
    this.setCanvasCursor('');
  }

  private setCanvasCursor(cursor: string): void {
    const el = this.host.scope().view && this.host.scope().view.element;
    if (el) (el as HTMLElement).style.cursor = cursor;
  }

  private handleDragLock(): void {
    const host = this.host;
    if (host.isInDragLock()) {
      if (host.lastMousePt() === null) host.setLastMousePt(host.mousePt());
      const delta = host.mousePt().subtract(host.lastMousePt());
      for (let i = 0; i < host.selectedItems().length; i++) {
        host.selectedItems()[i].position = host.selectedItems()[i].position.add(delta);
      }
      host.setLastMousePt(host.mousePt());
    } else {
      host.setLastMousePt(null);
    }
  }

  private applyHitSelection(hitResult: Item): void {
    const host = this.host;
    // Clicking a grouped child selects its user group as one item.
    let item: Item = hitResult && hitResult.item ? hitResult.item : null;
    if (item) item = host.topUserGroupOf(item);
    if (item) {
      const alreadySelected = host.selectedItems().indexOf(item) !== -1;
      if (alreadySelected) {
        item.selected = false;
        host.selectedItems().splice(host.selectedItems().indexOf(item), 1);
      } else {
        item.selected = true;
        host.selectedItems().push(item);
      }
    } else {
      host.clearOutSelection();
    }
    host.updateTextContent();
    host.notify();
  }

  private hitTestContent(point: Item): Item {
    const scope = this.host.scope();
    if (!point || !scope.project) return null;
    return scope.project.hitTest(point, {
      segments: true,
      stroke: true,
      fill: true,
      tolerance: 5,
      match: (hit: Item) => !this.host.isNonContentItem(hit),
    });
  }
}
