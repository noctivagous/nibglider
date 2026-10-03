// Ported from the flat global scripts (drawingProperties.js,
// drawingToolsAndFunctions.js, selectionFunctions.js, shapeGenerators.js,
// NibGliderApp.js). Scene identity and selection state now live in focused
// services; the PaperScope is injected instead of paper.install(window).
// NB: `paper.*` below refers to the global namespace from paper's bundled
// declarations (type positions only); the runtime value is never imported here.
import { FontMetrics } from './fontMetrics';
import { InputManager } from './input/InputManager';
import {
  KeyboardController,
  type KeyboardHost,
} from './input/KeyboardController';
import {
  PointerController,
  type PointerHost,
} from './input/PointerController';
import { commandKeycap, keyGroupForLabel, scaleFactor, rotationStep } from './input/keymap';
import { modifiersOf } from './input/ModifierStateTracker';
import { PathTool } from './drawing/PathTool';
import { CircleTool } from './drawing/CircleTool';
import { RectangleTool } from './drawing/RectangleTool';
import { QuadTool } from './drawing/QuadTool';
import { DrawingSession } from './drawing/DrawingSession';
import type { DrawingHost } from './drawing/DrawingHost';
import { SceneRepository, type RetainedPath } from './scene/SceneRepository';
import { SelectionManager } from './scene/SelectionManager';
import { HistoryManager } from './history/HistoryManager';
import { TransformManager } from './history/TransformManager';
import { GridRenderer } from './snapping/GridRenderer';
import { SnappingManager } from './snapping/SnappingManager';
import { LayerManager } from './document/LayerManager';
import { CoordinateManager } from './document/CoordinateManager';
import { ViewportManager } from './document/ViewportManager';
import { DocumentManager, type DocumentChange, type PageSettings } from './document/DocumentManager';
import type { NGPathDrawable } from './model/NGDrawable';
import type { NGPath } from './model/NGPath';
import {
  clampPolygonSides,
  clampSectorAngle as clampSectorAngleValue,
  clampShapeAngle as clampShapeAngleValue,
  clampSplineTension,
  clampStrokeWidth,
  clampSupershapeParam,
  snapShapeAngle as snapShapeAngleValue,
} from './input/KeySettingsRegistry';
import type {
  CircleInnerShape,
  CircleRadiusAnchor,
  CombineMode,
  DisplayFlow,
  FillSpec,
  FillType,
  GlyphOrientation,
  GridType,
  InnerShapeParams,
  KeyActivity,
  LengthUnit,
  LiveKeyBinding,
  PolygonRadiusMode,
  RectDiagonalMode,
  RectangleInnerShape,
  ShapeType,
  SplineTextPlacement,
  StatusKeyGroup,
  StatusLine,
  StatusRun,
  StatusSchema,
  StrokeCap,
  StrokeJoin,
  TextJustification,
  TextMode,
  TextSpec,
} from './types';

// Temporary compatibility re-exports. Callers may keep importing these
// from engine.ts. New code should import from ./types.
export type {
  CircleInnerShape,
  CircleRadiusAnchor,
  CombineMode,
  DisplayFlow,
  FillSpec,
  FillType,
  GlyphOrientation,
  GridType,
  InnerShapeParams,
  KeyActivity,
  LengthUnit,
  LiveKeyBinding,
  PolygonRadiusMode,
  RectDiagonalMode,
  RectangleInnerShape,
  ShapeType,
  SplineTextPlacement,
  StatusKeyGroup,
  StatusLine,
  StatusRun,
  StatusSchema,
  StrokeCap,
  StrokeJoin,
  TextJustification,
  TextMode,
  TextSpec,
} from './types';
export {
  PT_PER_CM,
  PT_PER_INCH,
  lengthUnitToPoints,
  pointsToLengthUnit,
} from './types';

// Paper item refs stay loosely typed: the original code leans on runtime
// paper behavior (null style assignment, shape-specific fields) that the
// bundled declarations model more narrowly.
type AnyItem = any;

interface StraightBoundaryEdge {
  /** Arc-length offset of the edge's first vertex. */
  start: number;
  length: number;
}

export class NibGliderEngine {
  private scope: paper.PaperScope;
  private input = new InputManager();
  private listeners = new Set<() => void>();
  private version = 0;
  private onKeyActivity: (a: KeyActivity) => void;

  // --- Stroke / style config (drawingProperties.js) ---
  globalStrokeWidth = 4.0;
  maxStrokeWidth = 200.0;
  lastCenterlineWidth = 80;
  splineTensionDefault = 0.4;
  splineTension = 0.4;

  // --- Deposit-time point handling (internal for now; a UI feature later).
  // 0 deposits strokes exactly as drawn (no action); 1 is Auto-Join
  // Drawn Points: a stroke ending near its own start closes onto it, a
  // stroke ending near another open path's endpoint joins into it, and
  // a stroke begun on an open path's endpoint welds its start into it.
  // Beginning a stroke always starts a new path object, even over an
  // existing endpoint; the welding happens at deposit time.
  depositPointMode = 1;
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
  // Snap indicators live here, not on the artwork layer. See ensureGuideLayer.
  guideLayer: AnyItem = null;
  gridCursor: AnyItem = null;
  pathSnapCursor: AnyItem = null;
  pointSnapCursor: AnyItem = null;

  // --- Snapping flags ---
  isGridSnappingEnabled = false;
  isPathSnappingEnabled = false;
  isPointSnappingEnabled = false;
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
  polygonRadiusMode: PolygonRadiusMode = 'inradius';
  // Per-tool "how it draws" settings, edited from the N, M, and I key
  // popovers. Defaults preserve the long-standing behavior.
  circleRadiusAnchor: CircleRadiusAnchor = 'origin';
  rectDiagonalMode: RectDiagonalMode = 'full';

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
  pathDrawingMode: 'legacy' | 'ngComposite' = 'legacy';
  private readonly drawing = new DrawingSession();
  private compositePathTool: PathTool;
  private circleTool: CircleTool;
  private rectangleTool: RectangleTool;
  private quadTool: QuadTool;
  // Compatibility bridge until document/scene/history extraction. Only plain
  // source data is retained; derived items are kept separately for identity.
  private readonly scene: SceneRepository;
  private readonly history: HistoryManager;
  private readonly transforms: TransformManager;
  private readonly gridRenderer: GridRenderer;
  private readonly snapping: SnappingManager;
  private readonly layers: LayerManager;
  private readonly coordinates = new CoordinateManager();
  private readonly viewport: ViewportManager;
  private readonly documentManager = new DocumentManager();
  private get retainedPaths(): Map<string, RetainedPath> { return this.scene.records; }
  private set retainedPaths(value: Map<string, RetainedPath>) { this.scene.restoreRecords(value); }
  maxShapeWidth = 200;
  // Live-drawing adjustments live on DrawingSession. Stamps keep them;
  // session start, complete, and cancel reset them.
  get isDrawingPath(): boolean { return this.drawing.isDrawingPath; }
  set isDrawingPath(value: boolean) { this.drawing.isDrawingPath = value; }
  get isDrawingShape(): boolean { return this.drawing.isDrawingShape; }
  set isDrawingShape(value: boolean) { this.drawing.isDrawingShape = value; }
  get isDrawingQuad(): boolean { return this.drawing.isDrawingQuad; }
  set isDrawingQuad(value: boolean) { this.drawing.isDrawingQuad = value; }
  get shapeType(): ShapeType | null { return this.drawing.shapeType; }
  set shapeType(value: ShapeType | null) { this.drawing.shapeType = value; }
  get shapeStartPoint(): AnyItem { return this.drawing.shapeStartPoint; }
  set shapeStartPoint(value: AnyItem) { this.drawing.shapeStartPoint = value; }
  get shapePt2(): AnyItem { return this.drawing.shapePt2; }
  set shapePt2(value: AnyItem) { this.drawing.shapePt2 = value; }
  get shapeWidth(): number { return this.drawing.shapeWidth; }
  set shapeWidth(value: number) { this.drawing.shapeWidth = value; }
  get quadPath(): AnyItem { return this.drawing.quadPath; }
  set quadPath(value: AnyItem) { this.drawing.quadPath = value; }
  get quadPointCount(): number { return this.drawing.quadPointCount; }
  set quadPointCount(value: number) { this.drawing.quadPointCount = value; }
  get shapeGuideAngle(): number { return this.drawing.shapeGuideAngle; }
  set shapeGuideAngle(value: number) { this.drawing.shapeGuideAngle = value; }
  get liveScale(): number { return this.drawing.liveScale; }
  set liveScale(value: number) { this.drawing.liveScale = value; }
  get liveRotateOffset(): number { return this.drawing.liveRotateOffset; }
  set liveRotateOffset(value: number) { this.drawing.liveRotateOffset = value; }
  get radialStampBaseRadius(): number { return this.drawing.radialStampBaseRadius; }
  set radialStampBaseRadius(value: number) { this.drawing.radialStampBaseRadius = value; }
  get radialStampLockedRadius(): number | null { return this.drawing.radialStampLockedRadius; }
  set radialStampLockedRadius(value: number | null) { this.drawing.radialStampLockedRadius = value; }
  get previewInner(): AnyItem { return this.drawing.previewInner; }
  set previewInner(value: AnyItem) { this.drawing.previewInner = value; }
  get previewSplineText(): AnyItem { return this.drawing.previewSplineText; }
  set previewSplineText(value: AnyItem) { this.drawing.previewSplineText = value; }
  get previewShape(): AnyItem { return this.drawing.previewShape; }
  set previewShape(value: AnyItem) { this.drawing.previewShape = value; }
  get previewLine(): AnyItem { return this.drawing.previewLine; }
  set previewLine(value: AnyItem) { this.drawing.previewLine = value; }
  get previewPath(): AnyItem { return this.drawing.previewPath; }
  set previewPath(value: AnyItem) { this.drawing.previewPath = value; }
  get previewRect(): AnyItem { return this.drawing.previewRect; }
  set previewRect(value: AnyItem) { this.drawing.previewRect = value; }
  get path(): AnyItem { return this.drawing.path; }
  set path(value: AnyItem) { this.drawing.path = value; }
  get mousePt(): AnyItem { return this.drawing.mousePt; }
  set mousePt(value: AnyItem) { this.drawing.mousePt = value; }
  get lastMousePt(): AnyItem { return this.drawing.lastMousePt; }
  set lastMousePt(value: AnyItem) { this.drawing.lastMousePt = value; }
  private pointer = new PointerController(this.pointerApi());
  private keyboard = new KeyboardController(this.keyboardApi());
  /** Unified live-drawing state across path, shape, and quad sessions. */
  get isLiveDrawing(): boolean {
    return this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad;
  }

