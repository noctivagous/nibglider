// Ported from the flat global scripts (drawingProperties.js,
// drawingToolsAndFunctions.js, selectionFunctions.js, shapeGenerators.js,
// NibGliderApp.js). Scene identity and selection state now live in focused
// services; the PaperScope is injected instead of paper.install(window).
// NB: `paper.*` below refers to the global namespace from paper's bundled
// declarations (type positions only); the runtime value is never imported here.
import { FontMetrics } from './fontMetrics';
import { StyleManager, type StyleState } from './appearance/StyleManager';
import { TextLayout, type TextLayoutConfig } from './appearance/TextLayout';
import {
  ShapeFactory,
  sectorPreviewPath as sectorPreviewD,
  segmentPreviewPath as segmentPreviewD,
} from './geometry/ShapeFactory';
import {
  circleInnerShapeUnitPoints as circleUnitPoints,
  type RectFrameInput,
} from './geometry/RectangleGeometry';
import { supershapeRadius as supershapeRadiusValue } from './geometry/pathResolver';
import { InputManager } from './input/InputManager';
import {
  KeyboardController,
  type KeyboardHost,
} from './input/KeyboardController';
import {
  PointerController,
  type PointerHost,
} from './input/PointerController';
import { keyGroupForLabel, scaleFactor, rotationStep } from './input/keymap';
import { CombinatoricsManager } from './scene/CombinatoricsManager';
import { DropController } from './document/DropController';
import { buildStatusSchema } from '../ui/StatusPresenter';
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

export class NibGliderEngine {
  private scope: paper.PaperScope;
  private styles!: StyleManager;
  private textLayout!: TextLayout;
  private shapes!: ShapeFactory;
  private input = new InputManager();
  private listeners = new Set<() => void>();
  private version = 0;
  private onKeyActivity: (a: KeyActivity) => void;

