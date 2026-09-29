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

export type CircleInnerShape =
  | 'circle'
  | 'semicircle'
  | 'sector'
  | 'segment'
  | 'polygon'
  | 'supershape'
  | 'trapezoid'
  | 'parallelogram'
  | 'rightTriangle'
  | 'rhombus';

export type StrokeCap = 'butt' | 'round' | 'square';
export type StrokeJoin = 'miter' | 'round' | 'bevel';

export type GridType = 'square' | 'diamond';

export type RectangleInnerShape =
  | 'rectangle'
  | 'circle'
  | 'polygon'
  | 'supershape'
  | 'trapezoid'
  | 'parallelogram'
  | 'rightTriangle'
  | 'rhombus'
  | 'kite';

export interface InnerShapeParams {
  sides: number;
  m: number;
  n1: number;
  n2: number;
  n3: number;
  a1: number;
  a2: number;
  angle: number;
  sector: number;
}

export interface KeyActivity {
  code: string;
  active: boolean;
}

// Overlay schema: state lines (what is true) plus step lines (what to do
// next). Text runs render plain; key runs render as keycaps in the key's
// keyboard-group color.
export type StatusKeyGroup = 'circle' | 'rect' | 'quad' | 'op' | 'end' | 'neutral';
export type StatusRun =
  | { t: 'text'; s: string }
  | { t: 'key'; s: string; g: StatusKeyGroup };
export type StatusLine = {
  kind: 'title' | 'meta' | 'hint';
  runs: StatusRun[];
};
export interface StatusSchema {
  state: StatusLine[];
  steps: StatusLine[];
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
  globalStrokeCap: StrokeCap = 'butt';
  globalStrokeJoin: StrokeJoin = 'miter';
  globalMiterLimit = 10;
  globalDashLength = 0;
  globalGapLength = 0;
  strokeEnabled = true;
  fillEnabled = false;

  // --- Grid / cursors ---
  isGridEnabled = false;
  gridType: GridType = 'square';
  gridSpacing = 20;
  gridLayer: AnyItem = null;
  gridCursor: AnyItem = null;
  pathSnapCursor: AnyItem = null;

  // --- Snapping flags ---
  isGridSnappingEnabled = false;
  isPathSnappingEnabled = false;
  isAngleSnappingEnabled = false;
  isLengthSnappingEnabled = false;
  isAspectSnappingEnabled = false;
  aspectRatioA = 3;
  aspectRatioB = 4;

  // --- Inner shape config ---
  innerShapeType = 'polygon';
  innerShapeParams = {
    sides: 6,
    m: 3,
    n1: 0.2,
    n2: 1.7,
    n3: 1.7,
    angle: 60,
    sector: 90,
  };
  circleInnerShapeType: CircleInnerShape = 'polygon';
  circleInnerShapeParams: InnerShapeParams = {
    sides: 6,
    m: 3,
    n1: 0.2,
    n2: 1.7,
    n3: 1.7,
    a1: 1.0,
    a2: 1.0,
    angle: 60,
    sector: 90,
  };
  rectangleInnerShapeType: RectangleInnerShape = 'rectangle';
  // Orientation of the Rect Keys shape inside its frame, in 90° steps.
  rectangleOrientation = 0;
  rectangleInnerShapeParams: InnerShapeParams = {
    sides: 6,
    m: 3,
    n1: 0.2,
    n2: 1.7,
    n3: 1.7,
    a1: 1.0,
    a2: 1.0,
    angle: 60,
    sector: 90,
  };
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
  isPanning = false;
  minZoom = 0.1;
  maxZoom = 16;

  // --- Selection (selectionFunctions.js) ---
  selectedItems: AnyItem[] = [];
  isInDragLock = false;

  private statusSchema: StatusSchema = { state: [], steps: [] };
  private lastStatusKey = '';

  getStatusSchema(): StatusSchema {
    return this.statusSchema;
  }

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

    this.updateTextContent();

    scope.view.onMouseDown = (event: paper.MouseEvent) =>
      this.onMouseDown(event);
    scope.view.onMouseMove = (event: paper.MouseEvent) =>
      this.onMouseMove(event);
    scope.view.onMouseDrag = (event: paper.MouseEvent) =>
      this.onMouseDrag(event);
    scope.view.onMouseUp = () => this.endPan();