  // --- Selection (selectionFunctions.js) ---
  private readonly selection: SelectionManager;
  get selectedItems(): AnyItem[] { return this.selection.selectedItems; }
  isInDragLock = false;

  private statusSchema: StatusSchema = { state: [], steps: [] };
  private lastStatusKey = '';

  getStatusSchema(): StatusSchema {
    return this.statusSchema;
  }

  constructor(scope: paper.PaperScope, onKeyActivity: (a: KeyActivity) => void) {
    this.scope = scope;
    this.onKeyActivity = onKeyActivity;
    this.layers = new LayerManager(scope);
    this.viewport = new ViewportManager(scope, () => this.afterViewChange());
    this.documentManager.subscribe(() => this.notify());
    this.scene = new SceneRepository(scope, () => ({
      gridLayer: this.gridLayer,
      cursors: [this.pathSnapCursor, this.pointSnapCursor, this.gridCursor],
      previews: [this.previewInner, this.previewSplineText, this.previewShape,
        this.previewLine, this.previewPath, this.previewRect],
    }), this.layers);
    this.history = new HistoryManager(this.scene, () => this.selection,
      () => this.documentManager.markEdited('scene'));
    this.selection = new SelectionManager(this.scene, this.history,
      (original, clone) => this.scene.retainClone(original, clone, (item) => this.shapePartOf(item)));
    this.transforms = new TransformManager(this.scene, this.selection, this.history);
    this.gridRenderer = new GridRenderer(scope);
    this.snapping = new SnappingManager(scope, () => ({
      gridEnabled: this.isGridEnabled, gridSnapping: this.isGridSnappingEnabled,
      gridType: this.gridType, gridSpacing: this.gridSpacing,
      path: this.isPathSnappingEnabled, point: this.isPointSnappingEnabled,
      angle: this.isAngleSnappingEnabled, length: this.isLengthSnappingEnabled,
      aspect: this.isAspectSnappingEnabled, angleDegrees: this.angleSnapDegrees,
      lengthStep: this.lengthSnapStep, aspectA: this.aspectRatioA, aspectB: this.aspectRatioB,
    }), () => this.drawingIgnoredItems(), (item) => this.isGuideItem(item), {
      mount: (item) => this.mountSnapIndicator(item),
      pathCursor: (item) => { this.pathSnapCursor = item; },
      pointCursor: (item) => { this.pointSnapCursor = item; },
    });
    this.compositePathTool = new PathTool(scope, (item) => {
      this.applyCurrentStyles(item);
      item.fillColor = null;
      if (!item.parent) this.layers.addToActive(item);
      this.refreshSplineTextPreview();
    });
    const host = this.drawingHost();
    this.compositePathTool.bind(host);
    this.circleTool = new CircleTool(host);
    this.rectangleTool = new RectangleTool(host);
    this.quadTool = new QuadTool(host);
  }

  private drawingHost(): DrawingHost {
    return {
      session: this.drawing,
      scope: () => this.scope,
      pathDrawingMode: () => this.pathDrawingMode,
      splineTension: () => this.splineTension,
      fillEnabled: () => this.fillEnabled,
      strokeEnabled: () => this.strokeEnabled,
      globalStrokeColor: () => this.globalStrokeColor,
      globalStrokeWidth: () => this.globalStrokeWidth,
      depositPointMode: () => this.depositPointMode,
      circleRadiusAnchor: () => this.circleRadiusAnchor,
      rectangleInnerShapeType: () => this.rectangleInnerShapeType,
      innerShapeType: () => this.innerShapeType,
      endpointTolerance: () => this.endpointTolerance(),
      rectDiagonalScale: () => this.rectDiagonalScale(),
      centerlineWidthForLength: (length) => this.centerlineWidthForLength(length),
      lastCenterlineWidth: () => this.lastCenterlineWidth,
      setLastCenterlineWidth: (width) => { this.lastCenterlineWidth = width; },
      layerChildren: () => [...this.layers.activeLayer.children],
      isNonContentItem: (item) => this.isNonContentItem(item),
      addToActive: (item) => this.layers.addToActive(item),
      applyStrokeGeometry: (item) => this.applyStrokeGeometry(item),
      applyStrokeDash: (item) => this.applyStrokeDash(item),
      applyCurrentStyles: (item) => this.applyCurrentStyles(item),
      applyFill: (item) => this.applyFillSpec(item, this.fillSpec()),
      stylePreviewFrame: (item, brightness) => this.stylePreviewFrame(item, brightness),
      addPreviewShadow: (item) => this.addPreviewShadow(item),
      clearShadow: (item) => this.clearShadow(item),
      withShapeText: (item, isPreview) => this.withShapeText(item, isPreview),
      resetStampedText: (item) => this.resetStampedText(item),
      shapePartOf: (item) => this.shapePartOf(item),
      createInnerShape: (center, radius, style, rotation) => this.createInnerShape(center, radius, style, rotation),
      createRectFrameShape: (style) => this.createRectFrameShape(style),
      drawInnerShape: (frame, style) => this.drawInnerShape(frame, style),
      refreshSplineText: () => this.refreshSplineTextPreview(),
      clearSplineText: () => this.clearSplineTextPreview(),
      findOpenEndpointNear: (point) => this.findOpenEndpointNear(point),
      removeFromSelection: (item) => this.selection.remove(item),
      dropItem: (item) => this.dropItem(item),
      place: (item, opts) => this.placeDeposited(item, opts),
      capture: () => this.captureDeposit(),
      commit: (label, snap, placed, retain) => {
        this.recordSceneCommand(label, snap.before, snap.selected, placed, retain ? snap.retained : undefined);
      },
      isRetained: (shape) => {
        const id = shape?.data?.drawableId;
        return typeof id === 'string' && this.retainedPaths.get(id)?.item === shape;
      },
      bezierSource: (item) => this.scene.bezierSource(item),
      retainResult: (item, source) => this.retainCompositeResult(item, source),
      pruneRecords: () => this.scene.pruneRecords(),
      updateTextContent: () => this.updateTextContent(),
      notify: () => this.notify(),
      cancelDrawing: () => this.cancelCurrentDrawingOperation(),
    };
  }