  // --- Stroke / style config (drawingProperties.js) ---
  // StyleManager mutates this object. The getters below are the public facade.
  private readonly paint: StyleState = {
    globalStrokeWidth: 4,
    maxStrokeWidth: 200,
    globalStrokeColor: '#107cff',
    globalFillColor: '#000000',
    globalFillType: 'solid',
    globalFillEndColor: '#ffffff',
    globalFillAngle: 0,
    globalFillInner: 0,
    globalStrokeCap: 'butt',
    globalStrokeJoin: 'miter',
    globalMiterLimit: 10,
    globalDashLength: 0,
    globalGapLength: 0,
    strokeEnabled: true,
    fillEnabled: false,
  };
  get globalStrokeWidth(): number { return this.paint.globalStrokeWidth; }
  set globalStrokeWidth(v: number) { this.paint.globalStrokeWidth = v; }
  get maxStrokeWidth(): number { return this.paint.maxStrokeWidth; }
  set maxStrokeWidth(v: number) { this.paint.maxStrokeWidth = v; }
  get globalStrokeColor(): string { return this.paint.globalStrokeColor; }
  set globalStrokeColor(v: string) { this.paint.globalStrokeColor = v; }
  get globalFillColor(): string { return this.paint.globalFillColor; }
  set globalFillColor(v: string) { this.paint.globalFillColor = v; }
  get globalFillType(): FillType { return this.paint.globalFillType; }
  set globalFillType(v: FillType) { this.paint.globalFillType = v; }
  get globalFillEndColor(): string { return this.paint.globalFillEndColor; }
  set globalFillEndColor(v: string) { this.paint.globalFillEndColor = v; }
  get globalFillAngle(): number { return this.paint.globalFillAngle; }
  set globalFillAngle(v: number) { this.paint.globalFillAngle = v; }
  get globalFillInner(): number { return this.paint.globalFillInner; }
  set globalFillInner(v: number) { this.paint.globalFillInner = v; }
  get globalStrokeCap(): StrokeCap { return this.paint.globalStrokeCap; }
  set globalStrokeCap(v: StrokeCap) { this.paint.globalStrokeCap = v; }
  get globalStrokeJoin(): StrokeJoin { return this.paint.globalStrokeJoin; }
  set globalStrokeJoin(v: StrokeJoin) { this.paint.globalStrokeJoin = v; }
  get globalMiterLimit(): number { return this.paint.globalMiterLimit; }
  set globalMiterLimit(v: number) { this.paint.globalMiterLimit = v; }
  get globalDashLength(): number { return this.paint.globalDashLength; }
  set globalDashLength(v: number) { this.paint.globalDashLength = v; }
  get globalGapLength(): number { return this.paint.globalGapLength; }
  set globalGapLength(v: number) { this.paint.globalGapLength = v; }
  get strokeEnabled(): boolean { return this.paint.strokeEnabled; }
  set strokeEnabled(v: boolean) { this.paint.strokeEnabled = v; }
  get fillEnabled(): boolean { return this.paint.fillEnabled; }
  set fillEnabled(v: boolean) { this.paint.fillEnabled = v; }
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
  private readonly combinatorics: CombinatoricsManager;
  private readonly drops: DropController;
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
    this.styles = new StyleManager(scope, {
      state: () => this.paint,
      hasSelection: () => this.hasSelection(),
      applyToSelection: (fn) => this.applyToSelection(fn),
      liveItems: () => [this.path, this.previewShape, this.quadPath, this.previewPath, this.previewRect, this.previewInner],
      livePath: () => this.path,
      isDrawingShape: () => this.isDrawingShape,
      updateShapePreview: () => this.updateShapePreview(),
    });
    this.textLayout = new TextLayout(scope, () => this.textLayoutConfig(), this.textMetrics);
    this.shapes = new ShapeFactory(scope, {
      applyStrokeGeometry: (item) => this.styles.applyStrokeGeometry(item),
      applyStrokeDash: (item) => this.styles.applyStrokeDash(item),
      applyFill: (item) => this.styles.applyFillSpec(item),
      withShapeText: (item, isPreview, rotation, center) => this.textLayout.withShapeText(item, isPreview, rotation, center),
      textForBoundary: (boundary, isPreview) => this.textLayout.textForBoundary(boundary, isPreview),
      globalStrokeColor: () => this.globalStrokeColor,
      globalStrokeWidth: () => this.globalStrokeWidth,
      textModeEnabled: () => this.textModeEnabled,
    });
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
    this.combinatorics = new CombinatoricsManager({
      combineMode: () => this.combineMode,
      setCombineNote: (note) => { this.lastCombineNote = note; },
      selectedItems: () => this.selectedItems,
      prependSelection: (item) => this.selection.prepend(item),
      removeFromSelection: (item) => this.removeItemFromSelection(item),
      addToSelection: (item) => this.addItemToSelection(item),
      isSelected: (item) => this.selectedItems.indexOf(item) !== -1,
      dropItem: (item) => this.dropItem(item),
      shapePartOf: (item) => this.shapePartOf(item),
      textModeEnabled: () => this.textModeEnabled,
      withShapeText: (item) => this.withShapeText(item, false),
      activeLayer: () => this.layers.activeLayer,
      drawingPath: () => this.path,
      quadPath: () => this.quadPath,
      isNonContentItem: (item) => this.isNonContentItem(item),
      layerChildren: () => [...this.layers.activeLayer.children],
      capture: () => this.captureDeposit(),
      commit: (label, snap, placed) => {
        this.recordSceneCommand(label, snap.before, snap.selected, placed, snap.retained);
      },
      retain: (item) => {
        if (item instanceof scope.Path || item instanceof scope.CompoundPath) this.scene.retain(item);
      },
      updateTextContent: () => this.updateTextContent(),
      notify: () => this.notify(),
    });
    this.drops = new DropController({
      scope: () => this.scope,
      zoom: () => this.viewport.zoom,
      clearSelection: () => this.clearOutSelection(),
      selectedItems: () => this.selectedItems,
      addToSelection: (item) => this.addItemToSelection(item),
      setDropNote: (note) => { this.lastDropNote = note; },
      recordDrop: (label, item, selectedBefore) => this.history.recordDrop(label, item, selectedBefore),
      updateTextContent: () => this.updateTextContent(),
      notify: () => this.notify(),
    });
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
      onDrop: (event) => this.drops.handle(event),
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

  private textLayoutConfig(): TextLayoutConfig {
    return {
      spec: this.globalText,
      textModeEnabled: this.textModeEnabled,
      textMode: this.textMode,
      displayFlow: this.displayFlow,
      glyphOrientation: this.glyphOrientation,
      splineTextPlacement: this.splineTextPlacement,
      displayOffset: this.displayOffset,
      circumferenceGap: this.circumferenceGap,
      circumferenceAngleOffset: this.circumferenceAngleOffset,
      fillEnabled: this.fillEnabled,
      fillColor: this.globalFillColor,
      strokeColor: this.globalStrokeColor,
    };
  }

  private rectFrameInput(): RectFrameInput {
    const start = xy(this.shapeStartPoint);
    const mouse = xy(this.mousePt);
    const length = start && mouse ? Math.hypot(mouse.x - start.x, mouse.y - start.y) : 0;
    return {
      shapeType: this.shapeType,
      start,
      second: xy(this.shapePt2),
      mouse,
      diagonalScale: this.rectDiagonalScale(),
      centerlineWidth: this.centerlineWidthForLength(length),
    };
  }

  setStrokeWidth(strokeVal: number): void {
    this.styles.setStrokeWidth(strokeVal);
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
    this.styles.setStrokeColor(colorVal);
    this.updateTextContent();
    this.notify();
  }

