// Ported from the flat global scripts (drawingProperties.js,
// drawingToolsAndFunctions.js, selectionFunctions.js, shapeGenerators.js,
// NibGliderApp.js). All shared mutable state lives on this class; the
// PaperScope is injected instead of paper.install(window).
// NB: `paper.*` below refers to the global namespace from paper's bundled
// declarations (type positions only); the runtime value is never imported here.
import { FontMetrics } from './fontMetrics';
import { UndoManager, type UndoCommand } from './undoManager';

export type ShapeType =
  | 'circle_radius'
  | 'circle_diameter'
  | 'circle_radial_stamp'
  | 'rectangle_diagonal'
  | 'rectangle_two_edges'
  | 'rectangle_centerline';

// A key remap that applies while a live drawing preview is active. The
// engine checks registered bindings before the idle (selection) handlers,
// so the same physical key can adjust the live preview instead. Future
// components (e.g. a repeat-circle counter) register here without touching
// handleKeyDown. Digit0..Digit9 codes are reserved as slots for such
// future bindings.
export interface LiveKeyBinding {
  /** Stable id, e.g. 'live-scale-down'. */
  id: string;
  /** Keycap labels shown in the Status Box, e.g. ['[']. */
  keys: string[];
  /** Short status description, e.g. 'scale'. */
  label: string;
  match: (event: KeyboardEvent) => boolean;
  /** Whether this binding applies right now. */
  applies: () => boolean;
  apply: (event: KeyboardEvent) => void;
}

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
  | 'rhombus'
  | 'kite';

export type CombineMode = 'union' | 'subtract' | 'intersect';

export type TextJustification = 'left' | 'center' | 'right';

export interface TextSpec {
  /** Primary line of text (Display Text, and line 1 of Circumference). */
  content: string;
  /** Second circumference line (Circumference 2 Lines). */
  line2: string;
  fontFamily: string;
  /** Font size in points. */
  fontSize: number;
  fontWeight: string;
  italic: boolean;
  justification: TextJustification;
  /** Leading as a multiple of the font size. */
  leading: number;
}

/** Text Mode content: flowing display type vs. contained body type. */
export type TextMode = 'display' | 'body';

/** Display Text placement relative to the shape boundary. */
export type DisplayFlow = 'interior' | 'exterior';

/** Which way Display glyph tops point: to the circumference or origin. */
export type GlyphOrientation = 'outward' | 'inward';

/** Vertical anchoring of Display Text glyphs on open spline strokes. */
export type SplineTextPlacement = 'above' | 'baseline' | 'below';

export type StrokeCap = 'butt' | 'round' | 'square';
export type StrokeJoin = 'miter' | 'round' | 'bevel';

export type FillType = 'solid' | 'linear' | 'radial';

export interface FillSpec {
  type: FillType;
  /** Solid color, and the gradient start stop. */
  color: string;
  /** Gradient end stop. */
  endColor: string;
  /** Linear gradient direction, degrees. */
  angle: number;
  /** Radial inner-stop offset, 0..0.95. */
  inner: number;
}

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

// One item's positional delta for a move command.
interface MoveEntry {
  item: AnyItem;
  before: AnyItem;
  after: AnyItem;
}

interface MoveCommand extends UndoCommand {
  entries: MoveEntry[];
}

export class NibGliderEngine {
  private scope: paper.PaperScope;
  private detachFns: Array<() => void> = [];
  private listeners = new Set<() => void>();
  private version = 0;
  private onKeyActivity: (a: KeyActivity) => void;

  // --- Stroke / style config (drawingProperties.js) ---
  globalStrokeWidth = 4.0;
  maxStrokeWidth = 200.0;
  lastCenterlineWidth = 80;
  splineTensionDefault = 0.4;
  splineTension = 0.4;

  // --- Path continuation gestures (all on by default) ---
  // END near the active path's own start closes onto it; starting a
  // stroke on an open path's end continues that path; END near another
  // open path's endpoint joins the two paths.
  closeShapeOnEndNearStart = true;
  continuePathFromEndpoint = true;
  joinPathsOnEndNearEndpoint = true;
  endpointSnapTolerance = 12;
  globalStrokeColor = '#107cff';
  globalFillColor = '#000000';
  globalFillType: FillType = 'solid';
  globalFillEndColor = '#ffffff';
  globalFillAngle = 0;
  globalFillInner = 0;
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
  // Snap increments: angle in degrees, length in pt.
  angleSnapDegrees = 15;
  lengthSnapStep = 10;
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

  // --- Text config (Text panel + Display/Body/Circumference text) ---
  globalText: TextSpec = {
    content: 'Ag',
    line2: '',
    fontFamily: 'Helvetica',
    fontSize: 24,
    fontWeight: 'normal',
    italic: false,
    justification: 'center',
    leading: 1.2,
  };
  // Text Mode: when on, every shape key draws its geometric shape plus
  // text derived from it (Display flows around the boundary, Body fills
  // the interior) instead of the bare shape.
  textModeEnabled = false;
  textMode: TextMode = 'display';
  displayFlow: DisplayFlow = 'exterior';
  glyphOrientation: GlyphOrientation = 'outward';
  // Vertical anchoring of Display glyphs on open spline strokes: Above
  // rests the descender line on the spline, Baseline uses the spline as
  // the text baseline, Below hangs the ascender line from the spline.
  splineTextPlacement: SplineTextPlacement = 'above';
  // Boundary offset for Display Text rings, in points.
  displayOffset = 18;
  // Extra advance between flow glyphs, in points.
  circumferenceGap = 2;
  // Start offset along the boundary, in degrees of total loop length.
  circumferenceAngleOffset = -90;
  // Last combinatorics outcome, surfaced under the panel buttons.
  lastCombineNote = '';
  // Last image-drop outcome, surfaced in the status overlay. Set on
  // skipped/failed files, cleared when a new drop starts.
  lastDropNote = '';
  // Persistent deposit-time combinatoric setting: with a selection
  // present, each deposited shape folds into it using this mode ('none'
  // deposits plainly, exactly as before).
  combineMode: CombineMode | 'none' = 'none';
  // Kerned advance measurement (parsed font bytes → canvas → estimate).
  textMetrics = new FontMetrics();

  // --- Drawing mode / shape state (drawingToolsAndFunctions.js) ---
  // continuedPathBaseCount is the segment count of an adopted existing
  // path (null while drawing a brand-new path); cancel strips only the
  // newly added points so the original shape survives.
  continuedPathBaseCount: number | null = null;
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
  // Live-drawing adjustments: multiplicative preview scale and additive
  // preview rotation (degrees) applied to circle-mode previews. Reset on
  // every session start/end/cancel; W stamps keep them (drawing continues).
  liveScale = 1;
  liveRotateOffset = 0;
  // Base circumradius of the Radial Stamp shape at 1x magnification,
  // independent of the placement-circle radius (a future radius-relative
  // mode may scale from a reference radius instead).
  radialStampBaseRadius = 45;
  private liveKeyBindings: LiveKeyBinding[] = [];
  /** Unified live-drawing state across path, shape, and quad sessions. */
  get isLiveDrawing(): boolean {
    return this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad;
  }
  previewInner: AnyItem = null;
  previewSplineText: AnyItem = null;
  previewShape: AnyItem = null;
  previewLine: AnyItem = null;
  previewPath: AnyItem = null;
  previewRect: AnyItem = null;
  path: AnyItem = null;
  mousePt: AnyItem = null;
  lastMousePt: AnyItem = null;
  isPanning = false;
  // Pan anchor: view center + pointer point at pan start. Paper's
  // event.delta is a project-space delta computed across the center
  // change applied by the previous drag, which stutters; re-deriving
  // the pointer offset from this fixed anchor every drag stays
  // frame-consistent.
  panAnchorCenter: AnyItem = null;
  panAnchorPoint: AnyItem = null;
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
    this.registerBuiltInLiveKeys();
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
    scope.view.onMouseUp = () => {
      this.endPan();
      this.commitMoveGesture();
    };

