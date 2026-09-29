// Ported from the flat global scripts (drawingProperties.js,
// drawingToolsAndFunctions.js, selectionFunctions.js, shapeGenerators.js,
// NibGliderApp.js). All shared mutable state lives on this class; the
// PaperScope is injected instead of paper.install(window).
// NB: `paper.*` below refers to the global namespace from paper's bundled
// declarations (type positions only); the runtime value is never imported here.

export type ShapeType =
  | 'circle_radius'
  | 'circle_diameter'
  | 'rectangle_diagonal'
  | 'rectangle_two_edges'
  | 'rectangle_centerline';

export type CircleInnerShape = 'circle' | 'polygon' | 'supershape';

export interface InnerShapeParams {
  sides: number;
  m: number;
  n1: number;
  n2: number;
  n3: number;
  a1: number;
  a2: number;
}

export interface KeyActivity {
  code: string;
  active: boolean;
}

// Paper item refs stay loosely typed: the original code leans on runtime
// paper behavior (null style assignment, shape-specific fields) that the
// bundled declarations model more narrowly.
type AnyItem = any;

export class NibGliderEngine {
  private scope: paper.PaperScope;
  private detachFns: Array<() => void> = [];
  private listeners = new Set<() => void>();
  private version = 0;
  private onKeyActivity: (a: KeyActivity) => void;

  // --- Stroke / style config (drawingProperties.js) ---
  globalStrokeWidth = 4.0;
  maxStrokeWidth = 40.0;
  lastCenterlineWidth = 80;
  splineTensionDefault = 0.4;
  splineTension = 0.4;
  globalStrokeColor = '#107cff';
  globalFillColor = '#000000';
  strokeEnabled = true;
  fillEnabled = false;

  // --- Grid / cursors ---
  isGridEnabled = false;
  gridSpacing = 20;
  gridLayer: AnyItem = null;
  gridCursor: AnyItem = null;
  pathSnapCursor: AnyItem = null;

  // --- Snapping flags ---
  isGridSnappingEnabled = false;
  isPathSnappingEnabled = false;
  isAngleSnappingEnabled = false;
  isLengthSnappingEnabled = false;

  // --- Inner shape config ---
  innerShapeType = 'polygon';
  innerShapeParams = { sides: 6, m: 3, n1: 0.2, n2: 1.7, n3: 1.7 };
  circleInnerShapeType: CircleInnerShape = 'polygon';
  circleInnerShapeParams: InnerShapeParams = {
    sides: 6,
    m: 3,
    n1: 0.2,
    n2: 1.7,
    n3: 1.7,
    a1: 1.0,
    a2: 1.0,
  };
  rectangleInnerShapeType = 'rectangle';
  rectangleInnerShapeParams: Record<string, number> = {};
  polygonRadiusMode = 'inradius';

  // --- Drawing mode / shape state (drawingToolsAndFunctions.js) ---
  isDrawingPath = false;
  isDrawingShape = false;
  isDrawingQuad = false;
  shapeType: ShapeType | null = null;
  shapeStartPoint: AnyItem = null;
  shapePt2: AnyItem = null;
  shapeWidth = 90;
  maxShapeWidth = 200;
  quadPath: AnyItem = null;
  quadPointCount = 0;
  shapeGuideAngle = 0;
  previewInner: AnyItem = null;
  previewShape: AnyItem = null;
  previewLine: AnyItem = null;
  previewPath: AnyItem = null;
  previewRect: AnyItem = null;
  path: AnyItem = null;
  mousePt: AnyItem = null;
  lastMousePt: AnyItem = null;

  // --- Selection (selectionFunctions.js) ---
  selectedItems: AnyItem[] = [];
  isInDragLock = false;

  private statusText: AnyItem = null;

  constructor(scope: paper.PaperScope, onKeyActivity: (a: KeyActivity) => void) {
    this.scope = scope;
    this.onKeyActivity = onKeyActivity;
  }

