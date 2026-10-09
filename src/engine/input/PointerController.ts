// Pointer routing for the canvas.
//
// Owns: hit-testing, pan, selection clicks, drag-lock movement, and the
//   mouse-down / move / drag / up / double-click decisions.
// May read: drawing session, snap settings, and guide items through PointerHost.
// May mutate: the view center while panning, selection membership, and the
//   live preview point. Shape construction stays on the engine.
// Public methods: onMouseDown, onMouseMove, onMouseDrag, releasePointer,
//   onDoubleClick, hitTestUnderCursor.
// Events: none. Host methods record history and refresh previews.
// Tests: blank mousedown pans, a hit toggles selection, mouseup commits
//   the move, and drag-lock follows the cursor. The first drag sample is
//   measured from the down point, and a drag keeps an already selected
//   shape selected. See refs/engine-smoke-checklist.md.

type Item = any;

export interface PointerHost {
  scope(): paper.PaperScope;
  isDrawingPath(): boolean;
  isDrawingShape(): boolean;
  isDrawingQuad(): boolean;
  isTypingText(): boolean;
  updateTypingPreview(): void;
  shapeType(): string | null;
  shapeStartPoint(): Item;
  shapePt2(): Item;
  isAngleSnappingEnabled(): boolean;
  isLengthSnappingEnabled(): boolean;
  isAspectSnappingEnabled(): boolean;
  path(): Item;
  pathSnapBase(): Item;
  updateLivePath(point: Item): boolean;
  updateLiveQuad(): void;
  isCompositePathDrawing(): boolean;
  quadPath(): Item;
  selectedItems(): Item[];
  moveSelectionBy(delta: Item): void;
  toggleSelection(item: Item): void;
  isInDragLock(): boolean;
  mousePt(): Item;
  setMousePt(v: Item): void;
  lastMousePt(): Item;
  setLastMousePt(v: Item): void;
  isPanning(): boolean;
  isPanLocked(): boolean;
  beginPan(point: Item): void;
  panTo(point: Item, delta: Item): void;
  endPan(): void;
  snapToGrid(point: Item): Item;
  applyAngleSnapping(base: Item, target: Item): Item;
  applyLengthSnapping(base: Item, target: Item): Item;
  applyPathSnapping(original: Item): void;
  applyPointSnapping(original: Item): void;
  applyAspectSnapping(base: Item, target: Item): Item;
  snapAspectSecond(first: number, second: number): number;
  updateGridCursor(): void;
  refreshSplineTextPreview(): void;
  updateShapePreview(): void;
  updateTextContent(): void;
  notify(): void;
  clearOutSelection(): void;
  beginMoveGesture(): void;
  commitMoveGesture(): void;
  clearMoveGesture(): void;
  frameHandleAt(point: Item): string | null;
  isFrameResizing(): boolean;
  beginFrameResize(handle: string): void;
  resizeFrameTo(point: Item): void;
  endFrameResize(): void;
  isTransformMode(): boolean;
  transformHandleAt(point: Item): string | null;
  isTransformResizing(): boolean;
  isTransformGestureActive(): boolean;
  beginTransformDrag(handle: string): void;
  updateTransformDrag(point: Item, shiftKey: boolean): void;
  endTransformDrag(): void;
  updateTransformLive(): boolean;
  topUserGroupOf(item: Item): Item;
  startTextEdit(item: Item): void;
  isNonContentItem(item: Item): boolean;
  updateCanvasCursor(dragging: boolean, point: Item | null): void;
}

export class PointerController {
  private readonly host: PointerHost;
  /** Selected root under the button. A click with no movement toggles it
   * off on release. A drag leaves it selected so the move has a target. */
  private pressedSelection: Item = null;
  /** Down point for this press. Any later drag point that leaves it counts
   * as a drag, even when snapping zeroes the movement delta. */
  private downPoint: Item = null;
  private dragMoved = false;

  constructor(host: PointerHost) {
    this.host = host;
  }

