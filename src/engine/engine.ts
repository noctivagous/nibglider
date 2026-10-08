// Ported from the flat global scripts (drawingProperties.js,
// drawingToolsAndFunctions.js, selectionFunctions.js, shapeGenerators.js,
// NibGliderApp.js). Scene identity and selection state now live in focused
// services; the PaperScope is injected instead of paper.install(window).
// NB: `paper.*` below refers to the global namespace from paper's bundled
// declarations (type positions only); the runtime value is never imported here.
import { FontMetrics } from './fontMetrics';
import { StyleManager, type StyleState } from './appearance/StyleManager';
import { installStrokePositionRenderer } from './appearance/strokePosition';
import { TextLayout, type TextLayoutConfig } from './appearance/TextLayout';
import {
  ShapeFactory,
  sectorPreviewPath as sectorPreviewD,
  segmentPreviewPath as segmentPreviewD,
  type InnerFrameDraw,
} from './geometry/ShapeFactory';
import {
  circleInnerShapeUnitPoints as circleUnitPoints,
  type QuadMapping,
  type RectFrameInput,
} from './geometry/RectangleGeometry';
import { supershapeRadius as supershapeRadiusValue } from './geometry/pathResolver';
import { remapCircleOrigins, scaleAboutMapper, shiftCircleOrigins } from './geometry/shapeCenters';
import {
  loadEngineSettings,
  memorySettingsStore,
  saveEngineSettings,
  type SettingsStorage,
} from './engineSettings';
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
import { InterlaceManager } from './scene/InterlaceManager';
import { DropController, viewFitScale } from './document/DropController';
import {
  clearTransient,
  decodeSceneItems,
  encodeSceneItems,
  isSceneJson,
  isSvgMarkup,
  readSceneView,
  stripSvgClips,
  type SceneView,
} from './document/SceneIO';
import {
  classifyClipboardText,
  isMultilineText,
  richTextToPlainText,
  splitBodyLines,
} from './document/clipboardIngest';
import {
  editableBaselines,
  resolveTextMoveDelta,
} from './snapping/textSnap';
import {
  blobToDataUrl,
  readSystemClipboard,
  writeSystemClipboard,
} from './document/systemClipboard';
import { buildStatusSchema } from './appearance/statusSchema';
import { buildKeymapRows } from './appearance/keymapSchema';
import {
  idleCursorContext,
  resolveCanvasCursor,
  type CanvasCursorContext,
} from './appearance/cursorState';
import { EngineContext } from './EngineContext';
import { createDrawingHost, createKeyboardHost, createPointerHost } from './hosts';
import { modifiersOf } from './input/ModifierStateTracker';
import { PathTool } from './drawing/PathTool';
import { CircleTool } from './drawing/CircleTool';
import { RectangleTool } from './drawing/RectangleTool';
import { QuadTool } from './drawing/QuadTool';
import { DrawingSession } from './drawing/DrawingSession';
import type { DrawingHost } from './drawing/DrawingHost';
import { SceneRepository, type RetainedPath } from './scene/SceneRepository';
import {
  EXPORT_FRAME_KEY,
  EXPORT_FRAME_RECORD,
  exportFrameItems,
  frameArtwork,
  isExportFrameItem,
  rasterizeSvg,
  rasterizeSvgToPng,
  readExportFrame,
} from './scene/exportFrames';
import {
  createExportFrame,
  exportPngSize,
  resolveExportBoxes,
  splitFrameBoxes,
  validateExportFrame,
  type ExportFrameBox,
  type ExportFrameRecord,
} from './model/NGExportFrame';
import { SelectionManager } from './scene/SelectionManager';
import {
  ExportFrameHandles,
  resizedBounds,
  type ExportFrameHandleId,
} from './scene/exportFrameHandles';
import {
  TransformHandles,
  type TransformBounds,
  type TransformHandleId,
  type TransformScaleHandleId,
} from './scene/transformHandles';
import { HistoryManager } from './history/HistoryManager';
import { TransformManager } from './history/TransformManager';
import { GridRenderer } from './snapping/GridRenderer';
import { SnappingManager } from './snapping/SnappingManager';
import { RepeatManager } from './repeat/RepeatManager';
import type { RepeatAnchor, RepeatDirection } from './geometry/RepeatGeometry';
import { clampRepeatCount, isRepeatAnchor, isRepeatDirection } from './geometry/RepeatGeometry';
import { LayerManager } from './document/LayerManager';
import { CoordinateManager } from './document/CoordinateManager';
import {
  drawingPageRect,
  pageCornerBrackets,
  pageEdgeTicks,
  snapPageToGrid,
  type DrawingPage,
  type DrawingPageRect,
} from './document/DrawingPage';
import { computeRulerTicks } from './document/pageRuler';
import { defaultGridSpacingPt } from './document/MeasurementUnits';
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
  KeymapRow,
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
  StrokePosition,
  TextJustification,
  TextMode,
  TextPasteLocation,
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
  KeymapRow,
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
  StrokePosition,
  TextJustification,
  TextMode,
  TextPasteLocation,
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

export type WheelGesture = 'pinch' | 'pan' | 'zoom';

/** File > Export scope: the document canvas, the current viewport frame,
 * or the selected objects. */
export type ExportScope = 'canvas' | 'viewport' | 'selection';

/** View snapshot for the canvas scrollbars and rulers: center and size
 * in project coordinates, plus the page sheet and the artwork bounds
 * (each null when absent). Null while no view exists. */
/** Ruler placement: viewer edges (fixed to the canvas container) or the
 * DrawingPage frame (travels with the page). A Document Settings option. */
export type RulerPlacement = 'viewer' | 'page';

export interface ViewState {
  centerX: number;
  centerY: number;
  zoom: number;
  viewWidth: number;
  viewHeight: number;
  /** User page sheet; null until page dimensions are set. */
  page: DrawingPageRect | null;
  /** Union bounds of the artwork; null on an empty canvas. */
  artwork: DrawingPageRect | null;
}
/** Pinch deltas arrive much smaller than wheel notches; this gain keeps the
 * trackpad pinch zoom pace comparable to the scroll-wheel pace. */
export const TRACKPAD_PINCH_GAIN = 3;
/** A notch-like spike shortly after trackpad input is momentum tail, not a
 * wheel notch. Tunable; momentum decays on roughly this timescale. */
export const TRACKPAD_STICKY_MS = 400;

/**
 * Route a wheel event: ctrl+wheel is a trackpad pinch, small, sideways, or
 * continuous pixel deltas are a two-finger pan, and notched (or
 * line-mode) deltas are a classic scroll wheel. Fast trackpad flings can
 * spike like notches, so a recent trackpad stream (recentTrackpad) keeps
 * them panning instead of flapping into zoom mid-gesture.
 */
export function classifyWheel(event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey'> & {
  wheelDeltaY?: number;
}, recentTrackpad = false): WheelGesture {
  if (event.ctrlKey) return 'pinch';
  if (event.deltaMode !== 0) return 'zoom';
  if (event.deltaX !== 0) return 'pan';
  if (event.deltaY === 0) return 'pan';
  if (typeof event.wheelDeltaY === 'number' && event.wheelDeltaY !== 0) {
    // Legacy notch multiples are definitive wheel hardware either way, and
    // beat the momentum-sticky window below.
    if (event.wheelDeltaY % 120 === 0) return 'zoom';
    return 'pan';
  }
  if (!Number.isInteger(event.deltaY) || Math.abs(event.deltaY) < 50) return 'pan';
  return recentTrackpad ? 'pan' : 'zoom';
}

export class NibGliderEngine {
  readonly context: EngineContext;
  private get scope(): paper.PaperScope { return this.context.scope; }
  private get styles(): StyleManager { return this.context.styles; }
  private get textLayout(): TextLayout { return this.context.textLayout; }
  private get shapes(): ShapeFactory { return this.context.shapes; }
  private input = new InputManager();
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
    globalStrokePosition: 'center',
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
  get globalStrokePosition(): StrokePosition { return this.paint.globalStrokePosition; }
  set globalStrokePosition(v: StrokePosition) { this.paint.globalStrokePosition = v; }
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
  // --- DrawingPage (the finite sheet on the infinite canvas) ---
  pageLayer: AnyItem = null;
  pageOutline: AnyItem = null;
  /** View from a scene opened before the canvas exists. Applied on attach. */
  private pendingSceneView: SceneView | null = null;
  /** True while a saved view is being applied, so that does not count as an edit. */
  private restoringView = false;

  // --- Grid repeat ---
  isRepeatEnabled = false;
  repeatRows = 2;
  repeatCols = 2;
  repeatAnchor: RepeatAnchor = 'cell-center';
  repeatDirection: RepeatDirection = 'both';
  repeatRectKeys = true;
  repeatCircleKeys = true;
  repeatPaths = true;
  private repeatManager!: RepeatManager;

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
    content: 'Hello World',
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
  // Settings window "Text pastes at Location": pasted text anchors at the
  // crosshair (cursor point, else view center) or always at the view center.
  textPasteLocation: TextPasteLocation = 'crosshair';
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
  // Mode the segmented control shows. Survives the switch-off ('none')
  // so turning Combinatorics back on restores the same operation.
  combineTool: CombineMode = 'union';
  // Daylight past the over-band when Combinatorics mode is Interlace.
  // Baked weaves from the mode use this gap; the menu Interlace command
  // keeps the width-derived default.
  interlaceGap = 2;
  // Kerned advance measurement (parsed font bytes → canvas → estimate).
  textMetrics = new FontMetrics();

  // --- Type At Cursor (P key) session state ---
  // While true the keyboard types a single line instead of key-clicking.
  // 'new' drafts a line at the cursor; 'edit' retypes the selected text.
  isTypingText = false;
  typedTextMode: 'new' | 'edit' | null = null;
  private typedTextBuffer = '';
  private typedTextPreview: AnyItem = null;
  private typedTextEditRoot: AnyItem = null;
  private typedTextOriginal: string[] = [];
  private typedTextAnchor: AnyItem = null;
  private typedTextSnap: { before: AnyItem[]; selected: AnyItem[]; retained: Map<string, RetainedPath> } | null = null;

  // --- Drawing mode / shape state (drawingToolsAndFunctions.js) ---
  pathDrawingMode: 'legacy' | 'ngComposite' = 'legacy';
  private readonly drawing = new DrawingSession();
  /** Pre-marquee selection, restored when Esc cancels the selection rectangle. */
  private selectionRectSnapshot: AnyItem[] | null = null;
  /** Resize handles for the selected export frame (exactly-one selection). */
  private readonly frameHandles = new ExportFrameHandles({
    scope: () => this.scope,
    mount: (item) => this.mountGuideItem(item),
    unmount: (item) => this.unmountGuideItem(item),
  });
  /** Active handle-resize gesture, or null while idle. */
  private frameResize: {
    item: AnyItem;
    handle: ExportFrameHandleId;
    before: { x: number; y: number; width: number; height: number };
  } | null = null;
  /** Conventional transform controls (Ctrl/Cmd+T on a selection). */
  isTransformMode = false;
  private readonly transformHandles = new TransformHandles({
    scope: () => this.scope,
    mount: (item) => this.mountGuideItem(item),
    unmount: (item) => this.unmountGuideItem(item),
  });
  /** Active transform-handle drag, or null while idle. Totals are measured
   * from the gesture start; each pointer step applies only the delta. */
  private transformDrag: {
    handle: TransformHandleId;
    items: AnyItem[];
    center: { x: number; y: number };
    width: number;
    height: number;
    startPt: { x: number; y: number };
    netFx: number;
    netFy: number;
    netDegrees: number;
  } | null = null;
  /** Armed S/R/H/V live transform: the mouse steers, a key-click commits. */
  private transformLive: {
    kind: 'scale' | 'rotate' | 'shearH' | 'shearV';
    items: AnyItem[];
    center: { x: number; y: number };
    width: number;
    height: number;
    startPt: { x: number; y: number };
    startDist: number;
    startAngle: number;
    netFx: number;
    netFy: number;
    netDegrees: number;
    netK: number;
  } | null = null;
  /** Drag line from the live-transform center to the cursor. */
  private transformLine: AnyItem | null = null;
  private get compositePathTool(): PathTool { return this.context.compositePathTool; }
  private get circleTool(): CircleTool { return this.context.circleTool; }
  private get rectangleTool(): RectangleTool { return this.context.rectangleTool; }
  private get quadTool(): QuadTool { return this.context.quadTool; }
  // Services live on EngineContext. These getters keep the existing call sites.
  private get scene(): SceneRepository { return this.context.scene; }
  private get history(): HistoryManager { return this.context.history; }
  private get combinatorics(): CombinatoricsManager { return this.context.combinatorics; }
  private get interlace(): InterlaceManager { return this.context.interlace; }
  private get drops(): DropController { return this.context.drops; }
  private get transforms(): TransformManager { return this.context.transforms; }
  private get gridRenderer(): GridRenderer { return this.context.gridRenderer; }
  private get snapping(): SnappingManager { return this.context.snapping; }
  private get layers(): LayerManager { return this.context.layers; }
  private readonly coordinates = new CoordinateManager();
  private get viewport(): ViewportManager { return this.context.viewport; }
  private get documentManager(): DocumentManager { return this.context.documentManager; }
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

  /** Current view zoom (1 = 100%). View-only state, published on the
   * lightweight view channel, never the document. */
  get zoomLevel(): number { return this.viewport.zoom; }

  // --- Config summary live readout ---
  // In-flight drawings move on mousemove without a document notify (only
  // the canvas repaints), so the summary box subscribes to this dedicated
  // progress ping instead of re-rendering the whole panel per cursor move.
  private liveVersion = 0;
  private readonly liveListeners = new Set<() => void>();

  subscribeLive = (fn: () => void): (() => void) => {
    this.liveListeners.add(fn);
    return () => { this.liveListeners.delete(fn); };
  };

  getLiveVersion = (): number => this.liveVersion;

  /** Progress ping for in-flight drawings. Only summary-box subscribers
   * re-render; the panel and app are untouched. */
  noteLiveProgress(): void {
    this.liveVersion++;
    for (const fn of [...this.liveListeners]) {
      try { fn(); } catch { /* A failing listener must not break drawing. */ }
    }
  }

  /** Live radius (circle tools) or rubber-band spline segment (path tools)
   * in page points, for the config summary readout. Null when nothing with
   * a length/angle meaning is in flight. Quad sessions are excluded. */
  liveMeasureVector(): { lengthPt: number; angleDeg: number } | null {
    if (this.isDrawingShape && this.shapeStartPoint && this.mousePt) {
      const type = this.shapeType;
      if (type != null && type.startsWith('circle_')) {
        const preview = this.previewShape;
        const radius = preview != null && typeof preview.radius === 'number' && preview.radius > 0
          ? preview.radius
          : this.shapeStartPoint.getDistance(this.mousePt);
        if (Number.isFinite(radius)) return { lengthPt: radius, angleDeg: this.shapeGuideAngle };
      }
      return null;
    }
    if (this.isDrawingPath && this.mousePt) {
      const compositeBase = this.compositePathTool.snapBase;
      let base = compositeBase
        ? new this.scope.Point(compositeBase.x, compositeBase.y)
        : null;
      if (!base) {
        const segments = this.path?.segments;
        base = segments?.length
          ? segments[segments.length === 1 ? 0 : segments.length - 2].point
          : null;
      }
      if (base) {
        const delta = this.mousePt.subtract(base);
        const lengthPt = Math.hypot(delta.x, delta.y);
        if (Number.isFinite(lengthPt) && Number.isFinite(delta.angle)) {
          return { lengthPt, angleDeg: delta.angle };
        }
      }
    }
    return null;
  }

  // --- Selection (selectionFunctions.js) ---
  private get selection(): SelectionManager { return this.context.selection; }
  get selectedItems(): AnyItem[] { return this.selection.selectedItems; }
  isInDragLock = false;
  isPanLocked = false;

  private statusSchema: StatusSchema = { state: [], steps: [] };
  private keymapRows: KeymapRow[] = [];
  private lastStatusKey = '';

  getStatusSchema(): StatusSchema {
    return this.statusSchema;
  }

  getKeymapRows(): KeymapRow[] {
    return this.keymapRows;
  }