    const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code) this.onKeyActivity({ code: event.code, active: false });
    };
    const onHighlightDown = (event: KeyboardEvent) => {
      if (this.isTextEntryTarget(event)) return;
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
    const onDocMouseUp = () => {
      this.endPan();
      this.commitMoveGesture();
    };
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

    // Preload parsed-font measurement bytes without blocking setup;
    // layout falls back to canvas/estimate until they land.
    void this.textMetrics.preload().then(() => {
      if (this.isDrawingShape) this.updateShapePreview();
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
    const scope = this.scope;
    const view = scope.view;
    const canvas = view.element as HTMLCanvasElement | null;
    const rect = canvas ? canvas.getBoundingClientRect() : null;
    // View (CSS) pixels -> project units, so the drop lands under the
    // cursor at any zoom or pan. Falls back to the view center.
    const base =
      rect != null
        ? view.viewToProject(
            new scope.Point(
              event.clientX - rect.left,
              event.clientY - rect.top,
            ),
          )
        : view.center.clone();
    const cascade = 24 / (view.zoom || 1);
    this.lastDropNote = '';
    const selBefore = [...this.selectedItems];
    this.clearOutSelection();
    this.updateTextContent();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const at = base.add(new scope.Point(cascade * i, cascade * i));
      if (this.looksLikeSvg(file)) this.dropSvgFile(file, at, selBefore);
      else if (this.looksLikeRaster(file))
        this.dropRasterFile(file, at, selBefore);
      else this.dropUnknownFile(file, at, selBefore);
    }
    this.notify();
  }

  private looksLikeSvg(file: File): boolean {
    if (/svg/i.test(file.type)) return true;
    return /\.svg$/i.test(file.name);
  }

  private looksLikeRaster(file: File): boolean {
    if (/^image\//.test(file.type)) return true;
    return /\.(png|jpe?g|gif|webp|bmp|avif|ico)$/i.test(file.name);
  }

  // Scale down only: items larger than 75% of the visible view in
  // either dimension fit inside it, aspect preserved, about center.
  private fitItemToView(item: AnyItem): void {
    try {
      const bounds = item.bounds;
      const vb = this.scope.view.bounds;
      if (!bounds || !vb) return;
      if (!(bounds.width > 0 && bounds.height > 0)) return;
      if (!(vb.width > 0 && vb.height > 0)) return;
      const s = Math.min(
        1,
        (vb.width * 0.75) / bounds.width,
        (vb.height * 0.75) / bounds.height,
      );
      if (s < 1) item.scale(s, bounds.center);
    } catch {
      // Best effort; a drop must never throw.
    }
  }

  private noteDropFailure(note: string): void {
    this.lastDropNote = note;
    this.updateTextContent();
    this.notify();
  }

  // One undoable entry per placed file: only that item is removed on
  // undo, so drops interleaved with later drawing stay independent.
  private recordDropCommand(
    label: string,
    item: AnyItem,
    selBefore: AnyItem[],
  ): void {
    const layer = this.scope.project
      ? this.scope.project.activeLayer
      : null;
    if (!layer || !item || !this.isInScene(item)) return;
    const after = this.contentItems();
    const i = after.indexOf(item);
    let next: AnyItem | null = null;
    for (let j = i + 1; j < after.length; j++) {
      if (after[j] !== item) {
        next = after[j];
        break;
      }
    }
    const selAfter = [...this.selectedItems];
    this.history.push({
      label,
      undo: () => {
        if (this.isInScene(item)) {
          this.removeItemFromSelection(item);
          try {
            item.remove();
          } catch {
            // Already gone.
          }
        }
        this.restoreSelection(selBefore);
      },
      redo: () => {
        if (!this.isInScene(item)) this.insertContentAt(item, next);
        this.restoreSelection(selAfter);
      },
    });
  }

  private placeDroppedItem(
    label: string,
    item: AnyItem,
    at: AnyItem,
    selBefore: AnyItem[],
  ): void {
    if (!item) {
      this.noteDropFailure('Drop failed: could not read that file.');
      return;
    }
    try {
      item.position = at;
    } catch {
      // Keep the imported position.
    }
    this.fitItemToView(item);
    this.addItemToSelection(item);
    this.recordDropCommand(label, item, selBefore);
    this.updateTextContent();
    this.notify();
  }

  private importSvgText(
    text: string,
    fileName: string,
    at: AnyItem,
    selBefore: AnyItem[],
  ): void {
    try {
      this.scope.project.importSVG(text, (imported: AnyItem) => {
        if (!imported) {
          this.noteDropFailure(`Drop failed: ${fileName} did not import.`);
          return;
        }
        // Behave as one object in selection/move/group flows.
        try {
          imported.data.isUserGroup = true;
        } catch {
          // Optional; grouping just won't apply.
        }
        this.placeDroppedItem(`Deposit ${fileName}`, imported, at, selBefore);
      });
    } catch {
      this.noteDropFailure(`Drop failed: ${fileName} did not import.`);
    }
  }

  private dropSvgFile(file: File, at: AnyItem, selBefore: AnyItem[]): void {
    const reader = new FileReader();
    reader.onerror = () =>
      this.noteDropFailure(`Drop failed: could not read ${file.name}.`);
    reader.onload = (e) => {
      const result = e.target?.result;
      if (
        typeof result !== 'string' ||
        !/<svg[\s>]/i.test(result.slice(0, 4096))
      ) {
        this.noteDropFailure(`Drop failed: ${file.name} is not SVG.`);
        return;
      }
      this.importSvgText(result, file.name, at, selBefore);
    };
    reader.readAsText(file);
  }

  private dropRasterFile(
    file: File,
    at: AnyItem,
    selBefore: AnyItem[],
  ): void {
    const reader = new FileReader();
    reader.onerror = () =>
      this.noteDropFailure(`Drop failed: could not read ${file.name}.`);
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== 'string') {
        this.noteDropFailure(`Drop failed: could not read ${file.name}.`);
        return;
      }
      const image = new Image();
      image.onerror = () =>
        this.noteDropFailure(`Drop failed: ${file.name} did not decode.`);
      image.onload = () => {
        let raster: AnyItem = null;
        try {
          raster = new this.scope.Raster(image);
        } catch {
          raster = null;
        }
        this.placeDroppedItem(`Deposit ${file.name}`, raster, at, selBefore);
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  }

  private dropUnknownFile(
    file: File,
    at: AnyItem,
    selBefore: AnyItem[],
  ): void {
    const reader = new FileReader();
    reader.onerror = () =>
      this.noteDropFailure(
        `Drop skipped: ${file.name} is not an image.`,
      );
    reader.onload = (e) => {
      const result = e.target?.result;
      if (
        typeof result === 'string' &&
        /<svg[\s>]/i.test(result.slice(0, 4096))
      ) {
        this.importSvgText(result, file.name, at, selBefore);
        return;
      }
      this.noteDropFailure(`Drop skipped: ${file.name} is not an image.`);
    };
    reader.readAsText(file);
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
        // Preserve a gradient fill, retinting its start stop.
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.color = colorVal;
        this.applyFillSpec(item, spec);
      });
    } else {
      this.globalFillColor = colorVal;
    }
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  /** Snapshot of the global fill settings for subsequently drawn shapes. */
  fillSpec(): FillSpec {
    return {
      type: this.globalFillType,
      color: this.globalFillColor,
      endColor: this.globalFillEndColor,
      angle: this.globalFillAngle,
      inner: this.globalFillInner,
    };
  }

  private clampFillInner(f: number): number {
    if (!Number.isFinite(f)) return 0;
    return Math.max(0, Math.min(0.95, f));
  }

  setFillType(t: FillType): void {
    if (t !== 'solid' && t !== 'linear' && t !== 'radial') return;
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        if (!item.fillColor) return;
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.type = t;
        this.applyFillSpec(item, spec);
      });
    } else {
      this.globalFillType = t;
    }
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  setFillEndColor(colorVal: string): void {
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        if (!item.fillColor) return;
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.endColor = colorVal;
        if (spec.type === 'solid') spec.type = 'linear';
        this.applyFillSpec(item, spec);
      });
    } else {
      this.globalFillEndColor = colorVal;
      if (this.globalFillType === 'solid') this.globalFillType = 'linear';
    }
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  setFillAngle(deg: number): void {
    const a = Number.isFinite(deg) ? deg : 0;
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        if (!item.fillColor) return;
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.angle = a;
        if (spec.type === 'solid') spec.type = 'linear';
        this.applyFillSpec(item, spec);
      });
    } else {
      this.globalFillAngle = a;
    }
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  setFillInner(f: number): void {
    const v = this.clampFillInner(f);
    if (this.hasSelection()) {
      this.applyToSelection((item) => {
        if (!item.fillColor) return;
        const spec = this.fillSpecOf(item) ?? this.fillSpec();
        spec.inner = v;
        if (spec.type === 'solid') spec.type = 'radial';
        this.applyFillSpec(item, spec);
      });
    } else {
      this.globalFillInner = v;
    }
    this.updateCurrentDrawingStyles();
    this.updateTextContent();
    this.notify();
  }

  // Read an item's fill back into a spec. Gradient geometry derives from
  // the stops (and origin/destination for linear angle); anything
  // unreadable falls back to a solid of the item's flat color.
  fillSpecOf(item: AnyItem): FillSpec | null {
    const fc = item?.fillColor;
    if (!fc) return null;
    const g = fc.gradient;
    const fallback: FillSpec = {
      type: 'solid',
      color: this.itemHexColor(fc) ?? this.globalFillColor,
      endColor: this.globalFillEndColor,
      angle: this.globalFillAngle,
      inner: this.globalFillInner,
    };
    if (!g) return fallback;
    const stops = g.stops ?? [];
    const c0 = stops.length > 0 ? this.itemHexColor(stops[0].color) : null;
    const c1 =
      stops.length > 1
        ? this.itemHexColor(stops[stops.length - 1].color)
        : null;
    const spec: FillSpec = {
      type: g.radial ? 'radial' : 'linear',
      color: c0 ?? fallback.color,
      endColor: c1 ?? fallback.endColor,
      angle: fallback.angle,
      inner: stops.length > 0 ? this.clampFillInner(Number(stops[0].offset) || 0) : 0,
    };
    const o = fc.origin;
    const d = fc.destination;
    if (o && d && typeof o.subtract === 'function') {
      const v = d.subtract(o);
      if (v.length > 0) {
        spec.angle = (Math.atan2(v.y, v.x) * 180) / Math.PI;
      }
    }
    return spec;
  }

  // Paint an item from a spec. Gradients derive from the item's bounds at
  // apply time, so each shape carries its own geometry.
  applyFillSpec(item: AnyItem, spec: FillSpec = this.fillSpec()): void {
    const scope = this.scope;
    if (!item) return;
    if (spec.type === 'solid' || !item.bounds) {
      item.fillColor = spec.color;
      return;
    }
    const b = item.bounds;
    const c = b.center;
    const r = Math.max(1, Math.hypot(b.width, b.height) / 2);
    const gradient = new scope.Gradient();
    gradient.radial = spec.type === 'radial';
    const inner = spec.type === 'radial' ? this.clampFillInner(spec.inner) : 0;
    gradient.stops = [
      new scope.GradientStop(new scope.Color(spec.color), inner),
      new scope.GradientStop(new scope.Color(spec.endColor), 1),
    ];
    let origin: AnyItem = c;
    let destination: AnyItem = c.add(new scope.Point(r, 0));
    if (spec.type === 'linear') {
      const a = ((spec.angle || 0) * Math.PI) / 180;
      const dir = new scope.Point(Math.cos(a), Math.sin(a));
      origin = c.subtract(dir.multiply(r));
      destination = c.add(dir.multiply(r));
    }
    item.fillColor = { gradient, origin, destination };
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
          if (!item.fillColor) this.applyFillSpec(item, this.fillSpec());
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

  setAngleSnapDegrees(v: number): void {
    if (!Number.isFinite(v)) return;
    this.angleSnapDegrees = Math.min(90, Math.max(1, v));
    this.updateTextContent();
    this.notify();
  }

  setLengthSnappingEnabled(v: boolean): void {
    this.isLengthSnappingEnabled = v;
    this.updateTextContent();
    this.notify();
  }

  setLengthSnapStep(v: number): void {
    if (!Number.isFinite(v)) return;
    this.lengthSnapStep = Math.min(500, Math.max(1, v));
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
    this.circleInnerShapeParams.angle = this.snapShapeAngle(deg);
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
    this.rectangleInnerShapeParams.angle = this.snapShapeAngle(deg);
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  // --- Text setters (Text panel) ---
  private setText(patch: Partial<TextSpec>): void {
    this.globalText = { ...this.globalText, ...patch };
    this.updateTextContent();
    this.notify();
  }

  setTextContent(v: string): void {
    this.setText({ content: v });
  }

  setTextLine2(v: string): void {
    this.setText({ line2: v });
  }

  setTextFontFamily(v: string): void {
    if (!v) return;
    this.setText({ fontFamily: v });
  }

  setTextFontSize(v: number): void {
    if (!Number.isFinite(v)) return;
    this.setText({ fontSize: Math.max(4, Math.min(400, v)) });
  }

  setTextFontWeight(v: string): void {
    if (!v) return;
    this.setText({ fontWeight: v });
  }

  setTextItalic(v: boolean): void {
    this.setText({ italic: !!v });
  }

  setTextJustification(v: TextJustification): void {
    if (v !== 'left' && v !== 'center' && v !== 'right') return;
    this.setText({ justification: v });
  }

  setTextLeading(v: number): void {
    if (!Number.isFinite(v)) return;
    this.setText({ leading: Math.max(0.8, Math.min(3, v)) });
  }

  setTextModeEnabled(v: boolean): void {
    this.textModeEnabled = !!v;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setTextMode(m: TextMode): void {
    if (m !== 'display' && m !== 'body') return;
    this.textMode = m;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setDisplayFlow(f: DisplayFlow): void {
    if (f !== 'interior' && f !== 'exterior') return;
    this.displayFlow = f;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setGlyphOrientation(o: GlyphOrientation): void {
    if (o !== 'outward' && o !== 'inward') return;
    this.glyphOrientation = o;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setSplineTextPlacement(p: SplineTextPlacement): void {
    if (p !== 'above' && p !== 'baseline' && p !== 'below') return;
    this.splineTextPlacement = p;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setDisplayOffset(v: number): void {
    if (!Number.isFinite(v)) return;
    this.displayOffset = Math.max(0, Math.min(200, v));
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setCircumferenceGap(v: number): void {
    if (!Number.isFinite(v)) return;
    this.circumferenceGap = Math.max(0, Math.min(60, v));
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setCircumferenceAngleOffset(v: number): void {
    if (!Number.isFinite(v)) return;
    this.circumferenceAngleOffset = Math.max(-180, Math.min(180, v));
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  // --- Combinatorics (boolean ops on the selection) ---
  // Operand order is selection order: base = first-selected, tool =
  // second-selected. Subtract is non-commutative, so the panel tooltips
  // say so.
  private combinePair(mode: CombineMode): boolean {
    const base = this.selectedItems[0];
    const tool = this.selectedItems[1];
    if (!base || !tool) return false;
    // Paper.js spells the union method "unite".
    const op = mode === 'union' ? base.unite : base[mode];
    if (typeof op !== 'function') return false;
    let result: AnyItem = null;
    try {
      result = op.call(base, tool, { insert: true });
    } catch {
      result = null;
    }
    if (!result) return false;
    this.removeItemFromSelection(base);
    this.removeItemFromSelection(tool);
    base.remove();
    tool.remove();
    result.selected = true;
    this.selectedItems.unshift(result);
    return true;
  }

  canCombineSelection(): boolean {
    if (this.selectedItems.length < 2) return false;
    const base = this.selectedItems[0];
    const tool = this.selectedItems[1];
    return (
      !!base &&
      !!tool &&
      typeof base.unite === 'function' &&
      typeof base.subtract === 'function' &&
      typeof base.intersect === 'function'
    );
  }

  combineSelection(mode: CombineMode): void {
    if (mode !== 'union' && mode !== 'subtract' && mode !== 'intersect') return;
    if (!this.canCombineSelection()) {
      this.lastCombineNote = 'Select two shapes first.';
      this.updateTextContent();
      this.notify();
      return;
    }
    const ok = this.combinePair(mode);
    this.lastCombineNote = ok
      ? ''
      : 'No result — shapes may not overlap.';
    this.updateTextContent();
    this.notify();
  }

  setCombineMode(m: CombineMode | 'none'): void {
    if (m !== 'none' && m !== 'union' && m !== 'subtract' && m !== 'intersect')
      return;
    this.combineMode = m;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  // Do two shapes touch (overlap, edge-touch, or containment either
  // way)? intersects() only sees curve crossings, so a shape fully
  // inside another needs the containment checks. Unknown shapes count
  // as touching (attempt the op) rather than risk skipping a real cut.
  private somePointOn(item: AnyItem): AnyItem | null {
    try {
      if (item.segments && item.segments.length > 0)
        return item.segments[0].point;
      if (Array.isArray(item.children)) {
        for (const c of item.children) {
          const p = this.somePointOn(c);
          if (p) return p;
        }
      }
      if (item.bounds) return item.bounds.center;
    } catch {
      // Fall through to null.
    }
    return null;
  }

  private shapesTouch(a: AnyItem, b: AnyItem): boolean {
    try {
      if (a && b && typeof a.intersects === 'function' && a.intersects(b))
        return true;
      const pa = this.somePointOn(a);
      const pb = this.somePointOn(b);
      if (pa && this.containsPoint(b, pa)) return true;
      if (pb && this.containsPoint(a, pb)) return true;
      return false;
    } catch {
      return true;
    }
  }

  // Remove a layer item entirely: out of the selection and off the
  // layer. Missing parents (detached clones, already-removed items) are
  // not errors.
  private dropItem(item: AnyItem): void {
    if (!item) return;
    this.removeItemFromSelection(item);
    try {
      if (item.parent != null) item.remove();
    } catch {
      // Detached already.
    }
  }

  // Fresh shape text for a boolean result when Text Mode is on. Falls
  // back to the bare geometry when derivation fails (e.g. compounds
  // paper cannot walk for glyphs).
  private retextResult(geo: AnyItem): AnyItem {
    if (!this.textModeEnabled) return geo;
    try {
      return this.withShapeText(geo, false);
    } catch {
      return geo;
    }
  }

  // Deposit-time combinatorics: a deposited shape combines with every
  // combinable shape it touches, using the persistent combine mode —
  // no selection needed. Union merges everything touched plus the
  // deposit into one shape (deposit paint wins); subtract cuts the
  // deposit out of each touched shape and consumes the deposit itself
  // (returns null: nothing to place); intersect keeps the deposit's
  // overlap with the union of what it touches. Returns the item to
  // place on the layer, the input untouched when the mode is 'none',
  // nothing is touched, or an op fails. Shape+text groups combine by
  // geometry and get fresh text re-derived from the result when Text
  // Mode is on. Callers place a non-null return; consumed operands are
  // already removed. Results stay unselected, matching plain deposits.
  depositWithCombine(deposited: AnyItem): AnyItem | null {
    if (!deposited || this.combineMode === 'none') return deposited;
    const opName = this.combineMode === 'union' ? 'unite' : this.combineMode;
    const depositGeo = this.shapePartOf(deposited);
    if (!depositGeo || typeof depositGeo[opName] !== 'function') {
      return deposited;
    }
    // Touching = top-level active-layer art the deposit overlaps.
    // Live drawing state, previews, cursors, and the grid are never
    // targets (mirrors isNonContentItem plus the in-progress stroke).
    const targets: Array<{ geo: AnyItem; container: AnyItem }> = [];
    const layer = this.scope.project.activeLayer;
    for (const item of [...layer.children]) {
      if (!item || item === deposited) continue;
      if (item === this.path || item === this.quadPath) continue;
      if (this.isNonContentItem(item)) continue;
      const geo = this.shapePartOf(item);
      if (!geo || geo === depositGeo || typeof geo[opName] !== 'function')
        continue;
      if (!this.shapesTouch(depositGeo, geo)) continue;
      targets.push({ geo, container: item });
    }
    if (targets.length === 0) return deposited;
    // insert:false keeps intermediates off the layer throughout.
    try {
      if (this.combineMode === 'subtract') {
        // Two-phase: compute every cut detached first, so a throwing
        // op cannot leave half the touched shapes modified.
        const cuts: Array<{
          container: AnyItem;
          cut: AnyItem | null;
          wasSelected: boolean;
        }> = [];
        for (const { geo, container } of targets) {
          cuts.push({
            container,
            cut: geo.subtract(depositGeo, { insert: false }),
            wasSelected: this.selectedItems.indexOf(container) !== -1,
          });
        }
        for (const { container, cut, wasSelected } of cuts) {
          this.dropItem(container);
          // Fully covered base vanishes entirely; otherwise the cut
          // replaces it, keeping its selection membership and paint
          // (first-operand convention).
          if (cut && Math.abs(cut.area || 0) > 1e-6) {
            const replaced = this.retextResult(cut);
            layer.addChild(replaced);
            if (wasSelected) this.addItemToSelection(replaced);
          }
        }
        // The deposit is the cutter: it never survives a subtract.
        for (const doomed of new Set([deposited, depositGeo])) {
          try {
            if (doomed && doomed.parent != null) doomed.remove();
          } catch {
            // Detached already.
          }
        }
        this.lastCombineNote = '';
        return null;
      }
      // Union folds everything touched plus the deposit (deposit paint
      // wins as the first operand); intersect keeps the deposit's
      // overlap with the union of what it touches.
      let acc: AnyItem = depositGeo;
      if (this.combineMode === 'intersect') {
        let union: AnyItem = targets[0].geo;
        for (const { geo } of targets.slice(1)) {
          union = union.unite(geo, { insert: false });
          if (!union) throw new Error('empty union');
        }
        acc = depositGeo.intersect(union, { insert: false });
      } else {
        for (const { geo } of targets) {
          acc = acc.unite(geo, { insert: false });
          if (!acc) throw new Error('empty union');
        }
      }
      if (!acc || !(Math.abs(acc.area || 0) > 1e-6)) {
        throw new Error('empty boolean result');
      }
      for (const { container } of targets) this.dropItem(container);
      for (const doomed of new Set([deposited, depositGeo])) {
        try {
          if (doomed && doomed.parent != null) doomed.remove();
        } catch {
          // Detached already.
        }
      }
      this.lastCombineNote = '';
      return this.retextResult(acc);
    } catch {
      this.lastCombineNote = 'No result — shapes may not overlap.';
      return deposited;
    }
  }

  // Parallelogram / trapezoid interior angle. 180° is a line; keep a
  // usable wedge on either side of 90°.
  clampShapeAngle(deg: number): number {
    if (!Number.isFinite(deg)) return 60;
    return Math.max(10, Math.min(170, deg));
  }

  // Slider grid for the trapezoid / parallelogram angle: 15° steps from
  // 15°. Typed entries snap onto the same grid as the slider.
  snapShapeAngle(deg: number): number {
    const c = this.clampShapeAngle(deg);
    return Math.max(15, Math.min(165, Math.round(c / 15) * 15));
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
    if (this.fillEnabled) {
      this.applyFillSpec(item, this.fillSpec());
    } else {
      item.fillColor = null;
    }
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
    const stepDeg =
      Number.isFinite(this.angleSnapDegrees) && this.angleSnapDegrees > 0
        ? this.angleSnapDegrees
        : 15;
    const stepRad = (stepDeg * Math.PI) / 180;
    const snappedAngle = Math.round(angleRad / stepRad) * stepRad;
    return new scope.Point(
      basePoint.x + Math.cos(snappedAngle) * len,
      basePoint.y + Math.sin(snappedAngle) * len,
    );
  }

  applyLengthSnapping(basePoint: AnyItem, targetPoint: AnyItem): AnyItem {
    const scope = this.scope;
    if (!this.isLengthSnappingEnabled || !basePoint || !targetPoint) {
      return targetPoint;
    }
    const step =
      Number.isFinite(this.lengthSnapStep) && this.lengthSnapStep > 0
        ? this.lengthSnapStep
        : 10;
    const dx = targetPoint.x - basePoint.x;
    const dy = targetPoint.y - basePoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return targetPoint;
    const snappedLen = Math.max(step, Math.round(len / step) * step);
    return new scope.Point(
      basePoint.x + (dx / len) * snappedLen,
      basePoint.y + (dy / len) * snappedLen,
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
      this.previewSplineText,
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

  // Screen-space endpoint tolerance in project units.
  private endpointTolerance(): number {
    return this.endpointSnapTolerance / (this.scope.view.zoom || 1);
  }

  private drawingIgnoredItems(): Set<AnyItem> {
    return new Set([
      this.path,
      this.previewPath,
      this.previewShape,
      this.previewRect,
      this.previewLine,
      this.previewInner,
      this.previewSplineText,
      this.quadPath,
      this.pathSnapCursor,
      this.gridCursor,
    ]);
  }

  // Nearest endpoint (first/last segment point) of an existing open path
  // within tolerance. Ties prefer the drawing end.
  findOpenEndpointNear(
    pt: AnyItem,
  ): { path: AnyItem; atStart: boolean } | null {
    const scope = this.scope;
    if (!pt) return null;
    const ignored = this.drawingIgnoredItems();
    const tol = this.endpointTolerance();
    let best: { path: AnyItem; atStart: boolean } | null = null;
    let bestDist = tol;
    const items: AnyItem[] = scope.project.getItems({
      match: (item: AnyItem) => {
        if (!item || ignored.has(item)) return false;
        if (!item.segments || item.segments.length === 0) return false;
        if (item.closed) return false;
        return true;
      },
    });
    for (const item of items) {
      const segs = item.segments;
      const dFirst = segs[0].point.getDistance(pt);
      const dLast = segs[segs.length - 1].point.getDistance(pt);
      if (dLast <= bestDist) {
        bestDist = dLast;
        best = { path: item, atStart: false };
      }
      if (dFirst < bestDist) {
        bestDist = dFirst;
        best = { path: item, atStart: true };
      }
    }
    return best;
  }

  // Start a stroke on an open path's drawing end: adopt that path so the
  // new points continue the shape instead of starting a separate one.
  // The adopting keypress adds no point; the endpoint is already current.
  private tryContinuePath(): boolean {
    if (!this.continuePathFromEndpoint || !this.mousePt) return false;
    const hit = this.findOpenEndpointNear(this.mousePt);
    if (!hit || hit.atStart) return false;
    const segs = hit.path.segments;
    this.path = hit.path;
    this.continuedPathBaseCount = segs.length;
    this.mousePt = segs[segs.length - 1].point.clone();
    const idx = this.selectedItems.indexOf(hit.path);
    if (idx !== -1) this.selectedItems.splice(idx, 1);
    if (this.isDrawingPath === false) this.isDrawingPath = true;
    this.resetLiveAdjust();
    return true;
  }

  private cloneSegmentInto(path: AnyItem, seg: AnyItem): void {
    const added = path.add(seg.point.clone());
    if (!added) return;
    if (seg.handleIn) added.handleIn = seg.handleIn.clone();
    if (seg.handleOut) added.handleOut = seg.handleOut.clone();
  }

  // END on another open path's endpoint: connect the drawing to it. The
  // cursor point snaps onto the target endpoint for a clean joint, and
  // the duplicate joint point is skipped so no zero-length segment forms.
  // Ending on the target's end appends our points to it (it keeps its own
  // styles); ending on its start appends its points to our drawing, which
  // is then finalized with the current styles.
  private joinDrawingInto(target: AnyItem, atStart: boolean): void {
    const ours = this.path.segments;
    const tsegs = target.segments;
    const joint = atStart
      ? tsegs[0].point
      : tsegs[tsegs.length - 1].point;
    ours[ours.length - 1].point = joint.clone();
    if (atStart) {
      for (let i = 1; i < tsegs.length; i++) {
        this.cloneSegmentInto(this.path, tsegs[i]);
      }
      const idx = this.selectedItems.indexOf(target);
      if (idx !== -1) this.selectedItems.splice(idx, 1);
      target.remove();
      this.applyCurrentStyles(this.path);
      if (this.fillEnabled) this.path.closed = true;
    } else {
      for (let i = 0; i < ours.length - 1; i++) {
        this.cloneSegmentInto(target, ours[i]);
      }
      this.path = target;
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
    this.commitMoveGesture();
    const before = this.contentItems();
    const selBefore = [...this.selectedItems];
    for (let i = this.selectedItems.length - 1; i >= 0; i--) {
      const item = this.selectedItems[i];
      this.removeItemFromSelection(item);
      item.remove();
    }
    this.selectedItems = [];
    this.recordSceneCommand(
      selBefore.length > 1 ? `Delete ${selBefore.length} items` : 'Delete',
      before,
      selBefore,
      [],
    );
    this.setIsInDragLock(false);
  }

  setIsInDragLock(status: boolean): void {
    if (status && !this.isInDragLock) this.beginMoveGesture();
    if (!status && this.isInDragLock) this.commitMoveGesture();
    this.isInDragLock = status;
    this.updateTextContent();
    this.notify();
  }

  hasSelection(): boolean {
    return this.selectedItems.length > 0;
  }

  // --- History (undo/redo) ---
  // Commands hold live item refs plus layer anchors (the surviving
  // successor at record time), so undo/redo reinsert at the original
  // z-order and degrade to append when the anchor is gone. Every op is
  // guarded by isInScene, so a command touching items that a later
  // non-undoable op (e.g. panel combinatorics) already consumed is a
  // harmless no-op instead of a crash.
  private history = new UndoManager(100, 800, () => this.notify());
  private moveGesture: { items: AnyItem[]; points: AnyItem[] } | null =
    null;

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  undoLabel(): string | null {
    return this.history.undoLabel();
  }

  redoLabel(): string | null {
    return this.history.redoLabel();
  }

  undo(): void {
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad)
      return;
    this.moveGesture = null;
    this.history.undo();
    this.updateTextContent();
    this.notify();
  }

  redo(): void {
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad)
      return;
    this.moveGesture = null;
    this.history.redo();
    this.updateTextContent();
    this.notify();
  }

  // Top-level active-layer artwork. Live previews, cursors, and the
  // grid are excluded so a snapshot can never resurrect UI chrome.
  private contentItems(): AnyItem[] {
    const layer = this.scope.project
      ? this.scope.project.activeLayer
      : null;
    if (!layer) return [];
    const out: AnyItem[] = [];
    for (const child of [...layer.children]) {
      if (!this.isNonContentItem(child)) out.push(child);
    }
    return out;
  }

  // True while the item is reachable from the active layer.
  private isInScene(item: AnyItem): boolean {
    if (!item) return false;
    const layer = this.scope.project
      ? this.scope.project.activeLayer
      : null;
    let p: AnyItem = item;
    while (p) {
      if (p === layer) return true;
      p = p.parent;
    }
    return false;
  }

  private insertContentAt(item: AnyItem, anchor: AnyItem | null): void {
    const layer = this.scope.project
      ? this.scope.project.activeLayer
      : null;
    if (!layer) return;
    try {
      if (anchor && anchor.parent === layer) {
        layer.insertChild(anchor.index, item);
      } else {
        layer.addChild(item);
      }
    } catch {
      try {
        layer.addChild(item);
      } catch {
        // Detached; nothing to restore.
      }
    }
  }

  private restoreSelection(items: AnyItem[]): void {
    for (const s of [...this.selectedItems]) {
      try {
        s.selected = false;
      } catch {
        // Already gone.
      }
    }
    this.selectedItems = [];
    for (const it of items) {
      if (it && this.isInScene(it)) {
        try {
          it.selected = true;
          this.selectedItems.push(it);
        } catch {
          // Already gone.
        }
      }
    }
  }

  // Record one undoable scene mutation. `before` is the content
  // snapshot taken before the mutation; `explicitPlaced` names items
  // that already lived in the layer (the live stroke/quad being
  // finished) so the add/remove diff alone would miss them. Fresh
  // constructs, combine results, and combine victims are all derived
  // from the diff, so armed deposit-time combinatorics is captured as
  // one composite deposit entry. Segment-level edits of an adopted
  // path (END-join continuation) are NOT captured — only the
  // resulting item's placement is.
  private recordSceneCommand(
    label: string,
    before: AnyItem[],
    selBefore: AnyItem[],
    explicitPlaced: Array<AnyItem | null>,
  ): void {
    const layer = this.scope.project
      ? this.scope.project.activeLayer
      : null;
    if (!layer) return;
    const after = this.contentItems();
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const placed: AnyItem[] = [];
    for (const item of explicitPlaced) {
      if (item && this.isInScene(item) && placed.indexOf(item) === -1)
        placed.push(item);
    }
    for (const item of after) {
      if (!beforeSet.has(item) && placed.indexOf(item) === -1)
        placed.push(item);
    }
    const victims = before.filter((item) => {
      if (afterSet.has(item)) return false;
      // Reparented into a placed group (finished stroke + derived
      // text): hidden inside the deposit, not gone.
      let p = item.parent;
      while (p) {
        if (placed.indexOf(p) !== -1) return false;
        p = p.parent;
      }
      return true;
    });
    if (placed.length === 0 && victims.length === 0) return;
    // Anchors: each item reinserts before its surviving successor, or
    // appends when the anchor is gone.
    const placedSet = new Set(placed);
    const anchorAfter = new Map<AnyItem, AnyItem | null>();
    const orderAfter = new Map<AnyItem, number>();
    after.forEach((item, i) => orderAfter.set(item, i));
    for (const item of placed) {
      const i = orderAfter.get(item) ?? -1;
      let next: AnyItem | null = null;
      for (let j = i + 1; j < after.length; j++) {
        if (!placedSet.has(after[j])) {
          next = after[j];
          break;
        }
      }
      anchorAfter.set(item, next);
    }
    const victimSet = new Set(victims);
    const anchorBefore = new Map<AnyItem, AnyItem | null>();
    const orderBefore = new Map<AnyItem, number>();
    before.forEach((item, i) => orderBefore.set(item, i));
    for (const item of victims) {
      const i = orderBefore.get(item) ?? -1;
      let next: AnyItem | null = null;
      for (let j = i + 1; j < before.length; j++) {
        if (!victimSet.has(before[j])) {
          next = before[j];
          break;
        }
      }
      anchorBefore.set(item, next);
    }
    const selAfter = [...this.selectedItems];
    // Descending insertion before each anchor restores exact order.
    const orderedVictims = [...victims].sort(
      (a, b) => (orderBefore.get(b) ?? 0) - (orderBefore.get(a) ?? 0),
    );
    const orderedPlaced = [...placed].sort(
      (a, b) => (orderAfter.get(b) ?? 0) - (orderAfter.get(a) ?? 0),
    );
    this.history.push({
      label,
      undo: () => {
        for (const item of placed) {
          if (this.isInScene(item)) {
            this.removeItemFromSelection(item);
            try {
              item.remove();
            } catch {
              // Already gone.
            }
          }
        }
        for (const item of orderedVictims) {
          if (!this.isInScene(item))
            this.insertContentAt(item, anchorBefore.get(item) ?? null);
        }
        this.restoreSelection(selBefore);
      },
      redo: () => {
        for (const item of victims) {
          if (this.isInScene(item)) {
            this.removeItemFromSelection(item);
            try {
              item.remove();
            } catch {
              // Already gone.
            }
          }
        }
        for (const item of orderedPlaced) {
          if (!this.isInScene(item))
            this.insertContentAt(item, anchorAfter.get(item) ?? null);
        }
        this.restoreSelection(selAfter);
      },
    });
  }

  // --- History: moves ---
  // A drag, drag-lock run, or nudge burst is one entry holding
  // per-item before/after positions. Only top-level items are
  // restored: once grouped, an item's position is group-relative and
  // the group's own move entry owns it.
  private makeMoveCommand(
    entries: MoveEntry[],
    coalesceKey?: string,
  ): MoveCommand {
    const activeLayerOf = (): AnyItem =>
      this.scope.project ? this.scope.project.activeLayer : null;
    const cmd: MoveCommand = {
      label:
        entries.length > 1 ? `Move ${entries.length} items` : 'Move',
      entries,
      undo: () => {
        const layer = activeLayerOf();
        for (const e of entries) {
          if (e.item && layer && e.item.parent === layer) {
            try {
              e.item.position = e.before.clone();
            } catch {
              // Already gone.
            }
          }
        }
      },
      redo: () => {
        const layer = activeLayerOf();
        for (const e of entries) {
          if (e.item && layer && e.item.parent === layer) {
            try {
              e.item.position = e.after.clone();
            } catch {
              // Already gone.
            }
          }
        }
      },
    };
    if (coalesceKey !== undefined) {
      cmd.coalesceKey = coalesceKey;
      cmd.absorb = (next: UndoCommand): boolean => {
        const n = next as MoveCommand;
        if (!Array.isArray(n.entries) || n.entries.length !== entries.length)
          return false;
        for (let i = 0; i < entries.length; i++) {
          if (n.entries[i].item !== entries[i].item) return false;
        }
        for (let i = 0; i < entries.length; i++)
          entries[i].after = n.entries[i].after;
        return true;
      };
    }
    return cmd;
  }

  private beginMoveGesture(): void {
    const items = [...this.selectedItems];
    if (items.length === 0) {
      this.moveGesture = null;
      return;
    }
    this.moveGesture = {
      items,
      points: items.map((it) =>
        it.position ? it.position.clone() : null,
      ),
    };
  }

  // Push one move entry for the in-flight gesture when anything
  // actually moved. Safe to call with no gesture active.
  private commitMoveGesture(coalesceKey?: string): void {
    const g = this.moveGesture;
    this.moveGesture = null;
    if (!g) return;
    const layer = this.scope.project
      ? this.scope.project.activeLayer
      : null;
    const entries: MoveEntry[] = [];
    for (let i = 0; i < g.items.length; i++) {
      const item = g.items[i];
      const before = g.points[i];
      if (!item || !before || !item.position) continue;
      if (!layer || item.parent !== layer) continue;
      const after = item.position.clone();
      try {
        if (after.getDistance(before) > 1e-9)
          entries.push({ item, before, after });
      } catch {
        // Unmeasurable; skip.
      }
    }
    if (entries.length === 0) return;
    this.history.push(this.makeMoveCommand(entries, coalesceKey));
  }

  // --- History: groups ---
  // A user group (data.isUserGroup) moves and selects as one item.
  // Shape+text groups (data.shapeTextGroup / data.isShapeText) are
  // atomic artwork and are never treated as user groups.
  private topUserGroupOf(item: AnyItem): AnyItem {
    let cur = item;
    while (
      cur &&
      cur.parent &&
      cur.parent.data &&
      cur.parent.data.isUserGroup
    ) {
      cur = cur.parent;
    }
    return cur;
  }

  private groupableMembers(): AnyItem[] {
    const layer = this.scope.project
      ? this.scope.project.activeLayer
      : null;
    const out: AnyItem[] = [];
    const seen = new Set<AnyItem>();
    for (const it of this.selectedItems) {
      if (!it || !this.isInScene(it)) continue;
      const top = this.topUserGroupOf(it);
      if (seen.has(top)) continue;
      seen.add(top);
      if (top.parent === layer) out.push(top);
    }
    return out;
  }

  canGroupSelection(): boolean {
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad)
      return false;
    return this.groupableMembers().length >= 2;
  }

  canUngroupSelection(): boolean {
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad)
      return false;
    for (const it of this.selectedItems) {
      if (it && it.data && it.data.isUserGroup && this.isInScene(it))
        return true;
    }
    return false;
  }

  groupSelection(): void {
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad)
      return;
    const members = this.groupableMembers();
    if (members.length < 2) return;
    const layer = this.scope.project.activeLayer;
    const selBefore = [...this.selectedItems];
    let at = members[0].index;
    for (const m of members) {
      if (m.index < at) at = m.index;
    }
    const group: AnyItem = new this.scope.Group(members);
    group.data.isUserGroup = true;
    try {
      layer.insertChild(Math.min(at, layer.children.length), group);
    } catch {
      try {
        layer.addChild(group);
      } catch {
        // Detached; nothing to record.
      }
    }
    group.selected = true;
    this.selectedItems = [group];
    const kids = [...members];
    this.history.push({
      label: `Group ${kids.length} items`,
      undo: () => {
        const idx = Math.max(0, group.index);
        for (let i = kids.length - 1; i >= 0; i--) {
          try {
            layer.insertChild(
              Math.min(idx, layer.children.length),
              kids[i],
            );
          } catch {
            try {
              layer.addChild(kids[i]);
            } catch {
              // Detached; skip.
            }
          }
        }
        this.removeItemFromSelection(group);
        try {
          group.remove();
        } catch {
          // Already gone.
        }
        this.restoreSelection(selBefore);
      },
      redo: () => {
        for (const k of kids) {
          if (this.isInScene(k) && k.parent !== group) {
            try {
              group.addChild(k);
            } catch {
              // Gone; skip.
            }
          }
        }
        if (!this.isInScene(group)) {
          try {
            layer.insertChild(
              Math.min(at, layer.children.length),
              group,
            );
          } catch {
            try {
              layer.addChild(group);
            } catch {
              // Detached; skip.
            }
          }
        }
        this.restoreSelection([group]);
      },
    });
    this.updateTextContent();
    this.notify();
  }

  ungroupSelected(): void {
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad)
      return;
    const groups = this.selectedItems.filter(
      (it) => it && it.data && it.data.isUserGroup && this.isInScene(it),
    );
    if (groups.length === 0) return;
    const layer = this.scope.project.activeLayer;
    const selBefore = [...this.selectedItems];
    const parts = groups.map((g: AnyItem) => ({
      group: g,
      kids: [...g.children] as AnyItem[],
      at: Math.max(0, g.index),
    }));
    const apply = (): AnyItem[] => {
      const out: AnyItem[] = [];
      for (const p of parts) {
        this.removeItemFromSelection(p.group);
        const kidsNow = [...p.group.children] as AnyItem[];
        kidsNow.forEach((k, i) => {
          try {
            layer.insertChild(
              Math.min(p.at + i, layer.children.length),
              k,
            );
          } catch {
            try {
              layer.addChild(k);
            } catch {
              // Detached; skip.
            }
          }
        });
        try {
          p.group.remove();
        } catch {
          // Already gone.
        }
        out.push(...kidsNow.filter((k) => this.isInScene(k)));
      }
      return out;
    };
    const kids = apply();
    this.restoreSelection(kids);
    this.history.push({
      label:
        groups.length > 1
          ? `Ungroup ${groups.length} groups`
          : 'Ungroup',
      undo: () => {
        for (const p of parts) {
          for (const k of p.kids) {
            if (this.isInScene(k) && k.parent !== p.group) {
              try {
                p.group.addChild(k);
              } catch {
                // Gone; skip.
              }
            }
          }
          if (!this.isInScene(p.group)) {
            try {
              layer.insertChild(
                Math.min(p.at, layer.children.length),
                p.group,
              );
            } catch {
              try {
                layer.addChild(p.group);
              } catch {
                // Detached; skip.
              }
            }
          }
        }
        this.restoreSelection(selBefore);
      },
      redo: () => {
        const redone = apply();
        this.restoreSelection(redone);
      },
    });
    this.updateTextContent();
    this.notify();
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
    fillSpec: FillSpec;
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
      fillSpec: this.fillSpecOf(it) ?? this.fillSpec(),
    };
  }

  // --- Drawing tools (drawingToolsAndFunctions.js) ---
  stampItems(itemsToStamp: AnyItem[] | null): void {
    if (itemsToStamp === null) return;
    const before = this.contentItems();
    const selBefore = [...this.selectedItems];
    for (let i = 0; i < itemsToStamp.length; i++) {
      const clone = itemsToStamp[i].clone();
      clone.selected = false;
      this.scope.project.activeLayer.addChild(clone);
    }
    this.recordSceneCommand(
      itemsToStamp.length > 1
        ? `Stamp ${itemsToStamp.length} items`
        : 'Stamp',
      before,
      selBefore,
      [],
    );
  }

  cancelCurrentDrawingOperation(): void {
    if (this.previewInner) {
      this.previewInner.remove();
      this.previewInner = null;
    }
    this.clearSplineTextPreview();
    if (this.isDrawingPath && this.path) {
      if (this.continuedPathBaseCount != null) {
        // Continuing an existing shape: strip only the newly added points
        // (including the live preview) so the original shape survives.
        while (this.path.segments.length > this.continuedPathBaseCount) {
          this.path.removeSegment(this.path.segments.length - 1);
        }
      } else {
        this.path.remove();
      }
      this.path = null;
      this.isDrawingPath = false;
      this.continuedPathBaseCount = null;
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
    this.resetLiveAdjust();
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

  // --- Shape text (Display / Body / Circumference) ---
  // Glyph color follows the fill toggle so text matches painted shapes:
  // fill color when fill is on, otherwise the stroke color.
  private textInk(): string {
    return this.fillEnabled ? this.globalFillColor : this.globalStrokeColor;
  }

  private styleTextItem(item: AnyItem, spec: TextSpec = this.globalText): void {
    if (!item) return;
    item.fontFamily = spec.fontFamily;
    item.fontSize = Math.max(4, spec.fontSize);
    item.fontWeight = spec.fontWeight;
    item.fillColor = this.textInk();
    item.strokeColor = null;
    item.justification = spec.justification;
    const leading = Math.max(0.8, spec.leading || 1.2) * Math.max(4, spec.fontSize);
    item.leading = leading;
    item.data.isShapeText = true;
  }

  /**
   * Geometry child of a shape+text group (marked data.shapeTextGroup by
   * withShapeText): the child without text styling. Plain items return
   * themselves, so paint call sites stay uniform.
   */
  private shapePartOf(item: AnyItem): AnyItem {
    if (
      item &&
      item.data &&
      item.data.shapeTextGroup &&
      Array.isArray(item.children)
    ) {
      const geo = item.children.find(
        (c: AnyItem) => !(c.data && c.data.isShapeText),
      );
      if (geo) return geo;
    }
    return item;
  }

  /**
   * Attach derived text to finished geometry under Text Mode: Display
   * flows around the boundary, Body fills the interior. Returns the
   * geometry untouched when Text Mode is off or no text results.
   */
  private withShapeText(
    path: AnyItem,
    isPreview: boolean,
    textRotation = 0,
    center: AnyItem = null,
  ): AnyItem {
    if (!path || !this.textModeEnabled) return path;
    const text =
      this.textMode === 'body'
        ? this.createBodyTextFor(path)
        : this.createBoundaryText(path);
    if (!text) return path;
    if (
      Number.isFinite(textRotation) &&
      textRotation !== 0 &&
      center &&
      text.children
    ) {
      text.rotate(textRotation, center);
    }
    const group: AnyItem = new this.scope.Group();
    group.addChild(path);
    group.addChild(text);
    group.data.shapeTextGroup = true;
    if (isPreview) this.fadeShapeText(text);
    return group;
  }

  /** Fade preview text to match the dashed-geometry preview treatment. */
  private fadeShapeText(item: AnyItem): void {
    if (!item) return;
    if (item.className === 'PointText') {
      item.opacity = 0.7;
      return;
    }
    if (Array.isArray(item.children)) {
      item.children.forEach((c: AnyItem) => this.fadeShapeText(c));
    }
  }

  // Live spline text: rebuild the derived Display/Body text for the
  // in-progress stroke, faded like other previews. The stroke itself is
  // untouched; the group is ignored by content hit-testing and snapping
  // and is cleared on finalize/cancel.
  private refreshSplineTextPreview(): void {
    const scope = this.scope;
    if (this.previewSplineText) {
      this.previewSplineText.remove();
      this.previewSplineText = null;
    }
    if (!this.isDrawingPath || !this.path || !this.textModeEnabled) return;
    if (this.path.segments.length < 2) return;
    let text: AnyItem = null;
    try {
      text =
        this.textMode === 'body'
          ? this.createBodyTextFor(this.path)
          : this.createBoundaryText(this.path);
    } catch {
      text = null;
    }
    if (!text) return;
    this.fadeShapeText(text);
    this.addPreviewShadow(text);
    this.previewSplineText = text;
    scope.project.activeLayer.addChild(text);
  }

  private clearSplineTextPreview(): void {
    if (this.previewSplineText) {
      this.previewSplineText.remove();
      this.previewSplineText = null;
    }
  }

  /** Clear preview fading after a preview group is stamped/finalized. */
  private resetStampedText(item: AnyItem): void {
    if (!item) return;
    item.opacity = 1;
    if (Array.isArray(item.children)) {
      item.children.forEach((c: AnyItem) => this.resetStampedText(c));
    }
  }

  private containsPoint(boundary: AnyItem, pt: AnyItem): boolean {
    try {
      return !!boundary.contains(pt);
    } catch {
      return false;
    }
  }

  /** Word-wrap shared by every Body Text container. */
  private layoutBodyLines(
    spec: TextSpec,
    maxWidth: number,
    content?: string,
  ): string[] {
    const words = (content ?? spec.content).split(/\s+/).filter(Boolean);
    const size = Math.max(4, spec.fontSize);
    // Kerned advances from parsed font bytes when available, else
    // canvas measurement, else an em estimate.
    const widthOf = (s: string): number =>
      this.textMetrics.advance(s, spec.fontFamily, size, spec.fontWeight);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (cur && widthOf(trial) > maxWidth) {
        lines.push(cur);
        cur = w;
      } else {
        cur = trial;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length === 0) lines.push(' ');
    return lines;
  }

  /**
   * Body text: the string word-wrapped to the boundary width, centered on
   * its center, and clipped to the boundary itself (Paper.js has no
   * AreaText). Works for any closed shape: hexagon, circle, rect frame.
   */
  createBodyTextFor(boundary: AnyItem, content?: string): AnyItem | null {
    const scope = this.scope;
    const spec = this.globalText;
    const bounds = boundary.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const size = Math.max(4, spec.fontSize);
    const lines = this.layoutBodyLines(
      spec,
      Math.max(8, bounds.width * 0.75),
      content,
    );
    const leading = Math.max(0.8, spec.leading || 1.2) * size;
    const group: AnyItem = new scope.Group();
    const startY = bounds.center.y - ((lines.length - 1) * leading) / 2;
    lines.forEach((line, i) => {
      const pt: AnyItem = new scope.PointText(
        new scope.Point(bounds.center.x, startY + i * leading),
      );
      pt.content = line;
      this.styleTextItem(pt, spec);
      pt.data.textKind = 'body';
      group.addChild(pt);
    });
    // Open spline strokes have no interior to clip to: keep the centered
    // wrapped lines visible instead of masking them away.
    if (boundary.closed !== false) {
      const mask: AnyItem = boundary.clone();
      mask.clipMask = true;
      group.addChild(mask);
    }
    group.data.isShapeText = true;
    group.data.textKind = 'body';
    return group;
  }

  /**
   * Display text: one PointText per glyph walked along the boundary by arc
   * length, oriented by the local tangent, offset inward (interior) or
   * outward (exterior) by displayOffset per ring. The start offset is the
   * configured degrees mapped onto total loop length, so circles keep
   * their historic placement. Non-empty second line runs a second ring.
   */
  createBoundaryText(
    boundary: AnyItem,
    content?: string,
    line2?: string,
  ): AnyItem | null {
    const scope = this.scope;
    const spec = this.globalText;
    const size = Math.max(4, spec.fontSize);
    const L = boundary.length;
    if (!(L > 0)) return null;
    const lines = [content ?? spec.content, line2 ?? spec.line2].filter(
      (s) => s && s.length > 0,
    );
    if (lines.length === 0) return null;
    const offset = Math.max(0, this.displayOffset);
    // Start offset in degrees, negated onto loop fraction: Paper.js
    // circles run counter-clockwise from 3 o'clock, so -90° lands at the
    // top exactly like the historic circle-only layout did.
    const start =
      ((((-this.circumferenceAngleOffset % 360) + 360) % 360) / 360) * L;
    // Which normal side is interior? Probe once; fall back to the
    // centroid side when the offset outgrows the shape. Open paths have
    // no interior: both flows sit on the boundary.
    let interiorSign = 0;
    if (boundary.closed !== false) {
      const p0 = boundary.getPointAt(0);
      let n0 = boundary.getNormalAt(0);
      if (p0 && n0 && n0.length > 0) {
        n0 = n0.normalize();
        const probeLen = Math.max(1, offset);
        const plusIn = this.containsPoint(
          boundary,
          p0.add(n0.multiply(probeLen)),
        );
        const minusIn = this.containsPoint(
          boundary,
          p0.subtract(n0.multiply(probeLen)),
        );
        if (plusIn !== minusIn) {
          interiorSign = plusIn ? 1 : -1;
        } else {
          const b = boundary.bounds;
          const toC = b ? b.center.subtract(p0) : null;
          interiorSign = toC && toC.dot(n0) >= 0 ? 1 : -1;
        }
      }
    }
    const group: AnyItem = new scope.Group();
    lines.forEach((text, li) => {
      const side =
        this.displayFlow === 'interior' ? interiorSign : -interiorSign;
      const ring = offset * (li + 1);
      let d = start;
      let lastTan: number | null = null;
      for (const ch of text) {
        const w =
          ch === ' '
            ? size * 0.4
            : this.textMetrics.advance(
                ch,
                spec.fontFamily,
                size,
                spec.fontWeight,
              );
        const step = w + this.circumferenceGap;
        if (d + step > start + L) break;
        if (ch === ' ') {
          d += step;
          continue;
        }
        const mid = d + w / 2;
        const pos = boundary.getPointAt(mid);
        if (!pos) break;
        const tan = boundary.getTangentAt(mid);
        if (tan && tan.length > 0) lastTan = tan.angle;
        if (lastTan === null) {
          d += step;
          continue;
        }
        let nor = boundary.getNormalAt(mid);
        if (!nor || nor.length === 0) {
          const ra = ((lastTan + 90) * Math.PI) / 180;
          nor = new scope.Point(Math.cos(ra), Math.sin(ra));
        } else {
          nor = nor.normalize();
        }
        const pt: AnyItem = new scope.PointText(new scope.Point(0, 0));
        pt.content = ch;
        this.styleTextItem(pt, spec);
        pt.justification = 'center';
        const at = pos.add(nor.multiply(side * ring));
        pt.position = at;
        // Glyph tops point to the circumference (outward) or the origin
        // (inward) along the local normal, independent of boundary travel
        // direction; degenerate normals fall back to the tangent.
        const facing =
          this.glyphOrientation === 'outward' ? -interiorSign : interiorSign;
        pt.rotate(
          facing !== 0 ? nor.multiply(facing).angle + 90 : lastTan,
          at,
        );
        // Open spline strokes have no ring offset, so centered glyphs
        // would straddle the path: anchor them vertically per the spline
        // placement instead. Closed boundaries keep the ring layout above.
        if (boundary.closed === false) {
          this.anchorSplineGlyph(pt, at, spec, size);
        }
        pt.data.textKind = 'display';
        group.addChild(pt);
        d += step;
      }
    });
    if (group.children.length === 0) {
      group.remove();
      return null;
    }
    group.data.isShapeText = true;
    group.data.textKind = 'display';
    return group;
  }

  /**
   * Shift a spline glyph from path-centered to its spline placement.
   * Paper.js `position` is the visual center while the anchor (`point`)
   * sits on the baseline at center justification, so the anchor rests
   * `dcb` below the center along glyph-up. Moving the center along
   * glyph-up by `dcb` lands the baseline on the spline; Above adds the
   * descent (descender line on the spline) and Below subtracts the
   * ascent (ascender line on the spline).
   */
  private anchorSplineGlyph(
    pt: AnyItem,
    at: AnyItem,
    spec: TextSpec,
    size: number,
  ): void {
    try {
      const center = pt.bounds ? pt.bounds.center : null;
      const anchor = pt.point;
      if (!center || !anchor) return;
      const up = center.subtract(anchor);
      const dcb = up.length;
      if (!(dcb > 0)) return;
      const dir = up.normalize();
      const m = this.textMetrics.vertical(
        spec.fontFamily,
        size,
        spec.fontWeight,
      );
      const extra =
        this.splineTextPlacement === 'above'
          ? m.desc
          : this.splineTextPlacement === 'below'
            ? -m.asc
            : 0;
      pt.position = at.add(dir.multiply(dcb + extra));
    } catch {
      // Keep the centered glyph when bounds are unavailable.
    }
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
    // Rotationally symmetric branches ignore rotationAngle, so text
    // needs it applied explicitly to follow the guide (see below).
    let geoRotates = true;
    switch (currentInnerType) {
      case 'circle':
        path = new scope.Path.Circle(center, radius);
        geoRotates = false;
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
        geoRotates = false;
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
        if (hasFill) {
          this.applyFillSpec(path, this.fillSpec());
        } else {
          path.fillColor = null;
        }
        this.applyStrokeDash(path);
      }
      this.applyStrokeGeometry(path);
    }
    // Text Mode derives text from the finished geometry. Branches that
    // baked the guide rotation in need no extra turn; symmetric ones
    // (circle, rectangle) get the angle applied to the text explicitly.
    return this.withShapeText(
      path,
      isPreview,
      geoRotates ? 0 : rotationAngle,
      center,
    );
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
    const basis = this.rectFrameBasis();
    if (!basis) return null;
    const { o, u, v } = basis;
    const P0 = (s: number, t: number): AnyItem =>
      o.add(u.multiply(s)).add(v.multiply(t));
    // Oriented frame map: rotate (s, t) about the frame center first, so
    // every shape drawn below follows rectangleOrientation and still
    // fits inside the frame bounds.
    const P = (s: number, t: number): AnyItem => P0(...this.rotST(s, t));
    const isPreview = styleOrPreview === 'preview';
    if (type === 'rectangle') {
      // Bare frame: no inner shape — but Text Mode still flows text
      // around the frame itself. The caller draws the frame; only the
      // text group is returned so nothing double-draws.
      if (!this.textModeEnabled) return null;
      const frame = new scope.Path({
        segments: [P(0, 0), P(1, 0), P(1, 1), P(0, 1)],
        closed: true,
      });
      const text =
        this.textMode === 'body'
          ? this.createBodyTextFor(frame)
          : this.createBoundaryText(frame);
      frame.remove();
      if (!text) return null;
      if (isPreview) this.fadeShapeText(text);
      return text;
    }
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
    if (isPreview) {
      path.strokeColor = this.globalStrokeColor;
      path.strokeWidth = this.globalStrokeWidth;
      path.strokeDasharray = [3, 3];
      path.opacity = 0.7;
      path.fillColor = null;
    }
    this.applyStrokeGeometry(path);
    // Text Mode derives text from the finished frame-fitted geometry.
    return this.withShapeText(path, isPreview);
  }

  rectCenterlineKC(): void {
    const scope = this.scope;
    if (this.shapeType === 'rectangle_centerline') {
      const histBefore = this.contentItems();
      const histSel = [...this.selectedItems];
      const placed = this.endShapeAsStroke();
      this.recordSceneCommand('Deposit shape', histBefore, histSel, placed);
      this.updateTextContent();
      return;
    }
    if (this.isDrawingShape) this.cancelCurrentDrawingOperation();
    if (!this.mousePt) return;
    this.resetLiveAdjust();
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
        const histBefore = this.contentItems();
        const histSel = [...this.selectedItems];
        const placed = this.endShapeAsStroke();
        this.recordSceneCommand(
          'Deposit shape',
          histBefore,
          histSel,
          placed,
        );
      }
      return;
    }
    if (this.isDrawingShape || !this.mousePt) return;
    this.resetLiveAdjust();
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
    const histBefore = this.contentItems();
    const histSel = [...this.selectedItems];
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
      this.resetLiveAdjust();
    } else {
      this.quadPath.add(this.mousePt);
      this.quadPointCount++;
      if (this.quadPointCount === 4) {
        this.applyCurrentStyles(this.quadPath);
        this.quadPath.closed = true;
        this.quadPath.selected = false;
        const placed = this.depositWithCombine(this.quadPath);
        if (placed) {
          placed.selected = false;
          if (placed.parent == null) scope.project.activeLayer.addChild(placed);
        }
        this.quadPath = null;
        this.isDrawingQuad = false;
        this.quadPointCount = 0;
        this.resetLiveAdjust();
        this.recordSceneCommand('Deposit shape', histBefore, histSel, [
          placed,
        ]);
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
    const histBefore = this.contentItems();
    const histSel = [...this.selectedItems];
    if (this.isDrawingPath && this.path) {
      const stampedBase = this.path.clone();
      this.applyCurrentStyles(stampedBase);
      if (this.fillEnabled) stampedBase.closed = true;
      const stamped = this.withShapeText(stampedBase, false);
      stamped.selected = false;
      const placedStamp = this.depositWithCombine(stamped);
      if (placedStamp) {
        placedStamp.selected = false;
        placedStamp.opacity = 1;
        scope.project.activeLayer.addChild(placedStamp);
      }
    } else if (this.isDrawingShape) {
      if (
        this.shapeType != null &&
        this.shapeType.startsWith('circle_') &&
        this.previewShape &&
        this.previewShape.radius > 0
      ) {
        const isRadial = this.shapeType === 'circle_radial_stamp';
        const center =
          isRadial && this.mousePt
            ? this.mousePt.clone()
            : this.previewShape.position;
        const radius = this.previewShape.radius;
        const strokeW = this.strokeEnabled ? this.globalStrokeWidth : 0;
        const iradius = isRadial
          ? this.radialStampBaseRadius * this.liveScale
          : Math.max(0, radius - strokeW / 2) * this.liveScale;
        const rotation = isRadial
          ? this.radialStampRotation()
          : this.shapeGuideAngle + this.liveRotateOffset;
        if (center && iradius > 0) {
          const stampedInner = this.createInnerShape(center, iradius, 'stroke', rotation);
          if (stampedInner) {
            this.applyCurrentStyles(this.shapePartOf(stampedInner));
            stampedInner.selected = false;
            const placedInner = this.depositWithCombine(stampedInner);
            if (placedInner) {
              placedInner.selected = false;
              scope.project.activeLayer.addChild(placedInner);
            }
          }
        }
      } else if (
        this.shapeType != null &&
        this.shapeType.startsWith('rectangle_') &&
        this.rectangleInnerShapeType !== 'rectangle'
      ) {
        const stampedShape = this.createRectFrameShape('stroke');
        if (stampedShape) {
          this.applyCurrentStyles(this.shapePartOf(stampedShape));
          stampedShape.selected = false;
          const placedShape = this.depositWithCombine(stampedShape);
          if (placedShape) {
            placedShape.selected = false;
            scope.project.activeLayer.addChild(placedShape);
          }
        }
      } else {
        const framePreview = this.previewShape || this.previewRect || this.previewPath;
        if (framePreview) {
          const stampedFrame = framePreview.clone();
          this.applyCurrentStyles(stampedFrame);
          this.clearShadow(stampedFrame);
          stampedFrame.opacity = 1;
          stampedFrame.selected = false;
          const placedFrame = this.depositWithCombine(stampedFrame);
          if (placedFrame) {
            placedFrame.selected = false;
            scope.project.activeLayer.addChild(placedFrame);
          }
        }
        if (this.previewInner) {
          const stampedInner = this.previewInner.clone();
          this.clearShadow(stampedInner);
          this.resetStampedText(stampedInner);
          const target = this.shapePartOf(stampedInner);
          target.strokeColor = this.strokeEnabled ? this.globalStrokeColor : null;
          target.strokeWidth = this.strokeEnabled ? this.globalStrokeWidth * 0.7 : 0;
          if (this.fillEnabled) {
            this.applyFillSpec(target, this.fillSpec());
          } else {
            target.fillColor = null;
          }
          this.applyStrokeGeometry(target);
          this.applyStrokeDash(target);
          stampedInner.selected = false;
          const placedPreview = this.depositWithCombine(stampedInner);
          if (placedPreview) {
            placedPreview.selected = false;
            scope.project.activeLayer.addChild(placedPreview);
          }
        }
      }
    } else if (this.isDrawingQuad && this.quadPath) {
      const stamped = this.quadPath.clone();
      this.applyCurrentStyles(stamped);
      stamped.closed = true;
      stamped.selected = false;
      const placedQuad = this.depositWithCombine(stamped);
      if (placedQuad) {
        placedQuad.selected = false;
        placedQuad.opacity = 1;
        scope.project.activeLayer.addChild(placedQuad);
      }
    }
    this.recordSceneCommand('Stamp', histBefore, histSel, []);
    this.updateTextContent();
  }

  endPathOrShape(): void {
    const scope = this.scope;
    const histBefore = this.contentItems();
    const histSel = [...this.selectedItems];
    const deposited: Array<AnyItem | null> = [];
    if (this.isDrawingPath && this.path) {
      const segs = this.path.segments;
      const first = segs.length > 0 ? segs[0].point : null;
      const tol = this.endpointTolerance();
      if (
        this.closeShapeOnEndNearStart &&
        first &&
        segs.length >= 3 &&
        this.mousePt &&
        this.mousePt.getDistance(first) <= tol
      ) {
        // END on the shape's own start: the start point becomes the last
        // point and the shape closes (straight, like END).
        this.path.removeSegment(segs.length - 1);
        this.path.add(first.clone());
        this.applyCurrentStyles(this.path);
        this.path.closed = true;
      } else if (this.joinPathsOnEndNearEndpoint && this.mousePt) {
        const hit = this.findOpenEndpointNear(this.mousePt);
        if (hit) {
          this.joinDrawingInto(hit.path, hit.atStart);
        } else {
          this.applyCurrentStyles(this.path);
          if (this.fillEnabled) this.path.closed = true;
        }
      } else {
        this.applyCurrentStyles(this.path);
        if (this.fillEnabled) this.path.closed = true;
      }
      // Text Mode applies to spline drawing too: derive Display/Body
      // text from the finished stroke, same as circle/rect keys. Grouping
      // reparents a continued path out of the layer, so always add the
      // returned group when it has no parent yet.
      const finished = this.withShapeText(this.path, false);
      finished.selected = false;
      // Deposit-time combinatorics folds the stroke into the selection
      // when a combine mode is armed.
      const placed = this.depositWithCombine(finished);
      if (placed) {
        placed.selected = false;
        // A continued path already lives in the layer; re-adding would
        // only reorder it to the front.
        if (placed.parent == null) {
          scope.project.activeLayer.addChild(placed);
        }
      }
      deposited.push(finished);
      this.path = null;
      this.isDrawingPath = false;
      this.continuedPathBaseCount = null;
      this.resetLiveAdjust();
      this.clearSplineTextPreview();
    } else if (this.isDrawingShape) {
      deposited.push(...this.endShapeAsStroke());
      if (this.previewInner) {
        this.previewInner.remove();
        this.previewInner = null;
      }
    } else if (this.isDrawingQuad && this.quadPath) {
      this.applyCurrentStyles(this.quadPath);
      this.quadPath.closed = true;
      this.quadPath.selected = false;
      const placedQuadEnd = this.depositWithCombine(this.quadPath);
      if (placedQuadEnd) {
        placedQuadEnd.selected = false;
        if (placedQuadEnd.parent == null) {
          scope.project.activeLayer.addChild(placedQuadEnd);
        }
      }
      deposited.push(placedQuadEnd);
      this.quadPath = null;
      this.isDrawingQuad = false;
      this.quadPointCount = 0;
      this.resetLiveAdjust();
    }
    this.recordSceneCommand('Deposit shape', histBefore, histSel, deposited);
    this.updateTextContent();
    this.notify();
  }

  polyLineKC(): void {
    const scope = this.scope;
    if (!this.mousePt) return;
    if (!this.path) {
      if (this.tryContinuePath()) {
        this.updateTextContent();
        this.notify();
        return;
      }
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
    if (this.isDrawingPath === false) {
      this.isDrawingPath = true;
      this.resetLiveAdjust();
    }
    this.updateTextContent();
    this.notify();
  }

  splinePointKC(): void {
    const scope = this.scope;
    if (!this.mousePt) return;
    if (!this.path) {
      if (this.tryContinuePath()) {
        this.updateTextContent();
        this.notify();
        return;
      }
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
    if (this.isDrawingPath === false) {
      this.isDrawingPath = true;
      this.resetLiveAdjust();
    }
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

  // A joint drawn with the sharp key carries no handles; a spline joint
  // does. The final segment inherits the character of the joint it leaves.
  private jointIsSpline(seg: AnyItem): boolean {
    if (!seg) return false;
    const hi = seg.handleIn;
    const ho = seg.handleOut;
    return (
      (!!hi && (hi.x !== 0 || hi.y !== 0)) ||
      (!!ho && (ho.x !== 0 || ho.y !== 0))
    );
  }

  // Complete Shape (R key): finish a path being drawn by committing the
  // last segment from where the mouse is, then closing the shape. The
  // trailing live-preview segment is replaced in place so no zero-length
  // stub is left behind. The final segment is a spline only when the
  // joint it leaves is one (all-sharp paths stay all-straight); otherwise
  // it is committed sharp, exactly like the sharp key. When the mouse is
  // near the first point, the final point lands exactly on it.
  completeShapeWithSpline(): void {
    const scope = this.scope;
    if (!this.isDrawingPath || !this.path || !this.mousePt) return;
    const histBefore = this.contentItems();
    const histSel = [...this.selectedItems];
    if (this.path.segments.length > 1) {
      this.path.removeSegment(this.path.segments.length - 1);
    }
    let endPt = this.mousePt;
    const first =
      this.path.segments.length > 0 ? this.path.segments[0].point : null;
    if (first) {
      if (endPt.getDistance(first) <= this.endpointTolerance()) {
        endPt = first.clone();
      }
    }
    const newSegment = this.path.add(endPt);
    const joint =
      this.path.segments.length >= 2
        ? this.path.segments[this.path.segments.length - 2]
        : null;
    if (this.jointIsSpline(joint)) {
      this.smoothLastSplineJoint(newSegment);
    } else if (newSegment) {
      newSegment.handleIn = new scope.Point(0, 0);
      newSegment.handleOut = new scope.Point(0, 0);
    }
    this.applyCurrentStyles(this.path);
    this.path.closed = true;
    const completed = this.withShapeText(this.path, false);
    completed.selected = false;
    const placedComplete = this.depositWithCombine(completed);
    if (placedComplete) {
      placedComplete.selected = false;
      if (placedComplete.parent == null) {
        scope.project.activeLayer.addChild(placedComplete);
      }
    }
    this.path = null;
    this.isDrawingPath = false;
    this.continuedPathBaseCount = null;
    this.resetLiveAdjust();
    this.clearSplineTextPreview();
    this.recordSceneCommand('Deposit shape', histBefore, histSel, [
      completed,
    ]);
    this.updateTextContent();
    this.notify();
  }

  // --- Live-drawing key remaps ---
  // Reserved number-key slots for future live bindings (repeat counts,
  // radius-reference keys, parametric modes). Unbound for now.
  readonly reservedLiveKeySlots = [
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9',
    'Digit0',
  ];

  registerLiveKeyBinding(binding: LiveKeyBinding): void {
    if (!this.liveKeyBindings.some((b) => b.id === binding.id)) {
      this.liveKeyBindings.push(binding);
    }
  }

  private resetLiveAdjust(): void {
    this.liveScale = 1;
    this.liveRotateOffset = 0;
  }

  // Live scale/rotate apply to in-progress paths/quads (transformed about
  // the first point) and to circle-mode previews (folded into the fitted
  // shape). Rect Keys modes keep their existing behavior for now.
  private liveAdjustApplies(): boolean {
    if (this.isDrawingPath || this.isDrawingQuad) return true;
    return (
      this.isDrawingShape &&
      this.shapeType != null &&
      this.shapeType.startsWith('circle_')
    );
  }

  // Rotation baked into Radial Stamp geometry: tangent to the placement
  // circle (guide angle + 90deg) plus the live rotation offset.
  private radialStampRotation(): number {
    return this.shapeGuideAngle + 90 + this.liveRotateOffset;
  }

  private liveScaleFactor(event: KeyboardEvent, dir: -1 | 1): number {
    if (event.shiftKey) return dir < 0 ? 0.8 : 1.25;
    if (event.altKey) return dir < 0 ? 0.98 : 1.02;
    return dir < 0 ? 0.9 : 1.1;
  }

  private applyLiveScale(event: KeyboardEvent, dir: -1 | 1): void {
    const f = this.liveScaleFactor(event, dir);
    if (this.isDrawingPath && this.path && this.path.segments.length > 0) {
      this.path.scale(f, this.path.segments[0].point);
      this.refreshSplineTextPreview();
    } else if (
      this.isDrawingQuad &&
      this.quadPath &&
      this.quadPath.segments.length > 0
    ) {
      this.quadPath.scale(f, this.quadPath.segments[0].point);
    } else {
      this.liveScale = Math.min(20, Math.max(0.05, this.liveScale * f));
      this.updateShapePreview();
    }
    this.updateTextContent();
    this.notify();
  }

  private liveRotateStep(event: KeyboardEvent): number {
    if (event.shiftKey) return 45;
    if (event.altKey) return 5;
    return 10;
  }

  private applyLiveRotate(event: KeyboardEvent, dir: -1 | 1): void {
    const angle = dir * this.liveRotateStep(event);
    if (this.isDrawingPath && this.path && this.path.segments.length > 0) {
      this.path.rotate(angle, this.path.segments[0].point);
      this.refreshSplineTextPreview();
    } else if (
      this.isDrawingQuad &&
      this.quadPath &&
      this.quadPath.segments.length > 0
    ) {
      this.quadPath.rotate(angle, this.quadPath.segments[0].point);
    } else {
      this.liveRotateOffset += angle;
      this.updateShapePreview();
    }
    this.updateTextContent();
    this.notify();
  }

  private registerBuiltInLiveKeys(): void {
    // Match by physical code: with Shift/Alt held, event.key reports the
    // shifted character ('{', ':', ...) instead of '[', ';', etc.
    this.registerLiveKeyBinding({
      id: 'live-scale-down',
      keys: ['['],
      label: 'scale',
      match: (event) =>
        event.code === 'BracketLeft' || event.key === '[',
      applies: () => this.liveAdjustApplies(),
      apply: (event) => this.applyLiveScale(event, -1),
    });
    this.registerLiveKeyBinding({
      id: 'live-scale-up',
      keys: [']'],
      label: 'scale',
      match: (event) =>
        event.code === 'BracketRight' || event.key === ']',
      applies: () => this.liveAdjustApplies(),
      apply: (event) => this.applyLiveScale(event, 1),
    });
    this.registerLiveKeyBinding({
      id: 'live-rotate-down',
      keys: [';'],
      label: 'rotate',
      match: (event) =>
        event.code === 'Semicolon' || event.key === ';',
      applies: () => this.liveAdjustApplies(),
      apply: (event) => this.applyLiveRotate(event, -1),
    });
    this.registerLiveKeyBinding({
      id: 'live-rotate-up',
      keys: ["'"],
      label: 'rotate',
      match: (event) =>
        event.code === 'Quote' || event.key === "'",
      applies: () => this.liveAdjustApplies(),
      apply: (event) => this.applyLiveRotate(event, 1),
    });
  }

  // First matching + applicable live binding wins. Returns true when a
  // binding consumed the event.
  private runLiveKeyBindings(event: KeyboardEvent): boolean {
    if (!this.isLiveDrawing) return false;
    for (const b of this.liveKeyBindings) {
      if (b.match(event) && b.applies()) {
        b.apply(event);
        return true;
      }
    }
    return false;
  }

  circleKC(mode: string): void {
    const scope = this.scope;
    if (this.shapeType != null && this.shapeType.startsWith('circle_')) {
      const histBefore = this.contentItems();
      const histSel = [...this.selectedItems];
      const placed = this.endShapeAsStroke();
      this.recordSceneCommand('Deposit shape', histBefore, histSel, placed);
      this.updateTextContent();
      return;
    }
    if (this.isDrawingShape || !this.mousePt) return;
    this.resetLiveAdjust();
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

  // Radial Stamp (, key): the first press fixes the placement-circle
  // origin; every later press stamps the riding shape (tangent point,
  // tangent-rotated) and stays in the session until END/Complete/Cancel.
  radialStampKC(): void {
    const scope = this.scope;
    if (this.shapeType === 'circle_radial_stamp') {
      this.stampCurrentPreview();
      return;
    }
    if (this.shapeType != null && this.shapeType.startsWith('circle_')) {
      const histBefore = this.contentItems();
      const histSel = [...this.selectedItems];
      const placed = this.endShapeAsStroke();
      this.recordSceneCommand('Deposit shape', histBefore, histSel, placed);
      this.updateTextContent();
      return;
    }
    if (this.isDrawingShape || !this.mousePt) return;
    this.resetLiveAdjust();
    this.shapeStartPoint = this.mousePt.clone();
    this.shapeType = 'circle_radial_stamp';
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

  // END / Complete Shape in Radial Stamp: deposit the live riding shape
  // at the tangent point, then dismiss the placement guide. Stamped copies
  // are already committed scene items.
  finishRadialStamp(): void {
    if (this.shapeType !== 'circle_radial_stamp') return;
    const histBefore = this.contentItems();
    const histSel = [...this.selectedItems];
    const placed = this.endShapeAsStroke();
    this.recordSceneCommand('Deposit shape', histBefore, histSel, placed);
    this.updateTextContent();
  }

  rectDiagonalKC(): void {
    const scope = this.scope;
    if (this.shapeType === 'rectangle_diagonal') {
      const histBefore = this.contentItems();
      const histSel = [...this.selectedItems];
      const placed = this.endShapeAsStroke();
      this.recordSceneCommand('Deposit shape', histBefore, histSel, placed);
      this.updateTextContent();
      return;
    }
    if (this.isDrawingShape || !this.mousePt) return;
    this.resetLiveAdjust();
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

  endShapeAsStroke(): AnyItem[] {
    const scope = this.scope;
    if (!this.isDrawingShape || this.shapeType === null) return [];
    const placed: AnyItem[] = [];
    let finalPath: AnyItem = null;
    const shapeType = this.shapeType;
    // Non-rectangle Rect Keys choice: the rect frame is the bounds and only
    // the fitted shape is drawn (no frame + inner double draw).
    const rectShapeOnly =
      shapeType.startsWith('rectangle_') &&
      this.rectangleInnerShapeType !== 'rectangle';
    if (shapeType.startsWith('circle_')) {
      if (!this.previewShape || this.previewShape.radius === 0) return [];
      // Radial Stamp deposits the riding shape at the tangent point (the
      // cursor), not the inscribed guide circle.
      const isRadial = shapeType === 'circle_radial_stamp';
      const center =
        isRadial && this.mousePt
          ? this.mousePt.clone()
          : this.previewShape.position;
      if (!center) return [];
      const radius = this.previewShape.radius;
      const strokeW = this.strokeEnabled ? this.globalStrokeWidth : 0;
      const iradius = isRadial
        ? this.radialStampBaseRadius * this.liveScale
        : Math.max(0, radius - strokeW / 2) * this.liveScale;
      const rotation = isRadial
        ? this.radialStampRotation()
        : this.shapeGuideAngle + this.liveRotateOffset;
      if (iradius > 0) {
        const innerPath = this.createInnerShape(center, iradius, 'stroke', rotation);
        if (innerPath) {
          this.applyCurrentStyles(this.shapePartOf(innerPath));
          innerPath.selected = false;
          const placedInner = this.depositWithCombine(innerPath);
          if (placedInner) {
            placedInner.selected = false;
            if (placedInner.parent == null) {
              scope.project.activeLayer.addChild(placedInner);
            }
            placed.push(placedInner);
          }
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
      if (finalPath) this.applyCurrentStyles(this.shapePartOf(finalPath));
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
      if (finalPath) this.applyCurrentStyles(this.shapePartOf(finalPath));
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
      if (finalPath) this.applyCurrentStyles(this.shapePartOf(finalPath));
    }
    if (shapeType === 'rectangle_centerline') {
      this.lastCenterlineWidth = this.shapeWidth;
    }
    if (finalPath) {
      finalPath.selected = false;
      const placedFinal = this.depositWithCombine(finalPath);
      if (placedFinal) {
        placedFinal.selected = false;
        if (placedFinal.parent == null) {
          scope.project.activeLayer.addChild(placedFinal);
        }
        placed.push(placedFinal);
        // Inner decoration follows the deposited (possibly combined)
        // bounds; it is never itself combined.
        if (!rectShapeOnly) this.drawInnerShape(placedFinal, 'stroke');
      }
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
    this.resetLiveAdjust();
    this.updateTextContent();
    this.notify();
    return placed;
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
      item === this.previewSplineText ||
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
    this.panAnchorCenter = null;
    this.panAnchorPoint = null;
    this.setCanvasCursor('');
  }

  // Keyboard group per key, mirroring keyboard.css. The overlay renders
  // the group color; no paper items involved.
  statusKeyGroup(key: string): StatusKeyGroup {
    const k = key.toLowerCase();
    if (k === 'n' || k === 'm' || k === ',') return 'circle';
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
      this.moveGesture = null;
      this.isPanning = true;
      this.panAnchorCenter = this.scope.view.center.clone();
      this.panAnchorPoint = event.point.clone();
      this.setCanvasCursor('grabbing');
      this.updateTextContent();
      return;
    }
    this.isPanning = false;
    this.applyHitSelection(hit);
    this.beginMoveGesture();
  }

  hitTestUnderCursor(): void {
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad) return;
    this.applyHitSelection(this.hitTestContent(this.mousePt));
  }

  private applyHitSelection(hitResult: AnyItem): void {
    // Clicking a grouped child selects its user group as one item.
    let item: AnyItem =
      hitResult && hitResult.item ? hitResult.item : null;
    if (item) item = this.topUserGroupOf(item);
    if (item) {
      const alreadySelected = this.selectedItems.indexOf(item) !== -1;
      if (alreadySelected) {
        item.selected = false;
        this.selectedItems.splice(this.selectedItems.indexOf(item), 1);
      } else {
        item.selected = true;
        this.selectedItems.push(item);
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
    if (this.isAngleSnappingEnabled || this.isLengthSnappingEnabled) {
      let snapBase: AnyItem = null;
      if (this.isDrawingPath && this.path && this.path.segments.length > 0) {
        const baseIndex =
          this.path.segments.length === 1 ? 0 : this.path.segments.length - 2;
        snapBase = this.path.segments[baseIndex].point;
      } else if (
        this.isDrawingShape &&
        this.shapeType != null &&
        this.shapeType.startsWith('circle_') &&
        this.shapeStartPoint
      ) {
        snapBase = this.shapeStartPoint;
      } else if (
        this.isDrawingShape &&
        this.shapeType != null &&
        this.shapeType.startsWith('rectangle_') &&
        this.shapeStartPoint
      ) {
        snapBase = this.shapeStartPoint;
        if (this.shapeType === 'rectangle_two_edges' && this.shapePt2) {
          snapBase = this.shapePt2;
        }
      }
      if (snapBase) {
        if (this.isAngleSnappingEnabled) {
          this.mousePt = this.applyAngleSnapping(snapBase, this.mousePt);
        }
        if (this.isLengthSnappingEnabled) {
          this.mousePt = this.applyLengthSnapping(snapBase, this.mousePt);
        }
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
      this.refreshSplineTextPreview();
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
    } else if (this.shapeType === 'circle_radial_stamp') {
      // Placement guide: origin fixed at the start point, radius follows
      // the cursor. The shape itself rides the tangent point; see below.
      this.previewShape.position = this.shapeStartPoint;
      this.previewShape.radius = this.shapeStartPoint.getDistance(endPt);
      if (this.previewShape.radius > 0) {
        this.shapeGuideAngle = this.mousePt.subtract(this.shapeStartPoint).angle;
      }
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
    if (this.shapeType === 'circle_radial_stamp') {
      this.refreshRadialStampPreview();
      return;
    }
    if (this.isDrawingShape && this.innerShapeType !== 'none') {
      let framePreview: AnyItem = null;
      if (
        this.shapeType != null &&
        this.shapeType.startsWith('circle_') &&
        this.previewShape &&
        this.previewShape.radius > 0
      ) {
        const pradius =
          (this.previewShape.radius - this.previewShape.strokeWidth / 2) *
          this.liveScale;
        if (pradius > 0) {
          this.previewInner = this.createInnerShape(
            this.previewShape.position,
            pradius,
            'preview',
            this.shapeGuideAngle + this.liveRotateOffset,
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

  // Radial Stamp live preview: the selected Circle Keys shape rides the
  // tangent point (the cursor) on the placement circle, rotated tangent to
  // it. Size is the fixed base radius times the live scale factor.
  private refreshRadialStampPreview(): void {
    const scope = this.scope;
    if (
      !this.isDrawingShape ||
      this.shapeType !== 'circle_radial_stamp' ||
      !this.mousePt
    ) {
      return;
    }
    if (this.innerShapeType === 'none') return;
    if (!this.previewShape || !(this.previewShape.radius > 0)) return;
    const tangentPoint = this.mousePt.clone();
    const radius = this.radialStampBaseRadius * this.liveScale;
    if (!(radius > 0)) return;
    this.previewInner = this.createInnerShape(
      tangentPoint,
      radius,
      'preview',
      this.radialStampRotation(),
    );
    if (this.previewInner) {
      this.addPreviewShadow(this.previewInner);
      scope.project.activeLayer.addChild(this.previewInner);
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
      const view = this.scope.view;
      if (this.panAnchorCenter !== null && this.panAnchorPoint !== null) {
        // Pointer travel since pan start, in project units. Subtracting
        // the center out of each point cancels the view translation, so
        // this measures pure pointer travel regardless of how center has
        // moved between events (unlike event.delta, which mixes frames).
        const offset = event.point
          .subtract(view.center)
          .subtract(this.panAnchorPoint.subtract(this.panAnchorCenter));
        view.center = this.panAnchorCenter.subtract(offset);
      } else {
        view.center = view.center.subtract(event.delta);
      }
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
  /** Typing in panel fields must never arm canvas functions. */
  private isTextEntryTarget(event: KeyboardEvent): boolean {
    const t = event.target as HTMLElement | null;
    if (!t) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (this.isTextEntryTarget(event)) return;
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
      const modKey = event.key.toLowerCase();
      if (modKey === 'z' && !event.shiftKey) {
        event.preventDefault();
        this.undo();
        return;
      }
      if ((modKey === 'z' && event.shiftKey) || modKey === 'y') {
        event.preventDefault();
        this.redo();
        return;
      }
      if (modKey === 'g') {
        event.preventDefault();
        if (event.shiftKey) this.ungroupSelected();
        else this.groupSelection();
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
        this.commitMoveGesture();
        const nudgeItems = [...this.selectedItems];
        const nudgeBefore = nudgeItems.map((it) => it.position.clone());
        const delta = new this.scope.Point(dx, dy);
        for (let i = 0; i < this.selectedItems.length; i++) {
          this.selectedItems[i].position =
            this.selectedItems[i].position.add(delta);
        }
        const nudgeEntries: MoveEntry[] = [];
        for (let i = 0; i < nudgeItems.length; i++) {
          nudgeEntries.push({
            item: nudgeItems[i],
            before: nudgeBefore[i],
            after: nudgeItems[i].position.clone(),
          });
        }
        this.history.push(this.makeMoveCommand(nudgeEntries, 'nudge'));
        this.updateTextContent();
        this.notify();
      }
      return;
    }
    const keyLower = event.key.toLowerCase();
    // Match by physical code: with Shift/Alt held, event.key reports the
    // shifted character ('{', ':', ...) instead of '[', ';', etc.
    const isBracketDown =
      event.code === 'BracketLeft' || event.key === '[';
    const isBracketUp =
      event.code === 'BracketRight' || event.key === ']';
    if (isBracketDown || isBracketUp) {
      if (this.isDrawingShape && this.shapeType === 'rectangle_centerline') {
        if (isBracketDown) {
          this.shapeWidth = Math.max(1, (this.shapeWidth || this.globalStrokeWidth * 2) - 2);
        } else {
          this.shapeWidth = Math.min(this.maxShapeWidth, (this.shapeWidth || this.globalStrokeWidth * 2) + 2);
        }
        this.updateTextContent();
        this.updateShapePreview();
        this.notify();
        return;
      }
      // Live drawing takes precedence over idle selection scaling.
      if (this.runLiveKeyBindings(event)) return;
      if (this.selectedItems.length > 0) {
        const center = this.collectiveCenter(this.selectedItems);
        // Shift = bigger step, Alt = finer step.
        const down = event.shiftKey ? 0.8 : event.altKey ? 0.98 : 0.9;
        const up = event.shiftKey ? 1.25 : event.altKey ? 1.02 : 1.1;
        for (let i = 0; i < this.selectedItems.length; i++) {
          if (isBracketDown) {
            this.selectedItems[i].scale(down, center);
          } else {
            this.selectedItems[i].scale(up, center);
          }
        }
        return;
      }
    }
    const isRotateDown =
      event.code === 'Semicolon' || event.key === ';';
    const isRotateUp =
      event.code === 'Quote' || event.key === "'";
    if (isRotateDown || isRotateUp) {
      // Live drawing takes precedence over idle selection rotation.
      if (this.runLiveKeyBindings(event)) return;
      if (this.selectedItems.length > 0) {
        const center = this.collectiveCenter(this.selectedItems);
        // Shift = 45°, Alt = 5°, otherwise 10°.
        const step = event.shiftKey ? 45 : event.altKey ? 5 : 10;
        const angle = isRotateDown ? -step : step;
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
    if (event.code === 'Comma' || event.key === ',') {
      this.radialStampKC();
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
        // In Radial Stamp, END and Complete Shape both deposit the live
        // shape and finish the stamping session.
        if (this.shapeType === 'circle_radial_stamp') {
          this.finishRadialStamp();
        } else if (keyLower === 'r' && this.isDrawingPath) {
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
    if (this.lastDropNote) {
      state.push(L('meta', [T(this.lastDropNote)]));
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
      steps.push(
        L('hint', [T('A near own start closes · A near a path end joins it')]),
      );
    }
    if (this.isDrawingShape) {
      if (
        this.shapeType === 'circle_radius' ||
        this.shapeType === 'circle_diameter'
      ) {
        const mode = this.shapeType === 'circle_radius' ? 'radius' : 'diameter';
        state.push(L('title', [T('Circle by (' + mode + ')')]));
      } else if (this.shapeType === 'circle_radial_stamp') {
        state.push(L('title', [T('Circle Radial Stamp')]));
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
        if (this.shapeType === 'circle_radial_stamp') {
          steps.push(
            L('hint', [
              T('Press '),
              K(','),
              T(' or '),
              K('W'),
              T(' to stamp. Move mouse to orbit the origin.'),
            ]),
          );
          steps.push(
            L('hint', [
              K('A'),
              T(' / '),
              K('R'),
              T(' to deposit + finish, '),
              K('Q'),
              T(' to cancel.'),
            ]),
          );
        } else {
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
        }
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
    // Live key remaps, driven by the binding registry so future bindings
    // (repeat counts, radius reference) appear here automatically.
    if (this.isLiveDrawing) {
      const liveByLabel = new Map<string, string[]>();
      for (const b of this.liveKeyBindings) {
        if (!b.applies()) continue;
        const keys = liveByLabel.get(b.label) ?? [];
        for (const k of b.keys) {
          if (!keys.includes(k)) keys.push(k);
        }
        liveByLabel.set(b.label, keys);
      }
      for (const [label, keys] of liveByLabel) {
        const runs: StatusRun[] = [];
        keys.forEach((k, i) => {
          if (i > 0) runs.push(T(' / '));
          runs.push(K(k));
        });
        runs.push(T(` ${label}`));
        steps.push(L('hint', runs));
      }
    }
    if (this.history.canUndo() || this.history.canRedo()) {
      const bits: string[] = [];
      if (this.history.canUndo())
        bits.push(`Undo ${this.history.undoLabel() ?? ''}`.trim());
      if (this.history.canRedo())
        bits.push(`Redo ${this.history.redoLabel() ?? ''}`.trim());
      state.push(L('meta', [T(`${bits.join(' · ')} (Ctrl/⌘+Z)`)]));
    }
    this.setStatusSchema({ state, steps });
  }
}