  private placeDeposited(item: AnyItem, opts?: { front?: boolean; opacity?: number }): AnyItem | null {
    const placed = this.depositWithCombine(item);
    if (!placed) return null;
    placed.selected = false;
    if (opts?.opacity != null) placed.opacity = opts.opacity;
    if (opts?.front || placed.parent == null) this.layers.activeLayer.addChild(placed);
    return placed;
  }

  private captureDeposit(): { before: AnyItem[]; selected: AnyItem[]; retained: Map<string, RetainedPath> } {
    return {
      before: this.contentItems(),
      selected: [...this.selectedItems],
      retained: new Map(this.retainedPaths),
    };
  }

  private pointerApi(): PointerHost {
    return {
      scope: () => this.scope,
      isDrawingPath: () => this.isDrawingPath,
      isDrawingShape: () => this.isDrawingShape,
      isDrawingQuad: () => this.isDrawingQuad,
      shapeType: () => this.shapeType,
      shapeStartPoint: () => this.shapeStartPoint,
      shapePt2: () => this.shapePt2,
      isAngleSnappingEnabled: () => this.isAngleSnappingEnabled,
      isLengthSnappingEnabled: () => this.isLengthSnappingEnabled,
      isAspectSnappingEnabled: () => this.isAspectSnappingEnabled,
      path: () => this.path,
      pathSnapBase: () => {
        const base = this.compositePathTool.snapBase;
        if (base) return new this.scope.Point(base.x, base.y);
        const segments = this.path?.segments;
        return segments?.length ? segments[segments.length === 1 ? 0 : segments.length - 2].point : null;
      },
      updateLivePath: (point) => this.compositePathTool.track(point),
      updateLiveQuad: () => this.quadTool.track(),
      isCompositePathDrawing: () => this.compositePathTool.active,
      quadPath: () => this.quadPath,
      selectedItems: () => this.selectedItems,
      moveSelectionBy: (delta) => this.transforms.moveSelectionBy(delta),
      toggleSelection: (item) => this.selection.toggle(item),
      isInDragLock: () => this.isInDragLock,
      mousePt: () => this.mousePt,
      setMousePt: (v) => {
        this.mousePt = v;
      },
      lastMousePt: () => this.lastMousePt,
      setLastMousePt: (v) => {
        this.lastMousePt = v;
      },
      isPanning: () => this.viewport.isPanning,
      beginPan: (point) => this.viewport.beginPan(point),
      panTo: (point, delta) => this.viewport.panTo(point, delta),
      endPan: () => this.viewport.endPan(),
      snapToGrid: (point) => this.snapToGrid(point),
      applyAngleSnapping: (base, target) => this.applyAngleSnapping(base, target),
      applyLengthSnapping: (base, target) => this.applyLengthSnapping(base, target),
      applyPathSnapping: (original) => this.applyPathSnapping(original),
      applyPointSnapping: (original) => this.applyPointSnapping(original),
      applyAspectSnapping: (base, target) => this.applyAspectSnapping(base, target),
      snapAspectSecond: (first, second) => this.snapAspectSecond(first, second),
      updateGridCursor: () => this.updateGridCursor(),
      refreshSplineTextPreview: () => this.refreshSplineTextPreview(),
      updateShapePreview: () => this.updateShapePreview(),
      updateTextContent: () => this.updateTextContent(),
      notify: () => this.notify(),
      clearOutSelection: () => this.clearOutSelection(),
      beginMoveGesture: () => this.beginMoveGesture(),
      commitMoveGesture: () => this.commitMoveGesture(),
      clearMoveGesture: () => {
        this.transforms.cancelDrag();
      },
      topUserGroupOf: (item) => this.topUserGroupOf(item),
      isNonContentItem: (item) => this.isNonContentItem(item),
    };
  }

  private keyboardApi(): KeyboardHost {
    return {
      isDrawingPath: () => this.isDrawingPath,
      isDrawingShape: () => this.isDrawingShape,
      isDrawingQuad: () => this.isDrawingQuad,
      isLiveDrawing: () => this.isLiveDrawing,
      shapeType: () => this.shapeType,
      selectedItems: () => this.selectedItems,
      globalStrokeWidth: () => this.globalStrokeWidth,
      maxShapeWidth: () => this.maxShapeWidth,
      maxStrokeWidth: () => this.maxStrokeWidth,
      splineTensionDefault: () => this.splineTensionDefault,
      strokeEnabled: () => this.strokeEnabled,
      fillEnabled: () => this.fillEnabled,
      isInDragLock: () => this.isInDragLock,
      shapeWidth: () => this.shapeWidth,
      setShapeWidth: (v) => {
        this.shapeWidth = v;
      },
      splineTension: () => this.splineTension,
      setSplineTension: (v) => {
        this.setSplineTension(v);
      },
      clearSelection: () => this.clearOutSelection(),
      liveAdjustApplies: () => this.liveAdjustApplies(),
      resetZoom: () => this.resetZoom(),
      stepZoom: (dir) => this.stepZoom(dir),
      undo: () => this.undo(),
      redo: () => this.redo(),
      groupSelection: () => this.groupSelection(),
      ungroupSelected: () => this.ungroupSelected(),
      nudgeSelection: (dx, dy) => this.nudgeSelection(dx, dy),
      scaleSelection: (factor) => this.scaleSelection(factor),
      rotateSelection: (degrees) => this.rotateSelection(degrees),
      updateTextContent: () => this.updateTextContent(),
      updateShapePreview: () => this.updateShapePreview(),
      notify: () => this.notify(),
      setIsInDragLock: (on) => this.setIsInDragLock(on),
      removeAllSelectedItemsAndReset: () => this.removeAllSelectedItemsAndReset(),
      stampCurrentPreview: () => this.stampCurrentPreview(),
      stampItems: (items) => this.stampItems(items),
      rectCenterlineKC: () => this.rectCenterlineKC(),
      rectDiagonalKC: () => this.rectDiagonalKC(),
      rectTwoEdgesKC: () => this.rectTwoEdgesKC(),
      polyLineKC: () => this.polyLineKC(),
      splinePointKC: () => this.splinePointKC(),
      roundedPointKC: () => this.roundedPointKC(),
      compositePathEnabled: () => this.pathDrawingMode === 'ngComposite',
      circleKC: (mode) => this.circleKC(mode),
      radialStampKC: () => this.radialStampKC(),
      quadPointKC: () => this.quadPointKC(),
      toggleGrid: () => this.toggleGrid(),
      thinStrokeWidth: () => this.thinStrokeWidth(),
      thickenStrokeWidth: () => this.thickenStrokeWidth(),
      finishRadialStamp: () => this.finishRadialStamp(),
      completeShapeWithSpline: () => this.completeShapeWithSpline(),
      endPathOrShape: () => this.endPathOrShape(),
      selectionPaint: () => this.selectionPaint(),
      setStrokeEnabled: (on) => this.setStrokeEnabled(on),
      setFillEnabled: (on) => this.setFillEnabled(on),
      cancelCurrentDrawingOperation: () => this.cancelCurrentDrawingOperation(),
      hitTestUnderCursor: () => this.pointer.hitTestUnderCursor(),
      applyLiveScale: (event, dir) => this.applyLiveScale(event, dir),
      applyLiveRotate: (event, dir) => this.applyLiveRotate(event, dir),
      toggleRadialStampRadiusLock: () => this.toggleRadialStampRadiusLock(),
      onKeyActivity: (activity) => this.onKeyActivity(activity),
    };
  }

  // UI consumers share the controller's authoritative input/context snapshots.
  getModifiers = () => this.keyboard.modifiers.getSnapshot();
  subscribeModifiers = (listener: () => void) => this.keyboard.modifiers.subscribe(listener);
  getKeyState = () => this.keyboard.keyState();

  private resetKeyboardInput(): void {
    this.keyboard.modifiers.reset();
    this.onKeyActivity({ code: '', active: false });
  }