  setStrokeCap(cap: StrokeCap): void {
    this.styles.setStrokeCap(cap);
    this.notify();
  }

  setStrokeJoin(join: StrokeJoin): void {
    this.styles.setStrokeJoin(join);
    this.notify();
  }

  setMiterLimit(limit: number): void {
    this.styles.setMiterLimit(limit);
    this.notify();
  }

  strokeDashArrayValue(dash?: number, gap?: number): number[] | null {
    return this.styles.strokeDashArrayValue(dash, gap);
  }

  applyStrokeDash(item: AnyItem, dash?: number, gap?: number): void {
    this.styles.applyStrokeDash(item, dash, gap);
  }

  setStrokeDash(dash: number, gap: number): void {
    this.styles.setStrokeDash(dash, gap);
    this.notify();
  }

  setFillColor(colorVal: string): void {
    this.styles.setFillColor(colorVal);
    this.updateTextContent();
    this.notify();
  }

  /** Snapshot of the global fill settings for subsequently drawn shapes. */
  fillSpec(): FillSpec {
    return this.styles.fillSpec();
  }

  setFillType(t: FillType): void {
    this.styles.setFillType(t);
    this.updateTextContent();
    this.notify();
  }

  setFillEndColor(colorVal: string): void {
    this.styles.setFillEndColor(colorVal);
    this.updateTextContent();
    this.notify();
  }

  setFillAngle(deg: number): void {
    this.styles.setFillAngle(deg);
    this.updateTextContent();
    this.notify();
  }

  setFillInner(f: number): void {
    this.styles.setFillInner(f);
    this.updateTextContent();
    this.notify();
  }

  fillSpecOf(item: AnyItem): FillSpec | null {
    return this.styles.fillSpecOf(item);
  }

  applyFillSpec(item: AnyItem, spec?: FillSpec): void {
    this.styles.applyFillSpec(item, spec);
  }

  setStrokeEnabled(enabled: boolean): void {
    this.styles.setStrokeEnabled(enabled);
    this.notify();
  }