  // --- React bridge: version counter + subscription ---
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  // --- Lifecycle: canvas setup + event wiring (NibGliderApp init) ---
  attach(canvas: HTMLCanvasElement): void {
    const scope = this.scope;
    scope.setup(canvas);
    this.mousePt = new scope.Point(
      scope.view.size.width / 2,
      scope.view.size.height / 2,
    );

    this.statusText = new scope.PointText({
      content: '',
      point: new scope.Point(50, 40),
      fillColor: '#fff',
      fontSize: '18pt',
      fontWeight: 'normal',
      fontFamily: 'Monospace',
    });

    scope.view.onMouseDown = (event: paper.MouseEvent) =>
      this.onMouseDown(event);
    scope.view.onMouseMove = (event: paper.MouseEvent) =>
      this.onMouseMove(event);
    scope.view.onMouseDrag = (event: paper.MouseEvent) =>
      this.onMouseDrag(event);

    const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code) this.onKeyActivity({ code: event.code, active: false });
    };
    const onHighlightDown = (event: KeyboardEvent) => {
      const keyLower = event.key.toLowerCase();
      if (keyLower === 'l') return;
      if (event.code && event.metaKey === false) {
        this.onKeyActivity({ code: event.code, active: true });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onHighlightDown);
    document.addEventListener('keyup', onKeyUp);

    const focusCanvas = () => {
      if (document.activeElement !== canvas) canvas.focus();
    };
    const onCanvasMove = () => focusCanvas();
    const onCanvasClick = () => {
      canvas.focus();
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => this.handleImageDrop(e);
    canvas.addEventListener('mousemove', onCanvasMove);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);

    this.detachFns.push(() => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keydown', onHighlightDown);
      document.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onCanvasMove);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('drop', onDrop);
      scope.view.onMouseDown = null;
      scope.view.onMouseMove = null;
      scope.view.onMouseDrag = null;
    });

    this.updatePreviewBox();
    this.updateTextContent();
  }

  detach(): void {
    const fns = this.detachFns;
    this.detachFns = [];
    fns.forEach((fn) => fn());
  }

  private handleImageDrop(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const scope = this.scope;
    const dropPoint = new scope.Point(event.offsetX, event.offsetY);
    if (/image\/svg\+xml/.test(file.type)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== 'string') return;
        scope.project.importSVG(result, (item: paper.Item) => {
          item.position = dropPoint;
        });
      };
      reader.readAsText(file);
    } else if (/image.*/.test(file.type)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== 'string') return;
        const image = new Image();
        image.onload = () => {
          const raster = new scope.Raster(image);
          raster.position = dropPoint;
        };
        image.src = result;
      };
      reader.readAsDataURL(file);
    }
  }

  // --- Control-panel setters (replace registerEventListeners wiring) ---
  setStrokeWidth(strokeVal: number): void {
    let v = strokeVal;
    if (v < 1) v = 1;
    if (v > this.maxStrokeWidth) v = this.maxStrokeWidth;
    this.globalStrokeWidth = v;
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  thinStrokeWidth(): void {
    this.setStrokeWidth(this.globalStrokeWidth - 1);
  }

  thickenStrokeWidth(): void {
    this.setStrokeWidth(this.globalStrokeWidth + 1);
  }

  setStrokeColor(colorVal: string): void {
    this.globalStrokeColor = colorVal;
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  setFillColor(colorVal: string): void {
    this.globalFillColor = colorVal;
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  setStrokeEnabled(enabled: boolean): void {
    this.strokeEnabled = enabled;
    if (!this.strokeEnabled && !this.fillEnabled) this.fillEnabled = true;
    this.updateCurrentDrawingStyles();
    this.notify();
  }

  setFillEnabled(enabled: boolean): void {
    this.fillEnabled = enabled;
    if (!this.fillEnabled && !this.strokeEnabled) this.strokeEnabled = true;
    this.updateCurrentDrawingStyles();
    this.notify();
  }

  setGridSnappingEnabled(v: boolean): void {
    this.isGridSnappingEnabled = v;
    this.updateTextContent();
    this.notify();
  }

  setPathSnappingEnabled(v: boolean): void {
    this.isPathSnappingEnabled = v;
    this.updateTextContent();
    this.notify();
  }

  setAngleSnappingEnabled(v: boolean): void {
    this.isAngleSnappingEnabled = v;
    this.updateTextContent();
    this.notify();
  }

  setLengthSnappingEnabled(v: boolean): void {
    this.isLengthSnappingEnabled = v;
    this.updateTextContent();
    this.notify();
  }

  setCircleInnerShapeType(t: CircleInnerShape): void {
    this.circleInnerShapeType = t;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setCircleSides(sides: number): void {
    this.circleInnerShapeParams.sides = sides;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setSupershapeParam(key: keyof InnerShapeParams, val: number): void {
    this.circleInnerShapeParams[key] = val;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  toggleGrid(): void {
    this.isGridEnabled = !this.isGridEnabled;
    if (this.isGridEnabled) {
      this.drawGrid();
    } else {
      this.clearGrid();
    }
    this.updateTextContent();
    this.notify();
  }

  setSplineTension(val: number): void {
    this.splineTension = Math.max(0.1, Math.min(1.0, val));
  }

  decreaseSplineTension(): void {
    if (this.isDrawingPath) {
      this.splineTension = Math.max(0.1, this.splineTension - 0.1);
      this.updateTextContent();
      this.notify();
    }
  }

  increaseSplineTension(): void {
    if (this.isDrawingPath) {
      this.splineTension = Math.min(1.0, this.splineTension + 0.1);
      this.updateTextContent();
      this.notify();
    }
  }

  setPolygonRadiusMode(mode: string): void {
    this.polygonRadiusMode = mode === 'inradius' ? 'inradius' : 'circumradius';
  }

  togglePolygonRadiusMode(): void {
    this.polygonRadiusMode =
      this.polygonRadiusMode === 'circumradius' ? 'inradius' : 'circumradius';
    this.updateTextContent();
    this.notify();
  }

  // --- Style helpers (drawingProperties.js) ---
  applyCurrentStyles(item: AnyItem): void {
    if (!item) return;
    item.strokeColor = this.strokeEnabled ? this.globalStrokeColor : null;
    item.strokeWidth = this.strokeEnabled ? this.globalStrokeWidth : 0;
    item.fillColor = this.fillEnabled ? this.globalFillColor : null;
    item.strokeCap = 'round';
    item.strokeJoin = 'round';
  }

  updateCurrentDrawingStyles(): void {
    const strokeWidth = this.strokeEnabled ? this.globalStrokeWidth : 0;
    const strokeColor = this.strokeEnabled ? this.globalStrokeColor : null;
    const fillColor = this.fillEnabled ? this.globalFillColor : null;
    [this.path, this.previewShape, this.quadPath, this.previewPath, this.previewRect].forEach(
      (item) => {
        if (item) {
          item.strokeWidth = strokeWidth;
          item.strokeColor = strokeColor;
          item.fillColor = fillColor;
        }
      },
    );
  }

  updatePreviewBox(): void {
    const svgPath = document.getElementById('shapePreviewPath');
    if (!svgPath) return;
    const radius = 0.9;
    const steps = 72;
    let pathData = 'M 0,0';
    if (this.circleInnerShapeType === 'circle') {
      pathData =
        `M ${radius},0 A ${radius},${radius} 0 1,1 ${-radius},0 ` +
        `A ${radius},${radius} 0 1,1 ${radius},0 Z`;
    } else if (this.circleInnerShapeType === 'polygon') {
      const sides = this.circleInnerShapeParams.sides || 6;
      const angleStep = (Math.PI * 2) / sides;
      pathData = 'M ';
      for (let i = 0; i < sides; i++) {
        const angle = angleStep * i;
        pathData +=
          `${(radius * Math.cos(angle)).toFixed(3)},` +
          `${(radius * Math.sin(angle)).toFixed(3)} `;
      }
      pathData += 'Z';
    } else if (this.circleInnerShapeType === 'supershape') {
      const { m = 5, n1 = 0.2, n2 = 1.7, n3 = 1.7, a1 = 1, a2 = 1 } =
        this.circleInnerShapeParams;
      pathData = 'M ';
      for (let i = 0; i <= steps; i++) {
        const phi = (i / steps) * Math.PI * 2;
        const r = this.supershapeRadius(phi, m, n1, n2, n3, a1, a2);
        const scaledR = radius * (r || 0);
        pathData +=
          `${(scaledR * Math.cos(phi)).toFixed(3)},` +
          `${(scaledR * Math.sin(phi)).toFixed(3)} `;
      }
      pathData += 'Z';
    }
    svgPath.setAttribute('d', pathData);
  }

  // --- Grid (drawingProperties.js) ---
  drawGrid(): void {
    const scope = this.scope;
    if (!this.gridLayer) {
      this.gridLayer = new scope.Layer();
      this.gridLayer.name = 'gridLayer';
      scope.project.addLayer(this.gridLayer);
    }
    this.gridLayer.removeChildren();
    const canvas = scope.view.element;
    void canvas;
    const viewBounds = scope.view.bounds;
    const startX = Math.floor(viewBounds.x / this.gridSpacing) * this.gridSpacing;
    const endX =
      Math.ceil((viewBounds.x + viewBounds.width) / this.gridSpacing) *
      this.gridSpacing;
    const startY = Math.floor(viewBounds.y / this.gridSpacing) * this.gridSpacing;
    const endY =
      Math.ceil((viewBounds.y + viewBounds.height) / this.gridSpacing) *
      this.gridSpacing;
    for (let x = startX; x <= endX; x += this.gridSpacing) {
      const line = new scope.Path.Line(
        new scope.Point(x, startY),
        new scope.Point(x, endY),
      );
      line.strokeColor = new scope.Color(0, 0, 1, 0.8);
      line.strokeWidth = 2;
      this.gridLayer.addChild(line);
    }
    for (let y = startY; y <= endY; y += this.gridSpacing) {
      const line = new scope.Path.Line(
        new scope.Point(startX, y),
        new scope.Point(endX, y),
      );
      line.strokeColor = new scope.Color(0, 0, 1, 0.8);
      line.strokeWidth = 2;
      this.gridLayer.addChild(line);
    }
    this.gridLayer.sendToBack();
    scope.view.update();
  }

  clearGrid(): void {
    if (this.gridLayer) this.gridLayer.removeChildren();
    if (this.gridCursor) this.gridCursor.visible = false;
    this.scope.view.update();
  }

  snapToGrid(point: AnyItem): AnyItem {
    if (!this.isGridSnappingEnabled) return point;
    const scope = this.scope;
    return new scope.Point(
      Math.round(point.x / this.gridSpacing) * this.gridSpacing,
      Math.round(point.y / this.gridSpacing) * this.gridSpacing,
    );
  }

  updateGridCursor(): void {
    const scope = this.scope;
    if (!this.isGridEnabled) {
      if (this.gridCursor) this.gridCursor.visible = false;
      return;
    }
    if (!this.gridCursor) {
      this.gridCursor = new scope.Shape.Circle(this.mousePt, 5);
      this.gridCursor.fillColor = new scope.Color(1, 0, 0, 0.9);
      this.gridCursor.strokeColor = new scope.Color(0, 0, 0, 1.0);
      this.gridCursor.strokeWidth = 2;
      this.gridCursor.selectable = false;
      this.gridCursor.data.isUICursor = true;
      scope.project.activeLayer.addChild(this.gridCursor);
      this.gridCursor.bringToFront();
    } else {
      this.gridCursor.position = this.mousePt;
      this.gridCursor.visible = true;
      this.gridCursor.bringToFront();
    }
  }

  applyAngleSnapping(basePoint: AnyItem, targetPoint: AnyItem): AnyItem {
    const scope = this.scope;
    if (!this.isAngleSnappingEnabled || !basePoint || !targetPoint) {
      return targetPoint;
    }
    const dx = targetPoint.x - basePoint.x;
    const dy = targetPoint.y - basePoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return targetPoint;
    const angleRad = Math.atan2(dy, dx);
    const stepRad = (15 * Math.PI) / 180;
    const snappedAngle = Math.round(angleRad / stepRad) * stepRad;
    return new scope.Point(
      basePoint.x + Math.cos(snappedAngle) * len,
      basePoint.y + Math.sin(snappedAngle) * len,
    );
  }

  applyPathSnapping(originalPoint: AnyItem): void {
    const scope = this.scope;
    if (!this.isPathSnappingEnabled || !originalPoint) {
      if (this.pathSnapCursor) this.pathSnapCursor.visible = false;
      return;
    }
    const ignoredItems = new Set([
      this.path,
      this.previewPath,
      this.previewShape,
      this.previewRect,
      this.quadPath,
      this.pathSnapCursor,
      this.previewLine,
      this.previewInner,
    ]);
    let bestPoint: AnyItem = null;
    let bestDist = Infinity;
    const maxSnapDistance = 12;
    const items: AnyItem[] = scope.project.getItems({
      match: (item: AnyItem) => {
        if (!item || !item.visible) return false;
        if (ignoredItems.has(item)) return false;
        return (
          typeof item.getNearestPoint === 'function' || item.segments || item.curves
        );
      },
    });
    items.forEach((item) => {
      const candidatePoint =
        typeof item.getNearestPoint === 'function'
          ? item.getNearestPoint(originalPoint)
          : item.position || null;
      if (!candidatePoint) return;
      const dist = candidatePoint.getDistance(originalPoint);
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = candidatePoint;
      }
    });
    if (bestPoint && bestDist <= maxSnapDistance) {
      this.mousePt = bestPoint;
      if (!this.pathSnapCursor) {
        this.pathSnapCursor = new scope.Shape.Circle(bestPoint, 4);
        this.pathSnapCursor.fillColor = new scope.Color(1, 0, 0, 0.9);
        this.pathSnapCursor.strokeColor = new scope.Color(0, 0, 0, 1.0);
        this.pathSnapCursor.strokeWidth = 2;
        this.pathSnapCursor.selectable = false;
        this.pathSnapCursor.data.isUICursor = true;
        scope.project.activeLayer.addChild(this.pathSnapCursor);
      } else {
        this.pathSnapCursor.position = bestPoint;
        this.pathSnapCursor.visible = true;
        this.pathSnapCursor.bringToFront();
      }
    } else if (this.pathSnapCursor) {
      this.pathSnapCursor.visible = false;
    }
  }

  // --- Selection (selectionFunctions.js + NibGliderApp.js) ---
  addItemToSelection(item: AnyItem): void {
    if (item === this.pathSnapCursor || item === this.gridCursor) return;
    item.selected = true;
    this.selectedItems.push(item);
  }

  removeItemFromSelection(item: AnyItem): void {
    const index = this.selectedItems.indexOf(item);
    if (index !== -1) {
      item.selected = false;
      this.selectedItems.splice(index, 1);
    }
  }

  collectiveBounds(items: AnyItem[]): AnyItem {
    let bounds: AnyItem = null;
    for (let i = 0; i < items.length; i++) {
      if (bounds === null) {
        bounds = items[i].bounds.clone();
      } else {
        bounds = bounds.unite(items[i].bounds);
      }
    }
    return bounds;
  }

  collectiveCenter(items: AnyItem[]): AnyItem {
    const bounds = this.collectiveBounds(items);
    return bounds ? bounds.center : new this.scope.Point(0, 0);
  }

  clearOutSelection(): void {
    if (this.pathSnapCursor) this.pathSnapCursor.selected = false;
    if (this.gridCursor) this.gridCursor.selected = false;
    for (let i = 0; i < this.selectedItems.length; i++) {
      this.selectedItems[i].selected = false;
    }
    this.selectedItems = [];
  }

  removeAllSelectedItemsAndReset(): void {
    for (let i = this.selectedItems.length - 1; i >= 0; i--) {
      const item = this.selectedItems[i];
      this.removeItemFromSelection(item);
      item.remove();
    }
    this.selectedItems = [];
    this.setIsInDragLock(false);
  }

  setIsInDragLock(status: boolean): void {
    this.isInDragLock = status;
    this.updateTextContent();
    this.notify();
  }

  // --- Drawing tools (drawingToolsAndFunctions.js) ---
  stampItems(itemsToStamp: AnyItem[] | null): void {
    if (itemsToStamp === null) return;
    for (let i = 0; i < itemsToStamp.length; i++) {
      const clone = itemsToStamp[i].clone();
      clone.selected = false;
      this.scope.project.activeLayer.addChild(clone);
    }
  }

  cancelCurrentDrawingOperation(): void {
    if (this.previewInner) {
      this.previewInner.remove();
      this.previewInner = null;
    }
    if (this.isDrawingPath && this.path) {
      this.path.remove();
      this.path = null;
      this.isDrawingPath = false;
    }
    if (this.isDrawingShape) {
      if (this.previewShape) this.previewShape.remove();
      if (this.previewLine) this.previewLine.remove();
      if (this.previewPath) {
        this.previewPath.remove();
        this.previewPath = null;
      }
      if (this.previewRect) {
        this.previewRect.remove();
        this.previewRect = null;
      }
      if (this.previewInner) {
        this.previewInner.remove();
        this.previewInner = null;
      }
      this.previewShape = null;
      this.previewLine = null;
      this.isDrawingShape = false;
      this.shapeType = null;
      this.shapeStartPoint = null;
      this.shapePt2 = null;
    }
    if (this.isDrawingQuad && this.quadPath) {
      this.quadPath.remove();
      this.quadPath = null;
      this.isDrawingQuad = false;
      this.quadPointCount = 0;
    }
    this.notify();
  }

  rotateShapeToMouseDirection(shape: AnyItem, center: AnyItem, mousePt: AnyItem): void {
    if (!mousePt || !center || !shape) return;
    const delta = mousePt.subtract(center);
    const angleDeg = (Math.atan2(delta.y, delta.x) * 180) / Math.PI;
    shape.rotate(angleDeg, center);
  }

  createInnerShape(
    center: AnyItem,
    radius: number,
    styleOrPreview = 'stroke',
    rotationAngle = 0,
  ): AnyItem {
    const scope = this.scope;
    const isPreview = styleOrPreview === 'preview';
    const hasStroke =
      !isPreview && (styleOrPreview === 'stroke' || styleOrPreview === 'fillstroke');
    const hasFill =
      !isPreview && (styleOrPreview === 'fill' || styleOrPreview === 'fillstroke');
    let path: AnyItem = null;
    const useCircleInner = this.shapeType != null && this.shapeType.startsWith('circle_');
    const isRect =
      this.shapeType != null && this.shapeType.startsWith('rectangle_');
    const currentInnerType = useCircleInner
      ? this.circleInnerShapeType
      : isRect
        ? this.rectangleInnerShapeType
        : this.innerShapeType;
    const currentInnerParams: Record<string, number> = useCircleInner
      ? (this.circleInnerShapeParams as unknown as Record<string, number>)
      : isRect
        ? this.rectangleInnerShapeParams
        : (this.innerShapeParams as Record<string, number>);
    switch (currentInnerType) {
      case 'circle':
        path = new scope.Path.Circle(center, radius);
        break;
      case 'rectangle':
        path = new scope.Path.Rectangle({
          center,
          size: new scope.Size(radius * 1.4, radius * 1.4),
        });
        break;
      case 'rightTriangle':
        path = new scope.Path({
          segments: [
            center.add(new scope.Point(-radius * 0.7, radius * 0.7)),
            center.add(new scope.Point(radius * 0.7, radius * 0.7)),
            center.add(new scope.Point(0, -radius * 0.7)),
          ],
          closed: true,
        });
        break;
      case 'rightTriangleB':
        path = new scope.Path({
          segments: [
            center.add(new scope.Point(-radius * 0.9, radius * 0.5)),
            center.add(new scope.Point(radius * 0.9, radius * 0.5)),
            center.add(new scope.Point(0, -radius * 0.9)),
          ],
          closed: true,
        });
        break;
      case 'regularTriangle':
        path = this.createRegularPolygon(center, radius, 3, rotationAngle);
        break;
      case 'regularPolygon':
      case 'polygon':
        path = this.createRegularPolygon(
          center,
          radius,
          currentInnerParams['sides'] || 6,
          rotationAngle,
          this.polygonRadiusMode,
        );
        if (this.shapeType === 'circle_diameter') {
          path.rotate(180, center);
        }
        break;
      case 'supershape':
        path = this.createSupershape(center, radius, currentInnerParams, rotationAngle);
        break;
      default:
        break;
    }
    if (path) {
      if (isPreview) {
        path.strokeColor = this.globalStrokeColor;
        path.strokeWidth = this.globalStrokeWidth;
        path.strokeDasharray = [3, 3];
        path.opacity = 0.7;
        path.fillColor = null;
      } else {
        path.strokeColor = hasStroke ? this.globalStrokeColor : null;
        path.strokeWidth = hasStroke ? this.globalStrokeWidth * 0.7 : 0;
        path.fillColor = hasFill ? this.globalFillColor : null;
        path.strokeCap = 'round';
        path.strokeJoin = 'round';
      }
    }
    return path;
  }

  drawInnerShape(frameItem: AnyItem, style: string): void {
    const scope = this.scope;
    if (
      (this.shapeType != null &&
        this.shapeType.startsWith('rectangle_') &&
        this.rectangleInnerShapeType === 'rectangle') ||
      (!this.shapeType && this.innerShapeType === 'none') ||
      this.quadPath ||
      (this.shapeType != null && this.shapeType.startsWith('rectangle_diagonal')) ||
      this.shapeType === 'rectangle_diagonal'
    ) {
      return;
    }
    const strokeW = frameItem.strokeWidth || this.globalStrokeWidth;
    let center: AnyItem;
    let iradius: number;
    if (typeof frameItem.radius !== 'undefined') {
      center = frameItem.position;
      iradius = Math.max(0, frameItem.radius - strokeW / 2);
      const innerPath = this.createInnerShape(center, iradius, style, this.shapeGuideAngle);
      if (innerPath) {
        innerPath.selected = false;
        scope.project.activeLayer.addChild(innerPath);
      }
      return;
    }
    const bounds = frameItem.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    const inset = strokeW * 1.5;
    const innerBounds = new scope.Rectangle(
      bounds.x + inset,
      bounds.y + inset,
      bounds.width - 2 * inset,
      bounds.height - 2 * inset,
    );
    if (innerBounds.width <= 0 || innerBounds.height <= 0) return;
    center = innerBounds.center;
    iradius = (Math.min(innerBounds.width, innerBounds.height) / 2) * 0.9;
    const innerPath = this.createInnerShape(center, iradius, style, this.shapeGuideAngle);
    if (innerPath) {
      innerPath.selected = false;
      scope.project.activeLayer.addChild(innerPath);
    }
  }

  rectCenterlineKC(): void {
    const scope = this.scope;
    if (this.shapeType === 'rectangle_centerline') {
      this.endShapeAsStroke();
      this.updateTextContent();
      return;
    }
    if (this.isDrawingShape) this.cancelCurrentDrawingOperation();
    if (!this.mousePt) return;
    this.shapeStartPoint = this.mousePt.clone();
    this.shapeType = 'rectangle_centerline';
    this.shapeWidth = this.lastCenterlineWidth;
    this.isDrawingShape = true;
    this.previewShape = null;
    this.previewPath = null;
    this.previewLine = new scope.Path({
      segments: [this.shapeStartPoint, this.shapeStartPoint],
      strokeColor: new scope.Color(0.5),
      strokeWidth: 1,
      strokeDasharray: [4, 4],
    });
    scope.project.activeLayer.addChild(this.previewLine);
    this.previewRect = new scope.Path({
      segments: [
        this.shapeStartPoint,
        this.shapeStartPoint,
        this.shapeStartPoint,
        this.shapeStartPoint,
      ],
      closed: true,
      strokeColor: this.globalStrokeColor,
      strokeWidth: this.globalStrokeWidth,
    });
    scope.project.activeLayer.addChild(this.previewRect);
    this.previewRect.strokeCap = 'round';
    this.previewRect.strokeJoin = 'round';
    this.updateTextContent();
    this.notify();
  }

  rectTwoEdgesKC(): void {
    const scope = this.scope;
    if (this.shapeType === 'rectangle_two_edges') {
      if (this.shapePt2 === null) {
        this.shapePt2 = this.mousePt.clone();
        if (this.previewPath) this.previewPath.add(this.shapePt2);
        this.previewLine.firstSegment.point = this.shapePt2;
        this.previewLine.lastSegment.point = this.shapePt2;
        const pt1 = this.shapeStartPoint;
        const pt2 = this.shapePt2;
        const pt3 = this.mousePt;
        const dir1 = pt2.subtract(pt1).normalize();
        const v2 = pt3.subtract(pt2);
        const perpVec = v2.subtract(dir1.multiply(v2.dot(dir1)));
        const ptC = pt2.add(perpVec);
        const ptD = pt1.add(perpVec);
        this.previewRect = new scope.Path({
          segments: [pt1, pt2, ptC, ptD],
          closed: true,
          strokeColor: this.globalStrokeColor,
          strokeWidth: this.globalStrokeWidth,
        });
        scope.project.activeLayer.addChild(this.previewRect);
        this.updateTextContent();
      } else {
        this.endShapeAsStroke();
      }
      return;
    }
    if (this.isDrawingShape || !this.mousePt) return;
    this.shapeStartPoint = this.mousePt.clone();
    this.shapeType = 'rectangle_two_edges';
    this.shapePt2 = null;
    this.isDrawingShape = true;
    this.previewPath = new scope.Path({
      segments: [this.shapeStartPoint],
      strokeColor: this.globalStrokeColor,
      strokeWidth: this.globalStrokeWidth,
    });
    scope.project.activeLayer.addChild(this.previewPath);
    this.previewLine = new scope.Path({
      segments: [this.shapeStartPoint, this.shapeStartPoint],
      strokeColor: new scope.Color(0.5),
      strokeWidth: 1,
      strokeDasharray: [4, 4],
    });
    scope.project.activeLayer.addChild(this.previewLine);
    this.updateTextContent();
    this.notify();
  }

  quadPointKC(): void {
    const scope = this.scope;
    if (!this.mousePt) return;
    if (!this.quadPath) {
      this.quadPath = new scope.Path({
        segments: [this.mousePt],
        strokeColor: this.globalStrokeColor,
        strokeWidth: this.globalStrokeWidth,
        fullySelected: true,
      });
      this.quadPointCount = 1;
      this.isDrawingQuad = true;
    } else {
      this.quadPath.add(this.mousePt);
      this.quadPointCount++;
      if (this.quadPointCount === 4) {
        this.applyCurrentStyles(this.quadPath);
        this.quadPath.closed = true;
        this.quadPath.selected = false;
        scope.project.activeLayer.addChild(this.quadPath);
        this.quadPath = null;
        this.isDrawingQuad = false;
        this.quadPointCount = 0;
        this.updateTextContent();
        this.notify();
        return;
      }
    }
    this.updateTextContent();
    this.notify();
  }

  stampCurrentPreview(): void {
    const scope = this.scope;
    if (this.isDrawingPath && this.path) {
      const stamped = this.path.clone();
      this.applyCurrentStyles(stamped);
      if (this.fillEnabled) stamped.closed = true;
      stamped.selected = false;
      stamped.strokeDasharray = null;
      stamped.opacity = 1;
      scope.project.activeLayer.addChild(stamped);
    } else if (this.isDrawingShape) {
      if (
        this.shapeType != null &&
        this.shapeType.startsWith('circle_') &&
        this.previewShape &&
        this.previewShape.radius > 0
      ) {
        const center = this.previewShape.position;
        const radius = this.previewShape.radius;
        const strokeW = this.strokeEnabled ? this.globalStrokeWidth : 0;
        const iradius = Math.max(0, radius - strokeW / 2);
        if (iradius > 0) {
          const stampedInner = this.createInnerShape(center, iradius, 'stroke', this.shapeGuideAngle);
          if (stampedInner) {
            this.applyCurrentStyles(stampedInner);
            stampedInner.selected = false;
            scope.project.activeLayer.addChild(stampedInner);
          }
        }
      } else {
        const framePreview = this.previewShape || this.previewRect || this.previewPath;
        if (framePreview) {
          const stampedFrame = framePreview.clone();
          this.applyCurrentStyles(stampedFrame);
          stampedFrame.strokeDasharray = null;
          stampedFrame.opacity = 1;
          stampedFrame.selected = false;
          scope.project.activeLayer.addChild(stampedFrame);
        }
        if (this.previewInner) {
          const stampedInner = this.previewInner.clone();
          stampedInner.strokeDasharray = null;
          stampedInner.opacity = 1;
          stampedInner.strokeColor = this.strokeEnabled ? this.globalStrokeColor : null;
          stampedInner.strokeWidth = this.strokeEnabled ? this.globalStrokeWidth * 0.7 : 0;
          stampedInner.fillColor = this.fillEnabled ? this.globalFillColor : null;
          stampedInner.strokeCap = 'round';
          stampedInner.strokeJoin = 'round';
          stampedInner.selected = false;
          scope.project.activeLayer.addChild(stampedInner);
        }
      }
    } else if (this.isDrawingQuad && this.quadPath) {
      const stamped = this.quadPath.clone();
      this.applyCurrentStyles(stamped);
      stamped.closed = true;
      stamped.selected = false;
      stamped.strokeDasharray = null;
      stamped.opacity = 1;
      scope.project.activeLayer.addChild(stamped);
    }
    this.updateTextContent();
  }

  endPathOrShape(): void {
    const scope = this.scope;
    if (this.isDrawingPath && this.path) {
      this.applyCurrentStyles(this.path);
      if (this.fillEnabled) this.path.closed = true;
      this.path.selected = false;
      scope.project.activeLayer.addChild(this.path);
      this.path = null;
      this.isDrawingPath = false;
    } else if (this.isDrawingShape) {
      this.endShapeAsStroke();
      if (this.previewInner) {
        this.previewInner.remove();
        this.previewInner = null;
      }
    } else if (this.isDrawingQuad && this.quadPath) {
      this.applyCurrentStyles(this.quadPath);
      this.quadPath.closed = true;
      this.quadPath.selected = false;
      scope.project.activeLayer.addChild(this.quadPath);
      this.quadPath = null;
      this.isDrawingQuad = false;
      this.quadPointCount = 0;
    }
    this.updateTextContent();
    this.notify();
  }

  polyLineKC(): void {
    const scope = this.scope;
    if (!this.mousePt) return;
    if (!this.path) {
      this.path = new scope.Path({
        segments: [this.mousePt],
        strokeColor: this.globalStrokeColor,
        strokeWidth: this.globalStrokeWidth,
        fullySelected: true,
      });
    } else {
      const newSegment = this.path.add(this.mousePt);
      if (newSegment) {
        newSegment.handleIn = new scope.Point(0, 0);
        newSegment.handleOut = new scope.Point(0, 0);
      }
    }
    if (this.isDrawingPath === false) this.isDrawingPath = true;
    this.updateTextContent();
    this.notify();
  }

  splinePointKC(): void {
    const scope = this.scope;
    if (!this.mousePt) return;
    if (!this.path) {
      this.path = new scope.Path({
        segments: [this.mousePt],
        strokeColor: this.globalStrokeColor,
        strokeWidth: this.globalStrokeWidth,
        fullySelected: true,
      });
    } else {
      const newSegment = this.path.add(this.mousePt);
      if (newSegment && this.path.segments.length >= 3) {
        const curr = this.path.segments[this.path.segments.length - 2];
        const next = newSegment;
        const p0 = this.path.segments[this.path.segments.length - 3].point;
        const p1 = curr.point;
        const p2 = next.point;
        const d01 = p1.subtract(p0);
        const d12 = p2.subtract(p1);
        next.handleIn = d12.multiply(this.splineTension * 0.5);
        curr.handleOut = d01.multiply(this.splineTension * 0.5);
        if (curr.handleIn) {
          curr.handleIn = curr.handleOut.multiply(-1);
        }
      }
    }
    if (this.isDrawingPath === false) this.isDrawingPath = true;
    this.updateTextContent();
    this.notify();
  }

  circleKC(mode: string): void {
    const scope = this.scope;
    if (this.shapeType != null && this.shapeType.startsWith('circle_')) {
      this.endShapeAsStroke();
      this.updateTextContent();
      return;
    }
    if (this.isDrawingShape || !this.mousePt) return;
    this.shapeStartPoint = this.mousePt.clone();
    this.shapeType = ('circle_' + mode) as ShapeType;
    this.isDrawingShape = true;
    this.previewShape = new scope.Shape.Circle(this.shapeStartPoint, 0);
    this.previewShape.strokeColor = new scope.Color(0.5);
    this.previewShape.strokeWidth = 1;
    this.previewShape.strokeDasharray = [4, 4];
    scope.project.activeLayer.addChild(this.previewShape);
    this.previewLine = new scope.Path({
      segments: [this.shapeStartPoint, this.shapeStartPoint],
      strokeColor: new scope.Color(0.5),
      strokeWidth: 1,
      strokeDashArray: [4, 4],
    });
    scope.project.activeLayer.addChild(this.previewLine);
    this.updateTextContent();
    this.notify();
  }

  rectDiagonalKC(): void {
    const scope = this.scope;
    if (this.shapeType === 'rectangle_diagonal') {
      this.endShapeAsStroke();
      this.updateTextContent();
      return;
    }
    if (this.isDrawingShape || !this.mousePt) return;
    this.shapeStartPoint = this.mousePt.clone();
    this.shapeType = 'rectangle_diagonal';
    this.isDrawingShape = true;
    this.previewShape = new scope.Shape.Rectangle(
      this.shapeStartPoint,
      new scope.Size(0, 0),
    );
    this.previewShape.strokeColor = this.globalStrokeColor;
    this.previewShape.strokeWidth = this.globalStrokeWidth;
    this.previewShape.strokeDasharray = [4, 4];
    scope.project.activeLayer.addChild(this.previewShape);
    this.previewLine = new scope.Path({
      segments: [this.shapeStartPoint, this.shapeStartPoint],
      strokeColor: new scope.Color(0.5),
      strokeWidth: 1,
      strokeDashArray: [4, 4],
    });
    scope.project.activeLayer.addChild(this.previewLine);
    this.updateTextContent();
    this.notify();
  }

  endShapeAsStroke(): void {
    const scope = this.scope;
    if (!this.isDrawingShape || this.shapeType === null) return;
    let finalPath: AnyItem = null;
    const shapeType = this.shapeType;
    if (shapeType.startsWith('circle_')) {
      if (!this.previewShape || this.previewShape.radius === 0) return;
      const center = this.previewShape.position;
      const radius = this.previewShape.radius;
      const strokeW = this.strokeEnabled ? this.globalStrokeWidth : 0;
      const iradius = Math.max(0, radius - strokeW / 2);
      if (iradius > 0) {
        const innerPath = this.createInnerShape(center, iradius, 'stroke', this.shapeGuideAngle);
        if (innerPath) {
          this.applyCurrentStyles(innerPath);
          innerPath.selected = false;
          scope.project.activeLayer.addChild(innerPath);
        }
      }
    } else if (shapeType === 'rectangle_diagonal') {
      finalPath = new scope.Path.Rectangle({
        center: this.previewShape.position,
        size: this.previewShape.size,
      });
      this.applyCurrentStyles(finalPath);
    } else if (shapeType === 'rectangle_two_edges') {
      const pt1 = this.shapeStartPoint;
      const pt2 = this.shapePt2;
      const pt3 = this.mousePt;
      const dir1 = pt2.subtract(pt1).normalize();
      const v2 = pt3.subtract(pt2);
      const perpVec = v2.subtract(dir1.multiply(v2.dot(dir1)));
      const ptC = pt2.add(perpVec);
      const ptD = pt1.add(perpVec);
      finalPath = new scope.Path({
        segments: [pt1, pt2, ptC, ptD],
        closed: true,
      });
      this.applyCurrentStyles(finalPath);
    } else if (shapeType === 'rectangle_centerline') {
      const pt1 = this.shapeStartPoint;
      const pt2 = this.mousePt;
      const center = pt1.add(pt2).divide(2);
      const dir = pt2.subtract(pt1);
      const halfLen = dir.length / 2;
      const unitDir = dir.normalize();
      const perp = new scope.Point(-unitDir.y, unitDir.x);
      const halfW = this.shapeWidth / 2;
      const ptA = center.add(unitDir.multiply(halfLen)).add(perp.multiply(halfW));
      const ptB = center.add(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW));
      const ptC = center.subtract(unitDir.multiply(halfLen)).add(perp.multiply(halfW));
      const ptD = center.subtract(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW));
      finalPath = new scope.Path({
        segments: [ptA, ptB, ptD, ptC],
        closed: true,
      });
      this.applyCurrentStyles(finalPath);
    }
    if (shapeType === 'rectangle_centerline') {
      this.lastCenterlineWidth = this.shapeWidth;
    }
    if (finalPath) {
      finalPath.selected = false;
      scope.project.activeLayer.addChild(finalPath);
      this.drawInnerShape(finalPath, 'stroke');
    }
    if (this.previewInner) {
      this.previewInner.remove();
      this.previewInner = null;
    }
    if (this.previewShape) this.previewShape.remove();
    if (this.previewLine) this.previewLine.remove();
    if (this.previewPath) {
      this.previewPath.remove();
      this.previewPath = null;
    }
    if (this.previewRect) {
      this.previewRect.remove();
      this.previewRect = null;
    }
    this.isDrawingShape = false;
    this.shapeType = null;
    this.shapeStartPoint = null;
    this.shapePt2 = null;
    this.previewShape = null;
    this.previewLine = null;
    this.updateTextContent();
    this.notify();
  }

  createRegularPolygon(
    center: AnyItem,
    radius: number,
    sides: number,
    rotationAngle = 0,
    radiusMode = 'circumradius',
  ): AnyItem {
    const scope = this.scope;
    const angleStep = (Math.PI * 2) / sides;
    const startAngle = (rotationAngle * Math.PI) / 180;
    let actualRadius: number;
    if (radiusMode === 'circumradius') {
      actualRadius = radius;
    } else {
      actualRadius = radius / Math.cos(Math.PI / sides);
    }
    const path = new scope.Path();
    for (let i = 0; i < sides; i++) {
      const angle = startAngle + i * angleStep;
      path.add(
        center.add(
          new scope.Point(Math.cos(angle) * actualRadius, Math.sin(angle) * actualRadius),
        ),
      );
    }
    if (radiusMode === 'inradius') {
      path.rotate(360 / sides / 2, center);
    }
    path.closed = true;
    return path;
  }

  supershapeRadius(
    phi: number,
    m: number,
    n1: number,
    n2: number,
    n3: number,
    a1 = 1,
    a2 = 1,
  ): number {
    const r1 = Math.pow(Math.abs(Math.cos((m * phi) / 4) / a1), n2);
    const r2 = Math.pow(Math.abs(Math.sin((m * phi) / 4) / a2), n3);
    const r = Math.pow(r1 + r2, -1 / n1);
    return r || 0;
  }

  createSupershape(
    center: AnyItem,
    radius: number,
    params: Record<string, number>,
    rotationAngle = 0,
  ): AnyItem {
    const scope = this.scope;
    const rotationRad = (rotationAngle * Math.PI) / 180;
    const path = new scope.Path();
    const steps = 360;
    const { m = 3, n1 = 0.2, n2 = 1.7, n3 = 1.7, a1 = 1, a2 = 1 } = params;
    for (let i = 0; i <= steps; i++) {
      const phi = (i / steps) * Math.PI * 2;
      const r = this.supershapeRadius(phi, m, n1, n2, n3, a1, a2);
      const scaledR = radius * (r || 0);
      path.add(
        new scope.Point(
          center.x + scaledR * Math.cos(phi + rotationRad),
          center.y + scaledR * Math.sin(phi + rotationRad),
        ),
      );
    }
    path.closed = true;
    path.strokeCap = 'round';
    path.strokeJoin = 'round';
    return path;
  }

  // --- Mouse (NibGliderApp.js) ---
  private onMouseDown(event: paper.MouseEvent): void {
    void event;
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad) return;
    this.hitTestUnderCursor();
  }

  hitTestUnderCursor(): void {
    const scope = this.scope;
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad) return;
    const self = this;
    let hitResult = scope.project.hitTest(this.mousePt, {
      segments: true,
      stroke: true,
      fill: true,
      tolerance: 5,
      match: (item: AnyItem) => {
        if (!item) return false;
        if (item === self.pathSnapCursor || item === self.gridCursor) return false;
        if (item.data && item.data.isUICursor) return false;
        return true;
      },
    });
    if (hitResult && hitResult.item) {
      if (
        hitResult.item === this.pathSnapCursor ||
        hitResult.item === this.gridCursor ||
        (hitResult.item.data && hitResult.item.data.isUICursor)
      ) {
        const wasPathSnapVisible = this.pathSnapCursor && this.pathSnapCursor.visible;
        const wasGridVisible = this.gridCursor && this.gridCursor.visible;
        if (this.pathSnapCursor) this.pathSnapCursor.visible = false;
        if (this.gridCursor) this.gridCursor.visible = false;
        hitResult = scope.project.hitTest(this.mousePt, {
          segments: true,
          stroke: true,
          fill: true,
          tolerance: 5,
        });
        if (this.pathSnapCursor) this.pathSnapCursor.visible = wasPathSnapVisible;
        if (this.gridCursor) this.gridCursor.visible = wasGridVisible;
        if (!hitResult || !hitResult.item) {
          this.clearOutSelection();
          this.updateTextContent();
          return;
        }
      }
      const alreadySelected = this.selectedItems.indexOf(hitResult.item) !== -1;
      if (alreadySelected) {
        hitResult.item.selected = false;
        this.selectedItems.splice(this.selectedItems.indexOf(hitResult.item), 1);
      } else {
        hitResult.item.selected = true;
        this.selectedItems.push(hitResult.item);
      }
    } else {
      this.clearOutSelection();
    }
    this.updateTextContent();
  }

  private onMouseMove(event: paper.MouseEvent): void {
    const originalPoint = event.point;
    this.mousePt = this.snapToGrid(event.point);
    if (this.isAngleSnappingEnabled) {
      if (this.isDrawingPath && this.path && this.path.segments.length > 0) {
        const baseIndex =
          this.path.segments.length === 1 ? 0 : this.path.segments.length - 2;
        this.mousePt = this.applyAngleSnapping(
          this.path.segments[baseIndex].point,
          this.mousePt,
        );
      } else if (
        this.isDrawingShape &&
        this.shapeType != null &&
        this.shapeType.startsWith('circle_') &&
        this.shapeStartPoint
      ) {
        this.mousePt = this.applyAngleSnapping(this.shapeStartPoint, this.mousePt);
      } else if (
        this.isDrawingShape &&
        this.shapeType != null &&
        this.shapeType.startsWith('rectangle_') &&
        this.shapeStartPoint
      ) {
        let rectBasePt = this.shapeStartPoint;
        if (this.shapeType === 'rectangle_two_edges' && this.shapePt2) {
          rectBasePt = this.shapePt2;
        }
        this.mousePt = this.applyAngleSnapping(rectBasePt, this.mousePt);
      }
    }
    this.applyPathSnapping(originalPoint);
    this.updateGridCursor();
    this.handleDragLock();
    if (this.isDrawingPath && this.path) {
      if (this.path.segments.length === 1) {
        this.path.add(this.mousePt);
      }
      if (this.path.segments.length > 1) {
        this.path.removeSegment(this.path.segments.length - 1);
        this.path.add(this.mousePt);
      }
    }
    if (this.isDrawingShape) this.updateShapePreview();
    if (this.isDrawingQuad && this.quadPath) {
      if (this.quadPath.segments.length === 1) {
        this.quadPath.add(this.mousePt);
      }
      if (this.quadPath.segments.length > 1) {
        this.quadPath.removeSegment(this.quadPath.segments.length - 1);
        this.quadPath.add(this.mousePt);
      }
    }
  }

  updateShapePreview(): void {
    const scope = this.scope;
    if (!this.isDrawingShape || !this.shapeStartPoint) return;
    // String-typed alias: the early-return branches below would otherwise
    // narrow this.shapeType and forbid the rectangle comparisons further down.
    const shapeType: string | null = this.shapeType;
    if (this.shapeType === 'rectangle_two_edges') {
      if (this.shapePt2 === null) {
        this.previewLine.firstSegment.point = this.shapeStartPoint;
        this.previewLine.lastSegment.point = this.mousePt;
        if (this.previewPath.segments.length > 1) {
          this.previewPath.removeSegment(1);
        }
        this.previewPath.add(this.mousePt);
      } else {
        this.previewLine.firstSegment.point = this.shapePt2;
        this.previewLine.lastSegment.point = this.mousePt;
        const pt1 = this.shapeStartPoint;
        const pt2 = this.shapePt2;
        const pt3 = this.mousePt;
        const dir1 = pt2.subtract(pt1).normalize();
        const v2 = pt3.subtract(pt2);
        const perpVec = v2.subtract(dir1.multiply(v2.dot(dir1)));
        const ptC = pt2.add(perpVec);
        const ptD = pt1.add(perpVec);
        this.previewRect.segments[0].point = pt1;
        this.previewRect.segments[1].point = pt2;
        this.previewRect.segments[2].point = ptC;
        this.previewRect.segments[3].point = ptD;
      }
      return;
    } else if (this.shapeType === 'rectangle_centerline') {
      const pt1 = this.shapeStartPoint;
      const pt2 = this.mousePt;
      this.previewLine.firstSegment.point = pt1;
      this.previewLine.lastSegment.point = pt2;
      const center = pt1.add(pt2).divide(2);
      const dir = pt2.subtract(pt1);
      const halfLen = dir.length / 2;
      const unitDir = dir.normalize();
      const perp = new scope.Point(-unitDir.y, unitDir.x);
      const halfW = this.shapeWidth / 2;
      const ptA = center.add(unitDir.multiply(halfLen)).add(perp.multiply(halfW));
      const ptB = center.add(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW));
      const ptC = center.subtract(unitDir.multiply(halfLen)).add(perp.multiply(halfW));
      const ptD = center.subtract(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW));
      this.previewRect.segments[0].point = ptA;
      this.previewRect.segments[1].point = ptB;
      this.previewRect.segments[2].point = ptD;
      this.previewRect.segments[3].point = ptC;
      return;
    }
    const endPt = this.mousePt;
    if (this.shapeType === 'circle_radius') {
      this.previewShape.position = this.shapeStartPoint;
      this.previewShape.radius = this.shapeStartPoint.getDistance(endPt);
      this.shapeGuideAngle = this.mousePt.subtract(this.previewShape.position).angle;
    } else if (this.shapeType === 'circle_diameter') {
      this.previewShape.position = this.shapeStartPoint.add(endPt).divide(2);
      this.previewShape.radius = this.shapeStartPoint.getDistance(endPt) / 2;
      this.shapeGuideAngle = this.mousePt.subtract(this.previewShape.position).angle;
    } else if (this.shapeType === 'rectangle_diagonal') {
      const dx = endPt.x - this.shapeStartPoint.x;
      const dy = endPt.y - this.shapeStartPoint.y;
      this.previewShape.position = this.shapeStartPoint.add(endPt).divide(2);
      this.previewShape.size = new scope.Size(Math.abs(dx), Math.abs(dy));
    }
    if (this.previewLine) {
      this.previewLine.firstSegment.point = this.shapeStartPoint;
      this.previewLine.lastSegment.point = endPt;
    }
    if (this.shapeType === 'rectangle_diagonal') return;
    if (this.previewInner) {
      this.previewInner.remove();
      this.previewInner = null;
    }
    if (this.isDrawingShape && this.innerShapeType !== 'none') {
      let framePreview: AnyItem = null;
      if (
        this.shapeType != null &&
        this.shapeType.startsWith('circle_') &&
        this.previewShape &&
        this.previewShape.radius > 0
      ) {
        const pradius = this.previewShape.radius - this.previewShape.strokeWidth / 2;
        if (pradius > 0) {
          this.previewInner = this.createInnerShape(
            this.previewShape.position,
            pradius,
            'preview',
            this.shapeGuideAngle,
          );
          if (this.previewInner) scope.project.activeLayer.addChild(this.previewInner);
        }
      } else if (
        shapeType === 'rectangle_centerline' ||
        (shapeType === 'rectangle_two_edges' && this.shapePt2 !== null)
      ) {
        framePreview = this.previewRect;
      } else if (this.previewShape) {
        framePreview = this.previewShape;
      }
      if (
        framePreview &&
        framePreview.bounds &&
        framePreview.bounds.width > 0 &&
        framePreview.bounds.height > 0
      ) {
        const inset = this.globalStrokeWidth * 1.5;
        const pBounds = new scope.Rectangle(
          framePreview.bounds.x + inset,
          framePreview.bounds.y + inset,
          framePreview.bounds.width - 2 * inset,
          framePreview.bounds.height - 2 * inset,
        );
        if (pBounds.width > 0 && pBounds.height > 0) {
          this.previewInner = this.createInnerShape(
            pBounds.center,
            (Math.min(pBounds.width, pBounds.height) / 2) * 0.9,
            'preview',
          );
          if (this.previewInner) scope.project.activeLayer.addChild(this.previewInner);
        }
      }
    }
  }

  private handleDragLock(): void {
    if (this.isInDragLock) {
      if (this.lastMousePt === null) this.lastMousePt = this.mousePt;
      const delta = this.mousePt.subtract(this.lastMousePt);
      for (let i = 0; i < this.selectedItems.length; i++) {
        this.selectedItems[i].position = this.selectedItems[i].position.add(delta);
      }
      this.lastMousePt = this.mousePt;
    } else {
      this.lastMousePt = null;
    }
  }

  private onMouseDrag(event: paper.MouseEvent): void {
    this.mousePt = this.snapToGrid(event.point);
    if (this.lastMousePt === null) this.lastMousePt = this.mousePt;
    const delta = this.mousePt.subtract(this.lastMousePt);
    for (let i = 0; i < this.selectedItems.length; i++) {
      this.selectedItems[i].position = this.selectedItems[i].position.add(delta);
    }
    this.lastMousePt = this.mousePt;
  }

  // --- Keyboard: the document keydown listener (NibGliderApp.js) ---
  // The legacy window.onKeyDown duplicate was never invoked (no InputManager),
  // so only this handler defines behavior.
  handleKeyDown(event: KeyboardEvent): void {
    const keyLower = event.key.toLowerCase();
    if (event.key === '[' || event.key === ']') {
      if (this.isDrawingShape && this.shapeType === 'rectangle_centerline') {
        if (event.key === '[') {
          this.shapeWidth = Math.max(1, (this.shapeWidth || this.globalStrokeWidth * 2) - 2);
        } else {
          this.shapeWidth = Math.min(this.maxShapeWidth, (this.shapeWidth || this.globalStrokeWidth * 2) + 2);
        }
        this.updateTextContent();
        this.updateShapePreview();
        this.notify();
        return;
      } else if (this.selectedItems.length > 0) {
        const center = this.collectiveCenter(this.selectedItems);
        for (let i = 0; i < this.selectedItems.length; i++) {
          if (event.key === '[') {
            this.selectedItems[i].scale(0.9, center);
          } else {
            this.selectedItems[i].scale(1.1, center);
          }
        }
        return;
      }
    }
    if (event.key === ';' || event.key === "'") {
      if (this.selectedItems.length > 0) {
        const center = this.collectiveCenter(this.selectedItems);
        const angle = event.key === ';' ? -10 : 10;
        for (let i = 0; i < this.selectedItems.length; i++) {
          this.selectedItems[i].rotate(angle, center);
        }
        return;
      }
    }
    if (event.key === ' ' && this.selectedItems.length > 0) {
      this.setIsInDragLock(!this.isInDragLock);
    }
    if (event.key === 'Backspace') {
      this.removeAllSelectedItemsAndReset();
    }
    if (event.key === 'Escape') {
      for (let i = 0; i < this.selectedItems.length; i++) {
        this.selectedItems[i].selected = false;
      }
      this.selectedItems = [];
      this.setIsInDragLock(false);
    }
    if (keyLower === 'w') {
      if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad) {
        this.stampCurrentPreview();
      } else {
        this.stampItems(this.selectedItems);
      }
    }
    if (keyLower === 'y') {
      this.rectCenterlineKC();
      return;
    }
    if (keyLower === 'i') {
      this.rectDiagonalKC();
      return;
    }
    if (keyLower === 'u') {
      this.rectTwoEdgesKC();
      return;
    }
    if (keyLower === 'f') {
      this.polyLineKC();
      return;
    }
    if (keyLower === 'g') {
      this.splinePointKC();
      return;
    }
    if (keyLower === 'n') {
      this.circleKC('diameter');
      return;
    }
    if (keyLower === 'm') {
      this.circleKC('radius');
      return;
    }
    if (keyLower === 'o') {
      this.quadPointKC();
      return;
    }
    if (this.isDrawingPath) {
      if (keyLower === 'j') {
        this.splineTension = Math.max(0.1, this.splineTension - 0.1);
        this.updateTextContent();
        this.notify();
        return;
      }
      if (keyLower === 'k') {
        this.splineTension = Math.min(1.0, this.splineTension + 0.1);
        this.updateTextContent();
        this.notify();
        return;
      }
      if (keyLower === 'l') {
        this.splineTension = this.splineTensionDefault;
        this.updateTextContent();
        this.notify();
        return;
      }
    }
    if (!this.isDrawingPath && keyLower === 'l') {
      this.toggleGrid();
      return;
    }
    if (keyLower === 'c') {
      this.thinStrokeWidth();
      if (this.selectedItems.length > 0) {
        for (let i = 0; i < this.selectedItems.length; i++) {
          if (this.selectedItems[i].strokeWidth !== undefined) {
            this.selectedItems[i].strokeWidth = Math.max(1, this.selectedItems[i].strokeWidth - 1);
          }
        }
      }
      return;
    }
    if (keyLower === 'v') {
      this.thickenStrokeWidth();
      if (this.selectedItems.length > 0) {
        for (let i = 0; i < this.selectedItems.length; i++) {
          if (this.selectedItems[i].strokeWidth !== undefined) {
            this.selectedItems[i].strokeWidth = Math.min(
              this.maxStrokeWidth,
              this.selectedItems[i].strokeWidth + 1,
            );
          }
        }
      }
      return;
    }
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad) {
      if (keyLower === 'r' || keyLower === 'e' || keyLower === 's' || keyLower === 'a') {
        this.endPathOrShape();
      }
    }
    if (!this.isDrawingPath && !this.isDrawingShape && !this.isDrawingQuad) {
      if (keyLower === 'r') {
        this.setStrokeEnabled(!this.strokeEnabled);
        this.updateTextContent();
        return;
      }
      if (keyLower === 't') {
        this.setFillEnabled(!this.fillEnabled);
        this.updateTextContent();
        return;
      }
    }
    if (event.key === 'q') {
      this.cancelCurrentDrawingOperation();
    }
    if (event.key === 'Escape') {
      this.cancelCurrentDrawingOperation();
    }
    if (event.key === 'Tab') {
      this.hitTestUnderCursor();
    }
    this.updateTextContent();
  }

  // --- Canvas status overlay (NibGliderApp.js updateTextContent) ---
  updateTextContent(): void {
    const lines: string[] = [];
    const selectedCount = this.selectedItems.length;
    if (this.isGridEnabled) {
      lines.push('Grid: ON (L to toggle)');
    }
    if (selectedCount) {
      lines.push('Selected Objects: ' + selectedCount);
      if (this.isInDragLock === false) {
        lines.push('Spacebar to begin Drag-Lock');
        lines.push('[ and ] to Scale, ; and \' to Rotate');
      }
    }
    if (this.isInDragLock) {
      lines.push('Drag-Lock On ');
      lines.push('Move mouse to drag all selected.  Spacebar to release.');
      lines.push('W to Stamp, [ and ] to Scale, ; and \' to Rotate');
    }
    let instruction = '';
    if (this.isDrawingPath) {
      lines.push('Drawing Path');
      instruction =
        'Move mouse to adjust path. \n F = sharp point, G = spline(tension:' +
        this.splineTension.toFixed(1) +
        ') ';
      instruction += '\nA = end, J/K = adjust tension';
    }
    if (this.isDrawingShape) {
      let shapeInfo = '';
      if (this.shapeType === 'circle_radius' || this.shapeType === 'circle_diameter') {
        const mode = this.shapeType === 'circle_radius' ? 'radius' : 'diameter';
        shapeInfo = 'Circle by (' + mode + ')';
      } else if (this.shapeType === 'rectangle_diagonal') {
        shapeInfo = 'Rectangle by Diagonal';
      } else if (this.shapeType === 'rectangle_two_edges') {
        shapeInfo = 'Rectangle by Two Edges';
      } else if (this.shapeType === 'rectangle_centerline') {
        shapeInfo = 'Rectangle by Centerline';
        lines.push('Width: ' + Math.round(this.shapeWidth) + 'pt');
      }
      lines.push(shapeInfo);
      if (this.shapeType != null && this.shapeType.startsWith('circle_')) {
        const finishKey = this.shapeType === 'circle_diameter' ? 'N' : 'M';
        instruction = `Press ${finishKey} to finish or W to stamp.`;
      } else if (this.shapeType === 'rectangle_diagonal') {
        instruction = 'Press I to finish or W to stamp.';
      } else if (this.shapeType === 'rectangle_two_edges') {
        if (this.shapePt2 === null) {
          instruction =
            '1. Move mouse to adjust this first edge. \n2. Press U again to start the second edge';
        } else {
          instruction =
            '1. Move mouse to adjust the second edge.\n2. Press U to finish or W to stamp.';
        }
      } else if (this.shapeType === 'rectangle_centerline') {
        instruction =
          "1. Move mouse to adjust the rectangle. \n'[': thin width, ']': thicken width, \nY: finish, W: stamp, Q: cancel";
      }
    }
    if (this.isDrawingQuad) {
      lines.push('Drawing Quadrilateral (' + this.quadPointCount + '/4)');
      instruction = 'Press O to add next point. Q: cancel';
    }
    if (instruction) {
      lines.push(instruction);
    }
    if (this.statusText) {
      this.statusText.justification = 'center';
      const centerX = this.scope.view.center.x;
      this.statusText.point = new this.scope.Point(centerX, 30);
      this.statusText.content = lines.join('\n');
    }
  }
}