  onMouseDown(event: paper.MouseEvent): void {
    // Right-click opens the context menu; it must never act like a left
    // click (select, deselect, pan, or start a move). The native button rides
    // on the wrapped DOM event; calls without one take the normal path.
    if (this.isRightButton(event)) return;
    this.resetPress();
    const host = this.host;
    host.setMousePt(event.point);
    if (host.isDrawingPath() || host.isDrawingShape() || host.isDrawingQuad()) return;
    // Clicks while typing only move the baseline anchor: selection and pan
    // stay parked until the line is placed or cancelled.
    if (host.isTypingText()) {
      host.updateTypingPreview();
      host.updateTextContent();
      host.notify();
      return;
    }
    // Export-frame resize handles take precedence over selection and pan.
    const handle = host.frameHandleAt(host.mousePt());
    if (handle) {
      host.beginFrameResize(handle);
      host.updateCanvasCursor(true, event.point);
      return;
    }
    // Transform-controls handles come next while the mode is on.
    if (!host.isTransformResizing()) {
      const transformHandle = host.isTransformMode() ? host.transformHandleAt(host.mousePt()) : null;
      if (transformHandle) {
        host.beginTransformDrag(transformHandle);
        host.updateCanvasCursor(true, event.point);
        return;
      }
    }
    const hit = this.hitTestContent(host.mousePt());
    if (!hit || !hit.item) {
      host.clearOutSelection();
      host.clearMoveGesture();
      host.beginPan(event.point);
      host.updateCanvasCursor(false, event.point);
      host.updateTextContent();
      return;
    }
    host.endPan();
    // An already selected root stays selected for the drag. Toggling it off
    // here used to snapshot an empty move, so the first drag did nothing.
    // A press that never leaves the down point still deselects on release.
    const root = this.hitRoot(hit);
    if (root && this.isSelected(root)) {
      this.pressedSelection = root;
    } else {
      this.applyHitSelection(hit);
    }
    this.downPoint = this.pointClone(event.point);
    host.beginMoveGesture();
    this.anchorDrag();
    host.updateCanvasCursor(false, event.point);
  }

  onMouseMove(event: paper.MouseEvent): void {
    const host = this.host;
    const originalPoint = event.point;
    const shapeType = host.shapeType();
    host.setMousePt(host.snapToGrid(event.point));
    if (host.isPanLocked()) {
      // Pan-Lock: the canvas point under the cursor stays glued to it.
      // This reuses the drag-pan anchor math; the delta is unused there.
      host.panTo(originalPoint, originalPoint);
      host.setLastMousePt(host.mousePt());
      host.updateGridCursor();
      return;
    }
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
    // The typed line tracks the cursor baseline while typing.
    if (host.isTypingText()) host.updateTypingPreview();
    // An armed S/R/H/V live transform steers from the cursor instead of
    // dragging; drag-lock stays parked until the gesture commits.
    if (!host.updateTransformLive()) this.handleDragLock();
    if (host.isDrawingPath()) host.updateLivePath(host.mousePt());
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
    if (host.isDrawingQuad()) host.updateLiveQuad();
    host.updateCanvasCursor(host.isInDragLock(), originalPoint);
  }

  onMouseDrag(event: paper.MouseEvent): void {
    // A right-drag starts no gesture (see onMouseDown), so it moves nothing.
    if (this.isRightButton(event)) return;
    const host = this.host;
    if (host.isFrameResizing()) {
      host.resizeFrameTo(event.point);
      host.updateCanvasCursor(true, event.point);
      return;
    }
    if (host.isTransformResizing()) {
      const shift = (event as unknown as { modifiers?: { shift?: boolean } }).modifiers?.shift ?? false;
      host.updateTransformDrag(event.point, shift);
      host.updateCanvasCursor(true, event.point);
      return;
    }
    if (host.isCompositePathDrawing()) {
      this.onMouseMove(event);
      return;
    }
    if (host.isPanning()) {
      host.panTo(event.point, event.delta);
      host.updateCanvasCursor(false, event.point);
      return;
    }
    host.setMousePt(host.snapToGrid(event.point));
    if (host.lastMousePt() === null) this.anchorDrag();
    if (this.leftDownPoint(event.point)) this.dragMoved = true;
    const delta = host.mousePt().subtract(host.lastMousePt());
    host.moveSelectionBy(delta);
    host.setLastMousePt(this.pointClone(host.mousePt()));
    host.updateCanvasCursor(true, event.point);
  }