  setFillEnabled(enabled: boolean): void {
    this.styles.setFillEnabled(enabled);
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
  canCombineSelection(): boolean {
    return this.combinatorics.canCombineSelection();
  }

  combineSelection(mode: CombineMode): void {
    if (mode !== 'union' && mode !== 'subtract' && mode !== 'intersect') return;
    this.combinatorics.combineSelection(mode);
  }

  setCombineMode(m: CombineMode | 'none'): void {
    if (m !== 'none' && m !== 'union' && m !== 'subtract' && m !== 'intersect')
      return;
    this.combineMode = m;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
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

  depositWithCombine(deposited: AnyItem): AnyItem | null {
    return this.combinatorics.depositWithCombine(deposited);
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
    this.styles.applyStrokeGeometry(item);
  }

  applyCurrentStyles(item: AnyItem): void {
    this.styles.applyCurrentStyles(item);
  }

  updateCurrentDrawingStyles(): void {
    this.styles.updateCurrentDrawingStyles();
  }

  innerShapePreviewPath(
    type: string,
    params: InnerShapeParams,
    previewFrame: 'circle' | 'rect' = 'circle',
  ): string {
    return this.shapes.innerShapePreviewPath(
      type, params, previewFrame, this.rectangleOrientation, this.polygonRadiusMode,
    );
  }
  // Preview wells are written by PreviewBoxPresenter. Setters still notify.
  updatePreviewBox(): void {}

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

  selectionPaint(): ReturnType<StyleManager['selectionPaint']> {
    if (this.selectedItems.length === 0) return null;
    return this.styles.selectionPaint(this.selectedItems[0]);
  }

  // --- Drawing tools (drawingToolsAndFunctions.js) ---
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
  circleInnerShapeUnitPoints(type: string, angleDeg = 60): Array<[number, number]> | null {
    return circleUnitPoints(type, angleDeg);
  }

  createCircumShape(center: AnyItem, radius: number, unitPoints: Array<[number, number]>, rotationAngle = 0): AnyItem {
    return this.shapes.createCircumShape(center, radius, unitPoints, rotationAngle);
  }

  sectorPreviewPath(radius: number, sweepDeg: number): string {
    return sectorPreviewD(radius, sweepDeg);
  }

  createSectorShape(center: AnyItem, radius: number, sweepDeg: number, rotationAngle = 0): AnyItem {
    return this.shapes.createSectorShape(center, radius, sweepDeg, rotationAngle);
  }

  segmentPreviewPath(radius: number, sweepDeg: number): string {
    return segmentPreviewD(radius, sweepDeg);
  }

  createSegmentShape(center: AnyItem, radius: number, sweepDeg: number, rotationAngle = 0): AnyItem {
    return this.shapes.createSegmentShape(center, radius, sweepDeg, rotationAngle);
  }

  // --- Shape text (Display / Body / Circumference) ---
  // --- Shape text (Display / Body / Circumference) ---
  // Glyph color follows the fill toggle so text matches painted shapes:
  // fill color when fill is on, otherwise the stroke color.
  private shapePartOf(item: AnyItem): AnyItem {
    return this.textLayout.shapePartOf(item);
  }

  private withShapeText(path: AnyItem, isPreview: boolean, textRotation = 0, center: AnyItem = null): AnyItem {
    return this.textLayout.withShapeText(path, isPreview, textRotation, center);
  }

  private fadeShapeText(item: AnyItem): void {
    this.textLayout.fadeShapeText(item);
  }

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
    this.textLayout.resetStampedText(item);
  }

  createBodyTextFor(boundary: AnyItem, content?: string): AnyItem | null {
    return this.textLayout.createBodyTextFor(boundary, content);
  }

  createBoundaryText(boundary: AnyItem, content?: string, line2?: string): AnyItem | null {
    return this.textLayout.createBoundaryText(boundary, content, line2);
  }

  createInnerShape(center: AnyItem, radius: number, styleOrPreview = 'stroke', rotationAngle = 0): AnyItem {
    return this.shapes.createInnerShape({
      center, radius, styleOrPreview, rotationAngle,
      shapeType: this.shapeType,
      circleInnerShapeType: this.circleInnerShapeType,
      circleInnerShapeParams: this.circleInnerShapeParams,
      rectangleInnerShapeType: this.rectangleInnerShapeType,
      rectangleInnerShapeParams: this.rectangleInnerShapeParams,
      innerShapeType: this.innerShapeType,
      innerShapeParams: this.innerShapeParams as InnerShapeParams,
      polygonRadiusMode: this.polygonRadiusMode,
    });
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

  createRectFrameShape(styleOrPreview = 'stroke'): AnyItem {
    return this.shapes.createRectFrameShape({
      styleOrPreview,
      innerType: this.rectangleInnerShapeType,
      params: this.rectangleInnerShapeParams,
      shapeType: this.shapeType,
      orientation: this.rectangleOrientation,
      guideAngle: this.shapeGuideAngle,
      frame: this.rectFrameInput(),
    });
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

  createRegularPolygon(center: AnyItem, radius: number, sides: number, rotationAngle = 0, radiusMode = 'circumradius'): AnyItem {
    return this.shapes.createRegularPolygon(center, radius, sides, rotationAngle, radiusMode);
  }

  supershapeRadius(phi: number, m: number, n1: number, n2: number, n3: number, a1 = 1, a2 = 1): number {
    return supershapeRadiusValue(phi, m, n1, n2, n3, a1, a2);
  }

  createSupershape(center: AnyItem, radius: number, params: Record<string, number>, rotationAngle = 0): AnyItem {
    return this.shapes.createSupershape(center, radius, params as unknown as InnerShapeParams, rotationAngle);
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
  private liveStatusHints(): Array<{ label: string; keys: string[] }> {
    if (!this.isLiveDrawing) return [];
    const liveByLabel = new Map<string, string[]>();
    for (const binding of this.keyboard.liveBindings()) {
      if (!binding.applies()) continue;
      const keys = liveByLabel.get(binding.label) ?? [];
      for (const key of binding.keys) {
        if (!keys.includes(key)) keys.push(key);
      }
      liveByLabel.set(binding.label, keys);
    }
    return [...liveByLabel].map(([label, keys]) => ({ label, keys }));
  }

  updateTextContent(): void {
    this.setStatusSchema(buildStatusSchema({
      selectedCount: this.selectedItems.length,
      gridEnabled: this.isGridEnabled,
      gridType: this.gridType,
      dropNote: this.lastDropNote,
      dragLock: this.isInDragLock,
      drawingPath: this.isDrawingPath,
      composite: this.compositePathTool.active,
      cornerRadius: this.compositeCornerRadius,
      splineTension: this.splineTension,
      drawingShape: this.isDrawingShape,
      shapeType: this.shapeType,
      circleRadiusAnchor: this.circleRadiusAnchor,
      radialStampLockedRadius: this.radialStampLockedRadius,
      rectDiagonalMode: this.rectDiagonalMode,
      shapeWidth: this.shapeWidth,
      aspectLabel: this.liveRectAspectLabel(),
      hasSecondEdge: this.shapePt2 != null,
      drawingQuad: this.isDrawingQuad,
      quadPointCount: this.quadPointCount,
      liveHints: this.liveStatusHints(),
    }));
  }
}

function xy(point: { x: number; y: number } | null | undefined): { x: number; y: number } | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x, y: point.y };
}