    const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code) this.onKeyActivity({ code: event.code, active: false });
    };
    const onHighlightDown = (event: KeyboardEvent) => {
      const keyLower = event.key.toLowerCase();
      if (keyLower === '/') return;
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
    const onWheel = (e: WheelEvent) => this.onMouseWheel(e);
    const onDocMouseUp = () => this.endPan();
    canvas.addEventListener('mousemove', onCanvasMove);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('mouseup', onDocMouseUp);

    this.detachFns.push(() => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keydown', onHighlightDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mouseup', onDocMouseUp);
      canvas.removeEventListener('mousemove', onCanvasMove);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('drop', onDrop);
      canvas.removeEventListener('wheel', onWheel);
      scope.view.onMouseDown = null;
      scope.view.onMouseMove = null;
      scope.view.onMouseDrag = null;
      scope.view.onMouseUp = null;
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
  // With a selection, paint setters apply to the selection only and leave
  // the globals alone (deselecting restores the global readout).
  // Otherwise they write the globals for subsequently drawn shapes.
  private applyToSelection(fn: (item: AnyItem) => void): void {
    for (let i = 0; i < this.selectedItems.length; i++) {
      fn(this.selectedItems[i]);
    }
  }

  setStrokeWidth(strokeVal: number): void {
    let v = strokeVal;
    if (v < 1) v = 1;
    if (v > this.maxStrokeWidth) v = this.maxStrokeWidth;
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        item.strokeWidth = v;
      });
    } else {
      this.globalStrokeWidth = v;
    }
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
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        item.strokeColor = colorVal;
        if (!(item.strokeWidth > 0)) item.strokeWidth = this.globalStrokeWidth;
      });
    } else {
      this.globalStrokeColor = colorVal;
    }
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  setStrokeCap(cap: StrokeCap): void {
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        item.strokeCap = cap;
      });
    } else {
      this.globalStrokeCap = cap;
    }
    this.updateCurrentDrawingStyles();
    this.notify();
  }

  setStrokeJoin(join: StrokeJoin): void {
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        item.strokeJoin = join;
      });
    } else {
      this.globalStrokeJoin = join;
    }
    this.updateCurrentDrawingStyles();
    this.notify();
  }

  setMiterLimit(limit: number): void {
    let v = limit;
    if (!(v >= 1)) v = 1;
    if (v > 40) v = 40;
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        item.miterLimit = v;
      });
    } else {
      this.globalMiterLimit = v;
    }
    this.updateCurrentDrawingStyles();
    this.notify();
  }

  private clampDash(n: number): number {
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > 80) return 80;
    return n;
  }

  strokeDashArrayValue(dash = this.globalDashLength, gap = this.globalGapLength): number[] | null {
    const d = this.clampDash(dash);
    const g = this.clampDash(gap);
    if (d <= 0 && g <= 0) return null;
    return [d, g];
  }

  applyStrokeDash(item: AnyItem, dash?: number, gap?: number): void {
    if (!item) return;
    const arr = this.strokeDashArrayValue(
      dash ?? this.globalDashLength,
      gap ?? this.globalGapLength,
    );
    item.dashArray = arr ? arr.slice() : [];
    item.strokeDashArray = arr;
    item.strokeDasharray = arr;
  }

  setStrokeDash(dash: number, gap: number): void {
    const d = this.clampDash(dash);
    const g = this.clampDash(gap);
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        this.applyStrokeDash(item, d, g);
      });
    } else {
      this.globalDashLength = d;
      this.globalGapLength = g;
    }
    this.updateCurrentDrawingStyles();
    this.notify();
  }

  setFillColor(colorVal: string): void {
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        item.fillColor = colorVal;
      });
    } else {
      this.globalFillColor = colorVal;
    }
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  setStrokeEnabled(enabled: boolean): void {
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        if (enabled) {
          if (!item.strokeColor) item.strokeColor = this.globalStrokeColor;
          if (!(item.strokeWidth > 0)) item.strokeWidth = this.globalStrokeWidth;
        } else {
          item.strokeColor = null;
        }
      });
    } else {
      this.strokeEnabled = enabled;
      if (!this.strokeEnabled && !this.fillEnabled) this.fillEnabled = true;
    }
    this.updateCurrentDrawingStyles();
    this.notify();
  }

  setFillEnabled(enabled: boolean): void {
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        if (enabled) {
          if (!item.fillColor) item.fillColor = this.globalFillColor;
        } else {
          item.fillColor = null;
        }
      });
    } else {
      this.fillEnabled = enabled;
      if (!this.fillEnabled && !this.strokeEnabled) this.strokeEnabled = true;
    }
    this.updateCurrentDrawingStyles();
    this.notify();
  }

  setGridSnappingEnabled(v: boolean): void {
    this.isGridSnappingEnabled = v;
    this.updateGridCursor();
    this.updateTextContent();
    this.notify();
  }

  setGridEnabled(v: boolean): void {
    this.isGridEnabled = v;
    if (this.isGridEnabled) {
      this.drawGrid();
    } else {
      this.clearGrid();
    }
    this.updateGridCursor();
    this.updateTextContent();
    this.notify();
  }

  setGridType(t: GridType): void {
    if (t !== 'square' && t !== 'diamond') return;
    this.gridType = t;
    if (this.isGridEnabled) this.drawGrid();
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

  setAspectSnappingEnabled(v: boolean): void {
    this.isAspectSnappingEnabled = v;
    this.updateTextContent();
    this.notify();
  }

  setAspectRatioKey(key: string): void {
    const parts = key.split(':');
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!(a > 0) || !(b > 0)) return;
    this.aspectRatioA = a;
    this.aspectRatioB = b;
    this.updateTextContent();
    this.notify();
  }

  aspectRatioKey(): string {
    return `${this.aspectRatioA}:${this.aspectRatioB}`;
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

  setRectangleInnerShapeType(t: RectangleInnerShape): void {
    this.rectangleInnerShapeType = t;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setRectangleOrientation(o: number): void {
    const v = Number.isFinite(o) ? Math.round(o) : 0;
    this.rectangleOrientation = ((v % 4) + 4) % 4;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setRectangleSides(sides: number): void {
    this.rectangleInnerShapeParams.sides = sides;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setRectangleSupershapeParam(key: keyof InnerShapeParams, val: number): void {
    this.rectangleInnerShapeParams[key] = val;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setCircleAngle(deg: number): void {
    this.circleInnerShapeParams.angle = this.clampShapeAngle(deg);
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setCircleSector(deg: number): void {
    this.circleInnerShapeParams.sector = this.clampSectorAngle(deg);
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setRectangleAngle(deg: number): void {
    this.rectangleInnerShapeParams.angle = this.clampShapeAngle(deg);
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  // Parallelogram / trapezoid interior angle. 180° is a line; keep a
  // usable wedge on either side of 90°.
  clampShapeAngle(deg: number): number {
    if (!Number.isFinite(deg)) return 60;
    return Math.max(10, Math.min(170, deg));
  }

  clampSectorAngle(deg: number): number {
    if (!Number.isFinite(deg)) return 90;
    return Math.max(10, Math.min(350, deg));
  }

  // Horizontal shear (as a fraction of the bottom edge) that makes the
  // interior angle at the bottom-left of the u/v frame equal `angleDeg`.
  private frameAngleShear(u: AnyItem, v: AnyItem, angleDeg: number): number {
    const θ = this.clampShapeAngle(angleDeg) * (Math.PI / 180);
    const lenU = u.length;
    if (!(lenU > 0)) return 0;
    return (v.length / lenU) * (Math.cos(θ) / Math.sin(θ));
  }

  // Rotate (s, t) frame coords about the frame center by
  // rectangleOrientation * 90°. The unit square maps onto itself, so an
  // oriented shape still fits inside the frame bounds.
  private rotST(s: number, t: number): [number, number] {
    const o = ((this.rectangleOrientation % 4) + 4) % 4;
    if (o === 1) return [1 - t, s];
    if (o === 2) return [1 - s, 1 - t];
    if (o === 3) return [t, 1 - s];
    return [s, t];
  }

  // Shear for a square frame (the panel preview well): cot of the
  // clamped interior angle.
  private squareShear(angleDeg: number): number {
    const θ = this.clampShapeAngle(angleDeg) * (Math.PI / 180);
    return Math.cos(θ) / Math.max(Math.sin(θ), 1e-6);
  }

  // Canonical (s, t) quads for the frame-fitted shapes, shared by the
  // canvas draw and the Rect Keys preview so both show the same vertex
  // layout. Every vertex stays in [0, 1]: fixed height, shear varies.
  // The canvas passes the aspect-correct frameAngleShear; the square
  // preview well passes squareShear.
  private trapezoidFrameST(shear: number): Array<[number, number]> {
    const inset = Math.max(-0.49, Math.min(0.49, shear));
    return [
      [inset, 0],
      [1 - inset, 0],
      [1, 1],
      [0, 1],
    ];
  }

  private parallelogramFrameST(shear: number): Array<[number, number]> {
    const k = Math.max(-0.9, Math.min(0.9, shear));
    return k >= 0
      ? [
          [0, 1],
          [1 - k, 1],
          [1, 0],
          [k, 0],
        ]
      : [
          [-k, 1],
          [1, 1],
          [1 + k, 0],
          [0, 0],
        ];
  }

  toggleGrid(): void {
    this.setGridEnabled(!this.isGridEnabled);
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
  applyStrokeGeometry(item: AnyItem): void {
    if (!item) return;
    item.strokeCap = this.globalStrokeCap;
    item.strokeJoin = this.globalStrokeJoin;
    item.miterLimit = this.globalMiterLimit;
  }

  applyCurrentStyles(item: AnyItem): void {
    if (!item) return;
    item.strokeColor = this.strokeEnabled ? this.globalStrokeColor : null;
    item.strokeWidth = this.strokeEnabled ? this.globalStrokeWidth : 0;
    item.fillColor = this.fillEnabled ? this.globalFillColor : null;
    this.applyStrokeGeometry(item);
    this.applyStrokeDash(item);
  }

  updateCurrentDrawingStyles(): void {
    const strokeWidth = this.strokeEnabled ? this.globalStrokeWidth : 0;
    const strokeColor = this.strokeEnabled ? this.globalStrokeColor : null;
    const fillColor = this.fillEnabled ? this.globalFillColor : null;
    [
      this.path,
      this.previewShape,
      this.quadPath,
      this.previewPath,
      this.previewRect,
      this.previewInner,
    ].forEach((item) => {
      if (item) {
        item.strokeWidth = strokeWidth;
        item.strokeColor = strokeColor;
        item.fillColor = fillColor;
        this.applyStrokeGeometry(item);
      }
    });
    if (this.path) this.applyStrokeDash(this.path);
    if (this.isDrawingShape) this.updateShapePreview();
  }

  innerShapePreviewPath(
    type: string,
    params: InnerShapeParams,
    previewFrame: 'circle' | 'rect' = 'circle',
  ): string {
    const radius = 0.9;
    const steps = 72;
    const f = (x: number, y: number): string =>
      `${x.toFixed(3)},${y.toFixed(3)} `;
    if (type === 'circle') {
      return (
        `M ${radius},0 A ${radius},${radius} 0 1,1 ${-radius},0 ` +
        `A ${radius},${radius} 0 1,1 ${radius},0 Z`
      );
    }
    if (type === 'sector' || type === 'semicircle' || type === 'segment') {
      const sweep =
        type === 'semicircle' ? 180 : this.clampSectorAngle(params.sector);
      return type === 'segment'
        ? this.segmentPreviewPath(radius, sweep)
        : this.sectorPreviewPath(radius, sweep);
    }
    if (type === 'rectangle') {
      const h = radius * 0.7;
      return `M ${f(-h, -h)}L ${f(h, -h)}L ${f(h, h)}L ${f(-h, h)}Z`;
    }
    if (previewFrame === 'rect') {
      // Rect Keys preview: the frame-fitted layout in the square well, so
      // the height never rescales with the angle slider — only the shear
      // varies. Oriented the same way as the canvas draw via rotST.
      const e = radius;
      const w = (s: number, t: number): [number, number] => {
        const [rs, rt] = this.rotST(s, t);
        return [-e + 2 * e * rs, -e + 2 * e * rt];
      };
      let quad: Array<[number, number]> | null = null;
      if (type === 'rightTriangle') {
        // Legs along the left and bottom of the well; 90° at bottom-left.
        quad = [
          [0, 1],
          [1, 1],
          [0, 0],
        ];
      } else if (type === 'trapezoid') {
        quad = this.trapezoidFrameST(this.squareShear(params.angle));
      } else if (type === 'parallelogram') {
        quad = this.parallelogramFrameST(this.squareShear(params.angle));
      }
      if (quad) {
        let d = 'M ';
        for (const [s, t] of quad) {
          const [x, y] = w(s, t);
          d += f(x, y);
        }
        return d + 'Z';
      }
    }
    const circumPts = this.circleInnerShapeUnitPoints(type, params.angle);
    if (circumPts) {
      let d = 'M ';
      for (const [x, y] of circumPts) {
        const [rx, ry] =
          previewFrame === 'rect' ? this.rotWell(x, y) : [x, y];
        d += f(radius * rx, radius * ry);
      }
      return d + 'Z';
    }
    if (type === 'polygon') {
      const sides = params.sides || 6;
      const angleStep = (Math.PI * 2) / sides;
      let d = 'M ';
      for (let i = 0; i < sides; i++) {
        const angle = angleStep * i;
        const [rx, ry] =
          previewFrame === 'rect'
            ? this.rotWell(Math.cos(angle), Math.sin(angle))
            : [Math.cos(angle), Math.sin(angle)];
        d += f(radius * rx, radius * ry);
      }
      return d + 'Z';
    }
    if (type === 'supershape') {
      const { m = 5, n1 = 0.2, n2 = 1.7, n3 = 1.7, a1 = 1, a2 = 1 } = params;
      let d = 'M ';
      for (let i = 0; i <= steps; i++) {
        const phi = (i / steps) * Math.PI * 2;
        const r = this.supershapeRadius(phi, m, n1, n2, n3, a1, a2);
        const scaledR = radius * (r || 0);
        const [rx, ry] =
          previewFrame === 'rect'
            ? this.rotWell(Math.cos(phi), Math.sin(phi))
            : [Math.cos(phi), Math.sin(phi)];
        d += f(scaledR * rx, scaledR * ry);
      }
      return d + 'Z';
    }
    return 'M 0,0';
  }

  // Rotate a preview-well point about the well center, mirroring rotST.
  private rotWell(x: number, y: number): [number, number] {
    const o = ((this.rectangleOrientation % 4) + 4) % 4;
    if (o === 1) return [-y, x];
    if (o === 2) return [-x, -y];
    if (o === 3) return [y, -x];
    return [x, y];
  }

  updatePreviewBox(): void {
    const circleSvg = document.getElementById('shapePreviewPath');
    if (circleSvg) {
      circleSvg.setAttribute(
        'd',
        this.innerShapePreviewPath(
          this.circleInnerShapeType,
          this.circleInnerShapeParams,
        ),
      );
    }
    const rectSvg = document.getElementById('rectShapePreviewPath');
    if (rectSvg) {
      rectSvg.setAttribute(
        'd',
        this.innerShapePreviewPath(
          this.rectangleInnerShapeType,
          this.rectangleInnerShapeParams,
          'rect',
        ),
      );
    }
  }

  // --- Grid (drawingProperties.js) ---
  // Dots, not lines: one small low-alpha dot per lattice point. Diamond is
  // the square lattice rotated 45° with the same neighbor spacing, so snap
  // targets coincide with the rendered dots (see snapToGrid).
  drawGrid(): void {
    const scope = this.scope;
    const active = scope.project.activeLayer;
    if (!this.gridLayer) {
      this.gridLayer = new scope.Layer();
      this.gridLayer.name = 'gridLayer';
      this.gridLayer.locked = true;
      scope.project.addLayer(this.gridLayer);
    }
    this.gridLayer.activate();
    this.gridLayer.removeChildren();
    const viewBounds = scope.view.bounds;
    const s = this.gridSpacing;
    const radius = 1.5 / (scope.view.zoom || 1);
    const dotColor = new scope.Color(0.55, 0.62, 0.72, 0.55);
    const addDot = (x: number, y: number): void => {
      const dot: AnyItem = new scope.Shape.Circle(new scope.Point(x, y), radius);
      dot.fillColor = dotColor;
      dot.strokeColor = null;
      dot.locked = true;
      dot.selectable = false;
      this.gridLayer.addChild(dot);
    };
    if (this.gridType === 'diamond') {
      // Basis e1=(d,d), e2=(d,-d) with d=s/sqrt(2): neighbors are s apart.
      const d = s / Math.SQRT2;
      const step = s * Math.SQRT2;
      const minX = viewBounds.x;
      const maxX = viewBounds.x + viewBounds.width;
      const minY = viewBounds.y;
      const maxY = viewBounds.y + viewBounds.height;
      const iMin = Math.floor((minX + minY) / step);
      const iMax = Math.ceil((maxX + maxY) / step);
      const jMin = Math.floor((minX - maxY) / step);
      const jMax = Math.ceil((maxX - minY) / step);
      for (let i = iMin; i <= iMax; i++) {
        for (let j = jMin; j <= jMax; j++) {
          addDot((i + j) * d, (i - j) * d);
        }
      }
    } else {
      const startX = Math.floor(viewBounds.x / s) * s;
      const endX = Math.ceil((viewBounds.x + viewBounds.width) / s) * s;
      const startY = Math.floor(viewBounds.y / s) * s;
      const endY = Math.ceil((viewBounds.y + viewBounds.height) / s) * s;
      for (let x = startX; x <= endX; x += s) {
        for (let y = startY; y <= endY; y += s) {
          addDot(x, y);
        }
      }
    }
    this.gridLayer.sendToBack();
    if (active && active !== this.gridLayer) active.activate();
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
    const s = this.gridSpacing;
    if (this.gridType === 'diamond') {
      const d = s / Math.SQRT2;
      const step = s * Math.SQRT2;
      const i = Math.round((point.x + point.y) / step);
      const j = Math.round((point.x - point.y) / step);
      return new scope.Point((i + j) * d, (i - j) * d);
    }
    return new scope.Point(
      Math.round(point.x / s) * s,
      Math.round(point.y / s) * s,
    );
  }

  updateGridCursor(): void {
    const scope = this.scope;
    // The red dot is a snap indicator, not a grid-visible indicator: it
    // shows only while grid snapping is on (and the grid itself is shown).
    if (!this.isGridEnabled || !this.isGridSnappingEnabled) {
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

  // Ordered pair of the configured ratio, smaller first. 3:4 and 4:3 share
  // {lo:3, hi:4}; orientation is chosen from the live width vs height.
  private aspectWH(): { w: number; h: number } {
    return {
      w: Math.abs(this.aspectRatioA) || 1,
      h: Math.abs(this.aspectRatioB) || 1,
    };
  }

  // Snap the second side so first:second matches the selected A:B ratio.
  private snapAspectSecond(first: number, second: number): number {
    if (!(first > 0)) return second;
    const { w, h } = this.aspectWH();
    return first * (h / w);
  }

  // Axis-aligned opposite corner: width:height stays the selected A:B.
  applyAspectSnapping(basePoint: AnyItem, targetPoint: AnyItem): AnyItem {
    const scope = this.scope;
    if (!this.isAspectSnappingEnabled || !basePoint || !targetPoint) {
      return targetPoint;
    }
    const dx = targetPoint.x - basePoint.x;
    const dy = targetPoint.y - basePoint.y;
    if (dx === 0 && dy === 0) return targetPoint;
    const { w: aw, h: ah } = this.aspectWH();
    const sx = dx === 0 ? 1 : Math.sign(dx);
    const sy = dy === 0 ? 1 : Math.sign(dy);
    const k = Math.max(Math.abs(dx) / aw, Math.abs(dy) / ah);
    return new scope.Point(basePoint.x + sx * aw * k, basePoint.y + sy * ah * k);
  }

  private centerlineWidthForLength(length: number): number {
    if (!this.isAspectSnappingEnabled) return this.shapeWidth;
    return this.snapAspectSecond(length, this.shapeWidth);
  }

  private liveRectAspectLabel(): string | null {
    if (!this.isAspectSnappingEnabled) return null;
    if (this.shapeType == null || !this.shapeType.startsWith('rectangle_')) {
      return null;
    }
    const { w, h } = this.aspectWH();
    return `${w}:${h}`;
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
    this.updateTextContent();
    this.notify();
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

  hasSelection(): boolean {
    return this.selectedItems.length > 0;
  }

  private itemHexColor(c: AnyItem): string | null {
    if (!c) return null;
    if (typeof c === 'string') return c;
    if (typeof c.toCSS === 'function') {
      try {
        return c.toCSS(true);
      } catch {
        return null;
      }
    }
    return null;
  }

  // Paint of the selection for the Stroke/Fill panels: the first selected
  // item's values, falling back to the globals where the item has none.
  // Null when nothing is selected (panels show the globals instead).
  selectionPaint(): {
    strokeOn: boolean;
    strokeColor: string;
    strokeWidth: number;
    strokeCap: StrokeCap;
    strokeJoin: StrokeJoin;
    miterLimit: number;
    dashLength: number;
    gapLength: number;
    fillOn: boolean;
    fillColor: string;
  } | null {
    if (this.selectedItems.length === 0) return null;
    const it = this.selectedItems[0];
    const sc = this.itemHexColor(it.strokeColor);
    const fc = this.itemHexColor(it.fillColor);
    const cap: StrokeCap =
      it.strokeCap === 'butt' || it.strokeCap === 'square'
        ? it.strokeCap
        : 'round';
    const join: StrokeJoin =
      it.strokeJoin === 'miter' || it.strokeJoin === 'bevel'
        ? it.strokeJoin
        : 'round';
    const w = Number(it.strokeWidth);
    const m = Number(it.miterLimit);
    const da = it.dashArray || it.strokeDashArray || it.strokeDasharray;
    let dashLength = 0;
    let gapLength = 0;
    if (Array.isArray(da) && da.length) {
      dashLength = Number(da[0]) || 0;
      gapLength = da.length > 1 ? Number(da[1]) || 0 : dashLength;
    }
    return {
      strokeOn: sc !== null,
      strokeColor: sc ?? this.globalStrokeColor,
      strokeWidth: Number.isFinite(w) && w > 0 ? w : this.globalStrokeWidth,
      strokeCap: cap,
      strokeJoin: join,
      miterLimit: Number.isFinite(m) && m >= 1 ? m : this.globalMiterLimit,
      dashLength,
      gapLength,
      fillOn: fc !== null,
      fillColor: fc ?? this.globalFillColor,
    };
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

  // Canonical vertices for trapezoid / parallelogram / right triangle /
  // rhombus, scaled so the farthest vertex sits on the unit circle (the
  // same circumradius convention as a regular polygon). Trapezoid and
  // right triangle are cyclic (every vertex on the circle); parallelogram
  // and rhombus keep their proportions, so only the long-diagonal vertices
  // land on the circle. `angleDeg` is the interior angle (10–170).
  circleInnerShapeUnitPoints(
    type: string,
    angleDeg = 60,
  ): Array<[number, number]> | null {
    const circum = (
      pts: Array<[number, number]>,
    ): Array<[number, number]> => {
      let maxR = 0;
      for (const [x, y] of pts) {
        const r = Math.hypot(x, y);
        if (r > maxR) maxR = r;
      }
      if (!(maxR > 0)) return pts;
      return pts.map(([x, y]) => [x / maxR, y / maxR]);
    };
    switch (type) {
      case 'rightTriangle':
      case 'rightTriangleB':
        // Thales: hypotenuse is the diameter; right angle at (0, -1).
        return [
          [-1, 0],
          [1, 0],
          [0, -1],
        ];
      case 'trapezoid':
        return this.trapezoidUnitPoints(angleDeg);
      case 'parallelogram':
        return circum(this.parallelogramUnitPoints(angleDeg));
      case 'rhombus':
        return circum([
          [0, -0.9],
          [0.7, 0],
          [0, 0.9],
          [-0.7, 0],
        ]);
      case 'kite':
        // Two pairs of adjacent equal sides; cross-bar closer to the top.
        return circum([
          [0, -1],
          [1, -1 / 3],
          [0, 1],
          [-1, -1 / 3],
        ]);
      default:
        return null;
    }
  }

  private trapezoidUnitPoints(angleDeg: number): Array<[number, number]> {
    const θ = this.clampShapeAngle(angleDeg) * (Math.PI / 180);
    const cos = Math.cos(θ);
    const sin = Math.max(Math.sin(θ), 1e-6);
    const bottomHalf = 1;
    const topHalf = 1 - cos;
    const h = sin;
    const yb = h / 2;
    const yt = -h / 2;
    const cy = (bottomHalf * bottomHalf - topHalf * topHalf) / (2 * h);
    const R = Math.hypot(bottomHalf, yb - cy) || 1;
    return [
      [-topHalf / R, (yt - cy) / R],
      [topHalf / R, (yt - cy) / R],
      [bottomHalf / R, (yb - cy) / R],
      [-bottomHalf / R, (yb - cy) / R],
    ];
  }

  private parallelogramUnitPoints(angleDeg: number): Array<[number, number]> {
    const θ = this.clampShapeAngle(angleDeg) * (Math.PI / 180);
    const c = Math.cos(θ);
    const s = Math.sin(θ);
    return [
      [-0.5 - 0.5 * c, 0.5 * s],
      [0.5 - 0.5 * c, 0.5 * s],
      [0.5 + 0.5 * c, -0.5 * s],
      [-0.5 + 0.5 * c, -0.5 * s],
    ];
  }

  createCircumShape(
    center: AnyItem,
    radius: number,
    unitPoints: Array<[number, number]>,
    rotationAngle = 0,
  ): AnyItem {
    const scope = this.scope;
    const rot = (rotationAngle * Math.PI) / 180;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const path = new scope.Path();
    for (const [x, y] of unitPoints) {
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      path.add(center.add(new scope.Point(rx * radius, ry * radius)));
    }
    path.closed = true;
    return path;
  }

  sectorPreviewPath(radius: number, sweepDeg: number): string {
    const sweep = this.clampSectorAngle(sweepDeg);
    const a = (sweep * Math.PI) / 180;
    const x2 = radius * Math.cos(a);
    const y2 = radius * Math.sin(a);
    const large = sweep > 180 ? 1 : 0;
    return (
      `M 0,0 L ${radius.toFixed(3)},0 ` +
      `A ${radius.toFixed(3)},${radius.toFixed(3)} 0 ${large},1 ` +
      `${x2.toFixed(3)},${y2.toFixed(3)} Z`
    );
  }

  createSectorShape(
    center: AnyItem,
    radius: number,
    sweepDeg: number,
    rotationAngle = 0,
  ): AnyItem {
    const scope = this.scope;
    const sweep = this.clampSectorAngle(sweepDeg);
    const start = (rotationAngle * Math.PI) / 180;
    const end = start + (sweep * Math.PI) / 180;
    const mid = (start + end) / 2;
    const pt = (ang: number): AnyItem =>
      center.add(new scope.Point(Math.cos(ang) * radius, Math.sin(ang) * radius));
    const path = new scope.Path();
    path.moveTo(center);
    path.lineTo(pt(start));
    path.arcTo(pt(mid), pt(end));
    path.closed = true;
    return path;
  }

  segmentPreviewPath(radius: number, sweepDeg: number): string {
    const sweep = this.clampSectorAngle(sweepDeg);
    const a = (sweep * Math.PI) / 180;
    const x2 = radius * Math.cos(a);
    const y2 = radius * Math.sin(a);
    const large = sweep > 180 ? 1 : 0;
    return (
      `M ${radius.toFixed(3)},0 ` +
      `A ${radius.toFixed(3)},${radius.toFixed(3)} 0 ${large},1 ` +
      `${x2.toFixed(3)},${y2.toFixed(3)} Z`
    );
  }

  createSegmentShape(
    center: AnyItem,
    radius: number,
    sweepDeg: number,
    rotationAngle = 0,
  ): AnyItem {
    const scope = this.scope;
    const sweep = this.clampSectorAngle(sweepDeg);
    const start = (rotationAngle * Math.PI) / 180;
    const end = start + (sweep * Math.PI) / 180;
    const mid = (start + end) / 2;
    const pt = (ang: number): AnyItem =>
      center.add(new scope.Point(Math.cos(ang) * radius, Math.sin(ang) * radius));
    const path = new scope.Path();
    path.moveTo(pt(start));
    path.arcTo(pt(mid), pt(end));
    path.closed = true;
    return path;
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
        ? (this.rectangleInnerShapeParams as unknown as Record<string, number>)
        : (this.innerShapeParams as Record<string, number>);
    switch (currentInnerType) {
      case 'circle':
        path = new scope.Path.Circle(center, radius);
        break;
      case 'sector':
      case 'semicircle':
      case 'segment': {
        const sweep =
          currentInnerType === 'semicircle'
            ? 180
            : this.clampSectorAngle(currentInnerParams['sector']);
        path =
          currentInnerType === 'segment'
            ? this.createSegmentShape(center, radius, sweep, rotationAngle)
            : this.createSectorShape(center, radius, sweep, rotationAngle);
        if (this.shapeType === 'circle_diameter') {
          path.rotate(180, center);
        }
        break;
      }
      case 'rectangle':
        path = new scope.Path.Rectangle({
          center,
          size: new scope.Size(radius * 1.4, radius * 1.4),
        });
        break;
      case 'rightTriangle':
      case 'rightTriangleB':
      case 'trapezoid':
      case 'parallelogram':
      case 'rhombus':
      case 'kite': {
        const unit = this.circleInnerShapeUnitPoints(
          currentInnerType,
          currentInnerParams['angle'],
        );
        if (unit) {
          path = this.createCircumShape(center, radius, unit, rotationAngle);
        }
        break;
      }
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
        this.applyStrokeDash(path);
      }
      this.applyStrokeGeometry(path);
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
      this.quadPath
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

  // --- Rect-frame shapes: the selected Rect Keys shape fitted to the rect
  // frame itself (not a centered inscribed circle). The frame is described
  // by an origin corner plus full-edge vectors: P(s, t) = o + u*s + v*t.

  private rectFrameBasis(): { o: AnyItem; u: AnyItem; v: AnyItem } | null {
    const scope = this.scope;
    const shapeType = this.shapeType;
    if (shapeType === 'rectangle_diagonal') {
      // Origin at the drag start corner; u/v follow the mouse so the
      // inner shape mirrors when the diagonal crosses into another quadrant.
      if (!this.shapeStartPoint || !this.mousePt) return null;
      const dx = this.mousePt.x - this.shapeStartPoint.x;
      const dy = this.mousePt.y - this.shapeStartPoint.y;
      if (dx === 0 || dy === 0) return null;
      return {
        o: this.shapeStartPoint,
        u: new scope.Point(dx, 0),
        v: new scope.Point(0, dy),
      };
    }
    if (shapeType === 'rectangle_two_edges') {
      if (!this.shapeStartPoint || !this.shapePt2 || !this.mousePt) return null;
      const edge = this.shapePt2.subtract(this.shapeStartPoint);
      if (edge.length === 0) return null;
      const dir1 = edge.normalize();
      const v2 = this.mousePt.subtract(this.shapePt2);
      const perpVec = v2.subtract(dir1.multiply(v2.dot(dir1)));
      if (perpVec.length === 0) return null;
      return { o: this.shapeStartPoint, u: edge, v: perpVec };
    }
    if (shapeType === 'rectangle_centerline') {
      if (!this.shapeStartPoint || !this.mousePt) return null;
      const dir = this.mousePt.subtract(this.shapeStartPoint);
      const halfLen = dir.length / 2;
      if (halfLen === 0) return null;
      const center = this.shapeStartPoint.add(this.mousePt).divide(2);
      const unitDir = dir.normalize();
      const perp = new scope.Point(-unitDir.y, unitDir.x);
      const halfW = this.centerlineWidthForLength(dir.length) / 2;
      return {
        o: center.subtract(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW)),
        u: unitDir.multiply(2 * halfLen),
        v: perp.multiply(2 * halfW),
      };
    }
    return null;
  }

  // Map unit-space points onto the rect frame, stretching each axis so
  // the result touches all four frame edges. P maps unit [0,1] to the frame.
  private fitUnitPoints(
    unit: Array<[number, number]>,
    P: (s: number, t: number) => AnyItem,
  ): AnyItem {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [ux, uy] of unit) {
      if (ux < minX) minX = ux;
      if (ux > maxX) maxX = ux;
      if (uy < minY) minY = uy;
      if (uy > maxY) maxY = uy;
    }
    if (!(maxX > minX) || !(maxY > minY)) return null;
    const path = new this.scope.Path();
    for (const [ux, uy] of unit) {
      path.add(P((ux - minX) / (maxX - minX), (uy - minY) / (maxY - minY)));
    }
    path.closed = true;
    return path;
  }

  createRectFrameShape(styleOrPreview = 'stroke'): AnyItem {
    const scope = this.scope;
    const type = this.rectangleInnerShapeType;
    if (type === 'rectangle') return null;
    const basis = this.rectFrameBasis();
    if (!basis) return null;
    const { o, u, v } = basis;
    const P0 = (s: number, t: number): AnyItem =>
      o.add(u.multiply(s)).add(v.multiply(t));
    // Oriented frame map: rotate (s, t) about the frame center first, so
    // every shape drawn below follows rectangleOrientation and still
    // fits inside the frame bounds.
    const P = (s: number, t: number): AnyItem => P0(...this.rotST(s, t));
    const params = this.rectangleInnerShapeParams;
    let path: AnyItem = null;
    switch (type) {
      case 'rightTriangle':
        // Legs along the full left and bottom edges, right angle at bottom-left.
        path = new scope.Path({
          segments: [P(0, 1), P(1, 1), P(0, 0)],
          closed: true,
        });
        break;
      case 'trapezoid': {
        // Base angle in the frame: inset the top so the legs meet the
        // bottom at `angle` degrees. Obtuse values invert (top wider).
        const quad = this.trapezoidFrameST(
          this.frameAngleShear(u, v, params.angle),
        );
        path = new scope.Path({
          segments: quad.map(([s, t]) => P(s, t)),
          closed: true,
        });
        break;
      }
      case 'parallelogram': {
        // Fit inside the frame: shrink both bases to 1-|k| and pin
        // opposite corners to the frame so every (s, t) stays in [0, 1].
        const quad = this.parallelogramFrameST(
          this.frameAngleShear(u, v, params.angle),
        );
        path = new scope.Path({
          segments: quad.map(([s, t]) => P(s, t)),
          closed: true,
        });
        break;
      }
      case 'rhombus':
        // Vertices at the four edge midpoints.
        path = new scope.Path({
          segments: [P(0.5, 0), P(1, 0.5), P(0.5, 1), P(0, 0.5)],
          closed: true,
        });
        break;
      case 'kite':
        // Two pairs of adjacent equal sides; touches all four edges,
        // with the cross-bar a third of the way from the top. Centerline
        // rotates 90° so the spine follows the drag axis.
        path = new scope.Path({
          segments:
            this.shapeType === 'rectangle_centerline'
              ? [P(0, 0.5), P(1 / 3, 0), P(1, 0.5), P(1 / 3, 1)]
              : [P(0.5, 0), P(1, 1 / 3), P(0.5, 1), P(0, 1 / 3)],
          closed: true,
        });
        break;
      case 'circle':
      case 'polygon': {
        // Fit unit points to the frame so the shape touches all four edges.
        const sides = type === 'circle' ? 72 : params.sides || 6;
        const start = (this.shapeGuideAngle * Math.PI) / 180;
        const unit: Array<[number, number]> = [];
        for (let i = 0; i < sides; i++) {
          const a = start + (i / sides) * Math.PI * 2;
          unit.push([Math.cos(a), Math.sin(a)]);
        }
        path = this.fitUnitPoints(unit, P);
        break;
      }
      case 'supershape': {
        // Fit unit points to the frame so the shape touches all four edges.
        const { m = 3, n1 = 0.2, n2 = 1.7, n3 = 1.7, a1 = 1, a2 = 1 } = params;
        const steps = 360;
        const unit: Array<[number, number]> = [];
        for (let i = 0; i <= steps; i++) {
          const phi = (i / steps) * Math.PI * 2;
          const r = this.supershapeRadius(phi, m, n1, n2, n3, a1, a2) || 0;
          unit.push([r * Math.cos(phi), r * Math.sin(phi)]);
        }
        path = this.fitUnitPoints(unit, P);
        break;
      }
      default:
        break;
    }
    if (!path) return null;
    if (styleOrPreview === 'preview') {
      path.strokeColor = this.globalStrokeColor;
      path.strokeWidth = this.globalStrokeWidth;
      path.strokeDasharray = [3, 3];
      path.opacity = 0.7;
      path.fillColor = null;
    }
    this.applyStrokeGeometry(path);
    return path;
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
    this.stylePreviewFrame(this.previewRect, 1);
    this.applyStrokeGeometry(this.previewRect);
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
        this.stylePreviewFrame(this.previewRect, 1);
        this.applyStrokeGeometry(this.previewRect);
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
    this.applyStrokeGeometry(this.previewPath);
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
      this.applyStrokeGeometry(this.quadPath);
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
      } else if (
        this.shapeType != null &&
        this.shapeType.startsWith('rectangle_') &&
        this.rectangleInnerShapeType !== 'rectangle'
      ) {
        const stampedShape = this.createRectFrameShape('stroke');
        if (stampedShape) {
          this.applyCurrentStyles(stampedShape);
          stampedShape.selected = false;
          scope.project.activeLayer.addChild(stampedShape);
        }
      } else {
        const framePreview = this.previewShape || this.previewRect || this.previewPath;
        if (framePreview) {
          const stampedFrame = framePreview.clone();
          this.applyCurrentStyles(stampedFrame);
          this.clearShadow(stampedFrame);
          stampedFrame.opacity = 1;
          stampedFrame.selected = false;
          scope.project.activeLayer.addChild(stampedFrame);
        }
        if (this.previewInner) {
          const stampedInner = this.previewInner.clone();
          this.clearShadow(stampedInner);
          stampedInner.opacity = 1;
          stampedInner.strokeColor = this.strokeEnabled ? this.globalStrokeColor : null;
          stampedInner.strokeWidth = this.strokeEnabled ? this.globalStrokeWidth * 0.7 : 0;
          stampedInner.fillColor = this.fillEnabled ? this.globalFillColor : null;
          this.applyStrokeGeometry(stampedInner);
          this.applyStrokeDash(stampedInner);
          stampedInner.selected = false;
          scope.project.activeLayer.addChild(stampedInner);
        }
      }
    } else if (this.isDrawingQuad && this.quadPath) {
      const stamped = this.quadPath.clone();
      this.applyCurrentStyles(stamped);
      stamped.closed = true;
      stamped.selected = false;
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
      this.applyStrokeGeometry(this.path);
      this.applyStrokeDash(this.path);
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
      this.applyStrokeGeometry(this.path);
      this.applyStrokeDash(this.path);
    } else {
      const newSegment = this.path.add(this.mousePt);
      this.smoothLastSplineJoint(newSegment);
    }
    if (this.isDrawingPath === false) this.isDrawingPath = true;
    this.updateTextContent();
    this.notify();
  }

  // Mirror of the spline smoothing in splinePointKC: shape the joint
  // before the path's last segment from the neighboring points, scaled
  // by the current spline tension.
  private smoothLastSplineJoint(newSegment: AnyItem): void {
    if (!newSegment || !this.path || this.path.segments.length < 3) return;
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

  // Complete Shape (R key): finish a path being drawn by committing the
  // last segment from where the mouse is as a spline point, then ending
  // the path. The trailing live-preview segment is replaced in place so
  // no zero-length stub is left behind.
  completeShapeWithSpline(): void {
    if (!this.isDrawingPath || !this.path || !this.mousePt) return;
    if (this.path.segments.length > 1) {
      this.path.removeSegment(this.path.segments.length - 1);
    }
    const newSegment = this.path.add(this.mousePt);
    this.smoothLastSplineJoint(newSegment);
    this.endPathOrShape();
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
    this.stylePreviewFrame(this.previewShape);
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
    this.stylePreviewFrame(this.previewShape, 1);
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
    // Non-rectangle Rect Keys choice: the rect frame is the bounds and only
    // the fitted shape is drawn (no frame + inner double draw).
    const rectShapeOnly =
      shapeType.startsWith('rectangle_') &&
      this.rectangleInnerShapeType !== 'rectangle';
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
      if (rectShapeOnly) {
        finalPath = this.createRectFrameShape('stroke');
      } else {
        finalPath = new scope.Path.Rectangle({
          center: this.previewShape.position,
          size: this.previewShape.size,
        });
      }
      if (finalPath) this.applyCurrentStyles(finalPath);
    } else if (shapeType === 'rectangle_two_edges') {
      if (rectShapeOnly) {
        finalPath = this.createRectFrameShape('stroke');
      } else {
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
      }
      if (finalPath) this.applyCurrentStyles(finalPath);
    } else if (shapeType === 'rectangle_centerline') {
      if (rectShapeOnly) {
        finalPath = this.createRectFrameShape('stroke');
      } else {
        const pt1 = this.shapeStartPoint;
        const pt2 = this.mousePt;
        const center = pt1.add(pt2).divide(2);
        const dir = pt2.subtract(pt1);
        const halfLen = dir.length / 2;
        const unitDir = dir.normalize();
        const perp = new scope.Point(-unitDir.y, unitDir.x);
        const halfW = this.centerlineWidthForLength(dir.length) / 2;
        const ptA = center.add(unitDir.multiply(halfLen)).add(perp.multiply(halfW));
        const ptB = center.add(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW));
        const ptC = center.subtract(unitDir.multiply(halfLen)).add(perp.multiply(halfW));
        const ptD = center.subtract(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW));
        finalPath = new scope.Path({
          segments: [ptA, ptB, ptD, ptC],
          closed: true,
        });
      }
      if (finalPath) this.applyCurrentStyles(finalPath);
    }
    if (shapeType === 'rectangle_centerline') {
      this.lastCenterlineWidth = this.shapeWidth;
    }
    if (finalPath) {
      finalPath.selected = false;
      scope.project.activeLayer.addChild(finalPath);
      if (!rectShapeOnly) this.drawInnerShape(finalPath, 'stroke');
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
    this.applyStrokeGeometry(path);
    return path;
  }

  // --- Mouse (NibGliderApp.js) ---
  private isNonContentItem(item: AnyItem): boolean {
    if (!item) return true;
    if (item === this.pathSnapCursor || item === this.gridCursor) return true;
    if (item.data && item.data.isUICursor) return true;
    if (this.gridLayer && (item === this.gridLayer || item.layer === this.gridLayer)) {
      return true;
    }
    if (
      item === this.previewInner ||
      item === this.previewShape ||
      item === this.previewLine ||
      item === this.previewPath ||
      item === this.previewRect
    ) {
      return true;
    }
    return false;
  }

  private hitTestContent(point: AnyItem): AnyItem {
    const scope = this.scope;
    if (!point) return null;
    const self = this;
    return scope.project.hitTest(point, {
      segments: true,
      stroke: true,
      fill: true,
      tolerance: 5,
      match: (item: AnyItem) => !self.isNonContentItem(item),
    });
  }

  private setCanvasCursor(cursor: string): void {
    const el = this.scope.view && this.scope.view.element;
    if (el) el.style.cursor = cursor;
  }

  private endPan(): void {
    if (!this.isPanning) return;
    this.isPanning = false;
    this.setCanvasCursor('');
  }

  // Keyboard group per key, mirroring keyboard.css. The overlay renders
  // the group color; no paper items involved.
  statusKeyGroup(key: string): StatusKeyGroup {
    const k = key.toLowerCase();
    if (k === 'n' || k === 'm') return 'circle';
    if (k === 'i' || k === 'u' || k === 'y') return 'rect';
    if (k === 'o') return 'quad';
    if (k === 'w' || k === '[' || k === ']' || k === ';' || k === "'")
      return 'op';
    if (k === 'q' || k === 'a' || k === 'r' || k === 'escape') return 'end';
    return 'neutral';
  }

  // Publish only when the schema changes (this runs on hot paths like
  // mousemove); the HTML overlay re-renders off the version counter.
  private setStatusSchema(schema: StatusSchema): void {
    const key = JSON.stringify(schema);
    if (key === this.lastStatusKey) return;
    this.lastStatusKey = key;
    this.statusSchema = schema;
    this.notify();
  }

  private afterViewChange(): void {
    if (this.isGridEnabled) this.drawGrid();
  }

  // Zoom around the view center, honoring min/max zoom.
  private stepZoom(dir: 1 | -1): void {
    const view = this.scope.view;
    const oldZoom = view.zoom || 1;
    const next = Math.min(
      this.maxZoom,
      Math.max(this.minZoom, oldZoom * (dir > 0 ? 1.25 : 1 / 1.25)),
    );
    if (next === oldZoom) return;
    view.zoom = next;
    this.afterViewChange();
  }

  private resetZoom(): void {
    const view = this.scope.view;
    if ((view.zoom || 1) === 1) return;
    view.zoom = 1;
    this.afterViewChange();
  }

  private onMouseWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY === 0) return;
    const view = this.scope.view;
    const canvas = view.element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const viewPoint = new this.scope.Point(
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    const oldZoom = view.zoom || 1;
    const next = Math.min(
      this.maxZoom,
      Math.max(this.minZoom, oldZoom * Math.exp(-event.deltaY * 0.002)),
    );
    if (next === oldZoom) return;
    const before = view.viewToProject(viewPoint);
    view.zoom = next;
    const after = view.viewToProject(viewPoint);
    view.center = view.center.add(before.subtract(after));
    this.afterViewChange();
  }

  private onMouseDown(event: paper.MouseEvent): void {
    this.mousePt = event.point;
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad) return;
    const hit = this.hitTestContent(this.mousePt);
    if (!hit || !hit.item) {
      this.clearOutSelection();
      this.isPanning = true;
      this.setCanvasCursor('grabbing');
      this.updateTextContent();
      return;
    }
    this.isPanning = false;
    this.applyHitSelection(hit);
  }

  hitTestUnderCursor(): void {
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad) return;
    this.applyHitSelection(this.hitTestContent(this.mousePt));
  }

  private applyHitSelection(hitResult: AnyItem): void {
    if (hitResult && hitResult.item) {
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
    this.notify();
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
    if (
      this.isAspectSnappingEnabled &&
      this.isDrawingShape &&
      this.shapeType != null &&
      this.shapeType.startsWith('rectangle_') &&
      this.shapeStartPoint
    ) {
      if (this.shapeType === 'rectangle_diagonal') {
        this.mousePt = this.applyAspectSnapping(this.shapeStartPoint, this.mousePt);
      } else if (this.shapeType === 'rectangle_two_edges' && this.shapePt2) {
        const edge = this.shapePt2.subtract(this.shapeStartPoint);
        if (edge.length > 0) {
          const dir1 = edge.normalize();
          const v2 = this.mousePt.subtract(this.shapePt2);
          const perpVec = v2.subtract(dir1.multiply(v2.dot(dir1)));
          if (perpVec.length > 0) {
            const snapped = this.snapAspectSecond(edge.length, perpVec.length);
            this.mousePt = this.shapePt2.add(perpVec.normalize().multiply(snapped));
          }
        }
      }
    }
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
    if (this.isDrawingShape) {
      this.updateShapePreview();
      if (
        this.isAspectSnappingEnabled &&
        this.shapeType != null &&
        this.shapeType.startsWith('rectangle_')
      ) {
        this.updateTextContent();
      }
    }
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

  // Preview style convention for the drawing keys (circle keys, rect
  // keys, later quad): thin mid-gray dashed overlay with a 1px black drop
  // shadow so it reads on any canvas background, light or dark.
  private addPreviewShadow(item: AnyItem): void {
    const scope = this.scope;
    item.shadowColor = new scope.Color(0, 0, 0, 0.9);
    item.shadowBlur = 1;
    item.shadowOffset = new scope.Point(1, 1);
  }

  // Rect keys use a thin white frame; circle keys keep the mid-gray one.
  private stylePreviewFrame(item: AnyItem, brightness = 0.5): void {
    const scope = this.scope;
    item.strokeColor = new scope.Color(brightness);
    item.strokeWidth = 1;
    item.strokeDasharray = [4, 4];
    this.addPreviewShadow(item);
  }

  private clearShadow(item: AnyItem): void {
    item.shadowColor = null;
    item.shadowBlur = 0;
  }

  // Live rect preview: the dashed preview frame always tracks the mouse;
  // with any non-Rectangle Rect Keys choice the fitted shape is drawn live
  // inside it, on top of it.
  private refreshRectPreview(
    corners: [AnyItem, AnyItem, AnyItem, AnyItem] | null,
    frameItem: AnyItem,
  ): void {
    const scope = this.scope;
    if (frameItem) {
      frameItem.visible = true;
      if (corners && frameItem.segments) {
        for (let i = 0; i < 4; i++) frameItem.segments[i].point = corners[i];
      }
    }
    if (this.previewInner) {
      this.previewInner.remove();
      this.previewInner = null;
    }
    if (this.rectangleInnerShapeType === 'rectangle') return;
    const shape = this.createRectFrameShape('preview');
    if (shape) {
      this.addPreviewShadow(shape);
      this.previewInner = shape;
      scope.project.activeLayer.addChild(shape);
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
        if (this.previewInner) {
          this.previewInner.remove();
          this.previewInner = null;
        }
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
        this.refreshRectPreview([pt1, pt2, ptC, ptD], this.previewRect);
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
      const halfW = this.centerlineWidthForLength(dir.length) / 2;
      const ptA = center.add(unitDir.multiply(halfLen)).add(perp.multiply(halfW));
      const ptB = center.add(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW));
      const ptC = center.subtract(unitDir.multiply(halfLen)).add(perp.multiply(halfW));
      const ptD = center.subtract(unitDir.multiply(halfLen)).subtract(perp.multiply(halfW));
      this.refreshRectPreview([ptA, ptB, ptD, ptC], this.previewRect);
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
    if (this.shapeType === 'rectangle_diagonal') {
      this.refreshRectPreview(null, this.previewShape);
      return;
    }
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
          if (this.previewInner) {
            this.addPreviewShadow(this.previewInner);
            scope.project.activeLayer.addChild(this.previewInner);
          }
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
          if (this.previewInner) {
            this.addPreviewShadow(this.previewInner);
            scope.project.activeLayer.addChild(this.previewInner);
          }
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
    if (this.isPanning) {
      this.scope.view.center = this.scope.view.center.subtract(event.delta);
      this.afterViewChange();
      return;
    }
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
    if (event.metaKey || event.ctrlKey) {
      if (event.key === '0') {
        event.preventDefault();
        this.resetZoom();
        return;
      }
      if (event.key === '-' || event.key === '=' || event.key === '+') {
        event.preventDefault();
        this.stepZoom(event.key === '-' ? -1 : 1);
        return;
      }
    }
    if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown'
    ) {
      // Let focused panel controls keep native arrow behavior (sliders etc.).
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      event.preventDefault();
      if (
        !this.isDrawingPath &&
        !this.isDrawingShape &&
        !this.isDrawingQuad &&
        this.selectedItems.length > 0
      ) {
        // Base nudge 1 unit; Shift = longer, Alt = shorter.
        let d = 1;
        if (event.shiftKey) d *= 10;
        if (event.altKey) d *= 0.2;
        let dx = 0;
        let dy = 0;
        if (event.key === 'ArrowLeft') dx = -d;
        else if (event.key === 'ArrowRight') dx = d;
        else if (event.key === 'ArrowUp') dy = -d;
        else dy = d;
        const delta = new this.scope.Point(dx, dy);
        for (let i = 0; i < this.selectedItems.length; i++) {
          this.selectedItems[i].position =
            this.selectedItems[i].position.add(delta);
        }
        this.updateTextContent();
      }
      return;
    }
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
        // Shift = bigger step, Alt = finer step.
        const down = event.shiftKey ? 0.8 : event.altKey ? 0.98 : 0.9;
        const up = event.shiftKey ? 1.25 : event.altKey ? 1.02 : 1.1;
        for (let i = 0; i < this.selectedItems.length; i++) {
          if (event.key === '[') {
            this.selectedItems[i].scale(down, center);
          } else {
            this.selectedItems[i].scale(up, center);
          }
        }
        return;
      }
    }
    if (event.key === ';' || event.key === "'") {
      if (this.selectedItems.length > 0) {
        const center = this.collectiveCenter(this.selectedItems);
        // Shift = 45°, Alt = 5°, otherwise 10°.
        const step = event.shiftKey ? 45 : event.altKey ? 5 : 10;
        const angle = event.key === ';' ? -step : step;
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
      if (keyLower === '/') {
        this.splineTension = this.splineTensionDefault;
        this.updateTextContent();
        this.notify();
        return;
      }
    }
    if (!this.isDrawingPath && keyLower === '/') {
      this.toggleGrid();
      return;
    }
    // NB: J toggles the controls bar overlay and L the status box,
    // both via App's own keydown listeners. While drawing a path J
    // trims spline tension instead (handled above).
    // NB: K toggles the on-screen keyboard (KB toggle) via App's own
    // keydown listener. While drawing a path K adjusts spline tension
    // instead (handled above), mirroring how / resets tension mid-path
    // and toggles the grid otherwise.
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
        if (keyLower === 'r' && this.isDrawingPath) {
          this.completeShapeWithSpline();
        } else {
          this.endPathOrShape();
        }
      }
    }
    if (!this.isDrawingPath && !this.isDrawingShape && !this.isDrawingQuad) {
      if (keyLower === 's') {
        const sel = this.selectionPaint();
        this.setStrokeEnabled(sel ? !sel.strokeOn : !this.strokeEnabled);
        this.updateTextContent();
        return;
      }
      if (keyLower === 'd') {
        const sel = this.selectionPaint();
        this.setFillEnabled(sel ? !sel.fillOn : !this.fillEnabled);
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
      // Native tab order wins inside panel fields; everywhere else Tab
      // selects under the cursor and must not leave the page for the
      // Omnibox.
      const target = event.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'BUTTON');
      if (!inField) {
        event.preventDefault();
        this.hitTestUnderCursor();
      }
    }
    this.updateTextContent();
  }

  // --- Canvas status overlay (NibGliderApp.js updateTextContent) ---
  updateTextContent(): void {
    const T = (s: string): StatusRun => ({ t: 'text', s });
    const K = (s: string): StatusRun => ({
      t: 'key',
      s,
      g: this.statusKeyGroup(s),
    });
    const state: StatusLine[] = [];
    const steps: StatusLine[] = [];
    const L = (kind: StatusLine['kind'], runs: StatusRun[]): StatusLine => ({
      kind,
      runs,
    });
    const selectedCount = this.selectedItems.length;
    if (this.isGridEnabled) {
      state.push(
        L('meta', [
          T(`Grid: ON · ${this.gridType === 'diamond' ? 'Diamond' : 'Square'} (`),
          K('L'),
          T(' to toggle)'),
        ]),
      );
    }
    if (selectedCount) {
      state.push(L('title', [T('Selected Objects: ' + selectedCount)]));
      if (this.isInDragLock === false) {
        steps.push(L('hint', [K('Space'), T(' to begin Drag-Lock')]));
        steps.push(
          L('hint', [
            K('['),
            T(' and '),
            K(']'),
            T(' to Scale, '),
            K(';'),
            T(' and '),
            K("'"),
            T(' to Rotate'),
          ]),
        );
      }
    }
    if (this.isInDragLock) {
      state.push(L('title', [T('Drag-Lock On ')]));
      steps.push(
        L('hint', [
          T('Move mouse to drag all selected.  '),
          K('Space'),
          T(' to release.'),
        ]),
      );
      steps.push(
        L('hint', [
          K('W'),
          T(' to Stamp, '),
          K('['),
          T(' and '),
          K(']'),
          T(' to Scale, '),
          K(';'),
          T(' and '),
          K("'"),
          T(' to Rotate'),
        ]),
      );
    }
    if (this.isDrawingPath) {
      state.push(L('title', [T('Drawing Path')]));
      steps.push(L('hint', [T('Move mouse to adjust path.')]));
      steps.push(
        L('hint', [
          K('F'),
          T(' = sharp point, '),
          K('G'),
          T(' = spline (tension:' + this.splineTension.toFixed(1) + '), '),
          K('R'),
          T(' = complete shape'),
        ]),
      );
      steps.push(
        L('hint', [K('A'), T(' = end, '), K('J'), T('/'), K('K'), T('/'), K('/'), T(' = adjust tension')]),
      );
    }
    if (this.isDrawingShape) {
      if (
        this.shapeType === 'circle_radius' ||
        this.shapeType === 'circle_diameter'
      ) {
        const mode = this.shapeType === 'circle_radius' ? 'radius' : 'diameter';
        state.push(L('title', [T('Circle by (' + mode + ')')]));
      } else if (this.shapeType === 'rectangle_diagonal') {
        state.push(L('title', [T('Rectangle by Diagonal')]));
      } else if (this.shapeType === 'rectangle_two_edges') {
        state.push(L('title', [T('Rectangle by Two Edges')]));
      } else if (this.shapeType === 'rectangle_centerline') {
        state.push(L('title', [T('Rectangle by Centerline')]));
        state.push(L('meta', [T('Width: ' + Math.round(this.shapeWidth) + 'pt')]));
      }
      const aspectLabel = this.liveRectAspectLabel();
      if (aspectLabel) state.push(L('meta', [T('Aspect ' + aspectLabel)]));
      if (this.shapeType != null && this.shapeType.startsWith('circle_')) {
        const finishKey = this.shapeType === 'circle_diameter' ? 'N' : 'M';
        steps.push(
          L('hint', [
            T('Press '),
            K(finishKey),
            T(' to finish or '),
            K('W'),
            T(' to stamp.'),
          ]),
        );
      } else if (this.shapeType === 'rectangle_diagonal') {
        steps.push(
          L('hint', [
            T('Press '),
            K('I'),
            T(' to finish or '),
            K('W'),
            T(' to stamp.'),
          ]),
        );
      } else if (this.shapeType === 'rectangle_two_edges') {
        if (this.shapePt2 === null) {
          steps.push(L('hint', [T('1. Move mouse to adjust this first edge.')]));
          steps.push(
            L('hint', [
              T('2. Press '),
              K('U'),
              T(' again to start the second edge'),
            ]),
          );
        } else {
          steps.push(L('hint', [T('1. Move mouse to adjust the second edge.')]));
          steps.push(
            L('hint', [
              T('2. Press '),
              K('U'),
              T(' to finish or '),
              K('W'),
              T(' to stamp.'),
            ]),
          );
        }
      } else if (this.shapeType === 'rectangle_centerline') {
        steps.push(L('hint', [T('1. Move mouse to adjust the rectangle.')]));
        steps.push(
          L('hint', [
            K('['),
            T(': thin width, '),
            K(']'),
            T(': thicken width,'),
          ]),
        );
        steps.push(
          L('hint', [
            K('Y'),
            T(': finish, '),
            K('W'),
            T(': stamp, '),
            K('Q'),
            T(': cancel'),
          ]),
        );
      }
    }
    if (this.isDrawingQuad) {
      state.push(
        L('title', [T('Drawing Quadrilateral (' + this.quadPointCount + '/4)')]),
      );
      steps.push(
        L('hint', [
          T('Press '),
          K('O'),
          T(' to add next point. '),
          K('Q'),
          T(': cancel'),
        ]),
      );
    }
    this.setStatusSchema({ state, steps });
  }
}