  releasePointer(): void {
    if (this.host.isFrameResizing()) {
      this.resetPress();
      this.host.endFrameResize();
      this.host.updateCanvasCursor(false, this.host.mousePt());
      return;
    }
    if (this.host.isTransformResizing()) {
      this.resetPress();
      this.host.endTransformDrag();
      this.host.updateCanvasCursor(false, this.host.mousePt());
      return;
    }
    const deselect = this.pressedSelection;
    const moved = this.dragMoved;
    this.resetPress();
    this.endPan();
    this.host.commitMoveGesture();
    // Click-without-drag still toggles a shape that was already selected.
    if (deselect && !moved) {
      this.host.toggleSelection(deselect);
      this.host.updateTextContent();
      this.host.notify();
    }
    this.host.updateCanvasCursor(false, this.host.mousePt());
  }

  hitTestUnderCursor(): void {
    const host = this.host;
    if (host.isDrawingPath() || host.isDrawingShape() || host.isDrawingQuad()) return;
    this.applyHitSelection(this.hitTestContent(host.mousePt()));
  }

  /** Left-button double-click on editable text opens it for retyping.
   * The two preceding clicks already ran their toggle selection, so the
   * root is re-resolved and re-selected here before edit mode starts.
   * Anything else (empty canvas, non-text, mid-gesture) is a no-op. */
  onDoubleClick(point: Item, button: number): void {
    if (button !== 0) return;
    const host = this.host;
    if (host.isDrawingPath() || host.isDrawingShape() || host.isDrawingQuad()) return;
    if (host.isTypingText()) return;
    if (host.isFrameResizing() || host.isTransformResizing()) return;
    const hit = this.hitTestContent(point);
    let item: Item = hit && hit.item ? hit.item : null;
    if (item) item = host.topUserGroupOf(item);
    if (!item || !item.data || !item.data.editableText) return;
    host.startTextEdit(item);
  }

  private isRightButton(event: paper.MouseEvent): boolean {
    return (event as unknown as { event?: { button?: number } }).event?.button === 2;
  }

  private endPan(): void {
    const host = this.host;
    if (!host.isPanning()) return;
    host.endPan();
    host.updateCanvasCursor(false, host.mousePt());
  }

  private handleDragLock(): void {
    const host = this.host;
    if (host.isInDragLock()) {
      if (host.lastMousePt() === null) host.setLastMousePt(host.mousePt());
      const delta = host.mousePt().subtract(host.lastMousePt());
      host.moveSelectionBy(delta);
      host.setLastMousePt(host.mousePt());
    } else {
      host.setLastMousePt(null);
    }
  }

  private resetPress(): void {
    this.pressedSelection = null;
    this.downPoint = null;
    this.dragMoved = false;
  }

  /** Remember the down point so the first drag sample is a real delta.
   * The move that Paper emits before mousedown clears lastMousePt, and
   * treating that null as the anchor used to drop the opening sample. */
  private anchorDrag(): void {
    const host = this.host;
    const point = host.mousePt();
    host.setLastMousePt(this.pointClone(point ? host.snapToGrid(point) : point));
  }

  private leftDownPoint(point: Item): boolean {
    const down = this.downPoint;
    if (!down || !point) return false;
    if (typeof point.getDistance === 'function') return point.getDistance(down) > 0;
    return point.x !== down.x || point.y !== down.y;
  }

  private pointClone(point: Item): Item {
    if (!point || typeof point.clone !== 'function') return point;
    return point.clone();
  }

  private isSelected(item: Item): boolean {
    const items = this.host.selectedItems();
    return !!item && !!items && items.includes(item);
  }

  private hitRoot(hitResult: Item): Item {
    let item: Item = hitResult && hitResult.item ? hitResult.item : null;
    if (item) item = this.host.topUserGroupOf(item);
    return item;
  }

  private applyHitSelection(hitResult: Item): void {
    const host = this.host;
    // Clicking a grouped child selects its user group as one item.
    const item = this.hitRoot(hitResult);
    if (item) {
      host.toggleSelection(item);
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