  constructor(
    scope: paper.PaperScope,
    onKeyActivity: (a: KeyActivity) => void,
    store: SettingsStorage = memorySettingsStore(),
  ) {
    this.settingsStore = store;
    this.context = new EngineContext(scope);
    installStrokePositionRenderer(scope);
    this.onKeyActivity = onKeyActivity;
    this.context.styles = new StyleManager(scope, {
      state: () => this.paint,
      hasSelection: () => this.hasSelection(),
      applyToSelection: (fn) => this.applyToSelection(fn),
      liveItems: () => [this.path, this.previewShape, this.quadPath, this.previewPath, this.previewRect, this.previewInner],
      livePath: () => this.path,
      isDrawingShape: () => this.isDrawingShape,
      updateShapePreview: () => this.updateShapePreview(),
    });
    this.context.textLayout = new TextLayout(scope, () => this.textLayoutConfig(), this.textMetrics);
    this.context.shapes = new ShapeFactory(scope, {
      applyStrokeGeometry: (item) => this.styles.applyStrokeGeometry(item),
      applyStrokeDash: (item) => this.styles.applyStrokeDash(item),
      applyFill: (item) => this.styles.applyFillSpec(item),
      withShapeText: (item, isPreview, rotation, center) => this.textLayout.withShapeText(item, isPreview, rotation, center),
      textForBoundary: (boundary, isPreview) => this.textLayout.textForBoundary(boundary, isPreview),
      globalStrokeColor: () => this.globalStrokeColor,
      globalStrokeWidth: () => this.globalStrokeWidth,
      textModeEnabled: () => this.textModeEnabled,
    });
    this.context.layers = new LayerManager(scope);
    this.context.viewport = new ViewportManager(scope, () => this.afterViewChange(), () => {
      const items = this.contentItems();
      // Pan-clamp stays artwork-only (existing contract): the board is a
      // bounds reference for display and scrollbars, not a pan constraint.
      return items.length > 0 ? this.collectiveBounds(items) : null;
    });
    this.context.documentManager = new DocumentManager();
    this.documentManager.subscribe(() => this.notify());
    this.context.scene = new SceneRepository(scope, () => ({
      gridLayer: this.gridLayer,
      cursors: [this.pathSnapCursor, this.pointSnapCursor, this.gridCursor],
      previews: [this.previewInner, this.previewSplineText, this.previewShape,
        this.previewLine, this.previewPath, this.previewRect],
    }), this.layers);
    this.context.history = new HistoryManager(this.scene, () => this.selection,
      () => this.documentManager.markEdited('scene'));
    this.context.selection = new SelectionManager(this.scene, this.history,
      (original, clone) => this.scene.retainClone(original, clone, (item) => this.shapePartOf(item)),
      {
        mount: (item) => this.mountCentroidMarker(item),
        unmount: (item) => { try { item.remove(); } catch { /* Detached already. */ } },
      });
    const combinatoricsHost = {
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
    };
    this.context.combinatorics = new CombinatoricsManager(combinatoricsHost);
    this.context.interlace = new InterlaceManager({
      ...combinatoricsHost,
      paperScope: () => scope,
      sourceById: (id) => {
        if (typeof id !== 'string') return null;
        const known = this.scene.drawableOf(id);
        if (known && known.kind === 'path') return known.source;
        try {
          const retained = this.scene.getRetainedPathDrawable(id);
          if (retained) return retained.source;
        } catch { /* No retained source. */ }
        return null;
      },
      pathSourceOf: (item) => {
        const id = item?.data?.drawableId;
        if (typeof id !== 'string') return null;
        const known = this.scene.drawableOf(id);
        if (known && known.kind === 'path') return known.source;
        try {
          const retained = this.scene.getRetainedPathDrawable(id);
          if (retained) return retained.source;
        } catch { /* No retained source. */ }
        return null;
      },
      bezierSourceOf: (item) => this.scene.bezierSource(item),
      recordCustom: (label, undo, redo) => this.context.history.push({ label, undo, redo }),
    });
    this.context.drops = new DropController({
      scope: () => this.scope,
      zoom: () => this.viewport.zoom,
      clearSelection: () => this.clearOutSelection(),
      selectedItems: () => this.selectedItems,
      addToSelection: (item) => this.addItemToSelection(item),
      setDropNote: (note) => { this.lastDropNote = note; },
      recordDrop: (label, item, selectedBefore) => this.history.recordDrop(label, item, selectedBefore),
      depositTextPayload: (text, at) => { this.pasteTextPayload(text, at); },
      depositImageUrl: (url, at) => { void this.depositImageUrl(url, at); },
      updateTextContent: () => this.updateTextContent(),
      notify: () => this.notify(),
    });
    this.context.transforms = new TransformManager(this.scene, this.selection, this.history);
    this.repeatManager = new RepeatManager({
      scope: () => this.scope,
      session: () => this.drawing,
      settings: () => ({
        enabled: this.isRepeatEnabled,
        rows: this.repeatRows,
        cols: this.repeatCols,
        anchor: this.repeatAnchor,
        direction: this.repeatDirection,
        rectKeys: this.repeatRectKeys,
        circleKeys: this.repeatCircleKeys,
        paths: this.repeatPaths,
      }),
      addToActive: (item) => this.layers.addToActive(item),
      place: (item) => this.placeDeposited(item, { front: true }),
      setRows: (rows) => this.setRepeatRows(rows),
      setCols: (cols) => this.setRepeatCols(cols),
    });
    this.registerRepeatLiveKeys();
    this.context.gridRenderer = new GridRenderer(scope);
    this.context.snapping = new SnappingManager(scope, () => ({
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
    this.context.compositePathTool = new PathTool(scope, (item) => {
      this.applyCurrentStyles(item);
      item.fillColor = null;
      if (!item.parent) this.layers.addToActive(item);
      this.refreshSplineTextPreview();
      this.repeatManager.refreshPreview();
    });
    const host = this.drawingHost();
    this.compositePathTool.bind(host);
    this.context.circleTool = new CircleTool(host);
    this.context.rectangleTool = new RectangleTool(host);
    this.context.quadTool = new QuadTool(host);
    this.retainHostCallbacks();
    this.loadSettings();
  }

  // hosts.ts calls these through the untyped surface. The references keep
  // the private methods live for noUnusedLocals.
  private retainHostCallbacks(): void {
    void this.placeDeposited;
    void this.topUserGroupOf;
    void this.retainCompositeResult;
    void this.fadeShapeText;
    void this.clearSplineTextPreview;
    void this.resetStampedText;
    void this.liveAdjustApplies;
    void this.applyLiveScale;
    void this.applyLiveRotate;
    void this.stepZoom;
    void this.resetZoom;
    void this.stylePreviewFrame;
    void this.clearShadow;
    void this.nudgeSelection;
    void this.scaleSelection;
    void this.rotateSelection;
  }

  private drawingHost(): DrawingHost {
    return createDrawingHost(this);
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
    return createPointerHost(this);
  }

  private keyboardApi(): KeyboardHost {
    return createKeyboardHost(this);
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
  subscribe = (fn: () => void): (() => void) => this.context.subscribe(fn);

  getVersion = (): number => this.context.getVersion();

  getPageSettings(): PageSettings { return this.documentManager.pageSettings; }
  /** Counts for the Document Info window: top-level artwork objects and
   * artwork layers. Guide, grid, cursor, and preview items never count;
   * groups count as one object, matching the selection model. */
  documentStats(): { objectCount: number; layerCount: number } {
    try {
      const project = this.scope.project;
      const layers = ((project?.layers ?? []) as AnyItem[]).filter(
        (layer) => layer && !layer.guide && layer !== this.gridLayer && layer !== this.guideLayer,
      );
      let objects = 0;
      for (const layer of layers) {
        for (const child of ([...(layer.children ?? [])] as AnyItem[])) {
          try {
            if (!this.scene.isNonContentItem(child)) objects += 1;
          } catch { /* Detached; not an object. */ }
        }
      }
      return { objectCount: objects, layerCount: layers.length };
    } catch {
      return { objectCount: 0, layerCount: 0 };
    }
  }
  isDocumentDirty(): boolean { return this.documentManager.isDirty; }
  documentRevision(): number { return this.documentManager.revisionNumber; }
  setPageDimensions(width: number, height: number, unit: LengthUnit = 'pt'): void {
    this.documentManager.setPageSize(width, height, unit);
    // documentManager.subscribe already notifies; repaint the page sheet.
    this.ensurePageLayer();
    this.drawPage();
  }

  /** New-document entry: dimensions snap to the unit grid, the display
   * unit applies, and the grid defaults to the unit spacing
   * (quarter-inch for inch/foot). Width/height arrive in points. */
  applyPageSpec(widthPt: number, heightPt: number, unit: LengthUnit): void {
    const spacing = defaultGridSpacingPt(unit);
    this.setGridSpacing(spacing);
    const snapped = snapPageToGrid(widthPt, heightPt, spacing);
    try {
      this.documentManager.setPageSize(snapped.widthPt, snapped.heightPt, 'pt');
    } catch {
      return;
    }
    this.documentManager.setDisplayUnit(unit);
    this.ensurePageLayer();
    this.centerOnCanvas();
    this.drawPage();
  }

  /** Center the view on the canvas origin (the page center), so a new
   * document opens with the page centered. Artwork clamping still
   * applies, so callers clear first when exact centering matters. */
  private centerOnCanvas(): void {
    try {
      this.viewport.setCenter(new this.scope.Point(0, 0));
    } catch {
      // Headless: no view to move.
    }
  }

  /** Active DrawingPage record (a copy), null until dimensions are set. */
  get drawingPage(): DrawingPage | null {
    const page = this.documentManager.activePage();
    return page ? { ...page } : null;
  }

  /** Every page in the document; one entry today, more for multi-page later. */
  get drawingPages(): DrawingPage[] {
    return this.documentManager.pageList;
  }

  /** Append a page (points) and make it active. The UI activates among them. */
  addDrawingPage(widthPt: number, heightPt: number, unit: LengthUnit = 'pt'): DrawingPage | null {
    if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) {
      return null;
    }
    const page = this.documentManager.addPage(widthPt, heightPt, unit);
    this.ensurePageLayer();
    this.drawPage();
    return page;
  }

  /** Activate a page by id. Unknown ids are ignored. */
  setActiveDrawingPage(id: string): boolean {
    if (!this.documentManager.setActivePage(id)) return false;
    this.ensurePageLayer();
    this.drawPage();
    return true;
  }

  /** Bind the active page to its Paper content layer: rejoin by recorded
   * layer id, else claim the current active content layer (fresh page,
   * or a new Paper project after attach). Captures the active layer
   * before creating anything: new Layer() activates itself, and
   * sendToBack() on the active layer hands activation elsewhere. */
  private ensurePageLayer(): AnyItem | null {
    try {
      const project = this.scope.project;
      if (!project) return null;
      const page = this.documentManager.activePage();
      if (!page) return null;
      const active = this.layers.activeOrNull;
      if (page.layerId) {
        for (const layer of (project.layers ?? []) as AnyItem[]) {
          try {
            if (layer && `paper-layer-${layer.id}` === page.layerId && !layer.guide) {
              if (layer !== active) layer.activate();
              return layer;
            }
          } catch { /* Detached; keep looking. */ }
        }
      }
      if (active && !active.guide) {
        page.layerId = `paper-layer-${active.id}`;
        return active;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** User page rect, centered on the canvas origin. Null until New
   * Document (or setPageDimensions) assigns page dimensions. */
  pageRect(): DrawingPageRect | null {
    const page = this.documentManager.activePage();
    if (!page) return null;
    return drawingPageRect(page);
  }

  /** Ruler placement. Unknown values are ignored. */
  rulerPlacement: RulerPlacement = 'viewer';

  setRulerPlacement(v: RulerPlacement): void {
    if (v !== 'viewer' && v !== 'page') return;
    if (v === this.rulerPlacement) return;
    this.rulerPlacement = v;
    this.updateTextContent(); this.notify();
  }

  /** Ruler guide lines from labeled majors to the canvas edges. Off by
   * default; a Document Settings option. */
  rulerGuides = false;

  setRulerGuides(v: boolean): void {
    if (v === this.rulerGuides) return;
    this.rulerGuides = v;
    this.updateTextContent(); this.notify();
  }

  /** Filled sheet behind the page corners. Off by default. */
  pageFill = false;

  setPageFill(v: boolean): void {
    if (v === this.pageFill) return;
    this.pageFill = v;
    this.drawPage();
    this.updateTextContent(); this.notify();
  }

  /** Ruler ticks along the four page edges. Off by default. */
  pageSideTicks = false;

  setPageSideTicks(v: boolean): void {
    if (v === this.pageSideTicks) return;
    this.pageSideTicks = v;
    this.drawPage();
    this.updateTextContent(); this.notify();
  }
  setPageDisplayUnit(unit: LengthUnit): void { this.documentManager.setDisplayUnit(unit); }
  subscribeDocumentChanges(listener: (change: DocumentChange) => void): () => void {
    return this.documentManager.subscribe(listener);
  }
  markDocumentClean(): void { this.documentManager.markClean(); }
  /** True when the active layer holds artwork (not overlays). */
  hasContent(): boolean { return this.contentItems().length > 0; }

  // --- Document session: gallery new/open/save support + SVG transfer ---
  // All mutators record one undo entry and refresh paint/status bridges.
  /** Remove every artwork item and clear the selection (New document).
   * Recenters on the workspace so the page opens centered. */
  newDocument(): void {
    if (this.isLiveDrawing) return;
    const before = this.contentItems();
    const selectedBefore = [...this.selectedItems];
    if (before.length === 0) { this.centerOnCanvas(); return; }
    this.clearOutSelection();
    for (const item of before) {
      try { item.remove(); } catch { /* Detached already. */ }
    }
    this.scene.pruneRecords();
    this.recordSceneCommand('New document', before, selectedBefore, []);
    this.centerOnCanvas();
    this.updateTextContent(); this.notify();
  }

  /** Native gallery payload: Paper JSON of artwork items, plus the view.
   * Selection and glow are stripped for the write and restored after. */
  exportScene(): string {
    const items = this.contentItems();
    const selected = this.selection.snapshot();
    this.selection.suspendGlow();
    try {
      for (const item of items) clearTransient(item);
      return encodeSceneItems(items, this.capturedSceneView());
    } catch {
      return '';
    } finally {
      try { this.selection.restore(selected, { quiet: true }); } catch { /* Headless. */ }
      try { this.selection.restoreGlow(); } catch { /* Headless. */ }
      try { this.scope.view?.update(); } catch { /* Headless. */ }
    }
  }

  /** Items hidden for every export so guide layers, snap/grid cursors,
   * live previews, export frames, and the selection glow never leak into
   * exported artwork (project.exportSVG omits none of them). */
  private hideExportOverlays(): AnyItem[] {
    const hidden: AnyItem[] = [];
    const hide = (item: AnyItem): void => {
      try {
        if (item && item.visible !== false && !hidden.includes(item)) {
          item.visible = false;
          hidden.push(item);
        }
      } catch { /* Detached already. */ }
    };
    try {
      const project = this.scope.project;
      for (const layer of ((project?.layers ?? []) as AnyItem[])) {
        try {
          if (layer && layer.guide) hide(layer);
        } catch { /* ignore */ }
      }
    } catch { /* Headless. */ }
    hide(this.gridLayer);
    hide(this.guideLayer);
    hide(this.gridCursor);
    hide(this.pathSnapCursor);
    hide(this.pointSnapCursor);
    hide(this.previewInner);
    hide(this.previewSplineText);
    hide(this.previewShape);
    hide(this.previewLine);
    hide(this.previewPath);
    hide(this.previewRect);
    for (const frame of this.exportFrameItems()) hide(frame);
    try {
      this.selection.suspendGlow();
    } catch { /* Headless. */ }
    return hidden;
  }

  private restoreExportOverlays(hidden: AnyItem[]): void {
    try {
      this.selection.restoreGlow();
    } catch { /* Headless. */ }
    for (const item of hidden) {
      try {
        item.visible = true;
      } catch { /* ignore */ }
    }
    try {
      this.scope.view?.update();
    } catch { /* Headless. */ }
  }

  /** Serialize the active artwork to SVG. Overlay hiding is shared with
   * the scoped exporters below. */
  exportSceneSVG(): string {
    const hidden = this.hideExportOverlays();
    try {
      const project = this.scope.project;
      if (!project) return '';
      const exported = project.exportSVG({ asString: true });
      return typeof exported === 'string' ? exported : '';
    } catch {
      return '';
    } finally {
      this.restoreExportOverlays(hidden);
    }
  }

  /** Serialize the artwork cropped to one document-points box via the SVG
   * viewBox. Live artwork is never clipped or modified. Null when the box
   * is degenerate or serialization is unavailable. */
  private exportBoxSVG(box: ExportFrameBox): string | null {
    if (!Number.isFinite(box.x) || !Number.isFinite(box.y)
      || !(box.width > 0) || !(box.height > 0)) return null;
    const hidden = this.hideExportOverlays();
    try {
      const project = this.scope.project;
      if (!project) return null;
      const bounds = new this.scope.Rectangle(
        new this.scope.Point(box.x, box.y),
        new this.scope.Size(box.width, box.height),
      );
      const exported = project.exportSVG({ asString: true, bounds });
      return typeof exported === 'string' && exported.length > 0 ? exported : null;
    } catch {
      return null;
    } finally {
      this.restoreExportOverlays(hidden);
    }
  }

  /** Document-points crop box for a File > Export scope. Canvas prefers
   * the page rect and falls back to the artwork bounds for unbounded
   * documents; viewport reads the live view; selection reads the
   * top-level selection union. Null when the scope has no area. */
  scopeExportBox(scope: ExportScope): ExportFrameBox | null {
    try {
      if (scope === 'canvas') {
        const page = this.pageRect();
        if (page && page.width > 0 && page.height > 0) {
          return { x: page.x, y: page.y, width: page.width, height: page.height };
        }
        const art = this.artworkRect();
        if (art && art.width > 0 && art.height > 0) return { ...art };
        return null;
      }
      if (scope === 'viewport') {
        const bounds = this.scope.view?.bounds;
        if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) return null;
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      }
      const items = this.topLevelSelected();
      if (items.length === 0) return null;
      const united = this.selection.collectiveBounds(items);
      if (!united || !(united.width > 0) || !(united.height > 0)) return null;
      return { x: united.x, y: united.y, width: united.width, height: united.height };
    } catch {
      return null;
    }
  }

  /** Vector (SVG) export for a File > Export scope. */
  exportScopeSVG(scope: ExportScope): { box: ExportFrameBox; svg: string } | null {
    const box = this.scopeExportBox(scope);
    if (!box) return null;
    const svg = this.exportBoxSVG(box);
    return svg ? { box, svg } : null;
  }

  /** PNG export for a File > Export scope at 96dpi. Needs DOM. */
  exportScopePNG(scope: ExportScope): Promise<{ box: ExportFrameBox; blob: Blob } | null> {
    const box = this.scopeExportBox(scope);
    if (!box) return Promise.resolve(null);
    const svg = this.exportBoxSVG(box);
    if (!svg) return Promise.resolve(null);
    return rasterizeSvg(svg, exportPngSize(box, 1), { mime: 'image/png', background: null })
      .then((blob) => (blob ? { box, blob } : null));
  }

  /** JPEG export for a File > Export scope. Quality is 1..100;
   * background defaults to opaque white because JPEG has no alpha. */
  exportScopeJPG(
    scope: ExportScope,
    opts: { quality: number; scale: number; background: string | null },
  ): Promise<{ box: ExportFrameBox; blob: Blob } | null> {
    const box = this.scopeExportBox(scope);
    if (!box) return Promise.resolve(null);
    const svg = this.exportBoxSVG(box);
    if (!svg) return Promise.resolve(null);
    const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
    const quality = Number.isFinite(opts.quality)
      ? Math.min(100, Math.max(1, opts.quality)) / 100
      : 0.92;
    return rasterizeSvg(svg, exportPngSize(box, scale), {
      mime: 'image/jpeg',
      quality,
      background: opts.background ?? '#ffffff',
    }).then((blob) => (blob ? { box, blob } : null));
  }

  // --- Export frames (Rect Keys > In-Canvas Elements > EXPORT FRAME) ---
  // Frames are selectable Paper rectangles on the artwork layer, so native
  // save, undo, and marquee-select keep working with no format change. They
  // are never artwork: whole-scene export hides them, and frame export
  // crops via the SVG viewBox without clipping the live elements.
  exportFrameItems(): AnyItem[] {
    const layer = this.layers.activeLayer;
    return layer ? exportFrameItems([...layer.children]) : [];
  }

  /** Deposit a frame with undo + selection. Used by Rect-Key drawing, the
   * panel, and tests. Returns null for degenerate rects. */
  depositExportFrame(rect: ExportFrameBox, opts?: { name?: string }): AnyItem | null {
    if (this.isLiveDrawing) return null;
    const before = this.contentItems();
    const selectedBefore = [...this.selectedItems];
    const placed = this.placeExportFrameItem(rect, opts);
    if (!placed) return null;
    this.addItemToSelection(placed);
    this.recordSceneCommand('Deposit export frame', before, selectedBefore, [placed]);
    this.updateTextContent(); this.notify();
    return placed;
  }

  /** Build, tag, and mount a frame item without history. The Rect-Key tool
   * finish path uses this; the outer deposit commit owns undo. */
  placeExportFrameItem(rect: ExportFrameBox, opts?: { name?: string }): AnyItem | null {
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)
      || !(rect.width > 0) || !(rect.height > 0)) return null;
    const layer = this.layers.activeLayer;
    if (!layer) return null;
    let record: ExportFrameRecord;
    try {
      record = createExportFrame(rect, { name: opts?.name });
    } catch {
      return null;
    }
    const item = new this.scope.Path.Rectangle({
      point: new this.scope.Point(rect.x, rect.y),
      size: new this.scope.Size(rect.width, rect.height),
    });
    try {
      item.strokeColor = new this.scope.Color(0.42, 0.42, 0.45);
      item.fillColor = null;
      item.strokeWidth = 1;
      item.dashArray = [6, 4];
      item.name = record.name;
      item.data[EXPORT_FRAME_KEY] = true;
      item.data[EXPORT_FRAME_RECORD] = record;
    } catch {
      try { item.remove(); } catch { /* Detached already. */ }
      return null;
    }
    try {
      layer.addChild(item);
    } catch {
      try { item.remove(); } catch { /* Detached already. */ }
      return null;
    }
    return item;
  }

  private exportFrameItemById(id: string): AnyItem | null {
    for (const item of this.exportFrameItems()) {
      try {
        if (item.data?.[EXPORT_FRAME_RECORD]?.id === id) return item;
      } catch { /* Detached already. */ }
    }
    return null;
  }

  private liveFrameRecord(item: AnyItem): ExportFrameRecord | null {
    const record = readExportFrame(item);
    if (!record) return null;
    // Geometry truth is the live item so dragged/resized frames stay exact.
    try {
      const b = item.bounds;
      if (b && b.width > 0 && b.height > 0) {
        record.rect = { x: b.x, y: b.y, width: b.width, height: b.height };
      }
    } catch { /* Detached already. */ }
    return record;
  }

  listExportFrames(): ExportFrameRecord[] {
    const out: ExportFrameRecord[] = [];
    for (const item of this.exportFrameItems()) {
      const record = this.liveFrameRecord(item);
      if (record) out.push(record);
    }
    return out;
  }

  getExportFrame(id: string): ExportFrameRecord | null {
    const item = this.exportFrameItemById(id);
    return item ? this.liveFrameRecord(item) : null;
  }

  /** The frame whose GUI is mounted: exactly one selected frame. */
  selectedExportFrame(): ExportFrameRecord | null {
    const selected = this.selectedItems.filter(isExportFrameItem);
    if (selected.length !== 1) return null;
    return this.liveFrameRecord(selected[0]);
  }

  updateExportFrame(id: string, patch: Partial<Pick<ExportFrameRecord, 'name' | 'format' | 'scale' | 'background'>>): boolean {
    const item = this.exportFrameItemById(id);
    if (!item) return false;
    const current = this.liveFrameRecord(item);
    if (!current) return false;
    const next: ExportFrameRecord = { ...current, ...patch, id: current.id, rect: current.rect, boxes: current.boxes };
    if (typeof next.name !== 'string' || next.name.trim().length === 0) return false;
    try {
      validateExportFrame(next);
    } catch {
      return false;
    }
    try {
      item.data[EXPORT_FRAME_RECORD] = next;
      if (patch.name !== undefined) item.name = next.name;
    } catch {
      return false;
    }
    this.documentManager.markEdited('scene');
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Configure N export boxes inside the frame (1 = full frame). */
  setExportFrameBoxCount(id: string, count: number): boolean {
    const item = this.exportFrameItemById(id);
    if (!item) return false;
    const current = this.liveFrameRecord(item);
    if (!current) return false;
    let boxes: ExportFrameBox[];
    try {
      boxes = count === 1 ? [] : splitFrameBoxes(count);
    } catch {
      return false;
    }
    const next: ExportFrameRecord = { ...current, boxes };
    try {
      validateExportFrame(next);
    } catch {
      return false;
    }
    try {
      item.data[EXPORT_FRAME_RECORD] = next;
    } catch {
      return false;
    }
    this.documentManager.markEdited('scene');
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Set frame dimensions in document points, anchored at the center.
   * Undoable through the same bounds entry as handle resizing. */
  setExportFrameSize(id: string, width: number, height: number): boolean {
    const item = this.exportFrameItemById(id);
    if (!item || this.isLiveDrawing) return false;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
    let before: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const b = item.bounds;
      if (b && b.width > 0 && b.height > 0) before = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch { /* Detached already. */ }
    if (!before) return false;
    const after = {
      x: before.x + (before.width - width) / 2,
      y: before.y + (before.height - height) / 2,
      width,
      height,
    };
    try {
      item.bounds = new this.scope.Rectangle(
        new this.scope.Point(after.x, after.y),
        new this.scope.Size(after.width, after.height),
      );
    } catch {
      return false;
    }
    this.history.recordBounds('Resize export frame', item, before, after);
    this.documentManager.markEdited('scene');
    this.updateTextContent(); this.notify();
    return true;
  }

  deleteExportFrame(id: string): boolean {
    const item = this.exportFrameItemById(id);
    if (!item || this.isLiveDrawing) return false;
    const before = this.contentItems();
    const selBefore = [...this.selectedItems];
    this.removeItemFromSelection(item);
    try { item.remove(); } catch { /* Detached already. */ }
    this.history.recordDelete(before, selBefore);
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Handle id under the document point for the selected frame, if any.
   * Used by the pointer controller; null while drawing or unselected. */
  frameHandleAt(point: { x: number; y: number }): ExportFrameHandleId | null {
    if (this.isLiveDrawing) return null;
    try {
      const frame = this.singleSelectedFrameItem();
      if (!frame) return null;
      this.frameHandles.refresh(frame);
      const zoom = this.scope.view?.zoom;
      const tolerance = 6 / (Number.isFinite(zoom) && (zoom as number) > 0 ? (zoom as number) : 1);
      return this.frameHandles.handleAt(point, tolerance);
    } catch {
      return null;
    }
  }

  isFrameResizing(): boolean {
    return this.frameResize !== null;
  }

  /** Begin a handle-resize gesture on the selected frame. */
  beginFrameResize(handle: ExportFrameHandleId): void {
    if (this.isLiveDrawing || this.frameResize || this.transformDrag) return;
    const frame = this.singleSelectedFrameItem();
    if (!frame) return;
    let before: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const b = frame.bounds;
      if (b && b.width > 0 && b.height > 0) before = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch { /* Detached already. */ }
    if (!before) return;
    this.frameResize = { item: frame, handle, before };
  }

  /** Live step of a handle-resize gesture: rescale the frame so the
   * dragged handle follows the document point. */
  resizeFrameTo(point: { x: number; y: number }): void {
    const gesture = this.frameResize;
    if (!gesture || this.isLiveDrawing) return;
    if (!this.scene.isInScene(gesture.item)) return;
    const next = resizedBounds(gesture.handle, gesture.before, point);
    try {
      gesture.item.bounds = new this.scope.Rectangle(
        new this.scope.Point(next.x, next.y),
        new this.scope.Size(next.width, next.height),
      );
    } catch {
      return;
    }
    this.updateTextContent(); this.notify();
  }

  /** Commit a handle-resize gesture with undo. No-op when unchanged. */
  endFrameResize(): void {
    const gesture = this.frameResize;
    this.frameResize = null;
    if (!gesture || this.isLiveDrawing) return;
    if (!this.scene.isInScene(gesture.item)) return;
    let after: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const b = gesture.item.bounds;
      if (b && b.width > 0 && b.height > 0) after = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch { /* Detached already. */ }
    if (!after) return;
    const changed = after.x !== gesture.before.x || after.y !== gesture.before.y
      || after.width !== gesture.before.width || after.height !== gesture.before.height;
    if (changed) {
      this.history.recordBounds('Resize export frame', gesture.item, gesture.before, after);
      this.documentManager.markEdited('scene');
    }
    this.updateTextContent(); this.notify();
  }

  // --- Transform controls (Ctrl/Cmd+T on a selection) ---
  // A conventional bounding-box overlay with eight scale handles and one
  // rotate handle. T toggles the mode; S/R/H/V arm cursor-driven live
  // scale, rotation, and horizontal/vertical shear with a drag line from
  // the center to the cursor. Every commit records one undo entry.

  setTransformMode(on: boolean): void {
    if (on && (this.isLiveDrawing || this.topLevelSelected().length === 0)) return;
    if (on === this.isTransformMode) return;
    if (on) {
      this.isTransformMode = true;
    } else {
      this.commitTransformDrag();
      this.commitTransformLive();
      this.isTransformMode = false;
      this.transformHandles.clear();
      this.clearTransformLine();
    }
    this.updateTextContent(); this.notify();
  }

  toggleTransformMode(): void {
    this.setTransformMode(!this.isTransformMode);
  }

  private exitTransformModeIfIdle(): void {
    if (this.isTransformMode && this.topLevelSelected().length === 0) this.setTransformMode(false);
  }

  /** Collective bounds of the transformable selection, or null. */
  private transformSelectionBounds(): TransformBounds | null {
    try {
      const items = this.topLevelSelected().filter((item) => this.scene.isInScene(item));
      if (!items.length) return null;
      const b = this.selection.collectiveBounds(items);
      if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) ||
        !Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;
      if (b.width <= 0 || b.height <= 0) return null;
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
      return null;
    }
  }

  /** Rebuild the overlay for the current selection. Identity-checked, so
   * the per-notify cost is one bounds read while idle. */
  private refreshTransformHandles(): void {
    try {
      this.transformHandles.refresh(
        this.isTransformMode && !this.isLiveDrawing ? this.transformSelectionBounds() : null);
    } catch { /* Headless or mid-teardown. */ }
  }

  /** Handle id under the document point while transform mode is on. */
  transformHandleAt(point: { x: number; y: number }): TransformHandleId | null {
    if (!this.isTransformMode || this.isLiveDrawing || this.transformDrag || this.frameResize) return null;
    try {
      const bounds = this.transformSelectionBounds();
      if (!bounds) return null;
      this.transformHandles.refresh(bounds);
      const zoom = this.scope.view?.zoom;
      const tolerance = 6 / (Number.isFinite(zoom) && (zoom as number) > 0 ? (zoom as number) : 1);
      return this.transformHandles.handleAt(point, tolerance);
    } catch {
      return null;
    }
  }

  isTransformResizing(): boolean {
    return this.transformDrag !== null;
  }

  isTransformGestureActive(): boolean {
    return this.transformDrag !== null || this.transformLive !== null;
  }

  /** Begin a handle drag. Commits any armed live gesture first. */
  beginTransformDrag(handle: TransformHandleId): void {
    if (!this.isTransformMode || this.isLiveDrawing || this.transformDrag || this.frameResize) return;
    this.commitTransformLive();
    const items = this.topLevelSelected().filter((item) => this.scene.isInScene(item));
    const bounds = this.transformSelectionBounds();
    const start = xy(this.mousePt);
    if (!items.length || !bounds || !start) return;
    this.transformDrag = {
      handle,
      items,
      center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      width: bounds.width,
      height: bounds.height,
      startPt: start,
      netFx: 1,
      netFy: 1,
      netDegrees: 0,
    };
  }

  /** Live step of a handle drag. Shift constrains: uniform scale, or
   * rotation snapped to 15° intervals. */
  updateTransformDrag(point: { x: number; y: number }, shiftKey: boolean): void {
    const gesture = this.transformDrag;
    const target = xy(point);
    if (!gesture || !target) return;
    if (gesture.handle === 'rotate') {
      const startAngle = Math.atan2(
        gesture.startPt.y - gesture.center.y, gesture.startPt.x - gesture.center.x);
      let total = (Math.atan2(target.y - gesture.center.y, target.x - gesture.center.x) - startAngle) *
        180 / Math.PI;
      if (!Number.isFinite(total)) return;
      if (shiftKey) total = Math.round(total / 15) * 15;
      const delta = total - gesture.netDegrees;
      if (delta !== 0) {
        this.transforms.rotatePreview(delta);
        gesture.netDegrees = total;
        this.refreshTransformHandles();
      }
      return;
    }
    const axes = this.transformScaleAxes(gesture.handle);
    let fx = axes.x ? 1 + (2 * (target.x - gesture.startPt.x)) / gesture.width : 1;
    let fy = axes.y ? 1 + (2 * (target.y - gesture.startPt.y)) / gesture.height : 1;
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;
    if (shiftKey) {
      const uniform = Math.abs(fx - 1) >= Math.abs(fy - 1) ? fx : fy;
      fx = uniform; fy = uniform;
    }
    fx = Math.min(20, Math.max(0.05, fx));
    fy = Math.min(20, Math.max(0.05, fy));
    const dx = fx / gesture.netFx;
    const dy = fy / gesture.netFy;
    if (dx !== 1 || dy !== 1) {
      this.transforms.scaleXYPreview(dx, dy);
      gesture.netFx = fx;
      gesture.netFy = fy;
      this.refreshTransformHandles();
    }
  }

  private transformScaleAxes(handle: TransformHandleId): { x: boolean; y: boolean } {
    switch (handle as TransformScaleHandleId) {
      case 'nw': case 'ne': case 'se': case 'sw': return { x: true, y: true };
      case 'e': case 'w': return { x: true, y: false };
      case 'n': case 's': return { x: false, y: true };
      default: return { x: true, y: true };
    }
  }

  /** Commit a handle drag with undo. No-op when unchanged. */
  endTransformDrag(): void {
    this.commitTransformDrag();
    this.updateTextContent(); this.notify();
  }

  private commitTransformDrag(): void {
    const gesture = this.transformDrag;
    this.transformDrag = null;
    if (!gesture) return;
    const items = gesture.items.filter((item) => this.scene.isInScene(item));
    if (!items.length) return;
    if (gesture.handle === 'rotate') {
      if (Math.abs(gesture.netDegrees) > 1e-9) {
        this.history.recordRotate(items, gesture.netDegrees, this.scopePoint(gesture.center));
      }
      return;
    }
    if (Math.abs(gesture.netFx - 1) > 1e-9 || Math.abs(gesture.netFy - 1) > 1e-9) {
      this.history.recordScaleXY(items, gesture.netFx, gesture.netFy, this.scopePoint(gesture.center));
    }
  }

  /** S/R/H/V key-click: commit the armed gesture, or arm a new one. The
   * same key twice commits; switching keys commits then re-arms. */
  transformLiveKey(kind: 'scale' | 'rotate' | 'shearH' | 'shearV'): void {
    if (!this.isTransformMode || this.isLiveDrawing) return;
    if (this.transformDrag) this.commitTransformDrag();
    if (this.transformLive) {
      const armed = this.transformLive.kind;
      this.commitTransformLive();
      if (armed === kind) { this.updateTextContent(); this.notify(); return; }
    }
    const items = this.topLevelSelected().filter((item) => this.scene.isInScene(item));
    const bounds = this.transformSelectionBounds();
    const start = xy(this.mousePt);
    if (!items.length || !bounds || !start) return;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const dx = start.x - center.x;
    const dy = start.y - center.y;
    this.transformLive = {
      kind,
      items,
      center,
      width: bounds.width,
      height: bounds.height,
      startPt: start,
      startDist: Math.hypot(dx, dy),
      startAngle: Math.atan2(dy, dx),
      netFx: 1,
      netFy: 1,
      netDegrees: 0,
      netK: 0,
    };
    this.updateTransformLine(center, start);
    this.updateTextContent(); this.notify();
  }

  /** Steer the armed live gesture from the cursor. Returns true while a
   * live gesture is armed. Called on pointer move. */
  updateTransformLive(): boolean {
    const gesture = this.transformLive;
    if (!gesture) return false;
    const cursor = xy(this.mousePt);
    if (!cursor) return true;
    const live = gesture.items.filter((item) => this.scene.isInScene(item));
    if (!live.length) { this.cancelTransformLive(); return false; }
    if (gesture.kind === 'scale') {
      if (gesture.startDist < 1e-9) return true;
      const dist = Math.hypot(cursor.x - gesture.center.x, cursor.y - gesture.center.y);
      if (!Number.isFinite(dist)) return true;
      const total = Math.min(20, Math.max(0.05, dist / gesture.startDist));
      const delta = total / gesture.netFx;
      if (delta !== 1) {
        this.transforms.scaleXYPreview(delta, delta);
        gesture.netFx = total;
        gesture.netFy = total;
        this.refreshTransformHandles();
      }
    } else if (gesture.kind === 'rotate') {
      const angle = Math.atan2(cursor.y - gesture.center.y, cursor.x - gesture.center.x);
      const total = (angle - gesture.startAngle) * 180 / Math.PI;
      if (!Number.isFinite(total)) return true;
      const delta = total - gesture.netDegrees;
      if (delta !== 0) {
        this.transforms.rotatePreview(delta);
        gesture.netDegrees = total;
        this.refreshTransformHandles();
      }
    } else {
      const horizontal = gesture.kind === 'shearH';
      const span = horizontal ? gesture.height : gesture.width;
      if (!(span > 0)) return true;
      const total = ((horizontal ? cursor.x : cursor.y) - (horizontal ? gesture.startPt.x : gesture.startPt.y)) / span;
      if (!Number.isFinite(total)) return true;
      const delta = total - gesture.netK;
      if (delta !== 0) {
        this.transforms.shearPreview(horizontal, delta);
        gesture.netK = total;
        this.refreshTransformHandles();
      }
    }
    this.updateTransformLine(gesture.center, cursor);
    return true;
  }

  /** Commit the armed live gesture with undo. No-op when unchanged. */
  commitTransformLive(): void {
    const gesture = this.transformLive;
    this.transformLive = null;
    this.clearTransformLine();
    if (!gesture) return;
    const items = gesture.items.filter((item) => this.scene.isInScene(item));
    if (!items.length) return;
    const center = this.scopePoint(gesture.center);
    if (gesture.kind === 'scale') {
      if (Math.abs(gesture.netFx - 1) > 1e-9) this.history.recordScaleXY(items, gesture.netFx, gesture.netFx, center);
    } else if (gesture.kind === 'rotate') {
      if (Math.abs(gesture.netDegrees) > 1e-9) this.history.recordRotate(items, gesture.netDegrees, center);
    } else if (Math.abs(gesture.netK) > 1e-9) {
      this.history.recordShear(items, gesture.kind === 'shearH', gesture.netK, center);
    }
  }

  /** Cancel the armed live gesture, restoring the pre-gesture geometry. */
  cancelTransformLive(): void {
    const gesture = this.transformLive;
    this.transformLive = null;
    this.clearTransformLine();
    if (!gesture) return;
    if (gesture.kind === 'scale') {
      if (gesture.netFx !== 1) this.transforms.scaleXYPreview(1 / gesture.netFx, 1 / gesture.netFx);
    } else if (gesture.kind === 'rotate') {
      if (gesture.netDegrees !== 0) this.transforms.rotatePreview(-gesture.netDegrees);
    } else if (gesture.netK !== 0) {
      this.transforms.shearPreview(gesture.kind === 'shearH', -gesture.netK);
    }
    this.refreshTransformHandles();
  }

  /** Esc handling for transform mode: cancel the live gesture first,
   * then exit the mode. Returns true when Esc is consumed. */
  transformEscape(): boolean {
    if (this.transformLive) {
      this.cancelTransformLive();
      this.updateTextContent(); this.notify();
      return true;
    }
    if (this.isTransformMode) {
      this.setTransformMode(false);
      return true;
    }
    return false;
  }

  private updateTransformLine(from: { x: number; y: number }, to: { x: number; y: number }): void {
    try {
      const line = this.transformLine;
      if (line && Array.isArray(line.segments) && line.segments.length === 2) {
        line.segments[0].point = new this.scope.Point(from.x, from.y);
        line.segments[1].point = new this.scope.Point(to.x, to.y);
        return;
      }
    } catch { /* Recreate below. */ }
    this.clearTransformLine();
    try {
      const line = new this.scope.Path.Line(
        new this.scope.Point(from.x, from.y), new this.scope.Point(to.x, to.y));
      line.strokeColor = new this.scope.Color('#4dabf7');
      line.strokeWidth = 1;
      line.dashArray = [4, 3];
      line.guide = true;
      line.locked = true;
      if (!line.data) line.data = {};
      line.data.isTransformLine = true;
      this.mountGuideItem(line);
      this.transformLine = line;
    } catch { /* Headless or detached. */ }
  }

  private clearTransformLine(): void {
    if (!this.transformLine) return;
    try { this.transformLine.remove(); } catch { /* Already gone. */ }
    this.transformLine = null;
  }

  private scopePoint(point: { x: number; y: number }): AnyItem {
    return new this.scope.Point(point.x, point.y);
  }

  /** Absolute export boxes for a frame (full frame when unconfigured).
   * Pure geometry: the unit tests cover this while the DOM-bound SVG
   * serializer (like exportSceneSVG) is verified in the browser. */
  exportFrameBoxes(id: string): ExportFrameBox[] | null {
    const item = this.exportFrameItemById(id);
    const record = item ? this.liveFrameRecord(item) : null;
    if (!item || !record) return null;
    try {
      return resolveExportBoxes(record);
    } catch {
      return null;
    }
  }

  /** Export one SVG per configured box, cropped to the box via the SVG
   * viewBox. Live artwork is never clipped or modified. Needs DOM (Paper
   * serializes through document.createElementNS), like exportSceneSVG. */
  exportFrameSVG(id: string): { box: ExportFrameBox; svg: string }[] | null {
    const boxes = this.exportFrameBoxes(id);
    if (!boxes) return null;
    const out: { box: ExportFrameBox; svg: string }[] = [];
    for (const box of boxes) {
      const svg = this.exportBoxSVG(box);
      if (!svg) return null;
      out.push({ box: { ...box }, svg });
    }
    return out;
  }

  /** Export one PNG per configured box, rasterized from the frame SVG at
   * 96dpi times the frame scale. Needs DOM (Image + canvas); null when
   * rasterization is unavailable. The SVG path stays the vector source. */
  async exportFramePNG(id: string): Promise<{ box: ExportFrameBox; blob: Blob }[] | null> {
    const record = this.getExportFrame(id);
    const outputs = this.exportFrameSVG(id);
    if (!record || !outputs) return null;
    const out: { box: ExportFrameBox; blob: Blob }[] = [];
    for (const entry of outputs) {
      const blob = await rasterizeSvgToPng(entry.svg, exportPngSize(entry.box, record.scale), record.background);
      if (!blob) return null;
      out.push({ box: { ...entry.box }, blob });
    }
    return out;
  }

  /** Artwork contained in or intersecting the frame. Shown in the frame GUI. */
  exportFrameArtworkCount(id: string): number {
    const item = this.exportFrameItemById(id);
    const record = item ? this.liveFrameRecord(item) : null;
    if (!item || !record) return 0;
    const layer = this.layers.activeLayer;
    if (!layer) return 0;
    try {
      return frameArtwork(record, [...layer.children]).length;
    } catch {
      return 0;
    }
  }

  /** Deposit an SVG document into the scene without replacing artwork. */
  importSceneSVG(svg: string, label = 'Import SVG'): boolean {
    if (this.isLiveDrawing) return false;
    const selectedBefore = [...this.selectedItems];
    const placed = this.ingestSvg(svg);
    if (!placed) return false;
    try { placed.data.isUserGroup = true; } catch { /* Grouping just won't apply. */ }
    this.addItemToSelection(placed);
    this.history.recordDrop(label, placed, selectedBefore);
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Replace all artwork with a gallery payload (JSON or legacy SVG).
   * A scene JSON view is restored after the items land, so the artwork
   * clamp sees the document that was saved. */
  replaceScene(label: string, blob: string, opts?: { history?: boolean }): boolean {
    if (this.isLiveDrawing) return false;
    if (isSceneJson(blob)) {
      const view = readSceneView(blob);
      const ok = this.replaceWithItems(label, () => (
        decodeSceneItems(this.scope.project, blob)
      ), opts);
      if (ok) this.restoreSceneView(view);
      return ok;
    }
    if (isSvgMarkup(blob)) {
      return this.replaceWithItems(label, () => {
        const imported = this.ingestSvg(blob);
        return imported ? [imported] : [];
      }, opts);
    }
    return false;
  }

  /** Replace all artwork with an SVG document (gallery Open). One undo entry. */
  replaceSceneWithSVG(label: string, svg: string, opts?: { history?: boolean }): boolean {
    return this.replaceScene(label, svg, opts);
  }

  private ingestSvg(svg: string): AnyItem | null {
    let placed: AnyItem | null = null;
    try {
      this.scope.project.importSVG(svg, (imported: AnyItem) => {
        if (!imported) return;
        stripSvgClips(imported);
        clearTransient(imported);
        placed = imported;
      });
    } catch {
      return null;
    }
    return placed;
  }

  private replaceWithItems(
    label: string,
    load: () => AnyItem[],
    opts?: { history?: boolean },
  ): boolean {
    const recordHistory = opts?.history !== false;
    const before = this.contentItems();
    const selectedBefore = [...this.selectedItems];
    const retainedBefore = new Map(this.retainedPaths);
    this.clearOutSelection();
    for (const item of before) {
      try { item.remove(); } catch { /* Detached already. */ }
    }
    let placed: AnyItem[] = [];
    try {
      placed = load().filter(Boolean);
    } catch {
      return false;
    }
    this.scene.pruneRecords();
    if (recordHistory) {
      this.recordSceneCommand(label, before, selectedBefore, placed, retainedBefore);
    }
    this.updateTextContent(); this.notify();
    return true;
  }

  private notify(): void {
    // Persist-on-notify: every user-facing setter ends here, so settings
    // reach storage with no per-setter hook. saveSettings writes only when
    // the snapshot changed and no-ops while settings load.
    this.refreshFrameHandles();
    this.refreshTransformHandles();
    this.saveSettings();
    this.context.notify();
  }

  /** The selected export frame item when exactly one frame is selected. */
  private singleSelectedFrameItem(): AnyItem | null {
    const selected = this.selectedItems.filter(isExportFrameItem);
    return selected.length === 1 ? selected[0] : null;
  }

  /** Rebuild resize handles for the current selection. Identity-checked,
   * so the per-notify cost is one selection filter while idle. */
  private refreshFrameHandles(): void {
    try {
      this.frameHandles.refresh(this.isLiveDrawing ? null : this.singleSelectedFrameItem());
    } catch { /* Headless or mid-teardown. */ }
  }

  private readonly settingsStore: SettingsStorage;
  private loadingSettings = false;
  private lastSettingsJson: string | null = null;

  private saveSettings(): void {
    if (this.loadingSettings) return;
    this.lastSettingsJson = saveEngineSettings(this, this.settingsStore, this.lastSettingsJson);
  }

  private loadSettings(): void {
    this.loadingSettings = true;
    try {
      loadEngineSettings(this, this.settingsStore);
    } finally {
      this.loadingSettings = false;
    }
    this.updateTextContent();
    this.notify();
  }

  // --- Lifecycle: canvas setup + event wiring (NibGliderApp init) ---
  attach(canvas: HTMLCanvasElement): void {
    const scope = this.scope;
    const bound = (scope.view as { element?: HTMLCanvasElement } | null)?.element;
    // setup() replaces the project. StrictMode remounts this effect, so a
    // second setup would drop restored artwork and leave stale pixels until
    // the next mouse event redraws the empty view.
    if (bound !== canvas) {
      scope.setup(canvas);
    }
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
      onGestureStart: (event) => this.onGestureStart(event),
      onGestureChange: (event) => this.onGestureChange(event),
      onGestureEnd: () => this.onGestureEnd(),
      onDocumentMouseUp: () => this.pointer.releasePointer(),
      onBeforePrint: this.onBeforePrint,
      onAfterPrint: this.onAfterPrint,
    });

    // Preload parsed-font measurement bytes without blocking setup;
    // layout falls back to canvas/estimate until they land.
    void this.textMetrics.preload().then(() => {
      if (this.isDrawingShape) this.updateShapePreview();
    });

    // setup() replaces the project, so the page sheet is repainted on
    // every attach (StrictMode remounts included). The page rebinds to
    // the new project's content layer first.
    this.ensurePageLayer();
    this.drawPage();
    this.applyPendingSceneView();
    this.updatePreviewBox();
    this.updateTextContent();
  }

  private capturedSceneView(): SceneView | null {
    try {
      const view = this.scope.view;
      const center = view?.center;
      if (!view || !center) return null;
      return { centerX: center.x, centerY: center.y, zoom: view.zoom || 1 };
    } catch {
      return null;
    }
  }

  private restoreSceneView(view: SceneView | null): void {
    if (!view) return;
    this.pendingSceneView = view;
    this.applyPendingSceneView();
  }

  private applyPendingSceneView(): void {
    const pending = this.pendingSceneView;
    if (!pending || !this.scope.view) return;
    this.pendingSceneView = null;
    this.restoringView = true;
    try {
      this.viewport.restore(pending.centerX, pending.centerY, pending.zoom);
    } catch {
      // Headless: no view to move.
    } finally {
      this.restoringView = false;
    }
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

  setStrokePosition(position: StrokePosition): void {
    this.styles.setStrokePosition(position);
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

  // --- Grid repeat settings ---
  // Row/column counts clamp to 1..12; enabling with 1x1 still deposits the
  // single drawn object (no copies), so the toggle alone never surprises.
  setRepeatEnabled(v: boolean): void {
    this.isRepeatEnabled = v;
    if (!v) this.repeatManager.clearPreview();
    else this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatRows(v: number): void {
    const next = clampRepeatCount(v, this.repeatRows);
    if (next === this.repeatRows) return;
    this.repeatRows = next;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatCols(v: number): void {
    const next = clampRepeatCount(v, this.repeatCols);
    if (next === this.repeatCols) return;
    this.repeatCols = next;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatAnchor(v: RepeatAnchor): void {
    if (!isRepeatAnchor(v) || v === this.repeatAnchor) return;
    this.repeatAnchor = v;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatDirection(v: RepeatDirection): void {
    if (!isRepeatDirection(v) || v === this.repeatDirection) return;
    this.repeatDirection = v;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatRectKeys(v: boolean): void {
    this.repeatRectKeys = v;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatCircleKeys(v: boolean): void {
    this.repeatCircleKeys = v;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatPaths(v: boolean): void {
    this.repeatPaths = v;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  /** Rebuild repeat preview clones for the live draw; safe to call anytime. */
  refreshRepeatPreview(): void {
    this.repeatManager.refreshPreview();
  }

  private registerRepeatLiveKeys(): void {
    const repeat = (id: string, code: string, keycap: string, label: string, apply: () => void): void => {
      this.registerLiveKeyBinding({
        id,
        actionId: 'repeat',
        keys: [keycap],
        label,
        match: (event) => event.code === code,
        applies: () => this.repeatManager.applies(),
        apply: () => {
          apply();
          this.updateTextContent();
          this.notify();
        },
      });
    };
    repeat('repeat-rows-down', 'Digit1', '1', 'repeat rows', () => this.repeatManager.adjustRows(-1));
    repeat('repeat-rows-up', 'Digit2', '2', 'repeat rows', () => this.repeatManager.adjustRows(1));
    repeat('repeat-cols-down', 'Digit3', '3', 'repeat columns', () => this.repeatManager.adjustCols(-1));
    repeat('repeat-cols-up', 'Digit4', '4', 'repeat columns', () => this.repeatManager.adjustCols(1));
  }

  /** Grid spacing in points. New documents default it from their unit
   * (quarter-inch for inch/foot); this manual override persists after. */
  setGridSpacing(v: number): void {
    if (!Number.isFinite(v) || v <= 0) return;
    const next = Math.min(500, v);
    if (next === this.gridSpacing) return;
    this.gridSpacing = next;
    if (this.isGridEnabled) this.drawGrid();
    if (this.pageSideTicks) this.drawPage();
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
    try {
      this.coordinates.fromPoints(1, u);
    } catch {
      return;
    }
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

  // Quad-frame mapping for quad-fitted shapes. Bilinear is robust for every
  // frame; projective is perspective-correct on convex, well-conditioned
  // frames and falls back per shape (raw quad) otherwise. Wired to the
  // Settings window switch when that lands; safe to call before then.
  quadMapping: QuadMapping = 'bilinear';

  setQuadMapping(m: QuadMapping): void {
    if (m !== 'bilinear' && m !== 'projective') return;
    this.quadMapping = m;
    this.updateTextContent();
    this.notify();
  }

  // Quad-fitted circle override for the Projection settings section: fitted
  // circles use the projective mapper even when the global mapping above is
  // bilinear. Other shapes always follow the global mapping.
  perspectiveCircle = false;

  setPerspectiveCircle(on: boolean): void {
    this.perspectiveCircle = on === true;
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
    this.applyToEditableText((_lines, root) => this.setEditableContent(root, v));
  }

  setTextLine2(v: string): void {
    this.setText({ line2: v });
  }

  setTextFontFamily(v: string): void {
    if (!v) return;
    this.setText({ fontFamily: v });
    this.applyToEditableText((lines) => {
      for (const line of lines) line.fontFamily = v;
    });
  }

  setTextFontSize(v: number): void {
    if (!Number.isFinite(v)) return;
    const size = Math.max(4, Math.min(400, v));
    this.setText({ fontSize: size });
    this.applyToEditableText((lines) => {
      for (const line of lines) {
        const current = line.fontSize;
        const factor = Number.isFinite(current) && current > 0 && Number.isFinite(line.leading)
          ? line.leading / current
          : this.globalText.leading;
        line.fontSize = size;
        line.leading = factor * size;
      }
    }, true);
  }

  setTextFontWeight(v: string): void {
    if (!v) return;
    this.setText({ fontWeight: v });
    this.applyToEditableText((lines) => {
      for (const line of lines) line.fontWeight = v;
    });
  }

  setTextItalic(v: boolean): void {
    const on = !!v;
    this.setText({ italic: on });
    this.applyToEditableText((lines) => {
      for (const line of lines) this.setLineItalic(line, on);
    });
  }

  setTextJustification(v: TextJustification): void {
    if (v !== 'left' && v !== 'center' && v !== 'right') return;
    this.setText({ justification: v });
    this.applyToEditableText((lines) => {
      for (const line of lines) line.justification = v;
    });
  }

  setTextLeading(v: number): void {
    if (!Number.isFinite(v)) return;
    const factor = Math.max(0.8, Math.min(3, v));
    this.setText({ leading: factor });
    this.applyToEditableText((lines) => {
      for (const line of lines) {
        const size = line.fontSize;
        line.leading = (Number.isFinite(size) && size > 0 ? size : this.globalText.fontSize) * factor;
      }
    }, true);
  }

  // --- Editable text selection sync (Text panel) ---
  // Selecting a pasted EditableText object loads its live properties into
  // the Text flyout (selectionText), and the text setters above apply to
  // the object as well as the global defaults — mirroring how stroke and
  // fill setters treat selected paths. Shape-attached text (isShapeText
  // without editableText) stays creation-driven and is untouched. Like the
  // stroke/fill path, object edits mark the document edited but record no
  // history entry.

  /** Top-level selected items that are standalone editable text. */
  editableTextRoots(): AnyItem[] {
    return this.topLevelSelected().filter((item) => !!item?.data?.editableText);
  }

  /** The PointText lines backing an editable root. */
  private editableLines(root: AnyItem): AnyItem[] {
    if (!root) return [];
    try {
      if (root.className === 'PointText') return [root];
      if (Array.isArray(root.children)) {
        return root.children.filter((child: AnyItem) => child && child.className === 'PointText');
      }
    } catch { /* Detached mid-read. */ }
    return [];
  }

  selectedEditableKind(): 'display' | 'body' | null {
    const roots = this.editableTextRoots();
    if (roots.length === 0) return null;
    return roots[0]?.data?.textKind === 'body' ? 'body' : 'display';
  }

  /** Panel spec for the Text flyout: the first selected editable text's
   * live properties, or null when no editable text is selected (the panel
   * then shows the global defaults). */
  selectionText(): TextSpec | null {
    const roots = this.editableTextRoots();
    if (roots.length === 0) return null;
    const base = this.globalText;
    const contents: string[] = [];
    for (const root of roots) {
      for (const line of this.editableLines(root)) {
        try { contents.push(String(line.content ?? '')); } catch { /* Skip unreadable lines. */ }
      }
    }
    const first = this.editableLines(roots[0])[0];
    const size = first && Number.isFinite(first.fontSize) && first.fontSize > 0
      ? first.fontSize as number
      : base.fontSize;
    const factor = first && Number.isFinite(first.leading) && size > 0
      ? (first.leading as number) / size
      : null;
    let fontFamily = base.fontFamily;
    try {
      if (first && typeof first.fontFamily === 'string' && first.fontFamily) fontFamily = first.fontFamily;
    } catch { /* Keep the default. */ }
    let fontWeight = base.fontWeight;
    try {
      if (first && typeof first.fontWeight === 'string' && first.fontWeight) fontWeight = first.fontWeight;
    } catch { /* Keep the default. */ }
    let italic = base.italic;
    try {
      if (first) italic = first.data?.italic === true;
    } catch { /* Keep the default. */ }
    const justification = first?.justification;
    return {
      content: contents.join('\n'),
      line2: base.line2,
      fontFamily,
      fontSize: size,
      fontWeight,
      italic,
      justification: justification === 'left' || justification === 'right' || justification === 'center'
        ? justification
        : base.justification,
      leading: factor !== null ? Math.max(0.8, Math.min(3, factor)) : base.leading,
    };
  }

  /** Run a mutation over every selected editable root's lines, keeping each
   * root pinned by its anchor (baseline lower-left for display, ascender
   * top-left for body). The restack flag re-flows multiline roots afterwards
   * (needed after size/leading changes). Returns true when a root was updated. */
  private applyToEditableText(
    apply: (lines: AnyItem[], root: AnyItem) => void,
    restack = false,
  ): boolean {
    const roots = this.editableTextRoots();
    if (roots.length === 0) return false;
    let touched = false;
    for (const root of roots) {
      const lines = this.editableLines(root);
      if (lines.length === 0) continue;
      const body = root.data?.textKind === 'body';
      const anchor = this.textAnchorOf(root, body);
      try {
        apply(lines, root);
        touched = true;
      } catch { /* One bad root must not sink the others. */ }
      if (restack) this.restackBodyLines(root);
      const current = this.textAnchorOf(root, body);
      if (anchor && current) this.anchorTextPointOn(root, anchor, current);
    }
    if (touched) this.documentManager.markEdited('scene');
    return touched;
  }

  /** The print anchor of an editable root in global coordinates: the left
   * edge of the text box at the baseline (display) or at the first line's
   * ascender height (body, 0.75 leading above its baseline, matching Paper's
   * text bounds convention). Null when unreadable. */
  private textAnchorOf(root: AnyItem, body: boolean): AnyItem | null {
    try {
      const lines = this.editableLines(root);
      const first = root.className === 'PointText' ? root : lines[0];
      if (!first) return null;
      const origin = first.localToGlobal(new this.scope.Point(0, 0));
      const step = Number(first.leading);
      const bounds = root.bounds;
      if (!origin || !bounds || !Number.isFinite(bounds.left)) return null;
      const y = body ? origin.y - 0.75 * step : origin.y;
      if (body && !(step > 0)) return null;
      return new this.scope.Point(bounds.left, y);
    } catch {
      return null;
    }
  }

  /** Translate an item so one of its global points lands on the target. */
  private anchorTextPointOn(item: AnyItem, target: AnyItem, point: AnyItem): void {
    try {
      item.translate(target.subtract(point));
    } catch {
      // Anchoring never fails a paste or an edit.
    }
  }

  /** Re-flow a multiline root's lines from the first line's position and
   * leading. Single-line roots are untouched. */
  private restackBodyLines(root: AnyItem): void {
    if (!root || root.className === 'PointText') return;
    const lines = this.editableLines(root);
    if (lines.length < 2) return;
    let origin: AnyItem = null;
    let step = 0;
    try {
      origin = lines[0].position && lines[0].position.clone ? lines[0].position.clone() : null;
      step = Number(lines[0].leading);
    } catch { return; }
    if (!origin || !(step > 0)) return;
    lines.forEach((line, i) => {
      if (i === 0) return;
      try {
        line.position = new this.scope.Point(origin.x, origin.y + i * step);
      } catch { /* Keep the line where it is. */ }
    });
  }

  private copyTextStyle(from: AnyItem, to: AnyItem, kind: 'display' | 'body'): void {
    to.fontFamily = from.fontFamily;
    to.fontSize = from.fontSize;
    to.fontWeight = from.fontWeight;
    try { to.fillColor = from.fillColor; } catch { /* Keep the default paint. */ }
    to.strokeColor = null;
    to.justification = from.justification;
    to.leading = from.leading;
    to.data.textKind = kind;
    to.data.editableText = true;
    to.data.italicShear = false;
    let italic = false;
    try { italic = from.data?.italic === true; } catch { /* Not italic. */ }
    this.setLineItalic(to, italic);
  }

  /** Paper has no native fontStyle and the global italic flag is
   * render-inert, so editable text synthesizes italics with a tracked shear
   * (tan 12°), keeping toggling idempotent. Re-pinning by the caller absorbs
   * the translation component. */
  private setLineItalic(line: AnyItem, on: boolean): void {
    let applied = false;
    try { applied = line.data?.italicShear === true; } catch { /* Assume unslanted. */ }
    if (on && !applied) {
      try { line.shear(-0.2126, 0); line.data.italicShear = true; } catch { /* Leave unslanted. */ }
    } else if (!on && applied) {
      try { line.shear(0.2126, 0); line.data.italicShear = false; } catch { /* Keep the slant. */ }
    }
    try { line.data.italic = on; } catch { /* Flag is best-effort. */ }
  }

  /** Replace a root's text: display roots take the whole string, body roots
   * rebuild their lines (adding/removing children to match) and re-flow. */
  private setEditableContent(root: AnyItem, text: string): void {
    const lines = this.editableLines(root);
    if (lines.length === 0) return;
    if (root.className === 'PointText') {
      lines[0].content = text;
      return;
    }
    const wanted = splitBodyLines(text);
    const template = lines[0];
    let anchor: AnyItem = null;
    let step = 0;
    try {
      anchor = template.position && template.position.clone ? template.position.clone() : null;
      step = Number(template.leading);
    } catch { /* Fall through with no anchor. */ }
    if (!anchor || !(step > 0)) {
      try {
        anchor = new this.scope.Point(root.bounds?.center?.x ?? 0, root.bounds?.center?.y ?? 0);
        step = Math.max(4, this.globalText.fontSize) * 1.2;
      } catch { anchor = null; }
    }
    let current = this.editableLines(root);
    while (current.length > wanted.length) {
      try { current[current.length - 1].remove(); } catch { break; }
      const next = this.editableLines(root);
      if (next.length === current.length) break;
      current = next;
    }
    while (current.length < wanted.length) {
      const pt: AnyItem = new this.scope.PointText(new this.scope.Point(0, 0));
      this.copyTextStyle(template, pt, 'body');
      try { root.addChild(pt); } catch { break; }
      const next = this.editableLines(root);
      if (next.length === current.length) break;
      current = next;
    }
    const final = this.editableLines(root);
    final.forEach((pt, i) => {
      pt.content = wanted[i] ?? ' ';
      if (anchor) {
        try {
          pt.position = new this.scope.Point(
            (anchor as AnyItem).x,
            (anchor as AnyItem).y + i * step,
          );
        } catch { /* Keep the line where it is. */ }
      }
    });
  }

  // --- Type At Cursor (P key) ---
  // P with no selection drafts a single line at the cursor: the keyboard
  // types, the preview follows the cursor with its baseline lower-left at
  // the hot point, Alt+W stamps a copy, and Return places it. P with an
  // editable text selection retypes that object instead. P with only
  // non-text selected is a no-op (see typeTextNonTextSelection).

  /** Live typed line, for the status overlay and tests. */
  typedText(): string { return this.typedTextBuffer; }

  startTypeText(): void {
    if (this.isTypingText || this.isLiveDrawing) return;
    const roots = this.editableTextRoots();
    if (this.selectedItems.length === 0) {
      this.typedTextSnap = this.captureDeposit();
      this.typedTextBuffer = '';
      this.typedTextMode = 'new';
      this.isTypingText = true;
      this.refreshTypingPreview();
      this.updateTextContent(); this.notify();
      return;
    }
    if (roots.length > 0) {
      const root = roots[0];
      this.typedTextSnap = this.captureDeposit();
      this.typedTextEditRoot = root;
      this.typedTextOriginal = this.editableLines(root).map((line) => String(line.content ?? ''));
      this.typedTextBuffer = this.typedTextOriginal.join(' ');
      this.typedTextAnchor = this.textAnchorOf(root, root.data?.textKind === 'body');
      this.typedTextMode = 'edit';
      this.isTypingText = true;
      this.applyTypedBufferToEditRoot();
      this.updateTextContent(); this.notify();
      return;
    }
    this.typeTextNonTextSelection();
  }

  /** P over a non-text selection: reserved for a future feature. */
  private typeTextNonTextSelection(): void {
    // No-op for now. A later change will hang the non-text typing feature
    // here (e.g. text-on-path or label flow) without touching startTypeText.
  }

  /** Append a character or apply backspace to the live typed line. */
  editTypedText(input: string): void {
    if (!this.isTypingText) return;
    if (input === 'backspace') {
      this.typedTextBuffer = this.typedTextBuffer.slice(0, -1);
    } else if (input.length === 1 && this.typedTextBuffer.length < 500) {
      this.typedTextBuffer += input;
    } else {
      return;
    }
    if (this.typedTextMode === 'edit') this.applyTypedBufferToEditRoot();
    else this.refreshTypingPreview();
    this.updateTextContent(); this.notify();
  }

  /** Follow the cursor with the draft preview (new-line mode only). */
  updateTypingPreview(): void {
    if (!this.isTypingText || this.typedTextMode !== 'new') return;
    this.anchorTypingPreview();
  }

  /** Return places the typed line; an empty line ends the session silently. */
  finalizeTypedText(): void {
    if (!this.isTypingText) return;
    if (!this.typedTextBuffer.trim()) {
      this.cancelTypingText();
      return;
    }
    if (this.typedTextMode === 'edit') {
      const root = this.typedTextEditRoot;
      const prev = [...this.typedTextOriginal];
      const next = this.typedTextBuffer;
      const anchor = this.typedTextAnchor;
      const body = root?.data?.textKind === 'body';
      this.endTypingSession();
      try {
        this.context.history.push({
          label: 'Edit text',
          undo: () => this.setTypedEditContent(root, prev.join('\n'), body, anchor),
          redo: () => this.setTypedEditContent(root, next, body, anchor),
        });
      } catch { /* The edit itself already landed. */ }
      this.documentManager.markEdited('scene');
      this.updateTextContent(); this.notify();
      return;
    }
    const snap = this.typedTextSnap ?? this.captureDeposit();
    const placed = this.depositTypedLine();
    this.endTypingSession();
    if (!placed) {
      this.updateTextContent(); this.notify();
      return;
    }
    this.selection.restore([placed]);
    this.recordSceneCommand('Type text', snap.before, snap.selected, [placed], snap.retained);
    this.updateTextContent(); this.notify();
  }

  /** Alt+W deposits a copy of the typed line and keeps typing. */
  stampTypedText(): void {
    if (!this.isTypingText || !this.typedTextBuffer.trim()) return;
    const snap = this.captureDeposit();
    const placed = this.depositTypedLine();
    if (!placed) return;
    this.recordSceneCommand('Stamp text', snap.before, snap.selected, [placed], snap.retained);
    this.updateTextContent(); this.notify();
  }

  /** Escape abandons the draft (edit mode restores the original text). */
  cancelTypingText(): void {
    if (!this.isTypingText) return;
    if (this.typedTextMode === 'edit' && this.typedTextEditRoot) {
      const root = this.typedTextEditRoot;
      this.setTypedEditContent(
        root,
        this.typedTextOriginal.join('\n'),
        root.data?.textKind === 'body',
        this.typedTextAnchor,
      );
    }
    this.endTypingSession();
    this.updateTextContent(); this.notify();
  }

  private endTypingSession(): void {
    if (this.typedTextPreview) {
      try { this.typedTextPreview.remove(); } catch { /* Detached already. */ }
    }
    this.isTypingText = false;
    this.typedTextMode = null;
    this.typedTextBuffer = '';
    this.typedTextPreview = null;
    this.typedTextEditRoot = null;
    this.typedTextOriginal = [];
    this.typedTextAnchor = null;
    this.typedTextSnap = null;
  }

  /** Draft target: the cursor, else the view center. */
  private typingTarget(): AnyItem {
    if (this.mousePt) {
      try { return this.mousePt.clone(); } catch { /* Fall through. */ }
    }
    try {
      const view = this.scope.view;
      if (view && view.center) return view.center.clone();
    } catch { /* Fall through. */ }
    return new this.scope.Point(0, 0);
  }

  private styleTypedTextItem(pt: AnyItem): void {
    const spec = this.globalText;
    const cfg = this.textLayoutConfig();
    const size = Math.max(4, spec.fontSize);
    pt.fontFamily = spec.fontFamily;
    pt.fontSize = size;
    pt.fontWeight = spec.fontWeight;
    pt.fillColor = cfg.fillEnabled ? cfg.fillColor : cfg.strokeColor;
    pt.strokeColor = null;
    pt.justification = spec.justification;
    pt.leading = Math.max(0.8, spec.leading || 1.2) * size;
    pt.data.textKind = 'display';
    pt.data.editableText = true;
    this.setLineItalic(pt, spec.italic);
  }

  /** Rebuild (or move) the draft preview from the buffer at the cursor. */
  private refreshTypingPreview(): void {
    const target = this.typingTarget();
    let preview = this.typedTextPreview;
    if (!preview) {
      preview = new this.scope.PointText(target);
      this.styleTypedTextItem(preview);
      preview.opacity = 0.7;
      preview.data.typingPreview = true;
      this.mountGuideItem(preview);
      this.typedTextPreview = preview;
    }
    preview.content = this.typedTextBuffer.length > 0 ? this.typedTextBuffer : ' ';
    this.anchorTypingPreview();
  }

  /** Pin the preview's baseline lower-left corner to the cursor hot point. */
  private anchorTypingPreview(): void {
    const preview = this.typedTextPreview;
    const at = this.mousePt;
    if (!preview || !at) return;
    try {
      const corner = preview.bounds?.bottomLeft;
      if (!corner) return;
      preview.translate(at.subtract(corner));
    } catch { /* Keep the preview where it is. */ }
  }

  /** Deposit the typed line as a real editable text item at the cursor. */
  private depositTypedLine(): AnyItem | null {
    const buffer = this.typedTextBuffer;
    if (!buffer.trim()) return null;
    const target = this.typingTarget();
    let placed: AnyItem = null;
    try {
      placed = new this.scope.PointText(target);
      placed.content = buffer;
      this.styleTypedTextItem(placed);
      placed.opacity = 1;
      const corner = placed.bounds?.bottomLeft;
      if (corner) this.anchorTextPointOn(placed, target, corner);
    } catch {
      return null;
    }
    if (!placed) return null;
    try {
      this.layers.addToActive(placed);
    } catch {
      return null;
    }
    return placed;
  }

  /** Live-apply the buffer to the edited root, keeping its anchor pinned. */
  private applyTypedBufferToEditRoot(): void {
    const root = this.typedTextEditRoot;
    if (!root) return;
    this.setTypedEditContent(
      root,
      this.typedTextBuffer,
      root.data?.textKind === 'body',
      this.typedTextAnchor,
    );
  }

  private setTypedEditContent(root: AnyItem, text: string, body: boolean, anchor: AnyItem): void {
    if (!root) return;
    try {
      this.setEditableContent(root, text.length > 0 ? text : ' ');
    } catch { /* Keep the existing text. */ }
    try {
      const current = this.textAnchorOf(root, !!body);
      if (anchor && current) this.anchorTextPointOn(root, anchor, current);
    } catch { /* Keep the root where it is. */ }
    this.documentManager.markEdited('scene');
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

  setTextPasteLocation(mode: TextPasteLocation): void {
    if (mode !== 'crosshair' && mode !== 'view-center') return;
    this.textPasteLocation = mode;
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
    if (mode === 'interlace') {
      this.interlace.interlaceSelection(this.interlaceGap);
      return;
    }
    if (mode !== 'union' && mode !== 'subtract' && mode !== 'intersect' && mode !== 'crop') return;
    this.combinatorics.combineSelection(mode);
  }

  setCombineMode(m: CombineMode | 'none'): void {
    if (m !== 'none' && m !== 'union' && m !== 'subtract' && m !== 'intersect' && m !== 'crop'
      && m !== 'interlace') return;
    if (m !== 'none') this.combineTool = m;
    this.combineMode = m;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setCombineTool(m: CombineMode): void {
    if (m !== 'union' && m !== 'subtract' && m !== 'intersect' && m !== 'crop' && m !== 'interlace') return;
    if (this.combineTool === m) return;
    this.combineTool = m;
    this.notify();
  }

  setInterlaceGap(v: number): void {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return;
    const next = Math.min(80, Math.round(v * 10) / 10);
    if (next === this.interlaceGap) return;
    this.interlaceGap = next;
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
    if (this.combineMode === 'interlace') {
      return this.interlace.depositWithInterlace(deposited, this.interlaceGap);
    }
    return this.combinatorics.depositWithCombine(deposited);
  }

  // --- Interlace (over/under weave of intersecting stroked paths) ---
  // Operand order is selection order: the first-selected path goes over at
  // the first crossing along its spine. Re-running a baked weave flips the
  // phase; selecting baked bands plus new strokes weaves the newcomers in
  // without flipping. Results lower to Bézier like other boolean results,
  // while memos keep each member's authoring source for later runs.
  canInterlaceSelection(): boolean {
    return this.interlace.canInterlaceSelection();
  }

  interlaceSelection(): void {
    this.interlace.interlaceSelection();
  }

  canInterlaceGroupSelection(): boolean {
    return this.interlace.canGroupSelection();
  }

  interlaceGroupSelection(): void {
    this.interlace.groupSelection();
  }

  convertSelectionToGroup(): void {
    this.interlace.convertSelectionToGroup();
  }

  setInterlaceParams(patch: { phase?: 0 | 1; padding?: number; overrides?: Record<string, string> }): void {
    this.interlace.setInterlaceParams(patch);
  }

  /** True when the selection holds at least one baked interlace band. */
  canRemoveFromInterlace(): boolean {
    return this.interlace.canRemoveFromInterlace();
  }

  /** Remove the selected baked bands' members from their weaves. */
  removeFromInterlace(): void {
    this.interlace.removeFromInterlace();
  }

  /** Flip one crossing's over side in the selected weave (group or baked). */
  flipInterlaceCrossing(key: string): void {
    const selected = this.selectedItems;
    if (selected.length === 1 && selected[0]?.data?.interlaceGroup) {
      this.interlace.flipGroupCrossing(key);
    } else {
      this.interlace.flipBakedCrossing(key);
    }
  }

  // Popover state for the selected weave: live group params plus the
  // crossing list with winners as member indices, or the same shape for a
  // selected baked weave (no padding control there). Null when neither is
  // selected.
  selectedInterlaceWeave(): {
    kind: 'group' | 'baked';
    phase: 0 | 1;
    padding?: number;
    members: number;
    crossings: Array<{ key: string; number: number; over: number; x: number; y: number }>;
  } | null {
    const groupDesc = this.interlace.describeGroupSelection();
    if (groupDesc) {
      const params = this.selectedInterlaceGroup();
      if (!params) return null;
      return { kind: 'group', phase: params.phase, padding: params.padding,
        members: groupDesc.members.length,
        crossings: groupDesc.crossings.map((cross) => ({
          key: cross.key, number: cross.number,
          over: Math.max(0, groupDesc.members.indexOf(cross.overId)), x: cross.x, y: cross.y,
        })) };
    }
    const bakedDesc = this.interlace.describeBakedSelection();
    if (!bakedDesc) return null;
    return { kind: 'baked', phase: bakedDesc.phase, members: bakedDesc.members.length,
      crossings: bakedDesc.crossings.map((cross) => ({
        key: cross.key, number: cross.number,
        over: Math.max(0, bakedDesc.members.indexOf(cross.overId)), x: cross.x, y: cross.y,
      })) };
  }

  // The selected interlace group's live params for in-canvas controls,
  // or null unless exactly one interlace group is selected.
  selectedInterlaceGroup(): { phase: 0 | 1; padding: number; firstId: string; members: number } | null {
    const selected = this.selectedItems.filter((item) => item?.data?.interlaceGroup);
    if (selected.length !== 1) return null;
    const stored = selected[0]?.data?.interlaceGroup;
    const params = stored?.params;
    if (!params || (params.phase !== 0 && params.phase !== 1)) return null;
    if (!(params.padding >= 0) || !Number.isFinite(params.padding)) return null;
    const members = Array.isArray(stored.members) ? stored.members.length : 0;
    return { phase: params.phase, padding: params.padding, firstId: params.firstId, members };
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
    // Page corner marks and the grid both paint with sendToBack, so
    // restack the grid above the page chrome after every draw.
    // moveAbove (unlike sendToBack) never migrates activation.
    try {
      const chrome = this.pageLayer;
      const grid = this.gridLayer;
      const project = this.scope.project;
      if (chrome && grid && chrome !== grid && chrome.project === project && grid.project === project) {
        grid.moveAbove(chrome);
      }
    } catch {
      // Keep previous stacking.
    }
  }

  clearGrid(): void {
    this.gridRenderer.clear();
    this.gridCursor = this.gridRenderer.gridCursor;
  }

  private ensurePageChromeLayer(): AnyItem | null {
    try {
      const scope = this.scope;
      const project = scope.project;
      if (!project) return null;
      // Capture before creating: new Layer() activates itself, and
      // sendToBack() on the active layer hands activation elsewhere.
      const active = this.layers.activeOrNull;
      let layer = this.pageLayer;
      if (!layer || layer.project !== project) {
        layer = new scope.Layer();
        layer.name = 'pageLayer';
        this.pageLayer = layer;
        this.pageOutline = null;
      }
      layer.guide = true;
      layer.locked = true;
      layer.sendToBack();
      if (active && active !== layer && active.project === project) active.activate();
      return layer;
    } catch {
      return null;
    }
  }

  /** Zoom the side ticks were built at, so a zoom rebuilds their length. */
  private pageChromeZoom = 1;

  /** Repaint the page chrome (when page dimensions are set). Guide-layer
   * only: never content, never exported, hidden with the other guides
   * on print. Corners always; fill and side ticks follow Document Settings. */
  drawPage(): void {
    const layer = this.ensurePageChromeLayer();
    if (!layer) return;
    try {
      const scope = this.scope;
      layer.removeChildren();
      this.pageOutline = null;
      const page = this.pageRect();
      if (page) {
        const stroke = new scope.Color(0.48, 0.54, 0.62, 1);
        const zoom = scope.view.zoom || 1;
        const width = 1 / zoom;
        this.pageChromeZoom = zoom;
        const marks: AnyItem = new scope.Group({ insert: false });
        const addStroke = (item: AnyItem, role: string): void => {
          item.fillColor = null;
          item.strokeColor = stroke;
          item.strokeWidth = width;
          item.strokeCap = 'butt';
          item.strokeJoin = 'miter';
          item.guide = true;
          item.locked = true;
          if (!item.data) item.data = {};
          item.data.pageRole = role;
          marks.addChild(item);
        };
        if (this.pageFill) {
          const sheet: AnyItem = new scope.Path.Rectangle({
            point: new scope.Point(page.x, page.y),
            size: new scope.Size(page.width, page.height),
            insert: false,
          });
          sheet.fillColor = new scope.Color(0.16, 0.19, 0.24, 1);
          sheet.strokeColor = null;
          sheet.guide = true;
          sheet.locked = true;
          if (!sheet.data) sheet.data = {};
          sheet.data.pageRole = 'fill';
          marks.addChild(sheet);
        }
        for (const pts of pageCornerBrackets(page)) {
          const bracket: AnyItem = new scope.Path({ insert: false });
          for (const pt of pts) bracket.add(new scope.Point(pt.x, pt.y));
          bracket.closed = false;
          addStroke(bracket, 'bracket');
        }
        if (this.pageSideTicks) {
          const unit = this.drawingPage?.unit ?? 'pt';
          const spacing = this.gridSpacing;
          const major = 10 / zoom;
          const minor = 6 / zoom;
          const along = (size: number, phase: number) => computeRulerTicks(size, spacing, unit, phase);
          for (const tick of pageEdgeTicks(page, along(page.width, page.x), along(page.height, page.y), major, minor)) {
            const mark: AnyItem = new scope.Path({ insert: false });
            for (const pt of tick.points) mark.add(new scope.Point(pt.x, pt.y));
            mark.closed = false;
            addStroke(mark, 'tick');
          }
        }
        marks.guide = true;
        marks.locked = true;
        if (!marks.data) marks.data = {};
        marks.data.isPage = true;
        layer.addChild(marks);
        this.pageOutline = marks;
      }
      layer.sendToBack();
      scope.view?.update();
    } catch {
      // Headless: no view to paint.
    }
  }

  /** Keep the 1px page strokes constant on screen across zoom. Side
   * ticks also keep a screen-sized length, so a zoom rebuilds them. */
  private syncPageStroke(): void {
    try {
      const zoom = this.scope.view?.zoom || 1;
      if (this.pageSideTicks && zoom !== this.pageChromeZoom) {
        this.drawPage();
        return;
      }
      const outline = this.pageOutline;
      if (!outline) return;
      const width = 1 / zoom;
      const children = outline.children;
      if (children && children.length) {
        for (const child of children) {
          if (child.strokeColor) child.strokeWidth = width;
        }
      } else if (outline.strokeColor) outline.strokeWidth = width;
    } catch {
      // Headless.
    }
  }

  // --- View state (scrollbars) ---
  getViewState(): ViewState | null {
    try {
      const view = this.scope.view;
      if (!view || !view.center || !view.bounds) return null;
      const bounds = view.bounds;
      if (!(bounds.width > 0) || !(bounds.height > 0)) return null;
      return {
        centerX: view.center.x,
        centerY: view.center.y,
        zoom: view.zoom || 1,
        viewWidth: bounds.width,
        viewHeight: bounds.height,
        page: this.pageRect(),
        artwork: this.artworkRect(),
      };
    } catch {
      return null;
    }
  }

  /** Union bounds of the artwork in project coordinates; null when the
   * canvas holds no artwork. Separate from contentItems so Pan-clamp
   * callers keep their own contract. */
  private artworkRect(): DrawingPageRect | null {
    try {
      const items = this.contentItems();
      if (items.length === 0) return null;
      const bounds = this.collectiveBounds(items);
      if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) return null;
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    } catch {
      return null;
    }
  }

  /** Absolute pan by project coordinates (scrollbar drags). Honors the
   * same artwork clamp as every other pan path. */
  scrollViewTo(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    try {
      this.viewport.setCenter(new this.scope.Point(x, y));
    } catch {
      // Headless: no view to move.
    }
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


  // Screen-space endpoint tolerance in project units.
  private endpointTolerance(): number {
    return this.endpointSnapTolerance / (this.scope.view.zoom || 1);
  }

  private drawingIgnoredItems(): Set<AnyItem> {
    return new Set([
      this.path,
      this.typedTextPreview,
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
      ...this.repeatManager.previewClones(),
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
    this.setTransformMode(false);
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
    this.setTransformMode(false);
  }

  /** Drag-move entry for the pointer host. With grid snapping on and
   * editable text in the selection, the delta is re-resolved so baselines
   * land on grid lines first, box edges second. Nudges and other exact
   * moves call the transform layer directly and stay exact. */
  moveSelectionBy(delta: AnyItem, snapText = false): void {
    let advance = delta;
    if (snapText && this.isGridSnappingEnabled && delta) {
      const spacing = this.gridSpacing;
      const roots = this.editableTextRoots();
      if (spacing > 0 && roots.length > 0) {
        try {
          const baselines: number[] = [];
          for (const root of roots) {
            for (const guide of editableBaselines(this.scope, root)) {
              if (Number.isFinite(guide.point?.y)) baselines.push(guide.point.y);
            }
          }
          const bounds = this.selection.collectiveBounds(this.topLevelSelected());
          const resolved = resolveTextMoveDelta({
            baselines,
            top: bounds?.top,
            bottom: bounds?.bottom,
            left: bounds?.left,
            right: bounds?.right,
          }, delta.x, delta.y, spacing);
          advance = new this.scope.Point(resolved.dx, resolved.dy);
        } catch { advance = delta; }
      }
    }
    this.transforms.moveSelectionBy(advance);
  }

  setIsInDragLock(status: boolean): void {
    if (status && !this.isInDragLock) this.beginMoveGesture();
    if (!status && this.isInDragLock) this.commitMoveGesture();
    this.isInDragLock = status;
    this.updateCanvasCursor(false, this.mousePt);
    this.updateTextContent();
    this.notify();
  }

  /** Pan-Lock (X): the canvas point under the cursor stays glued to it
   * until any key is pressed, like a button-free drag-pan. Pan changes
   * view state only, never document state. */
  setPanLocked(on: boolean): void {
    if (on === this.isPanLocked) return;
    if (on) {
      if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad || !this.mousePt) return;
      this.lastMousePt = null;
      this.viewport.beginPan(this.mousePt.clone());
    } else {
      this.viewport.endPan();
    }
    this.isPanLocked = on;
    this.updateCanvasCursor(false, this.mousePt);
    this.updateTextContent();
    this.notify();
  }

  /** Last CSS cursor value applied to the canvas element. */
  lastCursorCss = '';

  /** Resolve the canvas cursor from live pan/drag/snap/hover state and apply
   * it to the view element. Snap flags come from the indicator visibility the
   * pointer pass just set; returns the applied CSS value. */
  updateCanvasCursor(dragging = false, point: AnyItem = null): string {
    const context: CanvasCursorContext = idleCursorContext();
    context.panning = this.viewport.isPanning;
    context.panLocked = this.isPanLocked;
    context.dragging = dragging || this.isInDragLock;
    context.drawing = this.isLiveDrawing;
    context.snapPoint = !!this.pointSnapCursor?.visible;
    context.snapPath = !!this.pathSnapCursor?.visible && !context.snapPoint;
    context.snapGrid = !!this.gridCursor?.visible;
    context.hoverContent = !context.panning && !context.panLocked && !context.dragging &&
      !context.drawing && !!point && this.isContentHit(point);
    const resolved = resolveCanvasCursor(context);
    this.setCanvasCursor(resolved.css);
    this.lastCursorCss = resolved.css;
    return resolved.css;
  }

  private isContentHit(point: AnyItem): boolean {
    try {
      if (!point || !this.scope.project) return false;
      return !!this.scope.project.hitTest(point, {
        segments: true,
        stroke: true,
        fill: true,
        tolerance: 5,
        match: (hit: AnyItem) => !this.isNonContentItem(hit),
      });
    } catch {
      return false;
    }
  }

  private setCanvasCursor(cursor: string): void {
    const el = this.scope.view?.element as HTMLElement | null;
    if (el) el.style.cursor = cursor;
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
    this.exitTransformModeIfIdle();
    this.updateTextContent(); this.notify();
  }

  redo(): void {
    if (this.isLiveDrawing) return;
    this.history.redo();
    this.exitTransformModeIfIdle();
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

  // --- Clipboard (Edit menu cut/copy/paste + select-all) ---
  // The internal scene buffer is the source of truth: it works headless,
  // over plain HTTP, and when the system clipboard denies access. Copies
  // also mirror outward (native scene type + plain-text degradation) and
  // pastes read the system clipboard first, so cross-app exchange works
  // where the browser allows it. Every mutation records one history entry.
  private clipboardScene = '';
  private pasteCascade = 0;

  canSelectAll(): boolean {
    return !this.isLiveDrawing && !this.isTypingText && this.contentItems().length > 0;
  }

  selectAll(): boolean {
    if (this.isLiveDrawing || this.isTypingText) return false;
    const items = this.contentItems();
    if (items.length === 0) return false;
    this.commitMoveGesture();
    this.selection.restore(items);
    this.updateTextContent(); this.notify();
    return true;
  }

  canCopySelection(): boolean {
    return !this.isLiveDrawing && this.topLevelSelected().length > 0;
  }

  /** Internal scene buffer, filled by copy/cut. Null when empty. */
  clipboardSceneJson(): string | null {
    return this.clipboardScene ? this.clipboardScene : null;
  }

  /** Plain-text degradation of the selection for other apps: joined text
   * item contents, empty when no text is selected. */
  selectedTextContent(): string {
    const parts: string[] = [];
    const collect = (item: AnyItem): void => {
      if (!item) return;
      try {
        if (item.className === 'PointText' && typeof item.content === 'string') {
          parts.push(item.content);
          return;
        }
      } catch { return; }
      const children = item.children;
      if (Array.isArray(children)) for (const child of children) collect(child);
    };
    for (const item of this.topLevelSelected()) collect(item);
    return parts.join('\n');
  }

  copySelection(): boolean {
    if (!this.canCopySelection()) return false;
    try {
      this.clipboardScene = encodeSceneItems(this.topLevelSelected());
    } catch {
      return false;
    }
    void writeSystemClipboard({ scene: this.clipboardScene, text: this.selectedTextContent() });
    return true;
  }

  cutSelection(): boolean {
    if (!this.canCopySelection()) return false;
    this.commitMoveGesture();
    let buffer: string;
    try {
      buffer = encodeSceneItems(this.topLevelSelected());
    } catch {
      return false;
    }
    const outward = this.selectedTextContent();
    const before = this.contentItems();
    const selBefore = [...this.selectedItems];
    this.selection.removeAll();
    this.clipboardScene = buffer;
    this.recordSceneCommand(
      selBefore.length > 1 ? `Cut ${selBefore.length} items` : 'Cut',
      before, selBefore, [],
    );
    void writeSystemClipboard({ scene: buffer, text: outward });
    this.setIsInDragLock(false);
    this.setTransformMode(false);
    return true;
  }

  /** Route one pasted or dropped string through the shared classifier:
   * scene JSON, SVG markup, or rich/plain text. */
  pasteTextPayload(text: string, at?: AnyItem): boolean {
    if (this.isLiveDrawing || typeof text !== 'string') return false;
    switch (classifyClipboardText(text)) {
      case 'scene': return this.pasteSceneJson(text, at);
      case 'svg': return this.pasteSvgText(text, at);
      case 'rtf':
      case 'html':
      case 'text': {
        const plain = richTextToPlainText(text);
        if (!plain.trim()) return false;
        return this.pastePlainText(plain, at);
      }
      default: return false;
    }
  }

  pasteSceneJson(json: string, at?: AnyItem): boolean {
    if (this.isLiveDrawing || !isSceneJson(json)) return false;
    const before = this.contentItems();
    const selectedBefore = [...this.selectedItems];
    let placed: AnyItem[];
    try {
      placed = decodeSceneItems(this.scope.project, json).filter(Boolean);
    } catch {
      return false;
    }
    if (placed.length === 0) return false;
    this.centerPlacedOn(placed, this.pasteTarget(at));
    this.selection.restore(placed);
    this.recordSceneCommand(
      placed.length > 1 ? `Paste ${placed.length} items` : 'Paste',
      before, selectedBefore, placed,
    );
    this.updateTextContent(); this.notify();
    return true;
  }

  pasteSvgText(svg: string, at?: AnyItem): boolean {
    if (this.isLiveDrawing || !isSvgMarkup(svg)) return false;
    const before = this.contentItems();
    const selectedBefore = [...this.selectedItems];
    const placed = this.ingestSvg(svg);
    if (!placed) return false;
    try { placed.data.isUserGroup = true; } catch { /* Grouping just won't apply. */ }
    this.centerPlacedOn([placed], this.pasteTarget(at));
    this.fitPlacedToView(placed);
    this.selection.restore([placed]);
    this.recordSceneCommand('Paste', before, selectedBefore, [placed]);
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Plain text becomes a standalone editable text item: single-line pastes
   * are Display Text pinned by their lower-left box corner, multiline
   * pastes are Body Text pinned by their ascender top-left corner. */
  pastePlainText(text: string, at?: AnyItem): boolean {
    if (this.isLiveDrawing || this.isTypingText || typeof text !== 'string') return false;
    const clean = text.replace(/\r\n?/g, '\n');
    if (!clean.trim()) return false;
    const before = this.contentItems();
    const selectedBefore = [...this.selectedItems];
    const target = this.pasteTarget(at, true);
    const spec = this.globalText;
    const cfg = this.textLayoutConfig();
    const size = Math.max(4, spec.fontSize);
    const leading = Math.max(0.8, spec.leading || 1.2) * size;
    const styleText = (pt: AnyItem, kind: 'display' | 'body'): void => {
      pt.fontFamily = spec.fontFamily;
      pt.fontSize = size;
      pt.fontWeight = spec.fontWeight;
      pt.fillColor = cfg.fillEnabled ? cfg.fillColor : cfg.strokeColor;
      pt.strokeColor = null;
      pt.justification = spec.justification;
      pt.leading = leading;
      pt.data.textKind = kind;
      pt.data.editableText = true;
    };
    let placed: AnyItem;
    let label: string;
    if (!isMultilineText(clean)) {
      const pt: AnyItem = new this.scope.PointText(target);
      pt.content = clean.trim();
      styleText(pt, 'display');
      try {
        const corner = pt.bounds?.bottomLeft;
        if (corner) this.anchorTextPointOn(pt, target, corner);
      } catch { /* Keep the created position. */ }
      placed = pt;
      label = 'Paste display text';
    } else {
      const group: AnyItem = new this.scope.Group();
      for (const [index, line] of splitBodyLines(clean).entries()) {
        const pt: AnyItem = new this.scope.PointText(
          new this.scope.Point(target.x, target.y + index * leading),
        );
        pt.content = line.length > 0 ? line : ' ';
        styleText(pt, 'body');
        group.addChild(pt);
      }
      group.data.textKind = 'body';
      group.data.editableText = true;
      const anchor = this.textAnchorOf(group, true);
      if (anchor) this.anchorTextPointOn(group, target, anchor);
      placed = group;
      label = 'Paste body text';
    }
    if (!placed.parent) {
      try { this.layers.addToActive(placed); } catch { return false; }
    }
    this.selection.restore([placed]);
    this.recordSceneCommand(label, before, selectedBefore, [placed]);
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Data-URL raster paste. The image decodes asynchronously; the history
   * entry records on load, mirroring DropController. */
  pasteImageDataUrl(dataUrl: string, at?: AnyItem): boolean {
    if (this.isLiveDrawing || this.isTypingText || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false;
    const target = this.pasteTarget(at);
    const selectedBefore = [...this.selectedItems];
    let raster: AnyItem = null;
    try {
      raster = new this.scope.Raster(dataUrl);
    } catch {
      return false;
    }
    if (!raster) return false;
    try {
      raster.onLoad = () => {
        try { raster.position = target.clone(); } catch { /* Keep the decoded position. */ }
        this.fitPlacedToView(raster);
        this.selection.restore([raster]);
        this.history.recordDrop('Paste image', raster, selectedBefore);
        this.updateTextContent(); this.notify();
      };
    } catch {
      return false;
    }
    return true;
  }

  /** Full paste path for the Edit menu and the pasteshortcut: system
   * clipboard first, internal buffer when it is unavailable or empty. */
  async pasteFromSystemClipboard(): Promise<boolean> {
    if (this.isLiveDrawing || this.isTypingText) return false;
    try {
      const clip = await readSystemClipboard();
      if (clip.imageBlob) {
        const dataUrl = await blobToDataUrl(clip.imageBlob);
        if (dataUrl && this.pasteImageDataUrl(dataUrl)) return true;
      }
      if (clip.scene && this.pasteSceneJson(clip.scene)) return true;
      // HTML carries its own structure; plain text may still hold scene
      // JSON, SVG, or markdown, so both route through the classifier.
      if (clip.html && this.pasteTextPayload(clip.html)) return true;
      if (clip.text && this.pasteTextPayload(clip.text)) return true;
    } catch {
      // Fall through to the internal buffer below.
    }
    const internal = this.clipboardSceneJson();
    return internal ? this.pasteSceneJson(internal) : false;
  }

  /** Drop of an image URL (from text/uri-list): fetch, decode, deposit at
   * the drop point. Failures surface as a drop note, never a throw. */
  async depositImageUrl(url: string, at?: AnyItem): Promise<boolean> {
    if (this.isLiveDrawing || this.isTypingText || typeof url !== 'string') return false;
    const first = url.split(/[\r\n]+/).map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));
    if (!first || !/^https?:\/\//i.test(first)) return false;
    const target = this.pasteTarget(at);
    try {
      const response = await fetch(first);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!/^image\//.test(blob.type)) throw new Error('not an image');
      const dataUrl = await blobToDataUrl(blob);
      if (!dataUrl) throw new Error('unreadable');
      return this.pasteImageDataUrl(dataUrl, target);
    } catch {
      this.lastDropNote = 'Drop skipped: could not load that image URL.';
      this.updateTextContent(); this.notify();
      return false;
    }
  }

  /** Paste/drop target in project coordinates: explicit point, cursor, or
   * view center. Repeated pastes cascade so they never stack exactly. Text
   * pastes honor the "Text pastes at Location" setting: view-center skips
   * the cursor and always uses the view center. */
  private pasteTarget(explicit?: AnyItem, forText = false): AnyItem {
    this.pasteCascade += 1;
    const step = 16 * (this.pasteCascade % 8);
    let base: AnyItem = null;
    if (explicit) {
      try { base = explicit.clone(); } catch { base = explicit; }
    }
    const useCursor = !forText || this.textPasteLocation === 'crosshair';
    if (!base && useCursor && this.mousePt) {
      try { base = this.mousePt.clone(); } catch { base = null; }
    }
    if (!base) {
      try {
        const view = this.scope.view;
        base = view && view.center ? view.center.clone() : null;
      } catch { base = null; }
    }
    if (!base) base = new this.scope.Point(0, 0);
    try {
      return base.add(new this.scope.Point(step, step));
    } catch {
      return base;
    }
  }

  /** Translate placed items as a block so their collective center lands on
   * the already-resolved target, preserving relative layout. */
  private centerPlacedOn(placed: AnyItem[], target: AnyItem): void {
    try {
      const bounds = this.selection.collectiveBounds(placed);
      if (!bounds || !bounds.center) return;
      const delta = target.subtract(bounds.center);
      for (const item of placed) {
        try {
          item.translate(delta);
          // Decoded items keep their stored origins; carry them to placement.
          shiftCircleOrigins(item, delta.x, delta.y);
        } catch { /* Keep this item where it is. */ }
      }
    } catch {
      // Placement never fails a paste: items stay where they decoded.
    }
  }

  /** Scale down only, matching DropController's 75%-of-view fit. */
  private fitPlacedToView(item: AnyItem): void {
    try {
      const bounds = item.bounds;
      const vb = this.scope.view.bounds;
      if (!bounds || !vb) return;
      const scale = viewFitScale(bounds, vb);
      if (scale < 1) {
        item.scale(scale, bounds.center);
        remapCircleOrigins(item, scaleAboutMapper(bounds.center, scale));
      }
    } catch { /* A paste must never throw. */ }
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

  /** Live union size of the top-level selection in document points, for the
   * Scale dialog readout. Null when nothing is selected. */
  selectionSize(): { width: number; height: number } | null {
    const items = this.topLevelSelected();
    if (items.length === 0) return null;
    try {
      const b = this.selection.collectiveBounds(items);
      if (!b || !Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;
      return { width: Math.max(0, b.width), height: Math.max(0, b.height) };
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
    if (this.isLiveDrawing) return;
    // Interlace groups shed their derived displays first so the generic
    // ungroup only ever releases the live members.
    for (const item of this.selectedItems) {
      if (item?.data?.interlaceGroup) this.interlace.stripDisplays(item);
    }
    if (!this.selection.ungroup()) return;
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
    // A handle-resize gesture is not a drawing session; drop it uncommitted.
    this.frameResize = null;
    this.cancelTypingText();
    const restoreSelection = this.isDrawingShape && this.shapeType === 'rectangle_select'
      ? this.selectionRectSnapshot
      : null;
    this.compositePathTool.cancel();
    this.circleTool.cancel();
    this.rectangleTool.cancel();
    this.quadTool.cancel();
    this.repeatManager.clearPreview();
    // Clears anything a tool did not claim, and resets live scale/rotation.
    this.drawing.cancel();
    if (restoreSelection) {
      this.selection.restore(restoreSelection, { quiet: true });
      this.selectionRectSnapshot = null;
      this.updateTextContent();
    }
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
    this.textLayout.refreshSplinePreview({
      isDrawingPath: this.isDrawingPath,
      path: this.path,
      textModeEnabled: this.textModeEnabled,
      textMode: this.textMode,
      getPreview: () => this.previewSplineText,
      setPreview: (item) => { this.previewSplineText = item; },
      addPreviewShadow: (item) => this.addPreviewShadow(item),
      addToActive: (item) => this.layers.activeLayer.addChild(item),
    });
  }

  private clearSplineTextPreview(): void {
    this.textLayout.clearSplinePreview({
      getPreview: () => this.previewSplineText,
      setPreview: (item) => { this.previewSplineText = item; },
    });
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
    this.shapes.drawInnerShape(frameItem, style, this.innerFrameDraw());
  }

  private innerFrameDraw(): InnerFrameDraw {
    return {
      shapeType: this.shapeType,
      rectangleInnerShapeType: this.rectangleInnerShapeType,
      innerShapeType: this.innerShapeType,
      quadActive: !!this.quadPath,
      guideAngle: this.shapeGuideAngle,
      globalStrokeWidth: this.globalStrokeWidth,
      buildInner: (center: AnyItem, radius: number, style: string, rotation: number) =>
        this.createInnerShape(center, radius, style, rotation),
      addToActive: (item: AnyItem) => this.layers.activeLayer.addChild(item),
    };
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

  // --- Quad-frame shapes: the selected Rect Keys shape fitted to the quad
  // corners, used by the quad-by-4-pts key once three corners are fixed.
  // Returns null for the plain 'rectangle' setting, degenerate corners, or
  // a projectively unusable frame; the caller then deposits the raw quad.
  createQuadFrameShape(styleOrPreview = 'stroke', corners?: AnyItem[] | null): AnyItem {
    const pts = corners ?? [];
    const quad = pts.length === 4 ? pts.map((p) => xy(p)) : null;
    return this.shapes.createQuadFrameShape({
      styleOrPreview,
      innerType: this.rectangleInnerShapeType,
      params: this.rectangleInnerShapeParams,
      shapeType: this.shapeType,
      orientation: this.rectangleOrientation,
      guideAngle: this.shapeGuideAngle,
      corners: quad && quad.every((p) => p != null) ? (quad as [any, any, any, any]) : null,
      mapping: this.quadMapping,
      perspectiveCircle: this.perspectiveCircle,
    });
  }

  /** When the Rect Keys shape is Export Frame, any rect key begins (or
   * finishes) an export-frame drag instead of a drawable shape. */
  private beginRectOrFrame(beginShape: () => 'finish' | 'advance' | 'started' | 'noop'): void {
    if (this.shapeType === 'rectangle_export_frame'
      || (!this.isDrawingShape && this.rectangleInnerShapeType === 'exportFrame')) {
      this.finishOrBeginRect(() => this.rectangleTool.beginExportFrame());
      return;
    }
    this.finishOrBeginRect(beginShape);
  }

  rectCenterlineKC(): void {
    this.beginRectOrFrame(() => this.rectangleTool.beginCenterline());
  }

  rectTwoEdgesKC(): void {
    this.beginRectOrFrame(() => this.rectangleTool.beginTwoEdges());
  }

  rectDiagonalKC(): void {
    this.beginRectOrFrame(() => this.rectangleTool.beginDiagonal());
  }

  /** Z toggle: begin the selection marquee, or finalize it. */
  selectionRectKC(): void {
    if (this.isDrawingShape && this.shapeType === 'rectangle_select') {
      this.finishSelectionRect();
      return;
    }
    if (this.isDrawingPath || this.isDrawingShape || this.isDrawingQuad) return;
    if (!this.mousePt) return;
    if (this.rectangleTool.beginSelect() !== 'started') return;
    this.selectionRectSnapshot = [...this.selectedItems];
    this.updateSelectionRectLive();
    this.updateTextContent();
    this.notify();
  }

  private finishSelectionRect(): void {
    this.updateSelectionRectLive();
    this.selection.pulse();
    this.selectionRectSnapshot = null;
    this.drawing.clearShape();
    this.drawing.resetLiveAdjust();
    this.updateTextContent();
    this.notify();
  }

  /** Live Floating Marker behavior: the marquee reselects as it moves. */
  private updateSelectionRectLive(): void {
    if (!this.isDrawingShape || this.shapeType !== 'rectangle_select') return;
    const start = this.drawing.shapeStartPoint;
    const current = this.mousePt ?? start;
    if (!start || !current) return;
    const rect = new this.scope.Rectangle(start, current);
    const hits: AnyItem[] = [];
    for (const item of this.contentItems()) {
      try {
        if (!item.bounds || !item.bounds.intersects(rect)) continue;
      } catch { continue; }
      const top = this.topUserGroupOf(item);
      if (top && !hits.includes(top)) hits.push(top);
    }
    const selected = this.selectedItems;
    if (selected.length === hits.length && hits.every((item) => selected.includes(item))) return;
    this.selection.restore(hits, { quiet: true });
    this.updateTextContent();
    this.notify();
  }

  private finishOrBeginRect(begin: () => 'finish' | 'advance' | 'started' | 'noop'): void {
    // Read the label before the tool clears the session on finish.
    const frameDeposit = this.shapeType === 'rectangle_export_frame';
    const result = begin();
    if (result === 'finish') {
      const snap = this.captureDeposit();
      const placed = this.endShapeAsStroke();
      this.recordSceneCommand(frameDeposit ? 'Deposit export frame' : 'Deposit shape', snap.before, snap.selected, placed);
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
    if (this.isDrawingPath && this.path) {
      const offsets = this.repeatManager.beginDeposit();
      const base = this.compositePathTool.finishLegacy().filter((item) => !!item);
      deposited.push(...base, ...this.repeatManager.finishDeposit(base, offsets));
    } else if (this.isDrawingShape) deposited.push(...this.endShapeAsStroke());
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
    // Snapshot repeat offsets before finish clears the live session.
    const offsets = this.repeatManager.beginDeposit();
    let base: AnyItem[] = [];
    if (this.circleTool.active) base = this.circleTool.finish();
    else if (this.rectangleTool.active) base = this.rectangleTool.finish();
    const placed = base.filter((item) => !!item);
    return [...placed, ...this.repeatManager.finishDeposit(placed, offsets)];
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

  private mountCentroidMarker(item: AnyItem): void {
    if (!item) return;
    item.guide = true;
    item.locked = true;
    if (!item.data) item.data = {};
    if (!item.data.isBaselineGuide && !item.data.isAscenderGuide) item.data.isCentroidMarker = true;
    const layer = this.ensureGuideLayer();
    if (item.layer !== layer) layer.addChild(item);
  }

  /** Guide-layer mount for export-frame resize handles (already flagged
   * by the handle manager; guide + locked keeps them out of content,
   * save, and print paths). */
  private mountGuideItem(item: AnyItem): void {
    if (!item) return;
    const layer = this.ensureGuideLayer();
    if (item.layer !== layer) layer.addChild(item);
  }

  private unmountGuideItem(item: AnyItem): void {
    try { item.remove(); } catch { /* Detached already. */ }
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
    this.selection.suspendGlow();
  };

  private onAfterPrint = (): void => {
    this.selection.restoreGlow();
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

  // Publish only when the schemas change (this runs on hot paths like
  // mousemove); the HTML overlay re-renders off the version counter.
  private setStatusSchema(schema: StatusSchema, rows: KeymapRow[]): void {
    const key = JSON.stringify([schema, rows]);
    if (key === this.lastStatusKey) return;
    this.lastStatusKey = key;
    this.statusSchema = schema;
    this.keymapRows = rows;
    this.notify();
  }

  private afterViewChange(): void {
    if (this.isGridEnabled) this.drawGrid();
    this.syncPageStroke();
    if (!this.restoringView) this.documentManager.markViewDirty();
    this.emitView();
  }

  // --- View subscription (scrollbars, autosave) ---
  // Pan/zoom publish here instead of notify(): the full app does not
  // rerender on every pan event, only view subscribers do. The edit is
  // still dirty, so autosave can write the view into the document.
  private readonly viewListeners = new Set<() => void>();
  private viewVersion = 0;

  subscribeView = (fn: () => void): (() => void) => {
    this.viewListeners.add(fn);
    return () => { this.viewListeners.delete(fn); };
  };

  getViewVersion = (): number => this.viewVersion;

  private emitView(): void {
    this.viewVersion++;
    this.viewListeners.forEach((fn) => fn());
  }

  // Zoom around the view center, honoring min/max zoom.
  private stepZoom(dir: 1 | -1): void {
    this.viewport.stepZoom(dir);
  }

  private resetZoom(): void {
    this.viewport.resetZoom();
  }

  private lastTrackpadPanAt = 0;
  /** Safari reports pinch as gesture events, not ctrl+wheel. While one is
   * in flight the wheel zoom/pinch branch stands down (dual-reporting
   * engines would otherwise zoom twice); pan still applies. */
  private gestureZoomActive = false;
  private gestureZoomBase = 0;

  private onMouseWheel(event: WheelEvent): void {
    // Always swallowed: browsers treat ctrl+wheel as page zoom, and the
    // canvas owns every wheel gesture that reaches it.
    event.preventDefault();
    if (event.deltaY === 0 && event.deltaX === 0) return;
    const recentTrackpad = Date.now() - this.lastTrackpadPanAt < TRACKPAD_STICKY_MS;
    const gesture = classifyWheel(event, recentTrackpad);
    if (gesture === 'pan') {
      this.lastTrackpadPanAt = Date.now();
      this.viewport.panByScreen(event.deltaX, event.deltaY);
      return;
    }
    if (this.gestureZoomActive) return;
    const view = this.scope.view;
    const el = view.element as HTMLCanvasElement | null;
    const viewPoint = el && typeof el.getBoundingClientRect === 'function'
      ? (() => {
        const rect = el.getBoundingClientRect();
        return new this.scope.Point(event.clientX - rect.left, event.clientY - rect.top);
      })()
      : view.center.clone();
    const deltaY = event.ctrlKey ? event.deltaY * TRACKPAD_PINCH_GAIN : event.deltaY;
    if (deltaY !== 0) this.viewport.zoomForWheel(deltaY, viewPoint);
  }

  /** Select the content item under the cursor. */
  hitTestUnderCursor(): void {
    this.pointer.hitTestUnderCursor();
  }

  /** Safari trackpad pinch: cumulative scale from gesturestart. */
  onGestureStart(event: Event): void {
    event.preventDefault();
    const scale = (event as unknown as { scale?: unknown }).scale;
    this.gestureZoomBase = typeof scale === 'number' && scale > 0 ? scale : 0;
    this.gestureZoomActive = this.gestureZoomBase > 0;
  }

  /** Each change zooms by the ratio since the last one, at the pointer. */
  onGestureChange(event: Event): void {
    event.preventDefault();
    const e = event as unknown as { scale?: unknown; clientX?: unknown; clientY?: unknown };
    if (typeof e.scale !== 'number' || !(e.scale > 0) || !this.gestureZoomActive) return;
    const ratio = e.scale / this.gestureZoomBase;
    this.gestureZoomBase = e.scale;
    const view = this.scope.view;
    const el = view.element as HTMLCanvasElement | null;
    const viewPoint = el && typeof el.getBoundingClientRect === 'function' &&
      typeof e.clientX === 'number' && typeof e.clientY === 'number'
      ? (() => {
        const rect = el.getBoundingClientRect();
        return new this.scope.Point(e.clientX - rect.left, e.clientY - rect.top);
      })()
      : view.center.clone();
    this.viewport.zoomByFactor(ratio, viewPoint);
  }

  onGestureEnd(): void {
    this.gestureZoomActive = false;
    this.gestureZoomBase = 0;
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
    if (type === 'rectangle_select') this.updateSelectionRectLive();
    this.repeatManager.refreshPreview();
    this.noteLiveProgress();
  }

  /** Physical keyboard entry. Decisions live in KeyboardController. */
  handleKeyDown(event: KeyboardEvent): void {
    this.keyboard.handleKeyDown(event);
  }

  /** Demonstration entries: same controller path as physical input, so
   * the document, previews, and on-screen keycap highlights behave
   * identically. The DemonstrationPlayer drives these; user code and
   * tests should prefer real KeyboardEvents through handleKeyDown. */
  resetZoomForDemo(): void {
    this.viewport.resetZoom();
  }

  demoKeyDown(key: string): void {
    const event = this.demoKeyEvent(key);
    this.keyboard.handleKeyDown(event);
    this.keyboard.reportKeyHighlight(event);
  }

  demoKeyUp(key: string): void {
    this.keyboard.reportKeyUp(this.demoKeyEvent(key));
  }

  demoMoveCursorToFraction(fx: number, fy: number): void {
    const view = this.scope.view;
    if (!view || !Number.isFinite(fx) || !Number.isFinite(fy)) return;
    const cx = Math.min(1, Math.max(0, fx));
    const cy = Math.min(1, Math.max(0, fy));
    const viewPoint = new this.scope.Point(cx * view.size.width, cy * view.size.height);
    this.pointer.onMouseMove({ point: view.viewToProject(viewPoint) } as paper.MouseEvent);
  }

  private demoCodeFor(key: string): string {
    if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`;
    if (/^[0-9]$/.test(key)) return `Digit${key}`;
    const named: Record<string, string> = { Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', ' ': 'Space' };
    return named[key] ?? key;
  }

  private demoKeyEvent(key: string): KeyboardEvent {
    return {
      key,
      code: this.demoCodeFor(key),
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => {},
    } as unknown as KeyboardEvent;
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
  private liveStatusHints(): Array<{ label: string; keys: string[]; actionId?: string }> {
    if (!this.isLiveDrawing) return [];
    const liveByAction = new Map<string, { label: string; keys: string[]; actionId?: string }>();
    for (const binding of this.keyboard.liveBindings()) {
      if (!binding.applies()) continue;
      const group = binding.actionId ?? binding.label;
      const entry = liveByAction.get(group) ?? { label: binding.label, keys: [], actionId: binding.actionId };
      for (const key of binding.keys) {
        if (!entry.keys.includes(key)) entry.keys.push(key);
      }
      liveByAction.set(group, entry);
    }
    return [...liveByAction.values()];
  }

  updateTextContent(): void {
    const snapshot = {
      selectedCount: this.selectedItems.length,
      gridEnabled: this.isGridEnabled,
      gridType: this.gridType,
      dropNote: this.lastDropNote,
      dragLock: this.isInDragLock,
      panLock: this.isPanLocked,
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
      typingText: this.isTypingText,
      typingMode: this.typedTextMode,
      liveHints: this.liveStatusHints(),
      transformMode: this.isTransformMode,
      transformLive: this.transformLive ? this.transformLive.kind : null,
    };
    this.setStatusSchema(buildStatusSchema(snapshot), buildKeymapRows(snapshot));
  }
}

function xy(point: { x: number; y: number } | null | undefined): { x: number; y: number } | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x, y: point.y };
}