  // --- React bridge: version counter + subscription ---
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = (): number => this.version;

  getPageSettings(): PageSettings { return this.documentManager.pageSettings; }
  isDocumentDirty(): boolean { return this.documentManager.isDirty; }
  documentRevision(): number { return this.documentManager.revisionNumber; }
  setPageDimensions(width: number, height: number, unit: LengthUnit = 'pt'): void {
    this.documentManager.setPageSize(width, height, unit);
  }
  setPageDisplayUnit(unit: LengthUnit): void { this.documentManager.setDisplayUnit(unit); }
  subscribeDocumentChanges(listener: (change: DocumentChange) => void): () => void {
    return this.documentManager.subscribe(listener);
  }

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

    this.input.attach(scope, canvas, {
      onMouseDown: (event) => this.pointer.onMouseDown(event),
      onMouseMove: (event) => this.pointer.onMouseMove(event),
      onMouseDrag: (event) => this.pointer.onMouseDrag(event),
      onMouseUp: () => this.pointer.releasePointer(),
      onKeyDown: (event) => this.keyboard.handleKeyDown(event),
      onKeyHighlight: (event) => this.keyboard.reportKeyHighlight(event),
      onKeyUp: (event) => this.keyboard.reportKeyUp(event),
      onInputReset: () => this.resetKeyboardInput(),
      onDrop: (event) => this.handleImageDrop(event),
      onWheel: (event) => this.onMouseWheel(event),
      onDocumentMouseUp: () => this.pointer.releasePointer(),
      onBeforePrint: this.onBeforePrint,
      onAfterPrint: this.onAfterPrint,
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
    if (this.compositePathTool.active) this.cancelCurrentDrawingOperation();
    this.viewport.endPan();
    this.input.detach();
    this.resetKeyboardInput();
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
    const cascade = 24 / this.viewport.zoom;
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
    this.history.recordDrop(label, item, selBefore);
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
    if (!this.selectedItems.length) return;
    for (let i = 0; i < this.selectedItems.length; i++) {
      fn(this.selectedItems[i]);
    }
    this.documentManager.markEdited('scene');
  }

  setStrokeWidth(strokeVal: number): void {
    const v = clampStrokeWidth(strokeVal, this.maxStrokeWidth);
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

  setPointSnappingEnabled(v: boolean): void {
    this.isPointSnappingEnabled = v;
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

  // Display unit for length inputs in the Snapping section. The stored
  // step stays in points; conversion happens at display/entry.
  lengthUnit: LengthUnit = 'pt';

  setLengthUnit(u: LengthUnit): void {
    if (u !== 'pt' && u !== 'inch' && u !== 'cm') return;
    if (this.lengthUnit === u) return;
    this.lengthUnit = u;
    this.updateTextContent();
    this.notify();
  }

  lengthSnapStepInUnit(): number {
    return this.coordinates.fromPoints(this.lengthSnapStep, this.lengthUnit);
  }

  setLengthSnapStepFromUnit(v: number): void {
    if (!Number.isFinite(v)) return;
    this.setLengthSnapStep(this.coordinates.toPoints(v, this.lengthUnit));
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
    this.circleInnerShapeParams.sides = clampPolygonSides(sides);
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setSupershapeParam(key: keyof InnerShapeParams, val: number): void {
    this.circleInnerShapeParams[key] = clampSupershapeParam(key, val);
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
    this.rectangleInnerShapeParams.sides = clampPolygonSides(sides);
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setRectangleSupershapeParam(key: keyof InnerShapeParams, val: number): void {
    this.rectangleInnerShapeParams[key] = clampSupershapeParam(key, val);
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
    this.selection.prepend(result);
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
    if (ok) this.documentManager.markEdited('scene');
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
    const layer = this.layers.activeLayer;
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
    return clampShapeAngleValue(deg);
  }

  // Slider grid for the trapezoid / parallelogram angle: 15° steps from
  // 15°. Typed entries snap onto the same grid as the slider.
  snapShapeAngle(deg: number): number {
    return snapShapeAngleValue(deg);
  }

  clampSectorAngle(deg: number): number {
    return clampSectorAngleValue(deg);
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
    this.splineTension = clampSplineTension(val);
    if (this.isDrawingPath) this.refreshSplineTextPreview();
    this.updateTextContent();
    this.notify();
  }

  setPathDrawingMode(mode: 'legacy' | 'ngComposite'): void {
    if (this.isLiveDrawing || (mode !== 'legacy' && mode !== 'ngComposite')) return;
    this.pathDrawingMode = mode;
    this.updateTextContent();
    this.notify();
  }

  get compositeCornerRadius(): number { return this.compositePathTool.cornerRadius; }
  setCompositeCornerRadius(radius: number): void {
    this.compositePathTool.setCornerRadius(radius);
    this.updateTextContent();
    this.notify();
  }

  getRetainedPathDrawable(id: string): NGPathDrawable | null {
    return this.scene.getRetainedPathDrawable(id);
  }

  setCircleRadiusAnchor(anchor: CircleRadiusAnchor): void {
    if (anchor !== 'origin' && anchor !== 'circumference') return;
    this.circleRadiusAnchor = anchor;
    this.updateTextContent();
    this.notify();
  }

  setRectDiagonalMode(mode: RectDiagonalMode): void {
    if (mode !== 'full' && mode !== 'half' && mode !== 'quarter') return;
    this.rectDiagonalMode = mode;
    this.updateTextContent();
    this.notify();
  }

  /** Scale applied to the drawn diagonal vector for the Rect by Diagonal
   * mode: the drawn diagonal covers the full / half / quarter of the final
   * rect, so the final extent is 1x / 2x / 4x the drawn vector. */
  rectDiagonalScale(): number {
    if (this.rectDiagonalMode === 'half') return 2;
    if (this.rectDiagonalMode === 'quarter') return 4;
    return 1;
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
    if (mode !== 'inradius' && mode !== 'circumradius') return;
    this.polygonRadiusMode = mode;
    this.updateTextContent();
    this.notify();
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
      // Mirror the canvas draw: edge-forward (inradius) turns a half step
      // so an edge midpoint faces 0°, vertex-forward puts a vertex there.
      const alignOffset = this.polygonRadiusMode === 'inradius' ? angleStep / 2 : 0;
      let d = 'M ';
      for (let i = 0; i < sides; i++) {
        const angle = angleStep * i + alignOffset;
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
    this.gridRenderer.draw(this.gridType, this.gridSpacing);
    this.gridLayer = this.gridRenderer.gridLayer;
  }

  clearGrid(): void {
    this.gridRenderer.clear();
    this.gridCursor = this.gridRenderer.gridCursor;
  }

  snapToGrid(point: AnyItem): AnyItem { return this.snapping.grid(point); }
  updateGridCursor(): void {
    this.gridRenderer.updateCursor(this.mousePt,
      this.isGridEnabled && this.isGridSnappingEnabled,
      (item) => this.mountSnapIndicator(item));
    this.gridCursor = this.gridRenderer.gridCursor;
  }
  applyAngleSnapping(base: AnyItem, target: AnyItem): AnyItem { return this.snapping.angle(base, target); }
  applyLengthSnapping(base: AnyItem, target: AnyItem): AnyItem { return this.snapping.length(base, target); }
  applyAspectSnapping(base: AnyItem, target: AnyItem): AnyItem { return this.snapping.aspect(base, target); }
  applyPathSnapping(original: AnyItem): void {
    const snapped = this.snapping.snapPath(original);
    if (snapped) this.mousePt = snapped;
    this.pathSnapCursor = this.snapping.pathIndicator;
  }
  applyPointSnapping(original: AnyItem): void {
    const snapped = this.snapping.snapPoint(original);
    if (snapped) this.mousePt = snapped;
    this.pointSnapCursor = this.snapping.pointIndicator;
  }

  legacyDrawGrid(): void {
    const scope = this.scope;
    const active = this.layers.activeLayer;
    if (!this.gridLayer) {
      this.gridLayer = new scope.Layer();
      this.gridLayer.name = 'gridLayer';
      scope.project.addLayer(this.gridLayer);
    }
    // Lattice dots are drawing aids. guide skips hit-testing; locked
    // disables mouse interaction for the whole layer.
    this.gridLayer.guide = true;
    this.gridLayer.locked = true;
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
      dot.guide = true;
      dot.locked = true;
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

  legacyClearGrid(): void {
    if (this.gridLayer) this.gridLayer.removeChildren();
    if (this.gridCursor) this.gridCursor.visible = false;
    this.scope.view.update();
  }

  legacySnapToGrid(point: AnyItem): AnyItem {
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

  legacyUpdateGridCursor(): void {
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
    }
    this.gridCursor.position = this.mousePt;
    this.gridCursor.visible = true;
    this.mountSnapIndicator(this.gridCursor);
  }

  legacyApplyAngleSnapping(basePoint: AnyItem, targetPoint: AnyItem): AnyItem {
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

  legacyApplyLengthSnapping(basePoint: AnyItem, targetPoint: AnyItem): AnyItem {
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
    return this.snapping.aspectSecond(first, second);
  }

  // Axis-aligned opposite corner: width:height stays the selected A:B.
  legacyApplyAspectSnapping(basePoint: AnyItem, targetPoint: AnyItem): AnyItem {
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

  legacyApplyPathSnapping(originalPoint: AnyItem): void {
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
      this.pointSnapCursor,
      this.previewLine,
      this.previewInner,
      this.previewSplineText,
    ]);
    let bestPoint: AnyItem = null;
    let bestDist = Infinity;
    const maxSnapDistance = 12;
    const items: AnyItem[] = scope.project.getItems({
      match: (item: AnyItem) => {
        if (!item || !item.visible || this.isGuideItem(item)) return false;
        if (ignoredItems.has(item)) return false;
        return (
          typeof item.getNearestPoint === 'function' || item.segments || item.curves
        );
      },
    });
    items.forEach((item) => {
      const candidatePoint =
        typeof item.getNearestPoint === 'function'
          ? item.localToGlobal(item.getNearestPoint(item.globalToLocal(originalPoint)))
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
      }
      this.pathSnapCursor.position = bestPoint;
      this.pathSnapCursor.visible = true;
      this.mountSnapIndicator(this.pathSnapCursor);
    } else if (this.pathSnapCursor) {
      this.pathSnapCursor.visible = false;
    }
  }

  // Snap to vector-shape points: segment endpoints, segment midpoints,
  // and closed-shape centroids. Nearest candidate wins and the indicator
  // dot takes the winning kind's color.
  legacyApplyPointSnapping(originalPoint: AnyItem): void {
    const scope = this.scope;
    if (!this.isPointSnappingEnabled || !originalPoint) {
      if (this.pointSnapCursor) this.pointSnapCursor.visible = false;
      return;
    }
    const ignoredItems = new Set([
      this.path,
      this.previewPath,
      this.previewShape,
      this.previewRect,
      this.previewLine,
      this.previewInner,
      this.previewSplineText,
      this.quadPath,
      this.pathSnapCursor,
      this.pointSnapCursor,
      this.gridCursor,
    ]);
    type PointSnapKind = 'point' | 'midpoint' | 'centroid';
    const SNAP_COLORS: Record<PointSnapKind, string> = {
      point: '#ffd43b',
      midpoint: '#4dabf7',
      centroid: '#69db7c',
    };
    let bestPoint: AnyItem = null;
    let bestKind: PointSnapKind = 'point';
    let bestDist = Infinity;
    const maxSnapDistance = 12;
    const consider = (candidate: AnyItem, kind: PointSnapKind): void => {
      if (!candidate) return;
      const dist = candidate.getDistance(originalPoint);
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = candidate;
        bestKind = kind;
      }
    };
    const collect = (item: AnyItem): void => {
      if (!item || !item.visible || ignoredItems.has(item)) return;
      const children = item.children;
      if (children && children.length > 0) {
        children.forEach(collect);
        return;
      }
      const segments = item.segments;
      if (!segments || segments.length === 0) return;
      segments.forEach((seg: AnyItem) => consider(item.localToGlobal(seg.point), 'point'));
      const curves = item.curves;
      if (curves) {
        curves.forEach((curve: AnyItem) =>
          consider(item.localToGlobal(curve.getPointAt(curve.length / 2)), 'midpoint'),
        );
      }
      if (item.closed) {
        consider(item.localToGlobal(item.internalBounds.center), 'centroid');
      }
    };
    const items: AnyItem[] = scope.project.getItems({
      match: (item: AnyItem) => {
        if (!item || !item.visible || this.isGuideItem(item)) return false;
        if (ignoredItems.has(item)) return false;
        return !!(
          item.segments ||
          item.curves ||
          (item.children && item.children.length > 0)
        );
      },
    });
    items.forEach(collect);
    if (bestPoint && bestDist <= maxSnapDistance) {
      // Fresh point: never alias a live segment point of document geometry.
      const snapped = new scope.Point(bestPoint.x, bestPoint.y);
      this.mousePt = snapped;
      const color = SNAP_COLORS[bestKind];
      if (!this.pointSnapCursor) {
        this.pointSnapCursor = new scope.Shape.Circle(snapped, 4);
        this.pointSnapCursor.strokeColor = new scope.Color(0, 0, 0, 1.0);
        this.pointSnapCursor.strokeWidth = 2;
      }
      this.pointSnapCursor.position = snapped;
      this.pointSnapCursor.fillColor = new scope.Color(color);
      this.pointSnapCursor.visible = true;
      this.mountSnapIndicator(this.pointSnapCursor);
    } else if (this.pointSnapCursor) {
      this.pointSnapCursor.visible = false;
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
      this.pointSnapCursor,
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
        if (!item || ignored.has(item) || this.isGuideItem(item)) return false;
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

  // --- Selection (selectionFunctions.js + NibGliderApp.js) ---
  addItemToSelection(item: AnyItem): void {
    this.selection.add(item);
  }

  removeItemFromSelection(item: AnyItem): void {
    this.selection.remove(item);
  }

  collectiveBounds(items: AnyItem[]): AnyItem {
    return this.selection.collectiveBounds(items);
  }

  collectiveCenter(items: AnyItem[]): AnyItem {
    return this.selection.collectiveCenter(items);
  }

  clearOutSelection(): void {
    if (this.pathSnapCursor) this.pathSnapCursor.selected = false;
    if (this.pointSnapCursor) this.pointSnapCursor.selected = false;
    if (this.gridCursor) this.gridCursor.selected = false;
    this.selection.clear();
    this.updateTextContent();
    this.notify();
  }

  removeAllSelectedItemsAndReset(): void {
    this.commitMoveGesture();
    const before = this.contentItems();
    const selBefore = [...this.selectedItems];
    this.selection.removeAll();
    this.history.recordDelete(before, selBefore);
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
    return this.selection.hasSelection;
  }

  // --- History (undo/redo) ---
  // Commands hold live item refs plus layer anchors (the surviving
  // successor at record time), so undo/redo reinsert at the original
  // z-order and degrade to append when the anchor is gone. Every op is
  // guarded by isInScene, so a command touching items that a later
  // non-undoable op (e.g. panel combinatorics) already consumed is a
  // harmless no-op instead of a crash.
  canUndo(): boolean { return this.history.canUndo(); }
  canRedo(): boolean { return this.history.canRedo(); }
  undoLabel(): string | null { return this.history.undoLabel(); }
  redoLabel(): string | null { return this.history.redoLabel(); }

  undo(): void {
    if (this.isLiveDrawing) return;
    this.history.undo();
    this.updateTextContent(); this.notify();
  }

  redo(): void {
    if (this.isLiveDrawing) return;
    this.history.redo();
    this.updateTextContent(); this.notify();
  }

  // Top-level active-layer artwork. Live previews, cursors, and the
  // grid are excluded so a snapshot can never resurrect UI chrome.
  private contentItems(): AnyItem[] {
    return this.scene.contentItems();
  }

  private recordSceneCommand(
    label: string,
    before: AnyItem[],
    selBefore: AnyItem[],
    explicitPlaced: Array<AnyItem | null>,
    retainedBefore?: Map<string, RetainedPath>,
  ): void {
    this.history.recordSceneCommand(label, before, selBefore, explicitPlaced, retainedBefore);
  }

  private beginMoveGesture(): void { this.transforms.beginDrag(); }
  private commitMoveGesture(coalesceKey?: string): void { this.transforms.commitDrag(coalesceKey); }

  // --- History: groups ---
  // A user group (data.isUserGroup) moves and selects as one item.
  // Shape+text groups (data.shapeTextGroup / data.isShapeText) are
  // atomic artwork and are never treated as user groups.
  private topUserGroupOf(item: AnyItem): AnyItem { return this.selection.topUserGroupOf(item); }

  canGroupSelection(): boolean {
    return !this.isLiveDrawing && this.selection.canGroup;
  }

  canUngroupSelection(): boolean {
    return !this.isLiveDrawing && this.selection.canUngroup;
  }

  groupSelection(): void {
    if (this.isLiveDrawing || !this.selection.group()) return;
    this.updateTextContent(); this.notify();
  }

  // --- Selection operations (Operations menu) ---
  // Top-level layer items backing the current selection: each selected
  // item maps up through its user group so transforms, duplicates, and
  // z-order moves act on whole groups, never on children directly.
  private topLevelSelected(): AnyItem[] { return this.selection.topLevelSelected(); }

  canDuplicateSelection(): boolean {
    return !this.isLiveDrawing && this.selection.canDuplicate;
  }

  duplicateSelection(): void {
    if (this.isLiveDrawing || !this.selection.duplicate()) return;
    this.updateTextContent(); this.notify();
  }

  canReorderSelection(): boolean {
    return !this.isLiveDrawing && this.selection.canReorder;
  }

  bringSelectionToFront(): void {
    if (this.isLiveDrawing || !this.selection.bringToFront()) return;
    this.updateTextContent(); this.notify();
  }

  sendSelectionToBack(): void {
    if (this.isLiveDrawing || !this.selection.sendToBack()) return;
    this.updateTextContent(); this.notify();
  }

  canTransformSelection(): boolean {
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad)
      return false;
    return this.topLevelSelected().length > 0;
  }

  selectionCenter(): { x: number; y: number } | null {
    const items = this.topLevelSelected();
    if (items.length === 0) return null;
    try {
      const c = this.collectiveCenter(items);
      return { x: c.x, y: c.y };
    } catch {
      return null;
    }
  }

  // Live preview mutators: applied incrementally by the Operations modal
  // as its numeric field changes. No history here — the modal records one
  // undo entry for the net delta when the user commits.
  scaleSelectionPreview(factor: number): void {
    this.transforms.scalePreview(factor);
    this.updateTextContent();
    this.notify();
  }

  rotateSelectionPreview(degrees: number): void {
    this.transforms.rotatePreview(degrees);
    this.updateTextContent();
    this.notify();
  }

  // Generic undo entry for a net selection transform the caller already
  // applied (used by the Operations modal on commit).
  pushUndoCommand(label: string, undo: () => void, redo: () => void): void {
    this.history.push({ label, undo, redo });
    this.updateTextContent();
    this.notify();
  }

  ungroupSelected(): void {
    if (this.isLiveDrawing || !this.selection.ungroup()) return;
    this.updateTextContent(); this.notify();
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
  private retainCloneSources(original: paper.Item, clone: paper.Item): void {
    this.scene.retainClone(original, clone, (item) => this.shapePartOf(item));
  }

  private retainCompositeResult(item: paper.Item, source?: NGPath): void {
    const shape = this.shapePartOf(item);
    if (!(shape instanceof this.scope.Path || shape instanceof this.scope.CompoundPath)) return;
    const id = this.scene.retain(shape, source);
    item.data.drawableId = id;
  }

  stampItems(itemsToStamp: AnyItem[] | null): void {
    if (itemsToStamp === null) return;
    const before = this.contentItems();
    const selBefore = [...this.selectedItems];
    const retainedBefore = new Map(this.retainedPaths);
    for (let i = 0; i < itemsToStamp.length; i++) {
      const clone = itemsToStamp[i].clone();
      this.retainCloneSources(itemsToStamp[i], clone);
      clone.selected = false;
      this.layers.activeLayer.addChild(clone);
    }
    this.recordSceneCommand(
      itemsToStamp.length > 1
        ? `Stamp ${itemsToStamp.length} items`
        : 'Stamp',
      before,
      selBefore,
      [],
      retainedBefore,
    );
  }

  cancelCurrentDrawingOperation(): void {
    this.compositePathTool.cancel();
    this.circleTool.cancel();
    this.rectangleTool.cancel();
    this.quadTool.cancel();
    // Clears anything a tool did not claim, and resets live scale/rotation.
    this.drawing.cancel();
    // Cancel (Q / Escape) also releases drag-lock, like Space does.
    this.setIsInDragLock(false);
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
    this.layers.activeLayer.addChild(text);
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
    const straightEdges = this.straightBoundaryEdges(boundary);
    if (straightEdges.length > 0) {
      const text = this.createEdgeDisplayText(
        boundary,
        lines,
        straightEdges,
        start,
        interiorSign,
        offset,
        spec,
      );
      if (text) return text;
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
   * Return polygonal boundary edges only. Curves intentionally use the
   * continuous circumference layout below, where there is no vertex at which
   * a word needs to wrap.
   */
  private straightBoundaryEdges(boundary: AnyItem): StraightBoundaryEdge[] {
    if (boundary.closed === false || !Array.isArray(boundary.segments)) return [];
    const segments = boundary.segments;
    const curves = boundary.curves;
    if (segments.length < 3 || !Array.isArray(curves) || curves.length !== segments.length) {
      return [];
    }
    if (
      segments.some((segment: AnyItem) =>
        (segment.handleIn?.length ?? 0) > 1e-6 ||
        (segment.handleOut?.length ?? 0) > 1e-6,
      )
    ) {
      return [];
    }
    let start = 0;
    const edges: StraightBoundaryEdge[] = [];
    for (const curve of curves) {
      const length = curve.length;
      if (!(length > 1e-6)) return [];
      edges.push({ start, length });
      start += length;
    }
    return edges;
  }

  /**
   * Lay Display Text out edge by edge. A candidate always contains complete
   * words, so a word that does not fit in the remaining edge space moves to
   * the following edge rather than being split across the corner.
   */
  private createEdgeDisplayText(
    boundary: AnyItem,
    lines: string[],
    edges: StraightBoundaryEdge[],
    start: number,
    interiorSign: number,
    offset: number,
    spec: TextSpec,
  ): AnyItem {
    const scope = this.scope;
    const size = Math.max(4, spec.fontSize);
    const L = boundary.length;
    const startAt = ((start % L) + L) % L;
    let firstEdge = edges.findIndex(
      (edge) => startAt >= edge.start && startAt < edge.start + edge.length,
    );
    if (firstEdge < 0) firstEdge = 0;
    const group: AnyItem = new scope.Group();

    for (let li = 0; li < lines.length; li++) {
      const words = lines[li].trim().split(/\s+/).filter(Boolean);
      let wordIndex = 0;
      const side = this.displayFlow === 'interior' ? interiorSign : -interiorSign;
      const ring = offset * (li + 1);
      for (let edgeOffset = 0; edgeOffset < edges.length && wordIndex < words.length; edgeOffset++) {
        const edge = edges[(firstEdge + edgeOffset) % edges.length];
        let text = '';
        while (wordIndex < words.length) {
          const candidate = text ? `${text} ${words[wordIndex]}` : words[wordIndex];
          if (this.displayTextAdvance(candidate, spec, size) > edge.length) break;
          text = candidate;
          wordIndex++;
        }
        if (!text) continue;
        const advance = this.displayTextAdvance(text, spec, size);
        const alignOffset =
          spec.justification === 'right'
            ? edge.length - advance
            : spec.justification === 'center'
              ? (edge.length - advance) / 2
              : 0;
        this.addDisplayGlyphs(
          group,
          boundary,
          text,
          edge.start + alignOffset,
          side,
          ring,
          interiorSign,
          spec,
          size,
        );
      }
    }
    group.data.isShapeText = true;
    group.data.textKind = 'display';
    return group;
  }

  private displayTextAdvance(text: string, spec: TextSpec, size: number): number {
    let advance = 0;
    for (const ch of text) advance += this.displayGlyphStep(ch, spec, size);
    return advance;
  }

  private displayGlyphStep(ch: string, spec: TextSpec, size: number): number {
    const width =
      ch === ' '
        ? size * 0.4
        : this.textMetrics.advance(ch, spec.fontFamily, size, spec.fontWeight);
    return width + this.circumferenceGap;
  }

  private addDisplayGlyphs(
    group: AnyItem,
    boundary: AnyItem,
    text: string,
    start: number,
    side: number,
    ring: number,
    interiorSign: number,
    spec: TextSpec,
    size: number,
  ): void {
    const scope = this.scope;
    let d = start;
    let lastTan: number | null = null;
    for (const ch of text) {
      const step = this.displayGlyphStep(ch, spec, size);
      if (ch === ' ') {
        d += step;
        continue;
      }
      const mid = d + (step - this.circumferenceGap) / 2;
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
      const facing =
        this.glyphOrientation === 'outward' ? -interiorSign : interiorSign;
      pt.rotate(facing !== 0 ? nor.multiply(facing).angle + 90 : lastTan, at);
      pt.data.textKind = 'display';
      group.addChild(pt);
      d += step;
    }
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
        this.layers.activeLayer.addChild(innerPath);
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
      this.layers.activeLayer.addChild(innerPath);
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
      // Scaled by the diagonal mode, matching the preview frame.
      if (!this.shapeStartPoint || !this.mousePt) return null;
      const k = this.rectDiagonalScale();
      const dx = (this.mousePt.x - this.shapeStartPoint.x) * k;
      const dy = (this.mousePt.y - this.shapeStartPoint.y) * k;
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
    this.finishOrBeginRect(() => this.rectangleTool.beginCenterline());
  }

  rectTwoEdgesKC(): void {
    this.finishOrBeginRect(() => this.rectangleTool.beginTwoEdges());
  }

  rectDiagonalKC(): void {
    this.finishOrBeginRect(() => this.rectangleTool.beginDiagonal());
  }

  private finishOrBeginRect(begin: () => 'finish' | 'advance' | 'started' | 'noop'): void {
    const result = begin();
    if (result === 'finish') {
      const snap = this.captureDeposit();
      const placed = this.endShapeAsStroke();
      this.recordSceneCommand('Deposit shape', snap.before, snap.selected, placed);
      this.updateTextContent();
      return;
    }
    if (result === 'advance') {
      this.updateTextContent();
      return;
    }
    if (result === 'started') {
      this.updateTextContent();
      this.notify();
    }
  }

  quadPointKC(): void {
    const snap = this.captureDeposit();
    const result = this.quadTool.addPoint();
    if (result === 'deposited') {
      this.recordSceneCommand('Deposit shape', snap.before, snap.selected, [this.quadTool.lastPlaced]);
      this.updateTextContent();
      this.notify();
      return;
    }
    if (result === 'added') {
      this.updateTextContent();
      this.notify();
    }
  }

  stampCurrentPreview(): void {
    if (this.compositePathTool.stampComposite(this.fillEnabled)) return;
    const snap = this.captureDeposit();
    if (this.isDrawingPath && this.path) this.compositePathTool.stampLegacy();
    else if (!this.circleTool.stamp() && !this.rectangleTool.stamp() && this.isDrawingQuad) this.quadTool.stamp();
    this.recordSceneCommand('Stamp', snap.before, snap.selected, []);
    this.updateTextContent();
  }

  endPathOrShape(): void {
    if (this.compositePathTool.active) {
      this.compositePathTool.finishIntoScene(false);
      return;
    }
    const snap = this.captureDeposit();
    const deposited: Array<AnyItem | null> = [];
    if (this.isDrawingPath && this.path) deposited.push(...this.compositePathTool.finishLegacy());
    else if (this.isDrawingShape) deposited.push(...this.endShapeAsStroke());
    else if (this.isDrawingQuad && this.quadPath) deposited.push(this.quadTool.finish());
    this.recordSceneCommand('Deposit shape', snap.before, snap.selected, deposited);
    this.updateTextContent();
    this.notify();
  }

  polyLineKC(): void { this.compositePathTool.sharpKey(); }
  roundedPointKC(): void { this.compositePathTool.roundedKey(); }
  splinePointKC(): void { this.compositePathTool.splineKey(); }

  completeShapeWithSpline(): void { this.compositePathTool.completeWithSpline(); }

  // --- Live-drawing key remaps ---
  // Reserved number-key slots for future live bindings (repeat counts,
  // parametric modes). Digit0 is bound: the Radial Stamp radius lock.
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
  ];

  registerLiveKeyBinding(binding: LiveKeyBinding): void {
    this.keyboard.register(binding);
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

  toggleRadialStampRadiusLock(): void { this.circleTool.toggleRadiusLock(); }

  private liveScaleFactor(event: KeyboardEvent, dir: -1 | 1): number {
    return scaleFactor(modifiersOf(event), dir);
  }

  private applyLiveScale(event: KeyboardEvent, dir: -1 | 1): void {
    const f = this.liveScaleFactor(event, dir);
    if (this.compositePathTool.scaleLive(f) || this.quadTool.scaleLive(f)) {
      this.updateTextContent();
      this.notify();
      return;
    }
    this.liveScale = Math.min(20, Math.max(0.05, this.liveScale * f));
    this.updateShapePreview();
    this.updateTextContent();
    this.notify();
  }

  private liveRotateStep(event: KeyboardEvent): number {
    return rotationStep(modifiersOf(event));
  }

  private applyLiveRotate(event: KeyboardEvent, dir: -1 | 1): void {
    const angle = dir * this.liveRotateStep(event);
    if (this.compositePathTool.rotateLive(angle) || this.quadTool.rotateLive(angle)) {
      this.updateTextContent();
      this.notify();
      return;
    }
    this.liveRotateOffset += angle;
    this.updateShapePreview();
    this.updateTextContent();
    this.notify();
  }

  circleKC(mode: string): void {
    const result = this.circleTool.start(mode);
    if (result === 'finish') {
      const snap = this.captureDeposit();
      const placed = this.endShapeAsStroke();
      this.recordSceneCommand('Deposit shape', snap.before, snap.selected, placed);
      this.updateTextContent();
      return;
    }
    if (result === 'started') {
      this.updateTextContent();
      this.notify();
    }
  }

  radialStampKC(): void {
    const result = this.circleTool.startRadial();
    if (result === 'stamp') {
      this.stampCurrentPreview();
      return;
    }
    if (result === 'finish') {
      const snap = this.captureDeposit();
      const placed = this.endShapeAsStroke();
      this.recordSceneCommand('Deposit shape', snap.before, snap.selected, placed);
      this.updateTextContent();
      return;
    }
    if (result === 'started') {
      this.updateTextContent();
      this.notify();
    }
  }

  finishRadialStamp(): void {
    if (this.shapeType !== 'circle_radial_stamp') return;
    const snap = this.captureDeposit();
    const placed = this.endShapeAsStroke();
    this.recordSceneCommand('Deposit shape', snap.before, snap.selected, placed);
    this.updateTextContent();
  }

  endShapeAsStroke(): AnyItem[] {
    if (this.circleTool.active) return this.circleTool.finish();
    if (this.rectangleTool.active) return this.rectangleTool.finish();
    return [];
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

  // --- Guides (snap indicators and the grid) ---
  // Paper.js Item#guide is skipped by hitTest unless options.guides is
  // set (paper.js 0.12 Item#_hitTest). Item#locked disables mouse
  // interaction for that item and, on a layer, for everything in it.
  // Neither flag is omitted by project.exportSVG, so beforeprint hides
  // guide layers before the canvas bitmap is captured.
  private ensureGuideLayer(): AnyItem {
    const scope = this.scope;
    const project = scope.project;
    const active = this.layers.activeLayer;
    let layer = this.guideLayer;
    if (!layer || layer.project !== project) {
      layer = new scope.Layer();
      layer.name = 'guideLayer';
      this.guideLayer = layer;
    }
    layer.guide = true;
    layer.locked = true;
    if (active && active !== layer) active.activate();
    return layer;
  }

  private mountSnapIndicator(item: AnyItem): void {
    if (!item) return;
    item.guide = true;
    item.locked = true;
    if (!item.data) item.data = {};
    item.data.isUICursor = true;
    const layer = this.ensureGuideLayer();
    if (item.layer !== layer) layer.addChild(item);
    const layers = this.scope.project.layers;
    if (layers && layer.index !== layers.length - 1) layer.bringToFront();
  }

  private isGuideItem(item: AnyItem): boolean {
    if (!item) return false;
    if (item.guide) return true;
    const layer = item.layer;
    return !!(layer && layer !== item && layer.guide);
  }

  private setGuideLayersVisible(visible: boolean): void {
    const project = this.scope.project;
    if (!project || !project.layers) return;
    for (const layer of project.layers as AnyItem[]) {
      if (layer && layer.guide) layer.visible = visible;
    }
    if (this.scope.view) this.scope.view.update();
  }

  private onBeforePrint = (): void => {
    this.setGuideLayersVisible(false);
  };

  private onAfterPrint = (): void => {
    this.setGuideLayersVisible(true);
  };

  // --- Mouse (NibGliderApp.js) ---
  private isNonContentItem(item: AnyItem): boolean {
    return this.scene.isNonContentItem(item);
  }

  // Keyboard group per keycap, from the shared keymap.
  statusKeyGroup(key: string): StatusKeyGroup {
    return keyGroupForLabel(key);
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
    this.viewport.stepZoom(dir);
  }

  private resetZoom(): void {
    this.viewport.resetZoom();
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
    this.viewport.zoomForWheel(event.deltaY, viewPoint);
  }

  /** Select the content item under the cursor. */
  hitTestUnderCursor(): void {
    this.pointer.hitTestUnderCursor();
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

  updateShapePreview(): void {
    if (!this.isDrawingShape || !this.shapeStartPoint) return;
    const type = this.shapeType;
    if (type != null && type.startsWith('rectangle_')) this.rectangleTool.update();
    else if (type != null && type.startsWith('circle_')) this.circleTool.update();
  }

  /** Physical keyboard entry. Decisions live in KeyboardController. */
  handleKeyDown(event: KeyboardEvent): void {
    this.keyboard.handleKeyDown(event);
  }

  private nudgeSelection(dx: number, dy: number): void {
    this.transforms.nudge(dx, dy);
    this.updateTextContent();
    this.notify();
  }

  private scaleSelection(factor: number): void {
    this.transforms.scale(factor);
  }

  private rotateSelection(degrees: number): void {
    this.transforms.rotate(degrees);
  }

  // --- Canvas status overlay (NibGliderApp.js updateTextContent) ---
  updateTextContent(): void {
    const T = (s: string): StatusRun => ({ t: 'text', s });
    const K = (id: string): StatusRun => {
      const s = commandKeycap(id);
      return { t: 'key', s, g: keyGroupForLabel(s) };
    };
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
          K('toggle-status'),
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
        steps.push(L('hint', [K('drag-lock'), T(' to begin Drag-Lock')]));
        steps.push(
          L('hint', [
            K('scale-down'),
            T(' and '),
            K('scale-up'),
            T(' to Scale, '),
            K('rotate-ccw'),
            T(' and '),
            K('rotate-cw'),
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
          K('drag-lock'),
          T(' to release.'),
        ]),
      );
      steps.push(
        L('hint', [
          K('stamp'),
          T(' to Stamp, '),
          K('scale-down'),
          T(' and '),
          K('scale-up'),
          T(' to Scale, '),
          K('rotate-ccw'),
          T(' and '),
          K('rotate-cw'),
          T(' to Rotate'),
        ]),
      );
    }
    if (this.isDrawingPath) {
      state.push(L('title', [T(this.compositePathTool.active ? 'Drawing Composite Path' : 'Drawing Path')]));
      if (this.compositePathTool.active) {
        steps.push(L('hint', [K('sharp-point'), T(' sharp, '), K('spline-point'), T(' B-spline, '),
          K('rounded-point'), T(` rounded (${this.compositeCornerRadius}pt), `),
          K('finish-r'), T(' close, '), K('finish-a'), T(' end, '), K('cancel'), T(' cancel')]));
      } else {
      steps.push(L('hint', [T('Move mouse to adjust path.')]));
      steps.push(
        L('hint', [
          K('sharp-point'),
          T(' = sharp point, '),
          K('spline-point'),
          T(' = spline (tension:' + this.splineTension.toFixed(1) + '), '),
          K('finish-r'),
          T(' = complete shape'),
        ]),
      );
      steps.push(
        L('hint', [K('finish-a'), T(' = end, '), K('tension-down'), T('/'), K('tension-up'), T('/'), K('tension-reset'), T(' = adjust tension')]),
      );
      steps.push(
        L('hint', [T('A near own start closes · A near a path end joins it')]),
      );
      }
    }
    if (this.isDrawingShape) {
      if (
        this.shapeType === 'circle_radius' ||
        this.shapeType === 'circle_diameter'
      ) {
        const mode = this.shapeType === 'circle_radius' ? 'radius' : 'diameter';
        state.push(L('title', [T('Circle by (' + mode + ')')]));
        if (this.shapeType === 'circle_radius' && this.circleRadiusAnchor !== 'origin') {
          state.push(L('meta', [T('Start: circumference')]));
        }
      } else if (this.shapeType === 'circle_radial_stamp') {
        state.push(L('title', [T('Circle Radial Stamp')]));
        if (this.radialStampLockedRadius != null) {
          state.push(
            L('meta', [
              T(
                `Radius locked at ${Math.round(this.radialStampLockedRadius)}pt (0 to unlock)`,
              ),
            ]),
          );
        }
      } else if (this.shapeType === 'rectangle_diagonal') {
        state.push(L('title', [T('Rectangle by Diagonal')]));
        if (this.rectDiagonalMode !== 'full') {
          state.push(L('meta', [T(`Diagonal: ${this.rectDiagonalMode} rect`)]));
        }
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
              K('radial-stamp'),
              T(' or '),
              K('stamp'),
              T(' to stamp. Move mouse to orbit the origin.'),
            ]),
          );
          steps.push(
            L('hint', [
              K('finish-a'),
              T(' / '),
              K('finish-r'),
              T(' to deposit + finish, '),
              K('cancel'),
              T(' to cancel.'),
            ]),
          );
        } else {
          const finishKey = this.shapeType === 'circle_diameter' ? 'circle-diameter' : 'circle-radius';
          steps.push(
            L('hint', [
              T('Press '),
              K(finishKey),
              T(' to finish or '),
              K('stamp'),
              T(' to stamp.'),
            ]),
          );
        }
      } else if (this.shapeType === 'rectangle_diagonal') {
        steps.push(
          L('hint', [
            T('Press '),
            K('rect-diagonal'),
            T(' to finish or '),
            K('stamp'),
            T(' to stamp.'),
          ]),
        );
      } else if (this.shapeType === 'rectangle_two_edges') {
        if (this.shapePt2 === null) {
          steps.push(L('hint', [T('1. Move mouse to adjust this first edge.')]));
          steps.push(
            L('hint', [
              T('2. Press '),
              K('rect-two-edges'),
              T(' again to start the second edge'),
            ]),
          );
        } else {
          steps.push(L('hint', [T('1. Move mouse to adjust the second edge.')]));
          steps.push(
            L('hint', [
              T('2. Press '),
              K('rect-two-edges'),
              T(' to finish or '),
              K('stamp'),
              T(' to stamp.'),
            ]),
          );
        }
      } else if (this.shapeType === 'rectangle_centerline') {
        steps.push(L('hint', [T('1. Move mouse to adjust the rectangle.')]));
        steps.push(
          L('hint', [
            K('scale-down'),
            T(': thin width, '),
            K('scale-up'),
            T(': thicken width,'),
          ]),
        );
        steps.push(
          L('hint', [
            K('rect-centerline'),
            T(': finish, '),
            K('stamp'),
            T(': stamp, '),
            K('cancel'),
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
          K('quad'),
          T(' to add next point. '),
          K('cancel'),
          T(': cancel'),
        ]),
      );
    }
    // Live key remaps, driven by the binding registry so future bindings
    // (repeat counts, radius reference) appear here automatically.
    if (this.isLiveDrawing) {
      const liveByLabel = new Map<string, string[]>();
      for (const b of this.keyboard.liveBindings()) {
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
    // Undo/redo labels are suspended here; the History panel still shows them.
    this.setStatusSchema({ state, steps });
  }
}
