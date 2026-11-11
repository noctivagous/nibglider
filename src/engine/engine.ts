// Ported from the flat global scripts (drawingProperties.js,
// drawingToolsAndFunctions.js, selectionFunctions.js, shapeGenerators.js,
// NibGliderApp.js). Scene identity and selection state now live in focused
// services; the PaperScope is injected instead of paper.install(window).
// NB: `paper.*` below refers to the global namespace from paper's bundled
// declarations (type positions only); the runtime value is never imported here.
import { FontMetrics, weightsForFamily } from './fontMetrics';
import { outlineText } from './text/textOutline';
import {
  BUILT_IN_TEXT_STYLES,
  sanitizeTextStyle,
  stylePatch,
  type TextStyleEntry,
} from './text/textStyles';
import { traceBitmap as traceBitmapPixels, type BitmapInput, type TraceOptions } from './image/tracer';
import {
  isImageMaskGroup,
  imageContentOf,
  setImageCrop,
  setImageMask,
  clearImageMask,
  booleanImageMask,
  type ImageCropRect,
} from './image/imageMask';
import opentype from 'opentype.js';
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
import { resolvePath, supershapeRadius as supershapeRadiusValue } from './geometry/pathResolver';
import { arcSegments, arcThroughPoints, ellipseSegments } from './geometry/simpleGeometry';
import {
  arrowheadGeometry,
  isArrowheadStyle,
  type ArrowheadStyle,
} from './appearance/arrowheads';
import { displayedStrokePosition } from './appearance/strokePosition';
import type { BezierSegment, ResolvedVectorGeometry, Vec2 } from './model/geometryResolution';
import type { NGOutlinedStrokePath, NGSmoothedPolyline } from './model/NGPath';
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
import { keyGroupForLabel, keyboardPlatform, scaleFactor, rotationStep } from './input/keymap';
import { CombinatoricsManager, type CombinatoricsHost } from './scene/CombinatoricsManager';
import { InterlaceManager } from './scene/InterlaceManager';
import { DropController, viewFitScale } from './document/DropController';
import {
  boxBlurPixels,
  brightnessPixels,
  contrastPixels,
  flattenPixels,
  grayscalePixels,
  invertPixels,
  sharpenPixels,
} from './image/rasterOps';
import {
  clearTransient,
  decodeSceneItems,
  encodeSceneDocument,
  encodeSceneItems,
  isSceneJson,
  isSvgMarkup,
  readSceneActiveLayerId,
  readSceneGuides,
  readSceneLayers,
  readScenePrintSetup,
  readSceneView,
  stripSvgClips,
  type SceneView,
} from './document/SceneIO';
import {
  createGuide,
  guideAtPoint,
  moveGuide as moveGuideRecord,
  removeGuide as removeGuideRecord,
  setGuideLocked as setGuideLockedRecord,
  snapToGuides,
  type GuideRecord,
} from './document/guides';
import {
  cropMarkSegments,
  defaultPrintSetup,
  printableRect,
  readPrintSetup,
  resolvePrintItemIds,
  type PrintScope,
  type PrintSetup,
} from './document/printSetup';
import {
  buildLayerListing,
  layerLocked,
  layerOpacity,
  layerVisible,
  type LayerListing,
  type LayerRecord,
  type ListingObjectInput,
} from './document/layerModel';
import {
  adoptImportedArtwork,
  artworkNodeHasVectors,
  buildArtworkNode,
  type PdfArtworkGroup,
} from './document/vectorArtwork';
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
import { fbm1 } from './geometry/noise';
import { fitPolylineWithError, reducePolyline } from './geometry/polylineFit';
import { douglasPeucker, douglasPeuckerClosed } from './geometry/douglasPeucker';
import { concaveHull } from './geometry/concaveHull';
import { PathTool } from './drawing/PathTool';
import { CircleTool } from './drawing/CircleTool';
import { RectangleTool } from './drawing/RectangleTool';
import { QuadTool } from './drawing/QuadTool';
import { DrawingSession } from './drawing/DrawingSession';
import type { DrawingHost } from './drawing/DrawingHost';
import { SceneRepository, type RetainedPath } from './scene/SceneRepository';
import { DrawableCatalog } from './document/DrawableCatalog';
import { DrawableRenderer } from './scene/DrawableRenderer';
import { SceneSynchronizer } from './scene/SceneSynchronizer';
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
import { dxfDocument, toDxfSpace, type DxfPolyline } from './scene/dxfExport';
import {
  createExportFrame,
  exportPngSize,
  resolveExportBoxes,
  splitFrameBoxes,
  validateExportFrame,
  type ExportFrameBox,
  type ExportFrameRecord,
} from './model/NGExportFrame';
import {
  createPrintifyGarment,
  exportPngSizeForArea,
  exportScaleForArea,
  placeholderRectPoints,
  validatePrintifyGarment,
  type PrintifyGarmentRecord,
  type PrintifyGarmentSpec,
  type PrintifyPlaceholderSpec,
} from './model/NGPrintifyGarment';
import {
  garmentAreaArtwork,
  isPrintifyAreaItem,
  isPrintifyGarmentItem,
  PRINTIFY_AREA_DATA_KEY,
  PRINTIFY_AREA_GARMENT_KEY,
  PRINTIFY_AREA_POSITION_KEY,
  PRINTIFY_GARMENT_DATA_KEY,
  PRINTIFY_GARMENT_RECORD_KEY,
  readPrintifyGarment,
} from './scene/printifyGarment';
import {
  printifyFetch,
  productPayloadForGarment,
  uploadPayloadForArea,
} from './document/printifyClient';
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
import {
  basisForWallpaper,
  copyTransforms,
  FRIEZE_GROUPS,
  repeatOutcome,
  WALLPAPER_GROUPS,
  type Affine,
  type FriezeGroupId,
  type RepeatFamilyName,
  type SymmetryRepeatSpec,
  type WallpaperGroupId,
} from './repeat/symmetry';
import {
  isReplicationRecord,
  type ReplicationRecord,
} from './repeat/replication';
import type { Progression } from './repeat/symmetry';
import type { LiveFrame } from './repeat/RepeatManager';
import type { RepeatAnchor, RepeatDirection } from './geometry/RepeatGeometry';
import { clampRepeatCount, isRepeatAnchor, isRepeatDirection } from './geometry/RepeatGeometry';
import { LayerManager } from './document/LayerManager';
import {
  alignDeltas as computeAlignDeltas,
  alignToSelectionDeltas,
  distributeDeltas as computeDistributeDeltas,
  type AlignMode,
  type DistributeAxis,
} from './geometry/arrange';
import {
  buildNativeDocument,
  isNativeDocumentText,
  nativeFileName,
  parseNativeDocument,
  readPalette,
  serializeNativeDocument,
  type NativeDisplaySettings,
  type NativeDocumentFile,
  type NativeLayerRecord,
  type NativePageRecord,
} from './document/NativeDocument';
import {
  PointEditSession,
  applySnapshots as applyPointSnapshots,
  snapshotItem as snapshotPointItem,
  type ContourSnapshot,
} from './scene/PointEditSession';
import {
  joinContours as joinPointContours,
  joinEndToEnd as joinPointEndToEnd,
  joinStartToStart as joinPointStartToStart,
} from './geometry/pointEditing';
import { CoordinateManager } from './document/CoordinateManager';
import {
  drawingPageRect,
  pageCornerBrackets,
  pageEdgeTicks,
  snapPageToGrid,
  createDrawingPage,
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
  cssHex,
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
  TextCaseTransform,
  TextJustification,
  TextMode,
  TextPasteLocation,
  TextSpec,
  TypeCursorAnchor,
  TypeCursorBottomEdge,
} from './types';
import { typeAnchorPoint } from './types';

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
  TextCaseTransform,
  TextJustification,
  TextMode,
  TextPasteLocation,
  TextSpec,
  TypeCursorAnchor,
  TypeCursorBottomEdge,
} from './types';
export {
  PT_PER_CM,
  PT_PER_INCH,
  lengthUnitToPoints,
  pointsToLengthUnit,
  typeAnchorPoint,
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
/** Ruler placement: viewer edges (fixed to the canvas container), the
 * DrawingPage frame (travels with the page), or off (no rulers). A
 * Document Settings option, also in the View menu. */
export type RulerPlacement = 'viewer' | 'page' | 'off';

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
    globalArrowStart: 'none',
    globalArrowEnd: 'none',
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
  get globalArrowStart(): ArrowheadStyle { return this.paint.globalArrowStart; }
  set globalArrowStart(v: ArrowheadStyle) { this.paint.globalArrowStart = v; }
  get globalArrowEnd(): ArrowheadStyle { return this.paint.globalArrowEnd; }
  set globalArrowEnd(v: ArrowheadStyle) { this.paint.globalArrowEnd = v; }
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
  // --- Keys table widget ---
  /** Hide undo/redo/copy/paste rows from the keys table. On by default. */
  hideCommonKeymapRows = true;
  // --- Grid / cursors ---
  // Grid and page-display state is per-document from Tier Four
  // (Slice 17): it serializes into the .nibglider file (format v5),
  // and a document's values win on open. The field defaults below —
  // seeded once from any legacy global settings — are what a new
  // document starts from.
  isGridEnabled = false;
  gridType: GridType = 'square';
  gridSpacing = 20;
  /** Minor dots at gridSpacing / gridSubdivisions (1 = off, 1..10). */
  gridSubdivisions = 1;
  /** Major lattice rendering: dots, or full lines at spacing. */
  gridStyle: 'dots' | 'lines' = 'dots';
  gridColor = '#8c9eb8';
  gridOpacity = 0.55;
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
  // Symmetry repeat (Slice 9a): the selection-level repeat model.
  repeatFamily: RepeatFamilyName = 'wallpaper';
  repeatWallpaperGroup: WallpaperGroupId = 'p1';
  repeatFriezeGroup: FriezeGroupId = 'p11g';
  repeatSymmetryCount = 6;
  repeatPolarReflect = false;
  // Live symmetry (Slice 10, revised): the Repeat panel's
  // descriptor can be armed to preview and deposit while drawing.
  liveSymmetryArmed = false;
  repeatPolarMode: 'division' | 'degrees' = 'division';
  repeatPolarStepDeg = 50;
  repeatMotifOffsetDeg = 0;
  repeatStationMode: 'division' | 'spacing' | 'progression' = 'division';
  repeatAlongSpacing = 40;
  repeatAlongOrientationDeg = 0;
  /** Name of the Progressions outcome the polar fields were last
   * filled from ('whorl' | 'phyllotaxis'); display only — editing
   * any underlying field clears it (the configuration is custom). */
  repeatOutcomeName: string | null = null;
  polarRadiusProgression: Progression | null = null;
  polarScaleProgression: Progression | null = null;
  alongGapProgression: Progression | null = null;
  /** Reference path for live path-relative families. */
  private liveGuide: { points: Vec2[]; closed: boolean } | null = null;
  private pendingLiveSpec: SymmetryRepeatSpec | null = null;
  // Path-following repeat parameter (Slice 10).
  repeatAlongAlign = true;
  /** Live symmetry transforms captured for a composite deposit. */
  private pendingLiveTransforms: Affine[] | null = null;
  private repeatManager!: RepeatManager;

  // --- Snapping flags ---
  isGridSnappingEnabled = false;
  isPathSnappingEnabled = false;
  isPointSnappingEnabled = true;
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
    underline: false,
    strikethrough: false,
    caseTransform: 'none',
    baselineShift: 0,
    wordSpacing: 0,
    justification: 'center',
    leading: 1.2,
    letterSpacing: 0,
    paragraphSpacing: 0,
  };
  /** User-saved text styles (Slice 19), persisted in app settings
   * alongside the built-ins from textStyles.ts. */
  private userTextStyles: TextStyleEntry[] = [];
  // Text Mode: when on, every shape key draws its geometric shape plus
  // text derived from it (Display flows around the boundary, Body fills
  // the interior) instead of the bare shape.
  textModeEnabled = false;
  textMode: TextMode = 'display';
  // Settings window "Text pastes at Location": pasted text anchors at the
  // crosshair (cursor point, else view center) or always at the view center.
  textPasteLocation: TextPasteLocation = 'crosshair';
  // Type At Cursor: which point of the typed line attaches to the cursor.
  typeCursorAnchor: TypeCursorAnchor = 'bottom-left';
  // Type At Cursor: which rule the bottom-row anchors pin to. Baseline is
  // the lower edge of the baseline box (top edge: ascender line);
  // descender pins the full ascender-to-descender box instead.
  typeCursorBottomEdge: TypeCursorBottomEdge = 'baseline';
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
  /** Name of the disk file this document was opened from / last
   * saved to, or null while it lives only in the gallery. Surfaced
   * in the panel title next to the dirty marker. */
  currentFileName: string | null = null;
  // --- Tier Two: pages, guides, print setup -------------------------
  /** Snapshots of the pages that are not currently loaded. The
   * active page's record is always the live scene; switching pages
   * snapshots it here and loads the target's record. */
  private pageSnapshots = new Map<string, NativePageRecord>();
  /** Ruler guides of the active page. */
  private pageGuides: GuideRecord[] = [];
  private guideSeq = 0;
  private guideDrag: { id: string; creating: boolean } | null = null;
  /** Printer page setup, kept separate from Document Size. */
  private printSetupState: PrintSetup = defaultPrintSetup();
  /** Items hidden for the in-flight print, restored by finishPrint. */
  private printHiddenItems: AnyItem[] = [];
  private printMarkItems: AnyItem[] = [];
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
  private typedTextRotation = 0;
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
  /** Point-edit session for the path being point-edited, or null. */
  private pointEdit: PointEditSession | null = null;
  /** Active handle-resize gesture, or null while idle. The label names the
   * undo entry; export-frame and garment-area resizes share the gesture. */
  private frameResize: {
    item: AnyItem;
    handle: ExportFrameHandleId;
    before: { x: number; y: number; width: number; height: number };
    label: string;
  } | null = null;
  /** Printify token lives in memory only: it is never persisted to settings
   * or document JSON. The shop id is ordinary persisted engine settings. */
  private printifyToken = '';
  printifyShopId = '';
  /** Last fetched mockup image urls by Printify product id. Memory only. */
  private readonly printifyMockups = new Map<string, string[]>();
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
  private get catalog(): DrawableCatalog { return this.context.catalog; }
  private get renderer(): DrawableRenderer { return this.context.renderer; }
  private get synchronizer(): SceneSynchronizer { return this.context.synchronizer; }
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
    this.context.catalog = new DrawableCatalog();
    this.context.renderer = new DrawableRenderer(scope, {
      layerForId: (id) => this.layers.layerForId(id),
      scene: this.context.scene,
    });
    this.context.synchronizer = new SceneSynchronizer(this.context.catalog, this.context.renderer);
    this.context.scene.attachCatalog({
      catalog: this.context.catalog,
      resolvePage: () => this.documentManager.currentPageId ?? 'page-1',
      currentItemOf: (id) => this.context.renderer.getItem(id),
    });
    this.context.history = new HistoryManager(this.scene, () => this.selection,
      () => this.documentManager.markEdited('scene'));
    this.context.selection = new SelectionManager(this.scene, this.history,
      (original, clone) => this.scene.retainClone(original, clone, (item) => this.shapePartOf(item)),
      {
        mount: (item) => this.mountCentroidMarker(item),
        unmount: (item) => { try { item.remove(); } catch { /* Detached already. */ } },
      });
    const combinatoricsHost: CombinatoricsHost = {
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
      imageCombine: (mode, items) => this.combineImageMask(mode, items),
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
      openDocumentText: (text, fileName) => this.openDocumentText(text, fileName),
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
        symmetryArmed: this.liveSymmetryArmed,
      }),
      liveDescriptor: (frame) => this.liveDescriptorForFrame(frame),
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
  // the private methods live for noUnusedLocals. Catalog accessors land here
  // until the Phase 2 deposit pipeline calls them through the facade.
  private retainHostCallbacks(): void {
    void this.catalog;
    void this.renderer;
    void this.synchronizer;
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
      if (active && !(active as any).guide) {
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
    if (v !== 'viewer' && v !== 'page' && v !== 'off') return;
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

  /** Page fill colour (the Fill toggle paints the sheet with it).
   * Per-document from Slice 17; the default is the long-standing
   * slate. Edited in Document Settings' Page tab. */
  pageFillColor = '#29303d';

  setPageFillColor(v: string): void {
    const checked = cssHex(v, '');
    if (checked == null) return;
    if (checked === this.pageFillColor) return;
    this.pageFillColor = checked;
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
  /** True when any content layer holds artwork (not overlays). */
  hasContent(): boolean { return this.allContentItems().length > 0; }

  /** Content items across every registered content layer, in
   * bottom-to-top layer order. Editing operations keep using the
   * active layer (contentItems); save/open/stats use this. */
  private allContentItems(): AnyItem[] {
    const out: AnyItem[] = [];
    for (const layer of this.layers.contentLayers()) {
      for (const child of [...(layer.children ?? [])] as AnyItem[]) {
        try { if (!this.scene.isNonContentItem(child)) out.push(child); } catch { /* Detached. */ }
      }
    }
    return out;
  }

  // --- Document session: gallery new/open/save support + SVG transfer ---
  // All mutators record one undo entry and refresh paint/status bridges.
  /** Remove every artwork item and clear the selection (New document).
   * Recenters on the workspace so the page opens centered. */
  newDocument(): void {
    if (this.isLiveDrawing) return;
    this.adoptDocumentPalette(null);
    const before = this.allContentItems();
    const selectedBefore = [...this.selectedItems];
    if (before.length === 0) { this.centerOnCanvas(); return; }
    this.clearOutSelection();
    for (const item of before) {
      try { item.remove(); } catch { /* Detached already. */ }
    }
    this.scene.pruneRecords();
    this.currentFileName = null;
    this.recordSceneCommand('New document', before, selectedBefore, []);
    this.centerOnCanvas();
    this.updateTextContent(); this.notify();
  }

  /** Native gallery payload: Paper JSON of artwork items, plus the view.
   * Selection and glow are stripped for the write and restored after. */
  exportScene(): string {
    const items = this.allContentItems();
    const selected = this.selection.snapshot();
    this.selection.suspendGlow();
    try {
      for (const item of items) clearTransient(item);
      const records = this.layers.listLayers();
      const layerIdOf = new Map<AnyItem, string>();
      for (const record of records) {
        const layer = this.layers.layerForId(record.id);
        for (const child of (layer?.children ?? []) as AnyItem[]) layerIdOf.set(child, record.id);
      }
      return encodeSceneDocument(
        items.map((item) => ({ item, layerId: layerIdOf.get(item) ?? records[0]?.id ?? '' })),
        records,
        this.capturedSceneView(),
        this.layers.activeLayerId,
        {
          guides: this.pageGuides,
          printSetup: JSON.stringify(this.printSetupState) === JSON.stringify(defaultPrintSetup())
            ? null
            : this.printSetupState,
        },
      );
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
    for (const outline of this.printifyGarmentItems()) hide(outline);
    for (const area of this.printifyAreaItems()) hide(area);
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

  /** WebP export for a File > Export scope (Slice 9c). WebP keeps
   * alpha, so the background defaults to transparent. */
  exportScopeWEBP(
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
      mime: 'image/webp',
      quality,
      background: opts.background ?? null,
    }).then((blob) => (blob ? { box, blob } : null));
  }

  /** DXF export for a File > Export scope (Slice 9c): the scope's
   * vector geometry as LWPOLYLINE contours (curves flattened by
   * sampling). Text and rasters are not represented. */
  exportScopeDXF(scope: ExportScope): { box: ExportFrameBox; dxf: string } | null {
    const box = this.scopeExportBox(scope);
    if (!box) return null;
    const hidden = this.hideExportOverlays();
    try {
      const polylines: DxfPolyline[] = [];
      const boxRect = new this.scope.Rectangle(box.x, box.y, box.width, box.height);
      const samplePath = (path: AnyItem): void => {
        const points: Array<{ x: number; y: number }> = [];
        for (const curve of (path.curves ?? []) as AnyItem[]) {
          const steps = Math.max(1, Math.min(48, Math.ceil((curve.length ?? 0) / 4)));
          for (let s = 0; s <= steps; s++) {
            const local = curve.getPointAt(s / steps);
            if (!local) continue;
            const global = path.localToGlobal(local);
            const prev = points[points.length - 1];
            if (!prev || Math.hypot(global.x - prev.x, global.y - prev.y) > 1e-6) {
              points.push({ x: global.x, y: global.y });
            }
          }
        }
        const closed = !!path.closed;
        if (closed && points.length > 1) {
          const first = points[0];
          const last = points[points.length - 1];
          if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-6) points.pop();
        }
        if (points.length >= 2) polylines.push({ points, closed });
      };
      const visit = (item: AnyItem): void => {
        if (!item || item.guide) return;
        if (item.className === 'CompoundPath') {
          for (const child of (item.children ?? []) as AnyItem[]) samplePath(child);
          return;
        }
        if (item.className === 'Path') { samplePath(item); return; }
        for (const child of (item.children ?? []) as AnyItem[]) visit(child);
      };
      for (const item of this.contentItems()) {
        try {
          if (item?.bounds && !item.bounds.intersects(boxRect)) continue;
        } catch { /* bounds can throw on detached items */ }
        visit(item);
      }
      return { box, dxf: dxfDocument(toDxfSpace(polylines, box)) };
    } catch {
      return null;
    } finally {
      this.restoreExportOverlays(hidden);
    }
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

  /** Handle id under the document point for the selected frame or garment
   * area, if any. Used by the pointer controller; null while drawing or
   * unselected. */
  frameHandleAt(point: { x: number; y: number }): ExportFrameHandleId | null {
    if (this.isLiveDrawing) return null;
    try {
      const frame = this.singleSelectedResizeItem();
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

  /** Begin a handle-resize gesture on the selected frame or garment area. */
  beginFrameResize(handle: ExportFrameHandleId): void {
    if (this.isLiveDrawing || this.frameResize || this.transformDrag) return;
    const target = this.singleSelectedResizeItem();
    if (!target) return;
    let before: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const b = target.bounds;
      if (b && b.width > 0 && b.height > 0) before = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch { /* Detached already. */ }
    if (!before) return;
    const label = isPrintifyAreaItem(target) ? 'Resize garment area' : 'Resize export frame';
    this.frameResize = { item: target, handle, before, label };
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
      this.history.recordBounds(gesture.label, gesture.item, gesture.before, after);
      this.documentManager.markEdited('scene');
    }
    this.updateTextContent(); this.notify();
  }

  // --- Printify garments (Rect Keys > In-Canvas Elements > PRINTIFY GARMENT) ---
  // A garment is an outline guide plus one live area rect per Printify
  // placeholder, all selectable Paper items on the artwork layer (so native
  // save, undo, marquee-select, and hit-testing keep working). Outlines and
  // areas are never artwork: whole-scene export hides them, and area export
  // crops via the SVG viewBox without clipping the live elements.
  printifyGarmentItems(): AnyItem[] {
    const layer = this.layers.activeLayer;
    return layer ? [...layer.children].filter(isPrintifyGarmentItem) : [];
  }

  printifyAreaItems(): AnyItem[] {
    const layer = this.layers.activeLayer;
    return layer ? [...layer.children].filter(isPrintifyAreaItem) : [];
  }

  /** Deposit a garment group with undo + selection. Returns the garment id,
   * or null for degenerate specs. */
  depositPrintifyGarment(spec: PrintifyGarmentSpec): string | null {
    if (this.isLiveDrawing) return null;
    const before = this.contentItems();
    const selectedBefore = [...this.selectedItems];
    const placed = this.placePrintifyGarmentItems(spec);
    if (!placed) return null;
    for (const item of placed.items) this.addItemToSelection(item);
    this.recordSceneCommand('Deposit printify garment', before, selectedBefore, placed.items);
    this.updateTextContent(); this.notify();
    return placed.garmentId;
  }

  /** Build, tag, and mount a garment's outline + area items without history.
   * The Rect-Key tool finish path uses this; the outer deposit owns undo. */
  private placePrintifyGarmentItems(spec: PrintifyGarmentSpec): { garmentId: string; items: AnyItem[] } | null {
    const layer = this.layers.activeLayer;
    if (!layer) return null;
    let record: PrintifyGarmentRecord;
    try {
      record = createPrintifyGarment(spec);
    } catch {
      return null;
    }
    const made: AnyItem[] = [];
    try {
      const union = record.areas.reduce(
        (acc, area) => ({
          x: Math.min(acc.x, area.rect.x),
          y: Math.min(acc.y, area.rect.y),
          maxX: Math.max(acc.maxX, area.rect.x + area.rect.width),
          maxY: Math.max(acc.maxY, area.rect.y + area.rect.height),
        }),
        { x: Infinity, y: Infinity, maxX: -Infinity, maxY: -Infinity },
      );
      const pad = 24;
      const outline = new this.scope.Path.Rectangle({
        point: new this.scope.Point(union.x - pad, union.y - pad),
        size: new this.scope.Size(union.maxX - union.x + pad * 2, union.maxY - union.y + pad * 2),
      });
      outline.strokeColor = new this.scope.Color(0.42, 0.42, 0.45);
      outline.fillColor = null;
      outline.strokeWidth = 1;
      outline.dashArray = [6, 4];
      outline.name = record.name;
      outline.data[PRINTIFY_GARMENT_DATA_KEY] = true;
      outline.data[PRINTIFY_GARMENT_RECORD_KEY] = record;
      layer.addChild(outline);
      made.push(outline);
      for (const area of record.areas) {
        const item = new this.scope.Path.Rectangle({
          point: new this.scope.Point(area.rect.x, area.rect.y),
          size: new this.scope.Size(area.rect.width, area.rect.height),
        });
        item.strokeColor = new this.scope.Color(0.15, 0.4, 0.85);
        item.fillColor = null;
        item.strokeWidth = 1;
        item.dashArray = [6, 4];
        item.name = `${record.name} ${area.position}`;
        item.data[PRINTIFY_AREA_DATA_KEY] = true;
        item.data[PRINTIFY_AREA_GARMENT_KEY] = record.id;
        item.data[PRINTIFY_AREA_POSITION_KEY] = area.position;
        item.data.printifyAreaId = area.id;
        layer.addChild(item);
        made.push(item);
      }
    } catch {
      for (const item of made) {
        try { item.remove(); } catch { /* Detached already. */ }
      }
      return null;
    }
    return { garmentId: record.id, items: made };
  }

  private garmentOutlineById(id: string): AnyItem | null {
    for (const item of this.printifyGarmentItems()) {
      try {
        if (item.data?.[PRINTIFY_GARMENT_RECORD_KEY]?.id === id) return item;
      } catch { /* Detached already. */ }
    }
    return null;
  }

  private garmentAreaItem(garmentId: string, areaId: string): AnyItem | null {
    for (const item of this.printifyAreaItems()) {
      try {
        if (item.data?.[PRINTIFY_AREA_GARMENT_KEY] === garmentId
          && item.data?.printifyAreaId === areaId) return item;
      } catch { /* Detached already. */ }
    }
    return null;
  }

  garmentAreaItemByPosition(garmentId: string, position: string): AnyItem | null {
    for (const item of this.printifyAreaItems()) {
      try {
        if (item.data?.[PRINTIFY_AREA_GARMENT_KEY] === garmentId
          && item.data?.[PRINTIFY_AREA_POSITION_KEY] === position) return item;
      } catch { /* Detached already. */ }
    }
    return null;
  }

  /** Live garment record: area rects follow the live items so dragged or
   * resized areas stay exact, and each area scale re-derives from its
   * required Printify pixels. */
  private liveGarmentRecord(outline: AnyItem): PrintifyGarmentRecord | null {
    const record = readPrintifyGarment(outline);
    if (!record) return null;
    for (const area of record.areas) {
      const item = this.garmentAreaItem(record.id, area.id);
      if (!item) continue;
      try {
        const b = item.bounds;
        if (b && b.width > 0 && b.height > 0) {
          area.rect = { x: b.x, y: b.y, width: b.width, height: b.height };
          area.scale = exportScaleForArea(area.rect, area.requiredPx);
        }
      } catch { /* Detached already. */ }
    }
    try {
      validatePrintifyGarment(record);
    } catch {
      return null;
    }
    return record;
  }

  listPrintifyGarments(): PrintifyGarmentRecord[] {
    const out: PrintifyGarmentRecord[] = [];
    for (const outline of this.printifyGarmentItems()) {
      const record = this.liveGarmentRecord(outline);
      if (record) out.push(record);
    }
    return out;
  }

  getPrintifyGarment(id: string): PrintifyGarmentRecord | null {
    const outline = this.garmentOutlineById(id);
    return outline ? this.liveGarmentRecord(outline) : null;
  }

  /** The garment whose GUI is mounted: exactly one outline or area of one
   * garment selected. Outlines win when both are selected. */
  selectedPrintifyGarment(): PrintifyGarmentRecord | null {
    const outlines = this.selectedItems.filter(isPrintifyGarmentItem);
    if (outlines.length === 1) return this.liveGarmentRecord(outlines[0]);
    const areas = this.selectedItems.filter(isPrintifyAreaItem);
    if (areas.length === 0) return null;
    let garmentId: string | null = null;
    try {
      garmentId = areas[0].data?.[PRINTIFY_AREA_GARMENT_KEY] ?? null;
    } catch { /* Detached already. */ }
    if (typeof garmentId !== 'string') return null;
    if (areas.some((area) => {
      try {
        return area.data?.[PRINTIFY_AREA_GARMENT_KEY] !== garmentId;
      } catch {
        return true;
      }
    })) return null;
    const outline = this.garmentOutlineById(garmentId);
    return outline ? this.liveGarmentRecord(outline) : null;
  }

  /** The one selected Printify area, for File > Export > Printify.
   * Returns null unless exactly one area item is selected. */
  selectedPrintifyArea(): { garmentId: string; position: string } | null {
    const areas = this.selectedItems.filter(isPrintifyAreaItem);
    if (areas.length !== 1) return null;
    try {
      const garmentId = areas[0].data?.[PRINTIFY_AREA_GARMENT_KEY];
      const position = areas[0].data?.[PRINTIFY_AREA_POSITION_KEY];
      if (typeof garmentId !== 'string' || typeof position !== 'string') return null;
      return { garmentId, position };
    } catch {
      return null;
    }
  }

  /** Upload the selected garment area to Printify. Progress and failures
   * are reported through the status overlay note. */
  async uploadSelectedPrintifyAreaToPrintify(): Promise<boolean> {
    const selected = this.selectedPrintifyArea();
    if (!selected) {
      this.lastDropNote = 'Printify: select one garment area to upload.';
      this.notify();
      return false;
    }
    try {
      this.lastDropNote = `Printify: uploading the ${selected.position} area…`;
      this.notify();
      await this.uploadPrintifyArea(selected.garmentId, selected.position);
      this.lastDropNote = `Printify: uploaded the ${selected.position} area.`;
      this.notify();
      return true;
    } catch (err) {
      this.lastDropNote = `Printify upload failed: ${err instanceof Error ? err.message : String(err)}`;
      this.notify();
      return false;
    }
  }

  /** Upload every area of the selected garment, then create its product
   * using the existing Printify shop setting and the garment name. */
  async createSelectedPrintifyProductOnPrintify(): Promise<boolean> {
    const record = this.selectedPrintifyGarment();
    if (!record) {
      this.lastDropNote = 'Printify: select a garment or one of its areas to create a product.';
      this.notify();
      return false;
    }
    try {
      this.lastDropNote = `Printify: uploading ${record.areas.length} garment areas…`;
      this.notify();
      const uploads: Record<string, string> = {};
      for (const area of record.areas) {
        uploads[area.position] = await this.uploadPrintifyArea(record.id, area.position);
      }
      await this.createPrintifyProduct(record.id, uploads, { title: record.name });
      this.lastDropNote = `Printify: created a product for ${record.name}.`;
      this.notify();
      return true;
    } catch (err) {
      this.lastDropNote = `Printify product failed: ${err instanceof Error ? err.message : String(err)}`;
      this.notify();
      return false;
    }
  }

  updatePrintifyGarment(id: string, patch: { name: string }): boolean {
    const outline = this.garmentOutlineById(id);
    if (!outline) return false;
    const current = this.liveGarmentRecord(outline);
    if (!current) return false;
    if (typeof patch.name !== 'string' || patch.name.trim().length === 0) return false;
    const next: PrintifyGarmentRecord = { ...current, name: patch.name };
    try {
      validatePrintifyGarment(next);
    } catch {
      return false;
    }
    try {
      outline.data[PRINTIFY_GARMENT_RECORD_KEY] = next;
      outline.name = next.name;
      for (const area of next.areas) {
        const item = this.garmentAreaItem(next.id, area.id);
        if (item) item.name = `${next.name} ${area.position}`;
      }
    } catch {
      return false;
    }
    this.documentManager.markEdited('scene');
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Switch the garment to new variants: every area keeps its center and
   * height, takes the new placeholder aspect, and re-derives its export
   * scale. One undo entry per resized area. */
  setPrintifyGarmentVariants(
    id: string,
    variantIds: number[],
    placeholders: Record<string, PrintifyPlaceholderSpec>,
  ): boolean {
    const outline = this.garmentOutlineById(id);
    if (!outline || this.isLiveDrawing) return false;
    const current = this.liveGarmentRecord(outline);
    if (!current) return false;
    if (!Array.isArray(variantIds) || variantIds.length === 0 || variantIds.length > 256) return false;
    if (!variantIds.every((v) => Number.isSafeInteger(v) && v > 0)) return false;
    if (new Set(variantIds).size !== variantIds.length) return false;
    const specs = new Map<string, PrintifyPlaceholderSpec>();
    for (const area of current.areas) {
      const spec = (placeholders as Record<string, unknown>)[area.position];
      if (!spec || typeof spec !== 'object') return false;
      const { width, height, decorationMethod } = spec as PrintifyPlaceholderSpec;
      if (!Number.isSafeInteger(width) || (width as number) <= 0) return false;
      if (!Number.isSafeInteger(height) || (height as number) <= 0) return false;
      if (decorationMethod !== undefined
        && (typeof decorationMethod !== 'string' || (decorationMethod as string).trim().length === 0)) return false;
      specs.set(area.position, spec as PrintifyPlaceholderSpec);
    }
    const next: PrintifyGarmentRecord = {
      ...current,
      variantIds: [...variantIds],
      areas: current.areas.map((area) => ({ ...area, requiredPx: { ...area.requiredPx } })),
    };
    for (const area of next.areas) {
      const item = this.garmentAreaItem(next.id, area.id);
      const spec = specs.get(area.position);
      if (!item || !spec) return false;
      let before: { x: number; y: number; width: number; height: number } | null = null;
      try {
        const b = item.bounds;
        if (b && b.width > 0 && b.height > 0) before = { x: b.x, y: b.y, width: b.width, height: b.height };
      } catch { /* Detached already. */ }
      if (!before) return false;
      let size: { width: number; height: number };
      try {
        size = placeholderRectPoints({ width: spec.width, height: spec.height }, before.height);
      } catch {
        return false;
      }
      const after = {
        x: before.x + (before.width - size.width) / 2,
        y: before.y,
        width: size.width,
        height: size.height,
      };
      try {
        item.bounds = new this.scope.Rectangle(
          new this.scope.Point(after.x, after.y),
          new this.scope.Size(after.width, after.height),
        );
      } catch {
        return false;
      }
      area.requiredPx = { width: spec.width, height: spec.height };
      if (spec.decorationMethod !== undefined) area.decorationMethod = spec.decorationMethod;
      area.rect = { ...after };
      try {
        area.scale = exportScaleForArea(area.rect, area.requiredPx);
      } catch {
        return false;
      }
      this.history.recordBounds('Switch garment variant', item, before, after);
    }
    try {
      validatePrintifyGarment(next);
    } catch {
      return false;
    }
    try {
      outline.data[PRINTIFY_GARMENT_RECORD_KEY] = next;
    } catch {
      return false;
    }
    this.documentManager.markEdited('scene');
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Set one area's dimensions in document points, anchored at the center.
   * Undoable through the same bounds entry as handle resizing. */
  setPrintifyAreaSize(garmentId: string, position: string, width: number, height: number): boolean {
    const item = this.garmentAreaItemByPosition(garmentId, position);
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
    this.history.recordBounds('Resize garment area', item, before, after);
    this.documentManager.markEdited('scene');
    this.updateTextContent(); this.notify();
    return true;
  }

  deletePrintifyGarment(id: string): boolean {
    const outline = this.garmentOutlineById(id);
    if (!outline || this.isLiveDrawing) return false;
    const record = readPrintifyGarment(outline);
    const areas = record
      ? record.areas.map((area) => this.garmentAreaItem(id, area.id)).filter((item) => !!item)
      : [];
    const before = this.contentItems();
    const selBefore = [...this.selectedItems];
    for (const item of [outline, ...areas]) {
      this.removeItemFromSelection(item as AnyItem);
      try { (item as AnyItem).remove(); } catch { /* Detached already. */ }
    }
    this.history.recordDelete(before, selBefore);
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Artwork contained in or intersecting one garment area. */
  garmentAreaArtworkCount(garmentId: string, position: string): number {
    const item = this.garmentAreaItemByPosition(garmentId, position);
    if (!item) return 0;
    let box: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const b = item.bounds;
      if (b && b.width > 0 && b.height > 0) box = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch { /* Detached already. */ }
    if (!box) return 0;
    const layer = this.layers.activeLayer;
    if (!layer) return 0;
    try {
      return garmentAreaArtwork(box, [...layer.children]).length;
    } catch {
      return 0;
    }
  }

  /** Live bounds of one garment area in document points. */
  garmentAreaBox(garmentId: string, position: string): ExportFrameBox | null {
    const item = this.garmentAreaItemByPosition(garmentId, position);
    if (!item) return null;
    try {
      const b = item.bounds;
      if (!b || !(b.width > 0) || !(b.height > 0)) return null;
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
      return null;
    }
  }

  /** Export one area as SVG cropped to its box. Live artwork is never
   * clipped or modified. Needs DOM; null when unavailable. */
  garmentAreaSVG(garmentId: string, position: string): { box: ExportFrameBox; svg: string } | null {
    const box = this.garmentAreaBox(garmentId, position);
    if (!box) return null;
    const svg = this.exportBoxSVG(box);
    return svg ? { box: { ...box }, svg } : null;
  }

  /** Export one area as PNG at its exact required Printify pixels. Needs
   * DOM (Image + canvas); null when rasterization is unavailable. */
  async garmentAreaPNG(garmentId: string, position: string): Promise<{ box: ExportFrameBox; blob: Blob } | null> {
    const outline = this.garmentOutlineById(garmentId);
    const record = outline ? this.liveGarmentRecord(outline) : null;
    const output = this.garmentAreaSVG(garmentId, position);
    const area = record?.areas.find((candidate) => candidate.position === position);
    if (!record || !output || !area) return null;
    const blob = await rasterizeSvgToPng(
      output.svg, exportPngSizeForArea(output.box, area.scale), null);
    if (!blob) return null;
    return { box: { ...output.box }, blob };
  }

  private blobToBase64(blob: Blob): Promise<string | null> {
    if (typeof FileReader === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (): void => {
          try {
            const url = reader.result;
            if (typeof url !== 'string' || !url.includes(',')) {
              resolve(null);
              return;
            }
            resolve(url.slice(url.indexOf(',') + 1));
          } catch {
            resolve(null);
          }
        };
        reader.onerror = (): void => resolve(null);
        reader.readAsDataURL(blob);
      } catch {
        resolve(null);
      }
    });
  }

  /** Render one area to PNG and wrap it as a Printify upload payload.
   * Null when rasterization is unavailable (headless). */
  async printifyAreaUploadPayload(
    garmentId: string,
    position: string,
  ): Promise<{ fileName: string; base64: string } | null> {
    const outline = this.garmentOutlineById(garmentId);
    const record = outline ? this.liveGarmentRecord(outline) : null;
    if (!record) return null;
    const rendered = await this.garmentAreaPNG(garmentId, position);
    if (!rendered) return null;
    const base64 = await this.blobToBase64(rendered.blob);
    if (!base64) return null;
    const payload = uploadPayloadForArea(record.name, position, base64);
    return { fileName: payload.file_name, base64: payload.contents };
  }

  // --- Printify account (token memory-only, shop id persisted) ---
  /** Store the personal access token for this session. Never persisted:
   * settings snapshots and document JSON can never carry it. */
  setPrintifyToken(token: string): boolean {
    if (typeof token !== 'string' || token.trim().length === 0) return false;
    this.printifyToken = token.trim();
    return true;
  }

  clearPrintifyToken(): void {
    this.printifyToken = '';
  }

  hasPrintifyToken(): boolean {
    return this.printifyToken.length > 0;
  }

  setPrintifyShopId(shopId: string): void {
    this.printifyShopId = typeof shopId === 'string' ? shopId.trim() : '';
    this.updateTextContent(); this.notify();
  }

  private printifyTokenOrThrow(): string {
    if (!this.printifyToken) throw new Error('Printify token is not set');
    return this.printifyToken;
  }

  private printifyShopIdOrThrow(): string {
    if (!this.printifyShopId) throw new Error('Printify shop id is not set');
    return this.printifyShopId;
  }

  /** List available blueprints (shirts etc.) from the Printify catalog. */
  async fetchPrintifyBlueprints(): Promise<unknown> {
    return printifyFetch('/catalog/blueprints.json', this.printifyTokenOrThrow());
  }

  /** List variants + placeholders for one blueprint + print provider. */
  async fetchPrintifyVariants(blueprintId: number, printProviderId: number): Promise<unknown> {
    if (!Number.isSafeInteger(blueprintId) || blueprintId <= 0) {
      return Promise.reject(new Error('blueprintId: expected positive integer'));
    }
    if (!Number.isSafeInteger(printProviderId) || printProviderId <= 0) {
      return Promise.reject(new Error('printProviderId: expected positive integer'));
    }
    return printifyFetch(
      `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
      this.printifyTokenOrThrow(),
    );
  }

  /** Upload one rendered area; resolves to the Printify image id. */
  async uploadPrintifyArea(garmentId: string, position: string): Promise<string> {
    const token = this.printifyTokenOrThrow();
    const rendered = await this.printifyAreaUploadPayload(garmentId, position);
    if (!rendered) throw new Error('Area rasterization unavailable');
    const json = await printifyFetch('/uploads.json', token, {
      method: 'POST',
      body: { file_name: rendered.fileName, contents: rendered.base64 },
    }) as { id?: unknown };
    if (!json || typeof json.id !== 'string' || json.id.length === 0) {
      throw new Error('Printify upload returned no image id');
    }
    return json.id;
  }

  /** Create a shop product wiring each garment area to its uploaded image.
   * Caches the returned mockup image urls by product id for preview. */
  async createPrintifyProduct(
    garmentId: string,
    uploadsByPosition: Record<string, string>,
    opts?: { title?: string; description?: string; priceCents?: number },
  ): Promise<unknown> {
    const token = this.printifyTokenOrThrow();
    const shopId = this.printifyShopIdOrThrow();
    const outline = this.garmentOutlineById(garmentId);
    const record = outline ? this.liveGarmentRecord(outline) : null;
    if (!record) throw new Error('Unknown garment');
    const payload = productPayloadForGarment(record, uploadsByPosition, opts);
    const json = await printifyFetch(`/shops/${shopId}/products.json`, token, {
      method: 'POST',
      body: payload,
    }) as { id?: unknown; images?: unknown };
    this.cachePrintifyMockups(json);
    return json;
  }

  /** Refresh one product (mockups included) and cache its mockup urls. */
  async fetchPrintifyProduct(productId: string): Promise<unknown> {
    if (typeof productId !== 'string' || productId.length === 0) {
      throw new Error('productId: expected non-empty string');
    }
    const json = await printifyFetch(
      `/shops/${this.printifyShopIdOrThrow()}/products/${productId}.json`,
      this.printifyTokenOrThrow(),
    ) as { id?: unknown; images?: unknown };
    const id = typeof json?.id === 'string' && json.id ? json.id : productId;
    this.cachePrintifyMockups({ ...json, id });
    return json;
  }

  private cachePrintifyMockups(product: { id?: unknown; images?: unknown }): void {
    try {
      if (!product || typeof product.id !== 'string' || !Array.isArray(product.images)) return;
      const srcs = (product.images as unknown[])
        .map((image) => (image as { src?: unknown }).src)
        .filter((src): src is string => typeof src === 'string' && src.length > 0);
      this.printifyMockups.set(product.id, srcs);
    } catch { /* Preview cache is best-effort. */ }
  }

  /** Last fetched mockup image urls for a product, or null when unknown. */
  printifyProductMockups(productId: string): string[] | null {
    const cached = this.printifyMockups.get(productId);
    return cached ? [...cached] : null;
  }

  /** Blank-product template urls stored on the garment record. */
  printifyTemplatesFor(garmentId: string): string[] | null {
    const record = this.getPrintifyGarment(garmentId);
    return record ? [...record.templateSrcs] : null;
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

  // --- Arrange (Slice 4) -------------------------------------------------
  // Align/distribute translate the top-level selection by the pure
  // deltas from geometry/arrange.ts, committed as one labelled move
  // entry. Flip mirrors through TransformManager (own-inverse affine).

  private applyArrangeDeltas(label: string, deltas: Array<{ x: number; y: number }>): boolean {
    const items = this.topLevelSelected();
    if (!items.length || items.length !== deltas.length) return false;
    const entries: Array<{ item: AnyItem; before: AnyItem; after: AnyItem }> = [];
    items.forEach((item, i) => {
      const delta = deltas[i];
      if (!delta || (delta.x === 0 && delta.y === 0) || !item.position) return;
      const before = item.position.clone();
      item.position = item.position.add(new this.scope.Point(delta.x, delta.y));
      shiftCircleOrigins(item, delta.x, delta.y);
      entries.push({ item, before, after: item.position.clone() });
    });
    if (!entries.length) return false;
    this.history.recordMove(entries, undefined, label);
    this.selection.refreshCentroids();
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
  }

  alignSelection(mode: AlignMode, target: 'selection' | 'document'): boolean {
    const items = this.topLevelSelected();
    if (!items.length) return false;
    const bounds = items.map((item) => ({
      x: item.bounds.x, y: item.bounds.y, width: item.bounds.width, height: item.bounds.height,
    }));
    const labels: Record<AlignMode, string> = {
      left: 'Align Left', centerX: 'Align Centre', right: 'Align Right',
      top: 'Align Top', centerY: 'Align Middle', bottom: 'Align Bottom',
    };
    if (target === 'selection') {
      return this.applyArrangeDeltas(labels[mode], alignToSelectionDeltas(bounds, mode));
    }
    const reference = this.pageRect() ?? this.artworkRect();
    if (!reference) return false;
    return this.applyArrangeDeltas(`${labels[mode]} to Document`, computeAlignDeltas(bounds, mode, reference));
  }

  distributeSelection(axis: DistributeAxis): boolean {
    const items = this.topLevelSelected();
    if (items.length < 3) return false;
    const bounds = items.map((item) => ({
      x: item.bounds.x, y: item.bounds.y, width: item.bounds.width, height: item.bounds.height,
    }));
    return this.applyArrangeDeltas(
      axis === 'horizontal' ? 'Distribute Horizontally' : 'Distribute Vertically',
      computeDistributeDeltas(bounds, axis),
    );
  }

  flipSelection(axis: 'horizontal' | 'vertical'): void {
    if (!this.topLevelSelected().length) return;
    this.transforms.flip(axis === 'horizontal');
    this.documentManager.markEdited('scene');
    this.updateTextContent();
    this.notify();
  }

  // --- Eyedropper --------------------------------------------------------
  // One-shot: the next canvas press samples the topmost content item
  // under the point — fill/stroke from its paint, or a raster's
  // average colour around the point — into the current fill/stroke.

  eyedropperActive = false;

  setEyedropperActive(active: boolean): void {
    this.eyedropperActive = active;
    this.notify();
  }

  /** Pointer hook (PointerController): true when the press sampled. */
  eyedropperDown(point: AnyItem): boolean {
    if (!this.eyedropperActive || !point) return false;
    this.eyedropperActive = false;
    const picked = this.pickEyedropperColor({ x: point.x, y: point.y });
    if (picked) {
      if (picked.fill) this.setFillColor(picked.fill);
      if (picked.stroke) this.setStrokeColor(picked.stroke);
      this.lastDropNote = picked.stroke && picked.fill
        ? `Eyedropper: fill ${picked.fill}, stroke ${picked.stroke}.`
        : `Eyedropper: ${picked.fill ? `fill ${picked.fill}` : `stroke ${picked.stroke}`}.`;
    } else {
      this.lastDropNote = 'Eyedropper: nothing to sample there.';
    }
    this.updateTextContent();
    this.notify();
    return true;
  }

  /** Sample colours at a global point from the topmost content item. */
  pickEyedropperColor(point: { x: number; y: number }): { fill: string | null; stroke: string | null } | null {
    const probe = new this.scope.Point(point.x, point.y);
    const items = this.allContentItems();
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (!item || item.visible === false || item.locked) continue;
      let hit: AnyItem = null;
      try {
        hit = item.hitTest(probe, { fill: true, stroke: true, segments: false, tolerance: 2 });
      } catch { hit = null; }
      if (!hit && item.className !== 'Raster') continue;
      const target = (hit?.item ?? item) as AnyItem;
      const raster = target.className === 'Raster' ? target : (item.className === 'Raster' ? item : null);
      if (raster) {
        try {
          const local = raster.globalToLocal(probe.clone());
          const color = raster.getAverageColor(local);
          if (color) return { fill: color.toCSS('hex'), stroke: null };
        } catch { /* Fall through to paint. */ }
      }
      const fill = target.fillColor ? target.fillColor.toCSS('hex') : null;
      const stroke = target.strokeColor ? target.strokeColor.toCSS('hex') : null;
      if (fill || stroke) return { fill, stroke };
    }
    return null;
  }

  // --- Point editing (direct selection) --------------------------------
  // One session edits one deposited path: anchors and handles show
  // as overlays, drags and the §PATH KEYS operations each commit a
  // single history entry, and every commit writes the geometry back
  // to the retained source (lowered to plain Bézier) and to the
  // catalog record when the item is a model drawable — a shape
  // edited at point level becomes a path, per the model bridge.

  get isPointEditActive(): boolean { return this.pointEdit?.active ?? false; }

  /** The path item under point editing, or null. */
  get pointEditTarget(): AnyItem { return this.pointEdit?.target ?? null; }

  togglePointEdit(): boolean {
    if (this.pointEdit?.active) {
      this.exitPointEdit();
      return false;
    }
    const target = this.topLevelSelected().find(
      (item) => item.className === 'Path' || item.className === 'CompoundPath',
    );
    if (!target) return false;
    return this.enterPointEdit(target);
  }

  enterPointEdit(item: AnyItem): boolean {
    if (!item || (item.className !== 'Path' && item.className !== 'CompoundPath')) return false;
    if (!this.pointEdit) {
      this.pointEdit = new PointEditSession({
        scope: this.scope,
        mountOverlay: (overlay) => this.mountGuideItem(overlay),
        removeOverlay: (overlay) => this.unmountGuideItem(overlay),
        commit: (label, target, before, after) => this.commitPointEdit(label, target, before, after),
        notify: () => this.notify(),
      });
    }
    const ok = this.pointEdit.attach(item);
    if (ok) this.notify();
    return ok;
  }

  exitPointEdit(): void {
    this.pointEdit?.detach();
    this.notify();
  }

  private commitPointEdit(label: string, item: AnyItem, before: ContourSnapshot[], after: ContourSnapshot[]): void {
    const apply = (snapshots: ContourSnapshot[]): void => {
      applyPointSnapshots(this.scope, item, snapshots);
      this.writeBackPointEdit(item);
      this.pointEdit?.refreshOverlay();
    };
    this.history.push({
      label,
      undo: () => apply(before),
      redo: () => apply(after),
    });
    this.writeBackPointEdit(item);
    this.documentManager.markEdited('scene');
    this.notify();
  }

  /** After a segment edit, the item's retained source is its current
   * geometry as plain Bézier (semantic intent is replaced, exactly
   * as getRetainedPathDrawable already exposes it), and a catalog
   * drawable of kind path/shape is rewritten as a path record. An
   * item with neither gets a retained record so the edit persists. */
  private writeBackPointEdit(item: AnyItem): void {
    try {
      const id = typeof item.data?.drawableId === 'string' ? item.data.drawableId : null;
      if (id) {
        const retained = this.scene.records.get(id);
        if (retained && retained.item === item) {
          retained.source = this.scene.bezierSource(item, retained.source.id);
          retained.geometryKey = this.scene.pathGeometryKey(item);
        }
        if (this.catalog.has(id)) {
          const existing = this.catalog.get(id);
          const pageId = this.catalog.pageOf(id);
          if (existing && pageId && (existing.kind === 'path' || existing.kind === 'shape')) {
            const sourceId = existing.kind === 'path' ? existing.source.id : existing.id;
            this.catalog.upsert(pageId, {
              ...existing,
              kind: 'path',
              source: this.scene.bezierSource(item, sourceId),
            } as never);
          }
        }
      } else if (item.className === 'Path' || item.className === 'CompoundPath') {
        this.scene.retain(item);
      }
    } catch { /* Write-back must never break the edit itself. */ }
    this.scene.pruneRecords();
  }

  private pointTolerance(): number {
    try { return 8 / (this.scope.view?.zoom ?? 1); } catch { return 8; }
  }

  /** Pointer hooks (PointerController): true when the session took
   * the press/drag. Anchor drags move the point, handle drags move
   * the handle (Alt breaks coupling / moves the edge from an anchor). */
  pointEditDown(point: AnyItem, alt: boolean): boolean {
    if (!this.pointEdit?.active || !point) return false;
    return this.pointEdit.pointerDown({ x: point.x, y: point.y }, this.pointTolerance(), alt);
  }

  pointEditDrag(point: AnyItem): boolean {
    if (!this.pointEdit?.dragging || !point) return false;
    return this.pointEdit.pointerDrag({ x: point.x, y: point.y });
  }

  pointEditUp(): boolean {
    if (!this.pointEdit?.dragging) return false;
    return this.pointEdit.pointerUp();
  }

  /** Select Point key-click: select the anchor/handle at the cursor. */
  selectPointAtCursor(): boolean {
    if (!this.pointEdit?.active || !this.mousePt) return false;
    return this.pointEdit.selectAt({ x: this.mousePt.x, y: this.mousePt.y }, this.pointTolerance());
  }

  cyclePointSelection(dir: 1 | -1 = 1): boolean {
    return this.pointEdit?.selectNext(dir) ?? false;
  }

  pointEditInsertPointAtCursor(): boolean {
    if (!this.pointEdit?.active || !this.mousePt) return false;
    return this.pointEdit.insertPointAt({ x: this.mousePt.x, y: this.mousePt.y });
  }

  pointEditDeleteSelectedPoint(): boolean {
    return this.pointEdit?.deleteSelectedPoint() ?? false;
  }

  pointEditConvertSelected(to: 'corner' | 'smooth'): boolean {
    return this.pointEdit?.convertSelected(to) ?? false;
  }

  pointEditClosePath(): boolean {
    return this.pointEdit?.closeSelectedContour() ?? false;
  }

  /**
   * Join: stitch the edited open path to the nearest other open
   * path in the active layer, endpoint to endpoint, choosing the
   * orientation (end-to-end, end-to-start, start-to-start) by the
   * closest endpoint pair. The other path is consumed; the join is
   * one history entry whose undo restores both paths.
   */
  pointEditJoin(): boolean {
    const session = this.pointEdit;
    if (!session?.active) return false;
    const mine = session.target as AnyItem;
    const myContour = session.contourSnapshot(0);
    if (!myContour || myContour.closed || myContour.segments.length === 0) return false;
    const first = myContour.segments[0].point;
    const last = myContour.segments[myContour.segments.length - 1].point;
    let best: { item: AnyItem; contour: ContourSnapshot; mode: 'ee' | 'es' | 'ss' | 'se'; dist: number } | null = null;
    for (const other of this.contentItems()) {
      if (other === mine || (other.className !== 'Path' && other.className !== 'CompoundPath')) continue;
      const contour = snapshotPointItem(other)[0];
      if (!contour || contour.closed || contour.segments.length === 0) continue;
      const oFirst = contour.segments[0].point;
      const oLast = contour.segments[contour.segments.length - 1].point;
      const candidates = [
        { mode: 'ee' as const, dist: Math.hypot(last.x - oLast.x, last.y - oLast.y) },
        { mode: 'es' as const, dist: Math.hypot(last.x - oFirst.x, last.y - oFirst.y) },
        { mode: 'ss' as const, dist: Math.hypot(first.x - oFirst.x, first.y - oFirst.y) },
        { mode: 'se' as const, dist: Math.hypot(first.x - oLast.x, first.y - oLast.y) },
      ];
      for (const candidate of candidates) {
        if (!best || candidate.dist < best.dist) {
          best = { item: other, contour, mode: candidate.mode, dist: candidate.dist };
        }
      }
    }
    if (!best) return false;
    const chosen = best;
    const mergedSegments = chosen.mode === 'ee'
      ? joinPointEndToEnd(myContour.segments, chosen.contour.segments)
      : chosen.mode === 'ss'
        ? joinPointStartToStart(myContour.segments, chosen.contour.segments)
        : chosen.mode === 'se'
          ? joinPointEndToEnd(chosen.contour.segments, myContour.segments)
          : joinPointContours(myContour.segments, chosen.contour.segments);
    const beforeMine = snapshotPointItem(mine);
    const afterMine = [{ closed: false, segments: mergedSegments }];
    const otherParent = chosen.item.parent as AnyItem;
    const otherIndex = typeof chosen.item.index === 'number' ? chosen.item.index : -1;
    const applyJoin = (): void => {
      applyPointSnapshots(this.scope, mine, afterMine);
      try { chosen.item.remove(); } catch { /* Detached. */ }
      this.writeBackPointEdit(mine);
      session.refreshOverlay();
    };
    const undoJoin = (): void => {
      applyPointSnapshots(this.scope, mine, beforeMine);
      try {
        if (otherParent && otherIndex >= 0) otherParent.insertChild(otherIndex, chosen.item);
        else this.layers.activeLayer.addChild(chosen.item);
      } catch { /* Detached. */ }
      this.writeBackPointEdit(mine);
      session.refreshOverlay();
    };
    applyJoin();
    this.history.push({ label: 'Join Paths', undo: undoJoin, redo: applyJoin });
    this.scene.pruneRecords();
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
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
      (line as any).guide = true;
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
      if (ok) {
        this.pruneStaleContentLayers();
        this.layers.syncWithProject(readSceneLayers(blob));
        const savedActive = readSceneActiveLayerId(blob);
        if (savedActive) {
          const mapped = this.layers.layerIdForRecordFlag(savedActive);
          if (mapped) this.layers.setActiveLayer(mapped);
        }
        this.restoreSceneView(view);
        this.pageGuides = readSceneGuides(blob);
        const storedSetup = readScenePrintSetup(blob);
        if (storedSetup) this.printSetupState = storedSetup;
        this.renderGuides();
      }
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

  // --- Pages (Tier Two) ------------------------------------------------
  // Each page is a distinct scene: its own layers, items and guides,
  // sharing the document's settings. Only the active page is loaded
  // into the Paper project; the others live as native page records
  // in pageSnapshots. Switching snapshots the live page and loads
  // the target record through the same restore path as Open.

  /** Page ids in document order. A document whose single page was
   * never dimensioned still reports its implicit page. */
  private documentPageIds(): string[] {
    const listed = this.documentManager.pageList.map((page) => page.id);
    if (listed.length > 0) return listed;
    return [this.documentManager.currentPageId ?? 'page-1'];
  }

  listPages(): Array<{
    id: string; name: string; active: boolean;
    widthPt: number | null; heightPt: number | null;
  }> {
    const activeId = this.documentManager.currentPageId ?? 'page-1';
    return this.documentPageIds().map((id) => {
      const listed = this.documentManager.pageList.find((page) => page.id === id);
      const snapshot = this.pageSnapshots.get(id);
      return {
        id,
        name: this.documentManager.pageList.length > 0
          ? this.documentManager.pageName(id)
          : (snapshot?.name ?? 'Page 1'),
        active: id === activeId,
        widthPt: listed?.widthPt ?? snapshot?.page?.widthPt ?? null,
        heightPt: listed?.heightPt ?? snapshot?.page?.heightPt ?? null,
      };
    });
  }

  /** Snapshot the live (active) page as a native page record. */
  private snapshotActivePage(): NativePageRecord | null {
    const scene = this.exportScene();
    if (!scene) return null;
    const pageId = this.documentManager.currentPageId ?? 'page-1';
    const drawables = structuredClone(this.catalog.ordered(pageId));
    const catalogIds = new Set(drawables.map((drawable) => drawable.id));
    const retainedPaths: NGPathDrawable[] = [];
    for (const id of this.scene.records.keys()) {
      if (catalogIds.has(id)) continue;
      const retained = this.getRetainedPathDrawable(id);
      if (retained) retainedPaths.push(retained);
    }
    const page = this.documentManager.pageSettings;
    return {
      id: pageId,
      name: this.listPages().find((entry) => entry.id === pageId)?.name ?? 'Page',
      page: {
        widthPt: page.widthPt,
        heightPt: page.heightPt,
        orientation: page.orientation,
        unit: page.unit,
      },
      layers: this.listLayers().map((record): NativeLayerRecord => {
        const out: NativeLayerRecord = { id: record.id, name: record.name };
        if (typeof record.visible === 'boolean') out.visible = record.visible;
        if (typeof record.locked === 'boolean') out.locked = record.locked;
        if (typeof record.opacity === 'number') out.opacity = record.opacity;
        return out;
      }),
      activeLayerId: this.activeLayerId(),
      drawables,
      retainedPaths,
      scene,
      guides: structuredClone(this.pageGuides),
    };
  }

  /** Load a page record as the active page. The record's scene goes
   * through replaceScene (layers + view restored), then its catalog
   * drawables, retained sources and guides land. */
  private loadPageRecord(record: NativePageRecord, label: string): boolean {
    if (!this.replaceScene(label, record.scene, { history: false })) return false;
    try {
      this.catalog.clearPage(record.id);
      for (const drawable of record.drawables) this.catalog.upsert(record.id, structuredClone(drawable));
    } catch { /* A bad model section must not strand the artwork. */ }
    for (const retained of record.retainedPaths) {
      const item = this.itemByDrawableId(retained.id);
      if (item) {
        this.scene.records.set(retained.id, {
          source: structuredClone(retained.source),
          item,
          geometryKey: this.scene.pathGeometryKey(item),
        });
      }
    }
    this.pageGuides = structuredClone(record.guides ?? []);
    // Layer presentation state rides the page record (v6): the scene
    // restore rebuilt the registry in record order, so apply each
    // record's state to the registry entry at the same position.
    const registry = this.layers.listLayers();
    record.layers.forEach((layer, i) => {
      const target = registry[i];
      if (!target) return;
      if (typeof layer.visible === 'boolean') this.layers.setLayerVisible(target.id, layer.visible);
      if (typeof layer.locked === 'boolean') this.layers.setLayerLocked(target.id, layer.locked);
      if (typeof layer.opacity === 'number') this.layers.setLayerOpacity(target.id, layer.opacity);
    });
    this.documentManager.setActivePage(record.id);
    this.renderGuides();
    this.updateTextContent();
    return true;
  }

  /** Switch the active page, snapshotting the page being left. */
  switchPage(id: string): boolean {
    const activeId = this.documentManager.currentPageId ?? 'page-1';
    if (id === activeId) return true;
    if (!this.documentPageIds().includes(id)) return false;
    const target = this.pageSnapshots.get(id);
    if (!target) return false;
    const current = this.snapshotActivePage();
    if (!current) return false;
    this.pageSnapshots.set(activeId, current);
    this.pageSnapshots.delete(id);
    if (!this.loadPageRecord(target, `Page ${target.name}`)) {
      this.pageSnapshots.set(id, target);
      return false;
    }
    this.notify();
    return true;
  }

  /** Add a blank page (same size as the active page, or US Letter)
   * and switch to it. Returns the new page id. */
  addPage(): string {
    const activeId = this.documentManager.currentPageId ?? 'page-1';
    const settings = this.documentManager.pageSettings;
    const widthPt = settings.widthPt ?? 612;
    const heightPt = settings.heightPt ?? 792;
    const unit = settings.unit ?? 'pt';
    // Register the implicit first page so the new page gets a fresh id.
    if (this.documentManager.pageList.length === 0) {
      this.documentManager.ensurePage(activeId, widthPt, heightPt, unit);
      if (settings.widthPt === null) {
        // The implicit page was unbounded; keep it unbounded in the
        // record by restoring the no-size state is not representable
        // in DrawingPage, so the registered size stands (harmless:
        // it matches the fallback the rulers already used).
      }
    }
    const current = this.snapshotActivePage();
    if (current) this.pageSnapshots.set(activeId, current);
    const created = this.documentManager.addPage(widthPt, heightPt, unit);
    const blankScene = encodeSceneDocument(
      [],
      [{ id: `paper-layer-${created.id}`, name: 'Layer 1' }],
      null,
      `paper-layer-${created.id}`,
      {},
    );
    const record: NativePageRecord = {
      id: created.id,
      name: this.documentManager.pageName(created.id),
      page: { widthPt, heightPt, orientation: created.orientation, unit },
      layers: [{ id: `paper-layer-${created.id}`, name: 'Layer 1' }],
      activeLayerId: `paper-layer-${created.id}`,
      drawables: [],
      retainedPaths: [],
      scene: blankScene,
      guides: [],
    };
    this.loadPageRecord(record, `Page ${record.name}`);
    this.documentManager.markEdited('page');
    this.notify();
    return created.id;
  }

  /** Duplicate a page (content included) and switch to the copy. */
  duplicatePage(id: string): string | null {
    const activeId = this.documentManager.currentPageId ?? 'page-1';
    let source: NativePageRecord | null = null;
    if (id === activeId) {
      source = this.snapshotActivePage();
      if (source) this.pageSnapshots.set(id, source);
    } else {
      source = this.pageSnapshots.get(id) ?? null;
    }
    if (!source) return null;
    if (this.documentManager.pageList.length === 0) {
      const settings = this.documentManager.pageSettings;
      this.documentManager.ensurePage(id, settings.widthPt ?? 612, settings.heightPt ?? 792, settings.unit ?? 'pt');
    }
    const created = this.documentManager.duplicatePage(id);
    if (!created) return null;
    const copy: NativePageRecord = {
      ...structuredClone(source),
      id: created.id,
      name: this.documentManager.pageName(created.id),
      page: { widthPt: created.widthPt, heightPt: created.heightPt, orientation: created.orientation, unit: created.unit },
    };
    this.pageSnapshots.set(created.id, copy);
    this.switchPage(created.id);
    this.notify();
    return created.id;
  }

  /** Delete a page and its content. The last page cannot go. */
  deletePage(id: string): boolean {
    if (this.documentPageIds().length <= 1) return false;
    const activeId = this.documentManager.currentPageId ?? 'page-1';
    this.pageSnapshots.delete(id);
    if (!this.documentManager.removePage(id)) {
      // The page may only exist as an implicit/snapshot page.
      if (id !== activeId) return true;
      return false;
    }
    if (id === activeId) {
      const nextId = this.documentManager.currentPageId;
      if (!nextId) return false;
      const target = this.pageSnapshots.get(nextId);
      if (target) {
        this.pageSnapshots.delete(nextId);
        this.loadPageRecord(target, `Page ${target.name}`);
      } else {
        this.pageGuides = [];
        this.renderGuides();
      }
    }
    this.documentManager.markEdited('page');
    this.notify();
    return true;
  }

  renamePage(id: string, name: string): boolean {
    const snapshot = this.pageSnapshots.get(id);
    if (snapshot && name.trim()) snapshot.name = name.trim();
    const ok = this.documentManager.pageList.length > 0
      ? this.documentManager.renamePage(id, name)
      : !!snapshot;
    if (ok) this.notify();
    return ok;
  }

  movePage(id: string, dir: 'up' | 'down'): boolean {
    const ok = this.documentManager.movePage(id, dir);
    if (ok) this.notify();
    return ok;
  }

  // --- Guides (Tier Two) ----------------------------------------------
  // Guides live on the active page, render onto the guide layer, act
  // as snap targets alongside points and paths, and persist in the
  // scene payload and the native file.

  listGuides(): GuideRecord[] { return this.pageGuides.map((guide) => ({ ...guide })); }

  /** Guide visibility: hidden guides still exist on the page and are
   * still listed in the panel; only their canvas lines (and direct
   * canvas grabs) turn off. Independent of guide snapping. */
  guidesVisible = true;

  setGuidesVisible(v: boolean): void {
    const on = !!v;
    if (on === this.guidesVisible) return;
    this.guidesVisible = on;
    this.renderGuides();
    this.notify();
  }

  /** Guide snapping: when off, the guide-snap path never moves a point.
   * Independent of guide visibility — visible guides need not snap, and
   * hidden guides still snap while this stays on. */
  guideSnapping = true;

  setGuideSnapping(v: boolean): void {
    const on = !!v;
    if (on === this.guideSnapping) return;
    this.guideSnapping = on;
    this.notify();
  }

  private nextGuideId(): string {
    let id = '';
    do {
      this.guideSeq += 1;
      id = `guide-${this.guideSeq}`;
    } while (this.pageGuides.some((guide) => guide.id === id));
    return id;
  }

  addGuide(axis: 'x' | 'y', position: number): GuideRecord {
    const guide = createGuide(this.nextGuideId(), axis, position);
    this.pageGuides = [...this.pageGuides, guide];
    this.documentManager.markEdited('scene');
    this.renderGuides();
    this.notify();
    return { ...guide };
  }

  moveGuide(id: string, position: number): boolean {
    const guide = this.pageGuides.find((entry) => entry.id === id);
    if (!guide) return false;
    const moved = moveGuideRecord(guide, position);
    if (moved === guide) return false;
    this.pageGuides = this.pageGuides.map((entry) => (entry.id === id ? moved : entry));
    this.documentManager.markEdited('scene');
    this.renderGuides();
    this.notify();
    return true;
  }

  removeGuide(id: string): boolean {
    const next = removeGuideRecord(this.pageGuides, id);
    if (next.length === this.pageGuides.length) return false;
    this.pageGuides = next;
    this.documentManager.markEdited('scene');
    this.renderGuides();
    this.notify();
    return true;
  }

  setGuideLocked(id: string, locked: boolean): boolean {
    const guide = this.pageGuides.find((entry) => entry.id === id);
    if (!guide) return false;
    this.pageGuides = this.pageGuides.map((entry) => (entry.id === id ? setGuideLockedRecord(entry, locked) : entry));
    this.renderGuides();
    this.notify();
    return true;
  }

  clearGuides(): void {
    if (this.pageGuides.length === 0) return;
    this.pageGuides = [];
    this.documentManager.markEdited('scene');
    this.renderGuides();
    this.notify();
  }

  /** Snap threshold for guides, in document points (~8 screen px). */
  private guideSnapThreshold(): number {
    const zoom = this.zoomLevel;
    return Number.isFinite(zoom) && zoom > 0 ? 8 / zoom : 8;
  }

  private snapPointToGuides(point: AnyItem): AnyItem {
    if (!point || !this.guideSnapping || this.pageGuides.length === 0) return point;
    const result = snapToGuides({ x: point.x, y: point.y }, this.pageGuides, this.guideSnapThreshold());
    if (!result.snappedX && !result.snappedY) return point;
    return new this.scope.Point(result.point.x, result.point.y);
  }

  /** Begin dragging a new guide out of a ruler. The guide is created
   * at the press position and follows dragGuideTo until endGuideDrag. */
  beginGuideDragFromRuler(axis: 'x' | 'y', point: AnyItem): boolean {
    if (!point || !Number.isFinite(axis === 'x' ? point.x : point.y)) return false;
    // Dragging a new guide out of a ruler is a request to see it.
    if (!this.guidesVisible) this.setGuidesVisible(true);
    const guide = this.addGuide(axis, axis === 'x' ? point.x : point.y);
    this.guideDrag = { id: guide.id, creating: true };
    return true;
  }

  /** Coordinate form of beginGuideDragFromRuler for DOM callers
   * (the ruler overlay works in client pixels, not Paper points). */
  beginGuideDragFromRulerAt(axis: 'x' | 'y', x: number, y: number): boolean {
    return this.beginGuideDragFromRuler(axis, new this.scope.Point(x, y));
  }

  /** Coordinate form of dragGuideTo for DOM callers. */
  dragGuideToCoords(x: number, y: number): void {
    this.dragGuideTo(new this.scope.Point(x, y));
  }

  /** Begin dragging the existing guide nearest a canvas press.
   * Returns true when a guide was grabbed (the press is consumed). */
  beginGuideDragAt(point: AnyItem): boolean {
    if (!point || !this.guidesVisible || this.pageGuides.length === 0) return false;
    const guide = guideAtPoint({ x: point.x, y: point.y }, this.pageGuides, this.guideSnapThreshold());
    if (!guide) return false;
    this.guideDrag = { id: guide.id, creating: false };
    return true;
  }

  dragGuideTo(point: AnyItem): void {
    if (!this.guideDrag || !point) return;
    const guide = this.pageGuides.find((entry) => entry.id === this.guideDrag?.id);
    if (!guide) return;
    const moved = moveGuideRecord(guide, guide.axis === 'x' ? point.x : point.y);
    if (moved === guide) return;
    this.pageGuides = this.pageGuides.map((entry) => (entry.id === guide.id ? moved : entry));
    this.renderGuides();
  }

  endGuideDrag(): void {
    if (!this.guideDrag) return;
    this.guideDrag = null;
    this.documentManager.markEdited('scene');
    this.notify();
  }

  get isGuideDragging(): boolean { return this.guideDrag !== null; }

  /** Draw the active page's guides (and the print-setup preview
   * overlay when enabled) onto the guide layer. Lines span the page
   * rect, or the artwork/view when unbounded, padded generously. */
  renderGuides(): void {
    try {
      const layer = this.ensureGuideLayer();
      for (const child of [...(layer.children ?? [])] as AnyItem[]) {
        if (child?.data?.guideId || child?.data?.printSetupOverlay) {
          try { child.remove(); } catch { /* Detached already. */ }
        }
      }
      const page = this.pageRect();
      const art = this.artworkRect();
      const cx = page ? page.x + page.width / 2 : art ? art.x + art.width / 2 : 0;
      const cy = page ? page.y + page.height / 2 : art ? art.y + art.height / 2 : 0;
      const span = Math.max(page?.width ?? 0, page?.height ?? 0, art?.width ?? 0, art?.height ?? 0, 1000) + 1000;
      const drawLine = (x1: number, y1: number, x2: number, y2: number, tag: Record<string, unknown>, color: string, dash?: number[]): AnyItem => {
        const line = new this.scope.Path({
          segments: [new this.scope.Point(x1, y1), new this.scope.Point(x2, y2)],
          strokeColor: color,
          strokeWidth: 1,
          insert: false,
        });
        if (dash) line.dashArray = dash;
        (line as AnyItem).guide = true;
        line.locked = true;
        if (!line.data) line.data = {};
        Object.assign(line.data, tag);
        layer.addChild(line);
        return line;
      };
      for (const guide of this.guidesVisible ? this.pageGuides : []) {
        if (guide.axis === 'x') {
          drawLine(guide.position, cy - span, guide.position, cy + span, { guideId: guide.id }, guide.locked ? '#8a8f98' : '#2f9be8');
        } else {
          drawLine(cx - span, guide.position, cx + span, guide.position, { guideId: guide.id }, guide.locked ? '#8a8f98' : '#2f9be8');
        }
      }
      if (this.printSetupState.preview) {
        // The dashed rect and the crop marks describe the same sheet:
        // the document page. (Before Slice 17 the rect was the printer
        // paper's printable area while the marks framed the page.)
        // Without a dimensioned page, fall back to the printable area,
        // which the marks' paper fallback then matches.
        const printable = page ?? printableRect(this.printSetupState);
        const rect = new this.scope.Path.Rectangle({
          point: [printable.x, printable.y],
          size: [printable.width, printable.height],
          strokeColor: '#e2712f',
          strokeWidth: 1,
          fillColor: null,
          insert: false,
        });
        rect.dashArray = [6, 4];
        (rect as AnyItem).guide = true;
        rect.locked = true;
        if (!rect.data) rect.data = {};
        rect.data.printSetupOverlay = true;
        layer.addChild(rect);
        const pageW = this.documentManager.pageSettings.widthPt ?? this.printSetupState.paperWidthPt;
        const pageH = this.documentManager.pageSettings.heightPt ?? this.printSetupState.paperHeightPt;
        for (const seg of cropMarkSegments(pageW, pageH)) {
          drawLine(seg.from.x, seg.from.y, seg.to.x, seg.to.y, { printSetupOverlay: true }, '#e2712f');
        }
      }
      try { this.scope.view?.update(); } catch { /* Headless. */ }
    } catch { /* Headless or no project: guides stay model-only. */ }
  }

  // --- Print (Tier Two) -------------------------------------------------
  // Page Setup is the printer's paper, margins and crop marks —
  // separate from Document Size. Print prints the active page;
  // Print Selection hides everything else for the print pass. The
  // browser's print flow captures the canvas bitmap (see
  // onBeforePrint); finishPrint restores visibility afterwards.

  getPrintSetup(): PrintSetup {
    return { ...this.printSetupState, margins: { ...this.printSetupState.margins } };
  }

  setPrintSetup(setup: PrintSetup): void {
    const parsed = readPrintSetup(setup);
    if (!parsed) return;
    this.printSetupState = parsed;
    this.documentManager.markEdited('page');
    this.renderGuides();
    this.notify();
  }

  /**
   * Print the active page, or only the selection. Non-printing
   * content is hidden and restored by finishPrint (wired to
   * afterprint). Returns the Paper item ids that will print.
   * Headless callers get the same state without a print dialog.
   */
  printDocument(scope: PrintScope = 'page'): string[] {
    this.finishPrint();
    const all = this.allContentItems();
    const keep = new Set(resolvePrintItemIds(
      all.map((item) => String(item.id)),
      this.selectedItems.map((item) => String(item.id)),
      scope,
    ));
    for (const item of all) {
      if (!keep.has(String(item.id))) {
        try {
          item.visible = false;
          this.printHiddenItems.push(item);
        } catch { /* Detached already. */ }
      }
    }
    if (this.printSetupState.cropMarks) {
      try {
        const pageW = this.documentManager.pageSettings.widthPt ?? this.printSetupState.paperWidthPt;
        const pageH = this.documentManager.pageSettings.heightPt ?? this.printSetupState.paperHeightPt;
        const layer = this.layers.activeLayer;
        for (const seg of cropMarkSegments(pageW, pageH)) {
          const line = new this.scope.Path({
            segments: [
              new this.scope.Point(seg.from.x, seg.from.y),
              new this.scope.Point(seg.to.x, seg.to.y),
            ],
            strokeColor: '#000000',
            strokeWidth: 0.5,
            insert: false,
          });
          if (layer) layer.addChild(line);
          this.printMarkItems.push(line);
        }
      } catch { /* Marks are best-effort. */ }
    }
    const view = (globalThis as { window?: { print?: () => void } }).window;
    if (view && typeof view.print === 'function') {
      try { view.print(); } catch { /* Print is userland. */ }
    }
    return [...keep];
  }

  /** Restore everything printDocument hid or added. Idempotent. */
  finishPrint(): void {
    for (const item of this.printHiddenItems) {
      try { item.visible = true; } catch { /* Detached already. */ }
    }
    this.printHiddenItems = [];
    for (const item of this.printMarkItems) {
      try { item.remove(); } catch { /* Detached already. */ }
    }
    this.printMarkItems = [];
  }

  // --- Native document files -------------------------------------------
  // The .nibglider envelope (document/NativeDocument.ts): the NG
  // model sections (drawables, retained paths, layers, page, view)
  // ride on the scene payload that carries the live geometry.

  /** The per-document display settings as stored in the file (v5). */
  displaySettingsSnapshot(): NativeDisplaySettings {
    return {
      gridEnabled: this.isGridEnabled,
      gridType: this.gridType,
      gridSpacing: this.gridSpacing,
      gridSubdivisions: this.gridSubdivisions,
      gridStyle: this.gridStyle,
      gridColor: this.gridColor,
      gridOpacity: this.gridOpacity,
      pageFill: this.pageFill,
      pageFillColor: this.pageFillColor,
      pageSideTicks: this.pageSideTicks,
    };
  }

  // --- Document palette (Slice 20) ---------------------------------
  // The kept-colours palette is document state: it travels in the
  // .nibglider file (v6). `paletteTouched` distinguishes a document
  // that has a palette (even an emptied one) from one that has none
  // — only the latter imports the legacy localStorage palette, once.

  documentPalette: string[] = [];
  paletteFromDocument = false;
  private paletteTouched = false;
  private legacyPaletteSeeded = false;

  setDocumentPalette(colors: string[]): void {
    const next = readPalette(colors) ?? [];
    this.documentPalette = next;
    this.paletteTouched = true;
    this.notify();
  }

  /** Adopt a document's palette on open (null = no palette of its
   * own: start empty and let the panel offer the legacy import). */
  private adoptDocumentPalette(palette: string[] | null): void {
    if (palette) {
      this.documentPalette = [...palette];
      this.paletteFromDocument = true;
      this.paletteTouched = true;
    } else {
      this.documentPalette = [];
      this.paletteFromDocument = false;
      this.paletteTouched = false;
    }
  }

  /** One-time legacy import: the pre-v6 localStorage palette seeds
   * a document that carries no palette of its own. */
  seedDocumentPaletteFromLegacy(colors: string[]): void {
    if (this.legacyPaletteSeeded || this.paletteFromDocument || this.paletteTouched) return;
    this.legacyPaletteSeeded = true;
    const legacy = readPalette(colors);
    if (legacy && legacy.length > 0) {
      this.documentPalette = legacy;
      this.paletteTouched = true;
      this.notify();
    }
  }

  /** Apply a document's display settings (on open, the document's
   * values win). Each setter validates and repaints as needed. */
  applyDisplaySettings(display: NativeDisplaySettings): void {
    this.setGridEnabled(display.gridEnabled);
    this.setGridType(display.gridType as GridType);
    this.setGridSpacing(display.gridSpacing);
    this.setGridSubdivisions(display.gridSubdivisions);
    this.setGridStyle(display.gridStyle as 'dots' | 'lines');
    this.setGridColor(display.gridColor);
    this.setGridOpacity(display.gridOpacity);
    this.setPageFill(display.pageFill);
    this.setPageFillColor(display.pageFillColor);
    this.setPageSideTicks(display.pageSideTicks);
  }

  /** Serialize the whole document as a native file body. */
  exportNativeDocument(name: string): string {
    const active = this.snapshotActivePage();
    if (!active) return '';
    const pageById = new Map<string, NativePageRecord>();
    for (const [id, record] of this.pageSnapshots) pageById.set(id, record);
    pageById.set(active.id, active);
    const pages = this.documentPageIds()
      .map((id) => pageById.get(id))
      .filter((record): record is NativePageRecord => !!record);
    for (const record of pageById.values()) {
      if (!pages.includes(record)) pages.push(record);
    }
    const page = this.documentManager.pageSettings;
    const doc: NativeDocumentFile = buildNativeDocument({
      name,
      savedAt: new Date().toISOString(),
      layers: active.layers,
      activeLayerId: active.activeLayerId,
      drawables: active.drawables,
      retainedPaths: active.retainedPaths,
      page: {
        widthPt: page.widthPt,
        heightPt: page.heightPt,
        orientation: page.orientation,
        unit: page.unit,
      },
      view: readSceneView(active.scene),
      scene: active.scene,
      pages,
      activePageId: active.id,
      printSetup: this.printSetupState,
      display: this.displaySettingsSnapshot(),
      palette: this.paletteTouched ? [...this.documentPalette] : null,
    });
    return serializeNativeDocument(doc);
  }

  /** Find a live Path/CompoundPath carrying a drawableId (searching
   * group children), or null. */
  private itemByDrawableId(id: string): AnyItem {
    const visit = (item: AnyItem): AnyItem => {
      if (!item) return null;
      if (item.data?.drawableId === id
        && (item.className === 'Path' || item.className === 'CompoundPath')) return item;
      for (const child of (item.children ?? []) as AnyItem[]) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    for (const item of this.allContentItems()) {
      const found = visit(item);
      if (found) return found;
    }
    return null;
  }

  /**
   * Open a native document file body. Restores the scene (layers and
   * view included), the catalog drawables, the retained Bézier
   * sources, the page size, the current-file name, and clears the
   * dirty flag. Returns a UI-ready error instead of throwing.
   */
  openNativeDocumentText(text: string): { ok: boolean; name?: string; error?: string } {
    const parsed = parseNativeDocument(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const doc = parsed.doc;
    const activeRecord = doc.pages.find((page) => page.id === doc.activePageId) ?? doc.pages[0];
    if (!activeRecord) return { ok: false, error: 'That document has no pages.' };
    // Register every page with the DocumentManager (ids and names),
    // falling back to the document page size (or Letter) for pages a
    // v1 file never dimensioned.
    const fallbackW = doc.page?.widthPt ?? 612;
    const fallbackH = doc.page?.heightPt ?? 792;
    const drawingPages: DrawingPage[] = [];
    const names = new Map<string, string>();
    for (const record of doc.pages) {
      drawingPages.push(createDrawingPage(
        record.id,
        record.page?.widthPt ?? fallbackW,
        record.page?.heightPt ?? fallbackH,
        (record.page?.unit as LengthUnit) ?? 'pt',
      ));
      names.set(record.id, record.name);
    }
    this.documentManager.setPageList(drawingPages, activeRecord.id, names);
    this.pageSnapshots.clear();
    for (const record of doc.pages) {
      if (record.id !== activeRecord.id) this.pageSnapshots.set(record.id, structuredClone(record));
    }
    if (doc.printSetup) this.printSetupState = doc.printSetup;
    if (doc.display) this.applyDisplaySettings(doc.display);
    this.adoptDocumentPalette(doc.palette);
    if (!this.loadPageRecord(structuredClone(activeRecord), `Open ${doc.name}`)) {
      return { ok: false, error: 'That document’s scene could not be loaded.' };
    }
    this.currentFileName = doc.name;
    this.documentManager.markClean();
    this.notify();
    return { ok: true, name: doc.name };
  }

  /**
   * Unified file-open entry (Open File picker + document drops):
   * native documents open natively; legacy nibglider-scene JSON
   * (v1/v2, including gallery bodies) opens as a scene import.
   * Returns true when the text was taken as a document.
   */
  openDocumentText(text: string, fileName: string): boolean {
    if (isNativeDocumentText(text)) {
      const result = this.openNativeDocumentText(text);
      if (!result.ok) this.noteImportFailure(`Open failed: ${result.error ?? 'unknown error'}`);
      return result.ok;
    }
    if (isSceneJson(text)) {
      const name = fileName.replace(/\.json$/i, '') || 'Imported Document';
      if (this.replaceScene(`Open ${name}`, text)) {
        this.currentFileName = name;
        this.documentManager.markClean();
        this.notify();
        return true;
      }
      this.noteImportFailure(`Open failed: ${fileName} could not be loaded.`);
      return false;
    }
    return false;
  }

  /** Download file name for a Save to File of the current document. */
  suggestedNativeFileName(name: string): string {
    return nativeFileName(name);
  }

  private ingestSvg(svg: string): AnyItem | null {
    let placed: AnyItem | null = null;
    try {
      this.scope.project.importSVG(svg, (imported: AnyItem) => {
        if (!imported) return;
        stripSvgClips(imported);
        clearTransient(imported);
        // Nested groups become one-level-at-a-time user groups, shapes
        // expand to paths, and a loose path is wrapped so Ungroup never
        // deletes the import.
        placed = adoptImportedArtwork(this.scope, imported) ?? imported;
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
    const before = this.allContentItems();
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

  /** The selected garment area item when exactly one area is selected. */
  private singleSelectedGarmentAreaItem(): AnyItem | null {
    const selected = this.selectedItems.filter(isPrintifyAreaItem);
    return selected.length === 1 ? selected[0] : null;
  }

  /** Resize target: the single selected frame, else the single selected
   * garment area. Frames win when both are somehow selected. */
  private singleSelectedResizeItem(): AnyItem | null {
    return this.singleSelectedFrameItem() ?? this.singleSelectedGarmentAreaItem();
  }

  /** Rebuild resize handles for the current selection. Identity-checked,
   * so the per-notify cost is one selection filter while idle. */
  private refreshFrameHandles(): void {
    try {
      this.frameHandles.refresh(this.isLiveDrawing ? null : this.singleSelectedResizeItem());
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
      onMouseDown: (event) => this.inputMouseDown(event),
      onMouseMove: (event) => this.inputMouseMove(event),
      onMouseDrag: (event) => this.inputMouseDrag(event),
      onMouseUp: () => this.inputMouseUp(),
      onDoubleClick: (event) => this.handleDoubleClick(event),
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

  setHideCommonKeymapRows(v: boolean): void {
    this.hideCommonKeymapRows = v;
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

  setGridSubdivisions(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(1, Math.min(10, Math.floor(v)));
    if (next === this.gridSubdivisions) return;
    this.gridSubdivisions = next;
    if (this.isGridEnabled) this.drawGrid();
    this.updateTextContent();
    this.notify();
  }

  setGridStyle(v: 'dots' | 'lines'): void {
    if (v !== 'dots' && v !== 'lines') return;
    if (v === this.gridStyle) return;
    this.gridStyle = v;
    if (this.isGridEnabled) this.drawGrid();
    this.updateTextContent();
    this.notify();
  }

  setGridColor(v: string): void {
    const checked = cssHex(v, '');
    if (checked == null) return;
    if (checked === this.gridColor) return;
    this.gridColor = checked;
    if (this.isGridEnabled) this.drawGrid();
    this.updateTextContent();
    this.notify();
  }

  setGridOpacity(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(0, Math.min(1, v));
    if (next === this.gridOpacity) return;
    this.gridOpacity = next;
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

  // --- Symmetry repeat (Slice 9a) ---

  setRepeatFamily(v: RepeatFamilyName): void {
    if (v === this.repeatFamily) return;
    this.repeatFamily = v;
    this.updateTextContent();
    this.notify();
  }

  setRepeatWallpaperGroup(v: WallpaperGroupId): void {
    if (!WALLPAPER_GROUPS[v] || v === this.repeatWallpaperGroup) return;
    this.repeatWallpaperGroup = v;
    this.updateTextContent();
    this.notify();
  }

  setRepeatFriezeGroup(v: FriezeGroupId): void {
    if (!FRIEZE_GROUPS[v] || v === this.repeatFriezeGroup) return;
    this.repeatFriezeGroup = v;
    this.updateTextContent();
    this.notify();
  }

  setRepeatSymmetryCount(v: number): void {
    const next = Math.max(1, Math.min(64, Math.round(v) || 1));
    if (next === this.repeatSymmetryCount) return;
    this.repeatSymmetryCount = next;
    this.updateTextContent();
    this.notify();
  }

  setRepeatPolarReflect(v: boolean): void {
    this.repeatPolarReflect = v;
    this.updateTextContent();
    this.notify();
  }

  /** Flatten a path item to a world-space polyline for the
   * path-following repeat families (longest subpath wins). */
  private sampleGuidePath(item: AnyItem): { points: Array<{ x: number; y: number }>; closed: boolean } | null {
    const paths: AnyItem[] = [];
    const collect = (it: AnyItem): void => {
      if (!it) return;
      if (it.className === 'Path') paths.push(it);
      for (const child of it.children ?? []) collect(child);
    };
    collect(item);
    let best: AnyItem = null;
    let bestLength = 0;
    for (const path of paths) {
      let length = 0;
      try { length = path.length; } catch { continue; }
      if (length > bestLength) { best = path; bestLength = length; }
    }
    if (!best || !(bestLength > 0)) return null;
    const count = Math.max(24, Math.min(400, Math.ceil(bestLength / 3)));
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i++) {
      try {
        const local = best.getPointAt((bestLength * i) / count);
        const world = best.localToGlobal(local);
        points.push({ x: world.x, y: world.y });
      } catch { return null; }
    }
    return { points, closed: !!best.closed };
  }

  /** The symmetry spec implied by the panel state and the current
   * selection's bounds, or null without a usable selection. */
  repeatSpecForSelection(): SymmetryRepeatSpec | null {
    return this.symmetrySelection()?.spec ?? null;
  }

  /** Build the descriptor for a family from the panel state,
   * anchored on a frame (a selection's bounds, a live draw's
   * bounds, or a stored source's bounds). The single construction
   * path behind apply, live preview/deposit, and regenerate, so
   * all three agree. `guide` supplies the reference path for the
   * path-relative families; null there means no descriptor. */
  private buildRepeatSpec(
    family: RepeatFamilyName,
    anchor: { origin: { x: number; y: number }; center: { x: number; y: number }; width: number; height: number },
    pivot: { x: number; y: number },
    guide: { points: Array<{ x: number; y: number }>; closed: boolean } | null,
  ): SymmetryRepeatSpec | null {
    switch (family) {
      case 'wallpaper': {
        const basis = basisForWallpaper(this.repeatWallpaperGroup, anchor.width, anchor.height);
        return {
          family: 'wallpaper',
          group: this.repeatWallpaperGroup,
          origin: { ...anchor.origin },
          basisA: basis.basisA,
          basisB: basis.basisB,
          cols: this.repeatCols,
          rows: this.repeatRows,
          motifOffsetDeg: this.repeatMotifOffsetDeg,
        };
      }
      case 'frieze':
        return {
          family: 'frieze',
          group: this.repeatFriezeGroup,
          origin: { ...anchor.origin },
          step: { x: anchor.width, y: 0 },
          count: this.repeatSymmetryCount,
          motifOffsetDeg: this.repeatMotifOffsetDeg,
        };
      case 'polar':
        return {
          family: 'polar',
          center: { ...anchor.center },
          count: this.repeatSymmetryCount,
          reflect: this.repeatPolarReflect,
          mode: this.repeatPolarMode,
          stepDeg: this.repeatPolarStepDeg,
          motifOffsetDeg: this.repeatMotifOffsetDeg,
          progressions: this.progressionList([this.polarRadiusProgression, this.polarScaleProgression]),
          outcome: this.repeatOutcomeName ?? undefined,
        };
      case 'alongStroke': {
        if (!guide) return null;
        return {
          family: 'alongStroke',
          guide: guide.points.map((p) => ({ ...p })),
          closed: guide.closed,
          stationMode: this.repeatStationMode,
          count: this.repeatSymmetryCount,
          spacing: this.repeatAlongSpacing,
          pivot: { ...pivot },
          alignToTangent: this.repeatAlongAlign,
          orientationOffsetDeg: this.repeatAlongOrientationDeg,
          progressions: this.progressionList([this.alongGapProgression]),
        };
      }
      case 'normals': {
        if (!guide) return null;
        return {
          family: 'normals',
          guide: guide.points.map((p) => ({ ...p })),
          closed: guide.closed,
          stations: this.repeatSymmetryCount,
          pivot: { ...pivot },
        };
      }
    }
  }

  private progressionList(entries: Array<Progression | null>): Progression[] | undefined {
    const list = entries.filter((entry): entry is Progression => !!entry).map((entry) => ({ ...entry }));
    return list.length > 0 ? list : undefined;
  }

  /** Spec + the items it copies. For the path-following families
   * the guide is the last selected path; the other items repeat
   * along/across it (a lone path repeats along/across itself). */
  private symmetrySelection(): { spec: SymmetryRepeatSpec; sources: AnyItem[] } | null {
    const sources = this.selectedItems.filter((item) => item && !this.isNonContentItem(item));
    if (sources.length === 0) return null;
    let guide: { points: Array<{ x: number; y: number }>; closed: boolean } | null = null;
    let useSources = sources;
    if (this.repeatFamily === 'alongStroke' || this.repeatFamily === 'normals') {
      const guides = new Map<AnyItem, { points: Array<{ x: number; y: number }>; closed: boolean }>();
      for (const item of sources) {
        const sampled = this.sampleGuidePath(item);
        if (sampled) guides.set(item, sampled);
      }
      const guideItem = [...sources].reverse().find((item) => guides.has(item));
      if (!guideItem) return null;
      guide = guides.get(guideItem)!;
      const rest = sources.filter((item) => item !== guideItem);
      useSources = rest.length > 0 ? rest : [guideItem];
    }
    const first = useSources[0];
    const b = first.bounds;
    if (!b || !(b.width > 0) || !(b.height > 0)) return null;
    const center = this.selection.collectiveCenter(useSources);
    const spec = this.buildRepeatSpec(
      this.repeatFamily,
      {
        origin: { x: b.x, y: b.y },
        center: { x: center.x, y: center.y },
        width: b.width,
        height: b.height,
      },
      { x: b.center.x, y: b.center.y },
      guide,
    );
    if (!spec) return null;
    return { spec, sources: useSources };
  }

  /** Apply a symmetry repeat to the selected items: transformed
   * clones through the scene/history machinery, ONE undo entry. */
  applySymmetryRepeat(spec?: SymmetryRepeatSpec): number {
    if (this.isLiveDrawing) return 0;
    const built = spec ? null : this.symmetrySelection();
    const useSpec = spec ?? built?.spec;
    if (!useSpec) return 0;
    const sources = built?.sources
      ?? this.selectedItems.filter((item) => item && !this.isNonContentItem(item));
    if (sources.length === 0) return 0;
    const snap = this.captureDeposit();
    const copies = this.repeatManager.applySymmetry(useSpec, sources);
    const perSource = Math.max(1, copyTransforms(useSpec).length);
    for (let i = 0; i < copies.length; i++) {
      const source = sources[Math.min(sources.length - 1, Math.floor(i / perSource))];
      try { this.scene.retainClone(source, copies[i], (item) => this.shapePartOf(item)); } catch { /* unretained sources clone plainly */ }
    }
    if (copies.length === 0) return 0;
    // Applied deposits store the descriptor on the source too
    // (Slice 10, revised point 4): Regenerate replays it later.
    this.tagReplication(sources, copies, perSource, useSpec);
    this.recordSceneCommand('Repeat', snap.before, snap.selected, copies, snap.retained);
    this.updateTextContent();
    this.notify();
    return copies.length;
  }

  /** Operations > Repeat Grid: the plain-translation wallpaper
   * preset (p1) with the panel's rows/columns. */
  applyRepeatGrid(): number {
    const savedFamily = this.repeatFamily;
    const savedGroup = this.repeatWallpaperGroup;
    this.repeatFamily = 'wallpaper';
    this.repeatWallpaperGroup = 'p1';
    const count = this.applySymmetryRepeat();
    this.repeatFamily = savedFamily;
    this.repeatWallpaperGroup = savedGroup;
    return count;
  }

  /** Operations > Repeat Circle: the polar preset. */
  applyRepeatCircle(): number {
    const savedFamily = this.repeatFamily;
    this.repeatFamily = 'polar';
    const count = this.applySymmetryRepeat();
    this.repeatFamily = savedFamily;
    return count;
  }

  // --- Live symmetry + retained descriptors (Slice 10, revised) --
  // One Repeat system: the panel's family + parameters define a
  // symmetry descriptor (buildRepeatSpec). Armed, that descriptor
  // previews live during drawing and deposits source + copies in
  // one undo entry; applied, it deposits the same way. Every
  // deposit stores the descriptor on the source as its retained
  // replication record (native model v3); Regenerate replays it —
  // or the panel's current parameters when they target the same
  // family — replacing the old copies; Expand detaches it.

  setLiveSymmetryArmed(v: boolean): void {
    if (v === this.liveSymmetryArmed) return;
    this.liveSymmetryArmed = v;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatPolarMode(v: 'division' | 'degrees'): void {
    if (v !== 'division' && v !== 'degrees') return;
    if (v === this.repeatPolarMode) return;
    this.repeatPolarMode = v;
    this.repeatOutcomeName = null;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatPolarStepDeg(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(0.1, Math.min(360, v));
    if (next === this.repeatPolarStepDeg) return;
    this.repeatPolarStepDeg = next;
    this.repeatOutcomeName = null;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatMotifOffsetDeg(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(-360, Math.min(360, v));
    if (next === this.repeatMotifOffsetDeg) return;
    this.repeatMotifOffsetDeg = next;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setRepeatStationMode(v: 'division' | 'spacing' | 'progression'): void {
    if (v !== 'division' && v !== 'spacing' && v !== 'progression') return;
    if (v === this.repeatStationMode) return;
    this.repeatStationMode = v;
    this.updateTextContent();
    this.notify();
  }

  setRepeatAlongSpacing(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(1, Math.min(2000, v));
    if (next === this.repeatAlongSpacing) return;
    this.repeatAlongSpacing = next;
    this.updateTextContent();
    this.notify();
  }

  setRepeatAlongOrientationDeg(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(-360, Math.min(360, v));
    if (next === this.repeatAlongOrientationDeg) return;
    this.repeatAlongOrientationDeg = next;
    this.updateTextContent();
    this.notify();
  }

  setRepeatAlongAlign(v: boolean): void {
    this.repeatAlongAlign = v;
    this.updateTextContent();
    this.notify();
  }

  /** Store a progression for a target, or clear it with null.
   * Values are validated, never repaired silently beyond finiteness. */
  private setProgression(
    target: 'radius' | 'scale' | 'gap',
    value: { kind: 'arithmetic' | 'geometric'; start: number; step: number } | null,
  ): void {
    const next: Progression | null = value && (value.kind === 'arithmetic' || value.kind === 'geometric')
      && Number.isFinite(value.start) && Number.isFinite(value.step)
      ? { target, kind: value.kind, start: value.start, step: value.step }
      : null;
    if (target === 'radius') this.polarRadiusProgression = next;
    else if (target === 'scale') this.polarScaleProgression = next;
    else this.alongGapProgression = next;
    if (target !== 'gap') this.repeatOutcomeName = null;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  setPolarRadiusProgression(v: { kind: 'arithmetic' | 'geometric'; start: number; step: number } | null): void {
    this.setProgression('radius', v);
  }

  setPolarScaleProgression(v: { kind: 'arithmetic' | 'geometric'; start: number; step: number } | null): void {
    this.setProgression('scale', v);
  }

  setAlongGapProgression(v: { kind: 'arithmetic' | 'geometric'; start: number; step: number } | null): void {
    this.setProgression('gap', v);
    if (v) this.repeatStationMode = 'progression';
  }

  /** Fill the polar + progression fields from a named outcome
   * (Whorl / Phyllotaxis). The fields stay the source of truth;
   * the outcome name is kept for display until a field is edited. */
  applyRepeatOutcome(id: string): void {
    const outcome = repeatOutcome(id);
    if (!outcome) return;
    this.repeatFamily = 'polar';
    this.repeatPolarMode = 'degrees';
    this.repeatPolarStepDeg = outcome.stepDeg;
    this.repeatSymmetryCount = outcome.count;
    this.polarRadiusProgression = { target: 'radius', ...outcome.growth };
    this.polarScaleProgression = outcome.scale ? { target: 'scale', ...outcome.scale } : null;
    this.repeatOutcomeName = outcome.id;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  /** RepeatManager host: the armed descriptor around the live
   * draw's frame. For the path-relative families the reference
   * path is the chosen (or auto-captured selected) guide; without
   * one there is no live preview yet. */
  liveDescriptorForFrame(frame: LiveFrame): SymmetryRepeatSpec | null {
    let guide: { points: Array<{ x: number; y: number }>; closed: boolean } | null = null;
    if (this.repeatFamily === 'alongStroke' || this.repeatFamily === 'normals') {
      if (!this.liveGuide) this.captureLiveGuideFromSelection(false);
      guide = this.liveGuide;
      if (!guide) return null;
    }
    return this.buildRepeatSpec(this.repeatFamily, frame, frame.center, guide);
  }

  /** Choose the reference path for live path-relative repeats from
   * the current selection (the last selected path). */
  captureLiveGuideFromSelection(announce = true): boolean {
    const candidate = [...this.selectedItems].reverse()
      .find((item) => item && !this.isNonContentItem(item) && !this.isGuideItem(item));
    if (!candidate) return false;
    const sampled = this.sampleGuidePath(candidate);
    if (!sampled) return false;
    this.liveGuide = sampled;
    if (announce) {
      this.repeatManager.refreshPreview();
      this.updateTextContent();
      this.notify();
    }
    return true;
  }

  liveGuidePathChosen(): boolean {
    return !!this.liveGuide;
  }

  clearLiveGuidePath(): void {
    this.liveGuide = null;
    this.repeatManager.refreshPreview();
    this.updateTextContent();
    this.notify();
  }

  /** The key linking a replication source to its copies: its
   * drawable id when it has one, else a per-item key minted on the
   * source the first time it is tagged. */
  private replicationKeyOf(item: AnyItem): string {
    const existing = item?.data?.drawableId ?? item?.data?.replicationKey;
    if (typeof existing === 'string' && existing) return existing;
    const key = crypto.randomUUID();
    if (item?.data) item.data.replicationKey = key;
    return key;
  }

  /** Tag a deposit (live or applied): the source keeps the
   * retained record — the full symmetry descriptor — and each copy
   * points back at the source's key. The record also mirrors onto
   * the source's catalog drawable when it has one, so it is part of
   * the native document model, not only scene data. Copy→source
   * attribution slices the copies per source; at the shared
   * 200-copy cap with several sources that attribution can drift
   * for the last source, which only affects which copies a
   * regenerate of that source sweeps. */
  private tagReplication(
    sources: AnyItem[], copies: AnyItem[], transformsPerSource: number,
    spec: SymmetryRepeatSpec | null,
  ): void {
    if (!spec || copies.length === 0 || transformsPerSource <= 0) return;
    const record: ReplicationRecord = { version: 2, spec: structuredClone(spec) };
    sources.forEach((source, i) => {
      if (!source?.data) return;
      const key = this.replicationKeyOf(source);
      source.data.replication = structuredClone(record);
      const mine = copies.slice(i * transformsPerSource, (i + 1) * transformsPerSource);
      for (const copy of mine) {
        if (copy?.data) copy.data.replicationOf = key;
      }
      try {
        const id = this.scene.drawableIdOf(source);
        const drawable = id ? this.scene.drawableOf(id) : null;
        if (id && drawable && drawable.replication !== record) {
          this.scene.bindDrawable({ ...drawable, replication: structuredClone(record) }, source);
        }
      } catch { /* Unbound sources keep the record in scene data. */ }
    });
  }

  /** The replication record carried by the current selection (via a
   * source or one of its copies), or null. For the Repeat panel. */
  selectionReplication(): ReplicationRecord | null {
    const found = this.replicationSourcesForSelection();
    return found.length > 0 ? found[0].record : null;
  }

  /** Resolve selected sources (items carrying a record, plus the
   * sources of any selected copies) for regenerate/expand. */
  private replicationSourcesForSelection(): Array<{ source: AnyItem; key: string; record: ReplicationRecord }> {
    const out: Array<{ source: AnyItem; key: string; record: ReplicationRecord }> = [];
    const seen = new Set<string>();
    const content = this.contentItems();
    for (const item of this.selectedItems) {
      if (!item) continue;
      if (isReplicationRecord(item.data?.replication)) {
        const key = this.replicationKeyOf(item);
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ source: item, key, record: item.data.replication });
        }
        continue;
      }
      const of = item.data?.replicationOf;
      if (typeof of === 'string') {
        const source = content.find((candidate) => candidate !== item
          && isReplicationRecord(candidate.data?.replication)
          && this.replicationKeyOf(candidate) === of);
        if (source && !seen.has(of)) {
          seen.add(of);
          out.push({ source, key: of, record: source.data.replication });
        }
      }
    }
    return out;
  }

  /**
   * Regenerate the copies of each selected replication source from
   * its stored descriptor. When the Repeat panel is set to the
   * record's family, the panel's current parameters rebuild the
   * descriptor around the source (that is how parameters are
   * adjusted — progressions and outcomes included); otherwise the
   * stored descriptor replays as-is. For path-relative families the
   * stored guide path is reused. Old copies are removed and the
   * stored record is updated; everything lands as ONE undo entry,
   * so copies are replaced, never duplicated.
   */
  regenerateReplication(): number {
    if (this.isLiveDrawing) return 0;
    const targets = this.replicationSourcesForSelection();
    if (targets.length === 0) return 0;
    const snap = this.captureDeposit();
    const content = this.contentItems();
    let made = 0;
    const placedAll: AnyItem[] = [];
    for (const { source, key, record } of targets) {
      for (const item of content) {
        if (item !== source && item.data?.replicationOf === key) {
          try { item.remove(); } catch { /* already gone */ }
        }
      }
      let spec: SymmetryRepeatSpec = record.spec;
      const bounds = source.bounds;
      if (!bounds) continue;
      if (this.repeatFamily === record.spec.family) {
        const stored = record.spec;
        const guide = stored.family === 'alongStroke' || stored.family === 'normals'
          ? { points: stored.guide, closed: stored.closed }
          : this.liveGuide;
        const built = this.buildRepeatSpec(
          record.spec.family,
          {
            origin: { x: bounds.x, y: bounds.y },
            center: { x: bounds.center.x, y: bounds.center.y },
            width: Math.max(1, bounds.width),
            height: Math.max(1, bounds.height),
          },
          { x: bounds.center.x, y: bounds.center.y },
          guide,
        );
        if (built) spec = built;
      }
      const copies = this.repeatManager.applySymmetry(spec, [source]);
      for (const copy of copies) {
        try { this.scene.retainClone(source, copy, (item) => this.shapePartOf(item)); } catch { /* plain copy */ }
        if (copy?.data) copy.data.replicationOf = key;
      }
      const next: ReplicationRecord = { version: 2, spec: structuredClone(spec) };
      if (source.data) source.data.replication = structuredClone(next);
      try {
        const id = this.scene.drawableIdOf(source);
        const drawable = id ? this.scene.drawableOf(id) : null;
        if (id && drawable) this.scene.bindDrawable({ ...drawable, replication: structuredClone(next) }, source);
      } catch { /* Scene data still carries the record. */ }
      made += copies.length;
      placedAll.push(...copies);
    }
    this.scene.pruneRecords();
    if (made > 0) this.recordSceneCommand('Regenerate repeat', snap.before, snap.selected, placedAll, snap.retained);
    this.updateTextContent();
    this.notify();
    return made;
  }

  /**
   * Expand replication: copies become ordinary items and the
   * source's record is detached. This changes only item data (no
   * items are added or removed), so it is not a history entry.
   */
  expandReplication(): number {
    const targets = this.replicationSourcesForSelection();
    if (targets.length === 0) return 0;
    const content = this.contentItems();
    for (const { source, key } of targets) {
      if (source.data) {
        delete source.data.replication;
        delete source.data.replicationKey;
      }
      for (const item of content) {
        if (item.data?.replicationOf === key) delete item.data.replicationOf;
      }
      try {
        const id = this.scene.drawableIdOf(source);
        const drawable = id ? this.scene.drawableOf(id) : null;
        if (id && drawable?.replication) {
          const cleared = { ...drawable };
          delete cleared.replication;
          this.scene.bindDrawable(cleared, source);
        }
      } catch { /* Scene data is already cleared. */ }
    }
    this.updateTextContent();
    this.notify();
    return targets.length;
  }

  /** DrawingHost hook: capture the armed live symmetry transforms
   * (and their descriptor) before a composite finish clears the
   * session. */
  captureLiveRepeatTransforms(): void {
    this.pendingLiveTransforms = this.repeatManager.beginDepositTransforms();
    this.pendingLiveSpec = this.repeatManager.takeDepositSpec();
  }

  /** DrawingHost hook: place the live symmetry copies for a
   * composite deposit item and tag the descriptor record. */
  liveRepeatCopiesFor(item: AnyItem): AnyItem[] {
    const transforms = this.pendingLiveTransforms ?? this.repeatManager.beginDepositTransforms();
    const spec = this.pendingLiveSpec ?? this.repeatManager.takeDepositSpec();
    this.pendingLiveTransforms = null;
    this.pendingLiveSpec = null;
    if (!transforms || transforms.length === 0 || !item) return [];
    const copies = this.repeatManager.finishDepositTransformed([item], transforms);
    this.tagReplication([item], copies, transforms.length, spec);
    return copies;
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
    if (v !== 'left' && v !== 'center' && v !== 'right' && v !== 'justify') return;
    this.setText({ justification: v });
    this.applyToEditableText((lines) => {
      // Paper lines carry the value as data; the slack distribution
      // itself happens in body layout (TextLayout), the one place
      // lines are wrapped to a measure.
      for (const line of lines) line.justification = v;
    });
  }

  /** Underline on/off. Live PointText cannot render decoration in
   * Paper, so selected roots keep the flag as data (root.data) and
   * it takes visual effect in shape-attached text and on Convert
   * to Outlines — the same contract as tracking. */
  setTextUnderline(v: boolean): void {
    const on = !!v;
    this.setText({ underline: on });
    for (const root of this.editableTextRoots()) {
      try { root.data.underline = on; } catch { /* Best effort. */ }
    }
    this.documentManager.markEdited('scene');
    this.notify();
  }

  /** Strikethrough on/off: same data/visual contract as underline. */
  setTextStrikethrough(v: boolean): void {
    const on = !!v;
    this.setText({ strikethrough: on });
    for (const root of this.editableTextRoots()) {
      try { root.data.strikethrough = on; } catch { /* Best effort. */ }
    }
    this.documentManager.markEdited('scene');
    this.notify();
  }

  setTextCaseTransform(v: TextCaseTransform): void {
    if (v !== 'none' && v !== 'upper' && v !== 'smallCaps') return;
    this.setText({ caseTransform: v });
    for (const root of this.editableTextRoots()) {
      try { root.data.caseTransform = v; } catch { /* Best effort. */ }
    }
    this.documentManager.markEdited('scene');
    this.notify();
  }

  /** Baseline shift in points, −20..+40 (positive raises). Data on
   * selected roots like tracking; visual in shape-attached layout
   * and outline conversion. */
  setTextBaselineShift(v: number): void {
    if (!Number.isFinite(v)) return;
    const shift = Math.max(-20, Math.min(40, v));
    this.setText({ baselineShift: shift });
    for (const root of this.editableTextRoots()) {
      try { root.data.baselineShift = shift; } catch { /* Best effort. */ }
    }
    this.documentManager.markEdited('scene');
    this.notify();
  }

  /** Word spacing in points, 0..20: extra advance after each space.
   * Same storage/visual contract as baseline shift. */
  setTextWordSpacing(v: number): void {
    if (!Number.isFinite(v)) return;
    const spacing = Math.max(0, Math.min(20, v));
    this.setText({ wordSpacing: spacing });
    for (const root of this.editableTextRoots()) {
      try { root.data.wordSpacing = spacing; } catch { /* Best effort. */ }
    }
    this.documentManager.markEdited('scene');
    this.notify();
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

  /** Tracking in points (negative tightens). Stored on selected
   * editable roots; layout, display/body rendering and outline
   * conversion read it. Whole-line PointText items cannot render
   * tracking in Paper, so for selected live text the value is kept
   * as data and takes visual effect in shape-attached text and on
   * Convert to Outlines. */
  setTextLetterSpacing(v: number): void {
    if (!Number.isFinite(v)) return;
    const spacing = Math.max(-20, Math.min(100, v));
    this.setText({ letterSpacing: spacing });
    for (const root of this.editableTextRoots()) {
      try { root.data.letterSpacing = spacing; } catch { /* Best effort. */ }
    }
    this.documentManager.markEdited('scene');
    this.notify();
  }

  // --- Convert to Outlines (Tier Two, Slice 6) -----------------------
  // Selected live text becomes NGPath geometry built from the parsed
  // font's real glyph outlines (opentype.js), one history step for
  // the whole conversion. Lines whose family has no parsed font
  // (system families) stay live and are counted in the result.

  /**
   * Convert every selected editable text root to outlines.
   * Returns { converted, skipped }: roots converted, and roots left
   * live because no parsed font is available for them.
   */
  convertSelectedTextToOutlines(): { converted: number; skipped: number } {
    const roots = this.editableTextRoots();
    if (roots.length === 0) return { converted: 0, skipped: 0 };
    const snap = this.captureDeposit();
    const placed: AnyItem[] = [];
    let converted = 0;
    let skipped = 0;
    for (const root of roots) {
      const lines = this.editableLines(root);
      const tracking = typeof root.data?.letterSpacing === 'number'
        ? root.data.letterSpacing
        : this.globalText.letterSpacing;
      // Slice 18 spec data rides on the root like tracking: case,
      // decorations, baseline shift, word spacing all take their
      // visual effect here (and in shape-attached layout).
      const caseTransform = root.data?.caseTransform === 'upper' || root.data?.caseTransform === 'smallCaps'
        ? root.data.caseTransform
        : this.globalText.caseTransform;
      const baselineShift = typeof root.data?.baselineShift === 'number'
        ? root.data.baselineShift
        : this.globalText.baselineShift;
      const wordSpacing = typeof root.data?.wordSpacing === 'number'
        ? root.data.wordSpacing
        : this.globalText.wordSpacing;
      const underline = typeof root.data?.underline === 'boolean' ? root.data.underline : this.globalText.underline;
      const strikethrough = typeof root.data?.strikethrough === 'boolean' ? root.data.strikethrough : this.globalText.strikethrough;
      const outlines: AnyItem[] = [];
      let rootOk = lines.length > 0;
      for (const line of lines) {
        let content = '';
        let family = this.globalText.fontFamily;
        let weight = this.globalText.fontWeight;
        let size = this.globalText.fontSize;
        try {
          content = String(line.content ?? '');
          if (typeof line.fontFamily === 'string' && line.fontFamily) family = line.fontFamily;
          if (typeof line.fontWeight === 'string' && line.fontWeight) weight = line.fontWeight;
          if (Number.isFinite(line.fontSize) && line.fontSize > 0) size = line.fontSize;
        } catch { rootOk = false; break; }
        if (!content.trim()) continue;
        const font = this.textMetrics.fontFor(family, weight);
        if (!font) { rootOk = false; break; }
        if (caseTransform === 'upper') content = content.toUpperCase();
        const outlined = outlineText(this.scope, font, content, size, tracking, {
          wordSpacing,
          smallCaps: caseTransform === 'smallCaps',
        });
        if (!outlined) { rootOk = false; break; }
        const lineItems: AnyItem[] = [outlined.item];
        // Decorations convert as filled strokes in the glyph group:
        // thin rectangles in glyph space spanning the line width.
        if ((underline || strikethrough) && outlined.width > 0) {
          const th = Math.max(0.75, size * 0.055);
          const rect = (y0: number): AnyItem => new this.scope.Path.Rectangle({
            from: [0, y0], to: [outlined.width, y0 + th], insert: false,
          });
          if (underline) lineItems.push(rect(size * 0.18));
          if (strikethrough) lineItems.push(rect(-size * 0.33));
        }
        for (const item of lineItems) {
          // Paper justifies the line around its point: shift the glyph
          // space so the outline lands where the line renders.
          const justification = line.justification;
          if (justification === 'center') item.translate(new this.scope.Point(-outlined.width / 2, 0));
          else if (justification === 'right') item.translate(new this.scope.Point(-outlined.width, 0));
          if (baselineShift !== 0) item.translate(new this.scope.Point(0, -baselineShift));
          try {
            const matrix = line.globalMatrix;
            if (matrix) item.transform(matrix);
          } catch { /* Keep the untransformed outline. */ }
          try {
            if (line.fillColor) item.fillColor = line.fillColor;
          } catch { /* Keep the default fill. */ }
          item.strokeColor = null;
          outlines.push(item);
        }
      }
      if (!rootOk || outlines.length === 0) {
        for (const item of outlines) { try { item.remove(); } catch { /* Never placed. */ } }
        skipped += 1;
        continue;
      }
      const parent: AnyItem = root.parent ?? this.layers.activeLayer;
      const index = typeof root.index === 'number' ? root.index : undefined;
      outlines.forEach((item, i) => {
        if (parent) {
          try { parent.insertChild(index !== undefined ? index + i : parent.children.length, item); } catch { this.layers.addToActive(item); }
        } else {
          this.layers.addToActive(item);
        }
        try { this.scene.retain(item); } catch { /* Geometry still lands. */ }
        placed.push(item);
      });
      try { root.remove(); } catch { /* Already gone. */ }
      converted += 1;
    }
    if (placed.length > 0) {
      this.selection.restore(placed);
      this.recordSceneCommand('Convert to outlines', snap.before, snap.selected, placed, snap.retained);
    }
    this.updateTextContent();
    this.notify();
    return { converted, skipped };
  }

  // --- User fonts (Tier Two, Slice 6) --------------------------------
  // Fonts loaded from a file or URL: parsed by opentype.js for
  // metrics/outlines and registered with FontFace for canvas
  // rendering. The family list persists in settings; URL fonts
  // reload on startup, file fonts are session-only (their names are
  // remembered so documents keep naming them, marked not loaded).

  userFonts(): Array<{ family: string; source: 'file' | 'url'; url?: string; loaded: boolean }> {
    return this.textMetrics.userFontList();
  }

  /** Settings payload: every user font the user has added. */
  userFontSettings(): Array<{ family: string; source: 'file' | 'url'; url?: string }> {
    return this.textMetrics.userFontList()
      .map(({ family, source, url }) => ({ family, source, url }));
  }

  /** Restore user fonts from settings: URL fonts refetch; file fonts
   * are remembered by name only (bytes are session-only). */
  restoreUserFonts(list: Array<{ family: string; source: 'file' | 'url'; url?: string }>): void {
    for (const entry of list ?? []) {
      if (!entry || typeof entry.family !== 'string' || !entry.family) continue;
      if (entry.source === 'url' && typeof entry.url === 'string' && entry.url) {
        void this.addUserFontFromUrl(entry.url, entry.family);
      } else {
        this.textMetrics.registerKnownUserFont(entry.family, 'file');
      }
    }
  }

  /** Load a user font from raw TTF/OTF bytes. Returns the family
   * name on success, null on a parse failure. */
  async addUserFontFromBytes(
    bytes: ArrayBuffer,
    source: 'file' | 'url' = 'file',
    url?: string,
  ): Promise<string | null> {
    let font: ReturnType<typeof opentype.parse>;
    try {
      font = opentype.parse(bytes);
    } catch {
      return null;
    }
    let family = '';
    try { family = font.getEnglishName('fontFamily') ?? ''; } catch { /* Fall through. */ }
    if (!family) {
      try { family = font.names?.fontFamily?.en ?? ''; } catch { /* No name table. */ }
    }
    if (!family) return null;
    this.textMetrics.registerUserFont(family, font, source, url);
    // Canvas rendering: register the same bytes with FontFace.
    try {
      const FontFaceCtor = (globalThis as { FontFace?: typeof FontFace }).FontFace;
      const fonts = (globalThis as { document?: Document }).document?.fonts;
      if (FontFaceCtor && fonts) {
        const face = new FontFaceCtor(family, bytes);
        await face.load();
        fonts.add(face);
      }
    } catch { /* Metrics/outlines still work; canvas falls back. */ }
    this.notify();
    return family;
  }

  /** Load a user font from a URL (fetched, then the bytes path). */
  async addUserFontFromUrl(url: string, _familyHint?: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await this.addUserFontFromBytes(await res.arrayBuffer(), 'url', url);
    } catch {
      return null;
    }
  }

  /** The weight menu for a family: what the family actually ships. */
  textWeightOptions(family: string): Array<{ value: string; label: string }> {
    return weightsForFamily(family, this.textMetrics.fontFor(family, 'normal'))
      .map(({ value, label }) => ({ value, label }));
  }

  /** Extra points after each paragraph (blank-line separated) in
   * body text. Re-stacks selected body roots immediately. */
  setTextParagraphSpacing(v: number): void {
    if (!Number.isFinite(v)) return;
    const spacing = Math.max(0, Math.min(500, v));
    this.setText({ paragraphSpacing: spacing });
    for (const root of this.editableTextRoots()) {
      try { root.data.paragraphSpacing = spacing; } catch { /* Best effort. */ }
      if (root.data?.textKind === 'body') this.restackBodyLines(root);
    }
    this.documentManager.markEdited('scene');
    this.notify();
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
    const rootData = roots[0]?.data ?? {};
    return {
      content: contents.join('\n'),
      line2: base.line2,
      fontFamily,
      fontSize: size,
      fontWeight,
      italic,
      underline: typeof rootData.underline === 'boolean' ? rootData.underline : base.underline,
      strikethrough: typeof rootData.strikethrough === 'boolean' ? rootData.strikethrough : base.strikethrough,
      caseTransform: rootData.caseTransform === 'upper' || rootData.caseTransform === 'smallCaps'
        ? rootData.caseTransform
        : rootData.caseTransform === 'none' ? 'none' : base.caseTransform,
      baselineShift: typeof rootData.baselineShift === 'number' ? rootData.baselineShift : base.baselineShift,
      wordSpacing: typeof rootData.wordSpacing === 'number' ? rootData.wordSpacing : base.wordSpacing,
      justification: justification === 'left' || justification === 'right' || justification === 'center' || justification === 'justify'
        ? justification
        : base.justification,
      leading: factor !== null ? Math.max(0.8, Math.min(3, factor)) : base.leading,
      letterSpacing: typeof rootData.letterSpacing === 'number' ? rootData.letterSpacing : base.letterSpacing,
      paragraphSpacing: typeof rootData.paragraphSpacing === 'number' ? rootData.paragraphSpacing : base.paragraphSpacing,
    };
  }

  // --- Text styles (Slice 19) -------------------------------------
  // Named TextSpec presets in app settings (not per-document: a
  // style is a tool carried between documents, like added fonts).
  // Applying to a selected text object restyles it as ONE undo
  // entry; with no selection it sets the creation spec. A style
  // never applies content/line2 — those are the document's words.

  textStyles(): Array<TextStyleEntry & { builtIn: boolean }> {
    return [
      ...BUILT_IN_TEXT_STYLES.map((s) => ({ name: s.name, spec: { ...s.spec }, builtIn: true })),
      ...this.userTextStyles.map((s) => ({ name: s.name, spec: { ...s.spec }, builtIn: false })),
    ];
  }

  saveCurrentTextStyle(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (BUILT_IN_TEXT_STYLES.some((s) => s.name === trimmed)) return false;
    const spec = this.selectionText() ?? { ...this.globalText };
    const entry: TextStyleEntry = { name: trimmed, spec: { ...spec } };
    const existing = this.userTextStyles.findIndex((s) => s.name === trimmed);
    if (existing >= 0) this.userTextStyles[existing] = entry;
    else this.userTextStyles.push(entry);
    this.notify();
    return true;
  }

  deleteTextStyle(name: string): boolean {
    const index = this.userTextStyles.findIndex((s) => s.name === name);
    if (index < 0) return false;
    this.userTextStyles.splice(index, 1);
    this.notify();
    return true;
  }

  applyTextStyle(name: string): boolean {
    const entry = this.textStyles().find((s) => s.name === name);
    if (!entry) return false;
    const roots = this.editableTextRoots();
    if (roots.length === 0) {
      this.setText(stylePatch(entry.spec));
      return true;
    }
    // One undo entry: scene commands only track item set changes,
    // so an in-place restyle pushes a custom command capturing the
    // lines' before/after style state (the point-edit pattern).
    const spec = entry.spec;
    interface LineState {
      fontFamily: unknown; fontWeight: unknown; fontSize: unknown;
      leading: unknown; justification: unknown; italic: boolean;
    }
    const DATA_KEYS = [
      'letterSpacing', 'paragraphSpacing', 'underline', 'strikethrough',
      'caseTransform', 'baselineShift', 'wordSpacing',
    ] as const;
    const capture = (): { lines: Map<AnyItem, LineState>; data: Map<AnyItem, Record<string, unknown>> } => {
      const lines = new Map<AnyItem, LineState>();
      const data = new Map<AnyItem, Record<string, unknown>>();
      for (const root of roots) {
        const rootData: Record<string, unknown> = {};
        for (const key of DATA_KEYS) {
          try { rootData[key] = root.data?.[key]; } catch { /* Unreadable. */ }
        }
        data.set(root, rootData);
        for (const line of this.editableLines(root)) {
          let italic = false;
          try { italic = line.data?.italic === true; } catch { /* Not italic. */ }
          lines.set(line, {
            fontFamily: line.fontFamily, fontWeight: line.fontWeight,
            fontSize: line.fontSize, leading: line.leading,
            justification: line.justification, italic,
          });
        }
      }
      return { lines, data };
    };
    const apply = (state: { lines: Map<AnyItem, LineState>; data: Map<AnyItem, Record<string, unknown>> }): void => {
      this.applyToEditableText((lines, root) => {
        for (const line of lines) {
          const s = state.lines.get(line);
          if (!s) continue;
          line.fontFamily = s.fontFamily;
          line.fontWeight = s.fontWeight;
          line.fontSize = s.fontSize;
          line.leading = s.leading;
          line.justification = s.justification;
          this.setLineItalic(line, s.italic);
        }
        const rootData = state.data.get(root);
        if (rootData) {
          try {
            for (const key of DATA_KEYS) root.data[key] = rootData[key];
          } catch { /* Best effort. */ }
        }
      }, true);
    };
    const before = capture();
    const touched = this.applyToEditableText((lines, root) => {
      for (const line of lines) {
        line.fontFamily = spec.fontFamily;
        line.fontWeight = spec.fontWeight;
        line.fontSize = spec.fontSize;
        line.leading = Math.max(0.8, spec.leading || 1.2) * spec.fontSize;
        line.justification = spec.justification;
        this.setLineItalic(line, spec.italic);
      }
      try {
        root.data.letterSpacing = spec.letterSpacing;
        root.data.paragraphSpacing = spec.paragraphSpacing;
        root.data.underline = spec.underline;
        root.data.strikethrough = spec.strikethrough;
        root.data.caseTransform = spec.caseTransform;
        root.data.baselineShift = spec.baselineShift;
        root.data.wordSpacing = spec.wordSpacing;
      } catch { /* Best effort. */ }
    }, true);
    if (touched) {
      const after = capture();
      this.history.push({
        label: `Apply text style ${name}`,
        undo: () => { apply(before); this.notify(); },
        redo: () => { apply(after); this.notify(); },
      });
      this.documentManager.markEdited('scene');
    }
    this.notify();
    return true;
  }

  /** Settings payload: the user's saved styles (built-ins ship in
   * code and are never stored). */
  userTextStyleSettings(): TextStyleEntry[] {
    return this.userTextStyles.map((s) => ({ name: s.name, spec: { ...s.spec } }));
  }

  restoreUserTextStyles(list: unknown): void {
    if (!Array.isArray(list)) return;
    const out: TextStyleEntry[] = [];
    for (const raw of list) {
      const entry = sanitizeTextStyle(raw, this.globalText);
      if (entry
        && !BUILT_IN_TEXT_STYLES.some((b) => b.name === entry.name)
        && !out.some((o) => o.name === entry.name)) {
        out.push(entry);
      }
    }
    this.userTextStyles = out;
  }

  // --- Find & Replace in text (Slice 19) ---------------------------
  // Scope: the standalone text objects on the current page (editable
  // roots across the page's content layers). Shape-attached text is
  // regenerated from the creation spec, so it is not searched.

  pageTextObjects(): AnyItem[] {
    return this.allContentItems().filter((item) => !!item?.data?.editableText);
  }

  private countOccurrences(haystack: string, needle: string, caseSensitive: boolean): number {
    if (!needle) return 0;
    const h = caseSensitive ? haystack : haystack.toLowerCase();
    const n = caseSensitive ? needle : needle.toLowerCase();
    let count = 0;
    let at = h.indexOf(n);
    while (at >= 0) {
      count += 1;
      at = h.indexOf(n, at + n.length);
    }
    return count;
  }

  countTextMatches(query: string, caseSensitive: boolean): number {
    let total = 0;
    for (const root of this.pageTextObjects()) {
      for (const line of this.editableLines(root)) {
        try { total += this.countOccurrences(String(line.content ?? ''), query, caseSensitive); } catch { /* Skip unreadable lines. */ }
      }
    }
    return total;
  }

  private replaceInText(
    content: string, query: string, replacement: string, caseSensitive: boolean, firstOnly: boolean,
  ): { text: string; count: number } {
    if (!query) return { text: content, count: 0 };
    const h = caseSensitive ? content : content.toLowerCase();
    const n = caseSensitive ? query : query.toLowerCase();
    let out = '';
    let from = 0;
    let count = 0;
    let at = h.indexOf(n, from);
    while (at >= 0) {
      out += content.slice(from, at) + replacement;
      from = at + n.length;
      count += 1;
      if (firstOnly) break;
      at = h.indexOf(n, from);
    }
    out += content.slice(from);
    return { text: out, count };
  }

  /** Push one undo entry for a set of in-place line-content edits
   * (scene commands only track item set changes, so content edits
   * capture before/after strings — the point-edit pattern). */
  private recordTextContentEdit(label: string, plans: Array<{ line: AnyItem; before: string; after: string }>): void {
    const apply = (key: 'before' | 'after'): void => {
      for (const plan of plans) {
        try { plan.line.content = plan[key]; } catch { /* Keep the current line. */ }
      }
    };
    apply('after');
    this.history.push({
      label,
      undo: () => { apply('before'); this.notify(); },
      redo: () => { apply('after'); this.notify(); },
    });
    this.documentManager.markEdited('scene');
    this.notify();
  }

  /** Replace every match on the page as ONE undo entry; returns
   * the number of replacements (0 records no history). */
  replaceAllText(query: string, replacement: string, caseSensitive: boolean): number {
    if (!query) return 0;
    const plans: Array<{ line: AnyItem; before: string; after: string }> = [];
    let total = 0;
    for (const root of this.pageTextObjects()) {
      for (const line of this.editableLines(root)) {
        let content = '';
        try { content = String(line.content ?? ''); } catch { continue; }
        const result = this.replaceInText(content, query, replacement, caseSensitive, false);
        if (result.count > 0) {
          plans.push({ line, before: content, after: result.text });
          total += result.count;
        }
      }
    }
    if (total === 0) return 0;
    this.recordTextContentEdit('Replace all text', plans);
    return total;
  }

  /** Replace the first match on the page (one undo entry). */
  replaceFirstTextMatch(query: string, replacement: string, caseSensitive: boolean): boolean {
    if (!query) return false;
    for (const root of this.pageTextObjects()) {
      for (const line of this.editableLines(root)) {
        let content = '';
        try { content = String(line.content ?? ''); } catch { continue; }
        const result = this.replaceInText(content, query, replacement, caseSensitive, true);
        if (result.count > 0) {
          this.recordTextContentEdit('Replace text', [{ line, before: content, after: result.text }]);
          return true;
        }
      }
    }
    return false;
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
    const paragraphSpacing = Math.max(0, Number(root.data?.paragraphSpacing) || 0);
    let y = origin.y;
    lines.forEach((line, i) => {
      if (i === 0) return;
      y += step;
      // A blank line ends a paragraph: the next line also gets the
      // paragraph gap (Tier Two, Slice 6).
      const prev = lines[i - 1];
      let prevBlank = false;
      try { prevBlank = String(prev?.content ?? '').trim() === ''; } catch { /* Not blank. */ }
      if (prevBlank) y += paragraphSpacing;
      try {
        line.position = new this.scope.Point(origin.x, y);
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

  /** Double-click entry: select the double-clicked editable text root and
   * open it for retyping. Anything else is a no-op. */
  startTextEdit(item: AnyItem): void {
    if (this.isTypingText || this.isLiveDrawing) return;
    let root = item;
    try { root = this.topUserGroupOf(item) ?? item; } catch { /* Keep the hit item. */ }
    if (!root?.data?.editableText) return;
    this.selection.restore([root]);
    this.startTypeText();
  }

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

  /** Alt+[ / ] while typing: step the font size (Shift steps by 10). */
  adjustTypedFontSize(delta: number): void {
    if (!this.isTypingText || !Number.isFinite(delta) || delta === 0) return;
    this.setTextFontSize(this.globalText.fontSize + delta);
    if (this.typedTextMode === 'new') this.restyleTypingPreview();
  }

  /** Alt+; / ' while typing: rotate about the cursor (edit: the anchor). */
  rotateTypedText(degrees: number): void {
    if (!this.isTypingText || !Number.isFinite(degrees) || degrees === 0) return;
    this.typedTextRotation += degrees;
    try {
      if (this.typedTextMode === 'edit' && this.typedTextEditRoot && this.typedTextAnchor) {
        this.typedTextEditRoot.rotate(degrees, this.typedTextAnchor);
      } else if (this.typedTextPreview && this.mousePt) {
        this.typedTextPreview.rotate(degrees, this.mousePt);
      }
    } catch { /* Keep the current angle. */ }
    if (this.typedTextMode === 'new') this.anchorTypingPreview();
    this.updateTextContent(); this.notify();
  }

  /** Alt+B while typing: toggle bold on the draft (and the edited object). */
  toggleTypedBold(): void {
    if (!this.isTypingText) return;
    this.setTextFontWeight(this.globalText.fontWeight === 'bold' ? 'normal' : 'bold');
    if (this.typedTextMode === 'new') this.restyleTypingPreview();
  }

  /** Re-apply Text settings to the draft preview after a style chord. */
  private restyleTypingPreview(): void {
    const preview = this.typedTextPreview;
    if (!preview) return;
    try {
      this.styleTypedTextItem(preview);
      preview.opacity = 0.7;
    } catch { /* Keep the current style. */ }
    this.anchorTypingPreview();
    this.updateTextContent(); this.notify();
  }

  setTypeCursorAnchor(anchor: TypeCursorAnchor): void {
    const anchors: TypeCursorAnchor[] = [
      'top-left', 'top-center', 'top-right',
      'middle-left', 'center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right',
    ];
    if (!anchors.includes(anchor)) return;
    this.typeCursorAnchor = anchor;
    if (this.isTypingText && this.typedTextMode === 'new') this.anchorTypingPreview();
    this.updateTextContent(); this.notify();
  }

  setTypeCursorBottomEdge(edge: TypeCursorBottomEdge): void {
    if (edge !== 'baseline' && edge !== 'descender') return;
    this.typeCursorBottomEdge = edge;
    if (this.isTypingText && this.typedTextMode === 'new') this.anchorTypingPreview();
    this.updateTextContent(); this.notify();
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
      const rotated = this.typedTextRotation;
      const body = root?.data?.textKind === 'body';
      this.endTypingSession();
      try {
        this.context.history.push({
          label: 'Edit text',
          undo: () => {
            this.setTypedEditContent(root, prev.join('\n'), body, anchor);
            this.rotateTypedEditRoot(root, -rotated, anchor);
          },
          redo: () => {
            this.setTypedEditContent(root, next, body, anchor);
            this.rotateTypedEditRoot(root, rotated, anchor);
          },
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
      this.rotateTypedEditRoot(root, -this.typedTextRotation, this.typedTextAnchor);
    }
    this.endTypingSession();
    this.updateTextContent(); this.notify();
  }

  /** Counter-rotate an edited root (undo/redo/cancel); a no-op at 0°. */
  private rotateTypedEditRoot(root: AnyItem, degrees: number, anchor: AnyItem): void {
    if (!root || !anchor || !Number.isFinite(degrees) || degrees === 0) return;
    try {
      root.rotate(degrees, anchor);
    } catch { /* Keep the current angle. */ }
    this.documentManager.markEdited('scene');
  }

  private endTypingSession(): void {
    if (this.typedTextPreview) {
      try { this.typedTextPreview.remove(); } catch { /* Detached already. */ }
    }
    this.isTypingText = false;
    this.typedTextMode = null;
    this.typedTextBuffer = '';
    this.typedTextRotation = 0;
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
    pt.data.letterSpacing = spec.letterSpacing;
    pt.data.paragraphSpacing = spec.paragraphSpacing;
    pt.data.underline = spec.underline;
    pt.data.strikethrough = spec.strikethrough;
    pt.data.caseTransform = spec.caseTransform;
    pt.data.baselineShift = spec.baselineShift;
    pt.data.wordSpacing = spec.wordSpacing;
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

  /** Pin the preview's anchor point to the cursor hot point. */
  private anchorTypingPreview(): void {
    const preview = this.typedTextPreview;
    const at = this.mousePt;
    if (!preview || !at) return;
    const pin = this.typingPinOf(preview);
    if (!pin) return;
    try {
      preview.translate(at.subtract(pin));
    } catch { /* Keep the preview where it is. */ }
  }

  /** The cursor pin of a typed item in project coordinates, or null when
   * the bounds are unreadable. Bottom-row anchors pin the baseline when the
   * bottom edge is the baseline box, else the descender line. */
  private typingPinOf(item: AnyItem): AnyItem | null {
    try {
      const bounds = item?.bounds;
      if (!bounds || !Number.isFinite(bounds.left)) return null;
      let bottomY: number | null | undefined;
      if (this.typeCursorBottomEdge === 'baseline' && this.typeCursorAnchor.startsWith('bottom')) {
        bottomY = this.typingBaselineOf(item);
        if (bottomY == null) return null;
      }
      const pin = typeAnchorPoint(bounds, this.typeCursorAnchor, bottomY ?? undefined);
      return new this.scope.Point(pin.x, pin.y);
    } catch {
      return null;
    }
  }

  /** The baseline y of a typed item in project coordinates (its local
   * origin, as for textAnchorOf), or null when unreadable. */
  private typingBaselineOf(item: AnyItem): number | null {
    try {
      const origin = item.localToGlobal(new this.scope.Point(0, 0));
      const y = Number(origin?.y);
      return Number.isFinite(y) ? y : null;
    } catch {
      return null;
    }
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
      if (this.typedTextRotation) placed.rotate(this.typedTextRotation, target);
      const pin = this.typingPinOf(placed);
      if (pin) this.anchorTextPointOn(placed, target, pin);
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
    if (mode !== 'union' && mode !== 'subtract' && mode !== 'intersect' && mode !== 'exclude' && mode !== 'crop' && mode !== 'cut') return;
    this.combinatorics.combineSelection(mode);
  }

  setCombineMode(m: CombineMode | 'none'): void {
    if (m !== 'none' && m !== 'union' && m !== 'subtract' && m !== 'intersect' && m !== 'exclude' && m !== 'crop'
      && m !== 'cut' && m !== 'interlace') return;
    if (m !== 'none') this.combineTool = m;
    this.combineMode = m;
    this.updatePreviewBox();
    this.updateTextContent();
    this.notify();
  }

  setCombineTool(m: CombineMode): void {
    if (m !== 'union' && m !== 'subtract' && m !== 'intersect' && m !== 'exclude' && m !== 'crop' && m !== 'cut' && m !== 'interlace') return;
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

  /** Bow parameters stamped onto bowed points at deposit (Slice 14,
   * TASKS-FMStroke Phase 5.3). Stored through the settings registry. */
  get bowAmplitude(): number { return this.compositePathTool.bowParams.amplitude; }
  setBowAmplitude(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.compositePathTool.setBowParams({ amplitude: value });
    this.updateTextContent();
    this.notify();
  }
  get bowAmplitudeIsPercent(): boolean { return this.compositePathTool.bowParams.amplitudeIsPercent; }
  setBowAmplitudeIsPercent(on: boolean): void {
    this.compositePathTool.setBowParams({ amplitudeIsPercent: !!on });
    this.updateTextContent();
    this.notify();
  }
  get bowPeakLocation(): number { return this.compositePathTool.bowParams.peakLocation; }
  setBowPeakLocation(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) return;
    this.compositePathTool.setBowParams({ peakLocation: value });
    this.updateTextContent();
    this.notify();
  }
  get bowIsArc(): boolean { return this.compositePathTool.bowParams.isArc; }
  setBowIsArc(on: boolean): void {
    this.compositePathTool.setBowParams({ isArc: !!on });
    this.updateTextContent();
    this.notify();
  }
  /** The live session's rounding selection (status display). */
  get compositeRoundingMode(): string { return this.compositePathTool.roundingMode; }

  /** Manual keyboard-layout choice: 'auto' follows D1 (the spline
   * layout activates while composite mode is on / a composite
   * session is live); 'base'/'spline' pin a layout when not drawing
   * a composite path. */
  keyboardLayoutChoice: 'auto' | 'base' | 'spline' = 'auto';
  setKeyboardLayoutChoice(choice: string): void {
    if (choice !== 'auto' && choice !== 'base' && choice !== 'spline') return;
    this.keyboardLayoutChoice = choice;
    this.updateTextContent();
    this.notify();
  }
  activeKeyboardLayoutId(): string {
    if (this.compositePathTool.active || this.pathDrawingMode === 'ngComposite') return 'spline';
    return this.keyboardLayoutChoice === 'auto' ? 'base' : this.keyboardLayoutChoice;
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
  // Dots (or lattice lines) at the grid spacing, with optional minor
  // subdivision dots; colour and opacity are per-document settings.
  // Diamond is the square lattice rotated 45° with the same neighbor
  // spacing, so snap targets coincide with the rendered lattice (see
  // snapToGrid).
  drawGrid(): void {
    this.gridRenderer.draw(this.gridType, this.gridSpacing, {
      subdivisions: this.gridSubdivisions,
      style: this.gridStyle,
      color: this.gridColor,
      opacity: this.gridOpacity,
    });
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
          sheet.fillColor = new scope.Color(this.pageFillColor);
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
          const major = 10 / zoom;
          const minor = 6 / zoom;
          // Side ticks measure from the page corner at nice intervals,
          // like the rulers — not on grid lines.
          const along = (size: number, phase: number) => computeRulerTicks(size, unit, zoom, phase, true);
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
    this.mousePt = this.snapPointToGuides(this.mousePt);
    this.pathSnapCursor = this.snapping.pathIndicator;
  }
  applyPointSnapping(original: AnyItem): void {
    const snapped = this.snapping.snapPoint(original);
    if (snapped) this.mousePt = snapped;
    this.mousePt = this.snapPointToGuides(this.mousePt);
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

  /** History panel data: entry labels in chronological order and
   * the current position (entries before it are applied). */
  historyEntries(): { labels: string[]; position: number } {
    return this.history.entries();
  }

  /** Jump the history to a position (0 = empty document state
   * before the first entry) by walking undo/redo one entry at a
   * time — the same commands the Undo/Redo buttons run, so every
   * entry's own guards apply. One user action, several entries. */
  jumpToHistoryPosition(position: number): void {
    if (this.isLiveDrawing) return;
    const { labels } = this.history.entries();
    const target = Math.max(0, Math.min(labels.length, Math.round(position)));
    let guard = labels.length + 2;
    while (guard-- > 0) {
      const current = this.history.entries().position;
      if (current === target) break;
      if (current > target) this.history.undo();
      else this.history.redo();
    }
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

  pasteSceneJson(json: string, at?: AnyItem, inPlace = false): boolean {
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
    // Paste in Place keeps the decoded (source) coordinates instead
    // of re-centring on the paste target.
    if (!inPlace) this.centerPlacedOn(placed, this.pasteTarget(at));
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
      pt.data.letterSpacing = spec.letterSpacing;
      pt.data.paragraphSpacing = spec.paragraphSpacing;
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
      const bodyLines = splitBodyLines(clean);
      let stackY = target.y;
      bodyLines.forEach((line, index) => {
        if (index > 0) {
          stackY += leading;
          // Blank line = paragraph break: add the paragraph gap.
          if (bodyLines[index - 1].trim() === '') stackY += Math.max(0, spec.paragraphSpacing);
        }
        const pt: AnyItem = new this.scope.PointText(
          new this.scope.Point(target.x, stackY),
        );
        pt.content = line.length > 0 ? line : ' ';
        styleText(pt, 'body');
        group.addChild(pt);
      });
      group.data.textKind = 'body';
      group.data.editableText = true;
      group.data.letterSpacing = spec.letterSpacing;
      group.data.paragraphSpacing = spec.paragraphSpacing;
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
  pasteImageDataUrl(dataUrl: string, at?: AnyItem, label = 'Paste image'): boolean {
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
        this.lastDropNote = '';
        this.history.recordDrop(label, raster, selectedBefore);
        this.updateTextContent(); this.notify();
      };
      raster.onError = () => {
        try { raster.remove(); } catch { /* Already gone. */ }
        this.lastDropNote = 'Import failed: that image did not decode.';
        this.updateTextContent(); this.notify();
      };
    } catch {
      return false;
    }
    return true;
  }

  /** Surface an import failure in the status overlay. */
  noteImportFailure(note: string): void {
    this.lastDropNote = note;
    this.updateTextContent();
    this.notify();
  }

  /** File > Import > Raster. Same decode path as an image paste. */
  importRasterDataUrl(dataUrl: string, label: string): boolean {
    return this.pasteImageDataUrl(dataUrl, undefined, label);
  }

  /** Place already-decoded canvases (PDF page rasters) as one undoable
   * item at the view center, fitted like a drop. Pages share one user
   * group so Ungroup releases them one level at a time. */
  importRasterCanvases(label: string, sources: HTMLCanvasElement[], note = ''): boolean {
    if (this.isLiveDrawing || this.isTypingText || sources.length === 0) return false;
    const selectedBefore = [...this.selectedItems];
    const scope = this.scope;
    let placed: AnyItem = null;
    try {
      const gap = 24 / Math.max(this.zoomLevel, 0.1);
      let cursor = 0;
      const rasters: AnyItem[] = [];
      for (const source of sources) {
        const raster: AnyItem = new scope.Raster(source);
        const width = raster.bounds?.width ?? source.width;
        raster.position = new scope.Point(cursor + width / 2, (raster.bounds?.height ?? source.height) / 2);
        cursor += width + gap;
        rasters.push(raster);
      }
      const group: AnyItem = new scope.Group(rasters);
      try { group.data.isUserGroup = true; } catch { /* Grouping just won't apply. */ }
      placed = group;
      const center = scope.view?.center;
      if (center) placed.position = center.clone();
      this.fitPlacedToView(placed);
    } catch {
      this.lastDropNote = 'Import failed: could not place those pages.';
      this.updateTextContent(); this.notify();
      return false;
    }
    if (!placed) return false;
    this.selection.restore([placed]);
    this.lastDropNote = note;
    this.history.recordDrop(label, placed, selectedBefore);
    this.updateTextContent(); this.notify();
    return true;
  }

  /** File > Import > PDF vector path. Each page's artwork lands as a user
   * group; several pages share one outer group. One undo entry. False when
   * no page built anything, so the caller can fall back to raster. */
  importPdfArtwork(label: string, pages: { width: number; height: number; group: PdfArtworkGroup }[]): boolean {
    if (this.isLiveDrawing || this.isTypingText || pages.length === 0) return false;
    if (!pages.some((page) => artworkNodeHasVectors(page.group))) return false;
    const selectedBefore = [...this.selectedItems];
    const scope = this.scope;
    const placed: AnyItem[] = [];
    try {
      const gap = 24 / Math.max(this.zoomLevel, 0.1);
      let cursor = 0;
      for (const page of pages) {
        const built = buildArtworkNode(scope, page.group);
        const item = built ? adoptImportedArtwork(scope, built) : null;
        if (!item) continue;
        const width = item.bounds?.width ?? page.width;
        const height = item.bounds?.height ?? page.height;
        try {
          item.position = new scope.Point(cursor + width / 2, height / 2);
        } catch { /* Keep the recovered coordinates. */ }
        cursor += width + gap;
        placed.push(item);
      }
    } catch {
      return false;
    }
    if (placed.length === 0) return false;
    let top: AnyItem = placed.length === 1 ? placed[0] : null;
    if (!top) {
      try {
        top = new scope.Group(placed);
        try { top.data.isUserGroup = true; } catch { /* Grouping just won't apply. */ }
      } catch {
        return false;
      }
    }
    try {
      const center = scope.view?.center;
      if (center) top.position = center.clone();
    } catch { /* Keep the laid-out position. */ }
    this.fitPlacedToView(top);
    this.selection.restore([top]);
    this.lastDropNote = '';
    this.history.recordDrop(label, top, selectedBefore);
    this.updateTextContent(); this.notify();
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

  /** Paste in Place (Edit menu): scene payloads land at the exact
   * coordinates they were copied from — no cascade, no re-centring.
   * Non-scene clipboard content has no source position, so it takes
   * the ordinary paste path. */
  async pasteInPlaceFromClipboard(): Promise<boolean> {
    if (this.isLiveDrawing || this.isTypingText) return false;
    try {
      const clip = await readSystemClipboard();
      if (clip.scene && this.pasteSceneJson(clip.scene, undefined, true)) return true;
    } catch {
      // Fall through to the internal buffer below.
    }
    const internal = this.clipboardSceneJson();
    if (internal) return this.pasteSceneJson(internal, undefined, true);
    return this.pasteFromSystemClipboard();
  }

  // --- Selection lock / hide (Object menu) ---

  /** Lock the selected objects in place (they stay visible; the
   * Layers panel unlocks per object). Mirrors the panel setters:
   * not an undo entry. */
  lockSelection(): void {
    const items = this.topLevelSelected();
    if (items.length === 0) return;
    for (const item of items) {
      try { item.locked = true; } catch { /* Detached. */ }
    }
    this.documentManager.markEdited('scene');
    this.notify();
  }

  /** Hide the selected objects (the Layers panel shows them again
   * per object). The selection clears — hidden objects are not a
   * working selection. */
  hideSelection(): void {
    const items = this.topLevelSelected();
    if (items.length === 0) return;
    for (const item of items) {
      try { item.visible = false; } catch { /* Detached. */ }
    }
    this.clearOutSelection();
    this.documentManager.markEdited('scene');
    this.notify();
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

  // --- Image menu (Image top-level menu) ---
  // Placed images are Paper Rasters; pixel work runs on the raster's live
  // canvas in the browser, never through Sharp (Node-only).

  /** Paper Rasters among the current selection. Empty when none selected. */
  selectedRasters(): AnyItem[] {
    try {
      const Raster = this.scope?.Raster;
      if (!Raster) return [];
      return this.selectedItems.filter((item) => item instanceof Raster);
    } catch {
      return [];
    }
  }

  /** Whether at least one placed image is selected. Gates Image menu rows. */
  hasSelectedRaster(): boolean {
    return this.selectedRasters().length > 0;
  }

  /** Scale every selected image about its collective center, with undo. */
  scaleSelectedRasters(factor: number): boolean {
    if (this.isLiveDrawing || !Number.isFinite(factor) || factor <= 0 || factor === 1) return false;
    const rasters = this.selectedRasters();
    if (rasters.length === 0) return false;
    const center = this.collectiveCenter(rasters);
    for (const raster of rasters) raster.scale(factor, center);
    this.selection.refreshCentroids();
    this.history.recordScale(rasters, factor, center);
    this.updateTextContent(); this.notify();
    return true;
  }

  /** Shrink selected images that overflow the view, with undo. Images that
   * already fit are left alone; when none change, a note says so. */
  fitSelectedRastersToView(): boolean {
    if (this.isLiveDrawing) return false;
    const rasters = this.selectedRasters();
    if (rasters.length === 0) return false;
    try {
      const vb = this.scope.view.bounds;
      let applied = 0;
      for (const raster of rasters) {
        const center = raster.bounds.center;
        const scale = viewFitScale(raster.bounds, vb);
        if (!(scale < 1)) continue;
        raster.scale(scale, center);
        this.history.recordScale([raster], scale, center);
        applied += 1;
      }
      this.lastDropNote = applied > 0 ? 'Image fit to view.' : 'Image already fits the view.';
      this.selection.refreshCentroids();
      this.updateTextContent(); this.notify();
      return applied > 0;
    } catch {
      return false;
    }
  }

  /** Surface the first selected image's pixel and placed size in the status
   * overlay, through the same note channel as drop outcomes. */
  noteSelectedRasterInfo(): boolean {
    const raster = this.selectedRasters()[0];
    if (!raster) return false;
    try {
      const w = Math.round(raster.width ?? 0);
      const h = Math.round(raster.height ?? 0);
      const bw = Math.round(raster.bounds?.width ?? 0);
      const bh = Math.round(raster.bounds?.height ?? 0);
      const extra = (bw !== w || bh !== h) ? `, placed ${bw} × ${bh} pt` : '';
      this.lastDropNote = `Image: ${w} × ${h} px${extra}.`;
    } catch {
      this.lastDropNote = 'Image info unavailable.';
    }
    this.updateTextContent(); this.notify();
    return true;
  }

  // --- Images as citizens (Slice 8): trace, crop, shape mask,
  // mask booleans. A placed image is a Raster, or the mask group
  // wrapping one once it has a crop/mask record. ---

  /** True when the item is image content: a Raster or a mask group. */
  private isImageRoot(item: AnyItem): boolean {
    if (!item) return false;
    if (isImageMaskGroup(item)) return true;
    try {
      const Raster = this.scope?.Raster;
      return !!Raster && item instanceof Raster;
    } catch { return false; }
  }

  /** Whether any placed image (bare or masked) is selected. */
  hasSelectedImage(): boolean {
    return this.selectedItems.some((item) => this.isImageRoot(item));
  }

  /** The first selected image root (Raster or its mask group). */
  selectedImageRoot(): AnyItem | null {
    return this.selectedItems.find((item) => this.isImageRoot(item)) ?? null;
  }

  private retainImageMaskItem(root: AnyItem): void {
    if (!isImageMaskGroup(root)) return;
    for (const child of (root.children ?? []) as AnyItem[]) {
      if (child?.data?.imageMaskPath === true) {
        try { this.scene.retain(child); } catch { /* mask retention is best-effort */ }
      }
    }
  }

  /** Crop an image root to a document-space rectangle (its
   * boundary record). Null clears the crop. One history step. */
  applyImageCrop(root: AnyItem, crop: ImageCropRect | null): AnyItem | null {
    if (!root || this.isLiveDrawing) return null;
    const snap = this.captureDeposit();
    const next = setImageCrop(this.scope, root, crop);
    this.retainImageMaskItem(next);
    this.recordSceneCommand(crop ? 'Crop Image' : 'Remove Image Crop', snap.before, snap.selected, [next], snap.retained);
    this.updateTextContent(); this.notify();
    return next;
  }

  /** Use a shape item's geometry as an image's clipping mask. The
   * shape is consumed (its geometry lives on as the mask record). */
  applyImageShapeMask(root: AnyItem, shapeItem: AnyItem): AnyItem | null {
    if (!root || !shapeItem || this.isLiveDrawing) return null;
    const geo = this.shapePartOf(shapeItem);
    if (!geo) return null;
    const snap = this.captureDeposit();
    const next = setImageMask(this.scope, root, geo);
    this.retainImageMaskItem(next);
    if (shapeItem !== geo) { /* shapePartOf may return the item itself */ }
    try { shapeItem.remove(); } catch { /* already gone */ }
    this.recordSceneCommand('Mask Image', snap.before, snap.selected, [next], snap.retained);
    this.updateTextContent(); this.notify();
    return next;
  }

  /** Clear an image's shape mask (crop record, if any, stays). */
  applyImageMaskRemoval(root: AnyItem): AnyItem | null {
    if (!root || this.isLiveDrawing) return null;
    const snap = this.captureDeposit();
    const next = clearImageMask(this.scope, root);
    this.retainImageMaskItem(next);
    this.recordSceneCommand('Remove Image Mask', snap.before, snap.selected, [next], snap.retained);
    this.updateTextContent(); this.notify();
    return next;
  }

  /** Boolean an image against a tool shape by rewriting its mask. */
  applyImageBoolean(root: AnyItem, mode: 'subtract' | 'intersect' | 'crop' | 'union', toolItem: AnyItem): AnyItem | null {
    if (!root || !toolItem || this.isLiveDrawing) return null;
    const geo = this.shapePartOf(toolItem);
    if (!geo) return null;
    const snap = this.captureDeposit();
    const next = booleanImageMask(this.scope, root, mode, geo);
    this.retainImageMaskItem(next);
    try { toolItem.remove(); } catch { /* consumed like a combine tool */ }
    this.recordSceneCommand('Image Mask Boolean', snap.before, snap.selected, [next], snap.retained);
    this.updateTextContent(); this.notify();
    return next;
  }

  /** CombinatoricsManager hook: an image + shape pair combines by
   * mask, never by pixels. Returns true when handled. */
  combineImageMask(mode: CombineMode, items: AnyItem[]): boolean {
    if (this.isLiveDrawing || !items || items.length < 2) return false;
    const image = items.find((item) => this.isImageRoot(item));
    if (!image) return false;
    const tool = items.find((item) => item !== image && !this.isImageRoot(item) && !this.isNonContentItem(item));
    if (!tool) return false;
    if (mode === 'cut') {
      this.lastCombineNote = 'Cut does not apply to images — the mask is unchanged.';
      return true;
    }
    if (mode === 'exclude') {
      this.lastCombineNote = 'Exclude does not apply to images — the mask is unchanged.';
      return true;
    }
    if (mode === 'interlace') return false;
    const result = this.applyImageBoolean(image, mode, tool);
    this.lastCombineNote = result ? '' : 'No result — shapes may not overlap.';
    return true;
  }

  /** Crop the selected image to the other selected shape's frame. */
  cropSelectedImageToShapeFrame(): boolean {
    const image = this.selectedImageRoot();
    const shape = this.selectedItems.find((item) => item !== image && !this.isImageRoot(item) && !this.isNonContentItem(item));
    if (!image || !shape) { this.lastDropNote = 'Select an image and a shape to crop to its frame.'; this.notify(); return false; }
    const b = shape.bounds;
    return !!this.applyImageCrop(image, { x: b.x, y: b.y, width: b.width, height: b.height });
  }

  /** Mask the selected image with the other selected shape. */
  maskSelectedImageWithShape(): boolean {
    const image = this.selectedImageRoot();
    const shape = this.selectedItems.find((item) => item !== image && !this.isImageRoot(item) && !this.isNonContentItem(item));
    if (!image || !shape) { this.lastDropNote = 'Select an image and a shape to mask with.'; this.notify(); return false; }
    return !!this.applyImageShapeMask(image, shape);
  }

  /** Remove the selected image's shape mask. */
  removeSelectedImageMask(): boolean {
    const image = this.selectedImageRoot();
    if (!image) return false;
    return !!this.applyImageMaskRemoval(image);
  }

  /** Remove the selected image's crop. */
  removeSelectedImageCrop(): boolean {
    const image = this.selectedImageRoot();
    if (!image) return false;
    return !!this.applyImageCrop(image, null);
  }

  /**
   * Deposit traced contours (pixel space) as one editable
   * CompoundPath in document space. Returns the placed item.
   */
  depositTrace(
    bitmap: BitmapInput,
    options: TraceOptions,
    placement: { origin: { x: number; y: number }; scale: number },
  ): AnyItem | null {
    if (this.isLiveDrawing) return null;
    const contours = traceBitmapPixels(bitmap, options);
    if (contours.length === 0) return null;
    const scope = this.scope;
    const { origin, scale } = placement;
    let pathData = '';
    for (const contour of contours) {
      contour.points.forEach((p, i) => {
        const x = origin.x + p.x * scale;
        const y = origin.y + p.y * scale;
        pathData += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      });
      pathData += 'Z';
    }
    const snap = this.captureDeposit();
    const layer = this.layers.activeLayer;
    const item = new scope.CompoundPath(pathData);
    item.fillColor = new scope.Color('#20242c');
    item.fillRule = 'evenodd';
    item.strokeColor = null;
    layer.addChild(item);
    this.scene.retain(item);
    this.selection.restore([item]);
    this.recordSceneCommand('Trace to Vector', snap.before, snap.selected, [item], snap.retained);
    this.updateTextContent(); this.notify();
    return item;
  }

  // --- Filters card parameters (Slice 20) ---------------------------
  // The Filters card's working values live here (settings-backed)
  // so they survive the card closing, instead of dying with the
  // component. Ranges mirror the card's steppers.

  filterBlurRadius = 1;
  filterSharpenRadius = 1;
  filterSharpenAmount = 1;
  filterBrightness = 0;
  filterContrastPct = 100;

  setFilterBlurRadius(v: number): void {
    if (!Number.isFinite(v)) return;
    this.filterBlurRadius = Math.min(10, Math.max(1, Math.round(v)));
    this.notify();
  }

  setFilterSharpenRadius(v: number): void {
    if (!Number.isFinite(v)) return;
    this.filterSharpenRadius = Math.min(10, Math.max(1, Math.round(v)));
    this.notify();
  }

  setFilterSharpenAmount(v: number): void {
    if (!Number.isFinite(v)) return;
    this.filterSharpenAmount = Math.min(3, Math.max(0.1, v));
    this.notify();
  }

  setFilterBrightness(v: number): void {
    if (!Number.isFinite(v)) return;
    this.filterBrightness = Math.min(255, Math.max(-255, Math.round(v)));
    this.notify();
  }

  setFilterContrastPct(v: number): void {
    if (!Number.isFinite(v)) return;
    this.filterContrastPct = Math.min(400, Math.max(10, Math.round(v)));
    this.notify();
  }

  /** Trace the selected image's pixels into vector paths. */
  traceSelectedImage(options: TraceOptions): boolean {
    const root = this.selectedImageRoot();
    const raster = root ? imageContentOf(root) : null;
    if (!raster) { this.lastDropNote = 'Select an image to trace.'; this.notify(); return false; }
    let bitmap: BitmapInput | null = null;
    try {
      const size = raster.size;
      const data = raster.getImageData(new this.scope.Rectangle(0, 0, size.width, size.height));
      bitmap = { data: data.data, width: size.width, height: size.height };
    } catch { bitmap = null; }
    if (!bitmap) {
      try {
        const canvas = raster.canvas as AnyItem;
        const ctx = canvas?.getContext?.('2d');
        const d = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        if (d) bitmap = { data: d.data, width: canvas.width, height: canvas.height };
      } catch { bitmap = null; }
    }
    if (!bitmap) {
      this.lastDropNote = 'Trace needs the image to finish loading first.';
      this.notify();
      return false;
    }
    const bounds = raster.bounds;
    const item = this.depositTrace(bitmap, options, {
      origin: { x: bounds.x, y: bounds.y },
      scale: bounds.width / Math.max(1, bitmap.width),
    });
    if (!item) this.lastDropNote = 'Nothing traced — try a different threshold.';
    this.notify();
    return !!item;
  }

  /** Run a pixel filter over every selected image's live canvas, with one
   * shared undo entry. The filter may mutate in place or return a
   * replacement buffer (for neighborhood ops like blur). Failures surface
   * as a note, never a throw. */
  private mutateSelectedRasterPixels(
    label: string,
    mutate: (pixels: Uint8ClampedArray, width: number, height: number) => void | Uint8ClampedArray,
  ): boolean {
    if (this.isLiveDrawing) return false;
    const rasters = this.selectedRasters();
    if (rasters.length === 0) return false;
    const jobs: Array<{ ctx: AnyItem; before: AnyItem; after: AnyItem }> = [];
    for (const raster of rasters) {
      try {
        const canvas = raster.canvas as HTMLCanvasElement | undefined;
        if (!canvas || !canvas.width || !canvas.height) continue;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const before = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = Uint8ClampedArray.from(before.data);
        const out = mutate(pixels, before.width, before.height);
        const result = out instanceof Uint8ClampedArray && out.length === before.data.length ? out : pixels;
        const after = new ImageData(before.width, before.height);
        after.data.set(result);
        ctx.putImageData(after, 0, 0);
        jobs.push({ ctx, before, after });
      } catch {
        continue;
      }
    }
    if (jobs.length === 0) {
      this.lastDropNote = 'Image pixels are not readable.';
      this.updateTextContent(); this.notify();
      return false;
    }
    this.pushUndoCommand(label,
      () => { for (const job of jobs) job.ctx.putImageData(job.before, 0, 0); },
      () => { for (const job of jobs) job.ctx.putImageData(job.after, 0, 0); });
    return true;
  }

  /** Desaturate every selected image, with undo. Alpha is preserved. */
  grayscaleSelectedRasters(): boolean {
    return this.mutateSelectedRasterPixels('Grayscale image', grayscalePixels);
  }

  /** Composite every selected image onto white, with undo. JPEG export
   * flattens the same way (see Sharp's default background). */
  flattenSelectedRasters(): boolean {
    return this.mutateSelectedRasterPixels('Flatten image transparency', (pixels) => {
      flattenPixels(pixels, 255, 255, 255);
    });
  }

  /** Negative of every selected image, with undo. */
  invertSelectedRasters(): boolean {
    return this.mutateSelectedRasterPixels('Invert image', invertPixels);
  }

  /** Brightness shift (-255..255) on every selected image, with undo.
   * Zero is a no-op and returns false. */
  adjustSelectedRasterBrightness(delta: number): boolean {
    if (!Number.isFinite(delta) || delta === 0) return false;
    const shift = Math.min(255, Math.max(-255, Math.round(delta)));
    return this.mutateSelectedRasterPixels('Adjust image brightness', (pixels) => {
      brightnessPixels(pixels, shift);
    });
  }

  /** Contrast factor on every selected image, with undo. One is a no-op
   * and returns false; the factor clamps to a sane 0.1..4 range. */
  adjustSelectedRasterContrast(factor: number): boolean {
    if (!Number.isFinite(factor) || factor === 1) return false;
    const clamped = Math.min(4, Math.max(0.1, factor));
    return this.mutateSelectedRasterPixels('Adjust image contrast', (pixels) => {
      contrastPixels(pixels, clamped);
    });
  }

  /** Box blur (radius 1..10) on every selected image, with undo. */
  blurSelectedRasters(radius: number): boolean {
    if (!Number.isFinite(radius)) return false;
    const r = Math.min(10, Math.max(1, Math.round(radius)));
    return this.mutateSelectedRasterPixels('Blur image', (pixels, width, height) =>
      boxBlurPixels(pixels, width, height, r));
  }

  /** Unsharp mask (radius 1..10, strength 0.1..3) on every selected
   * image, with undo. */
  sharpenSelectedRasters(radius: number, amount = 1): boolean {
    if (!Number.isFinite(radius) || !Number.isFinite(amount) || amount <= 0) return false;
    const r = Math.min(10, Math.max(1, Math.round(radius)));
    const k = Math.min(3, Math.max(0.1, amount));
    return this.mutateSelectedRasterPixels('Sharpen image', (pixels, width, height) =>
      sharpenPixels(pixels, width, height, r, k));
  }

  /** Re-encode every selected image in place (PNG keeps alpha; JPEG
   * flattens onto white first since the format holds no alpha), with undo
   * via source swap. */
  convertSelectedRaster(format: 'png' | 'jpeg'): boolean {
    if (this.isLiveDrawing || (format !== 'png' && format !== 'jpeg')) return false;
    const rasters = this.selectedRasters();
    if (rasters.length === 0) return false;
    let applied = false;
    for (const raster of rasters) {
      try {
        const canvas = raster.canvas as HTMLCanvasElement | undefined;
        if (!canvas || !canvas.width || !canvas.height) continue;
        let source: HTMLCanvasElement = canvas;
        if (format === 'jpeg') {
          const flat = document.createElement('canvas');
          flat.width = canvas.width;
          flat.height = canvas.height;
          const flatCtx = flat.getContext('2d');
          if (!flatCtx) continue;
          flatCtx.fillStyle = '#ffffff';
          flatCtx.fillRect(0, 0, flat.width, flat.height);
          flatCtx.drawImage(canvas, 0, 0);
          source = flat;
        }
        const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const dataUrl = source.toDataURL(mime, 0.9);
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) continue;
        const before = raster.source;
        raster.source = dataUrl;
        const after = raster.source;
        this.pushUndoCommand(`Convert image to ${format.toUpperCase()}`,
          () => { raster.source = before; },
          () => { raster.source = after; });
        applied = true;
      } catch {
        continue;
      }
    }
    if (!applied) {
      this.lastDropNote = 'Image pixels are not readable.';
      this.updateTextContent(); this.notify();
    }
    return applied;
  }

  /** Swap the first selected image's source for picked file bytes, keeping
   * its placement. Undo swaps the original source back. */
  replaceSelectedRaster(dataUrl: string): boolean {
    if (this.isLiveDrawing || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false;
    const raster = this.selectedRasters()[0];
    if (!raster) return false;
    try {
      const before = raster.source;
      raster.source = dataUrl;
      const after = raster.source;
      this.lastDropNote = 'Image replaced.';
      this.pushUndoCommand('Replace image',
        () => { raster.source = before; },
        () => { raster.source = after; });
      return true;
    } catch {
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

  bringSelectionForward(): void {
    if (this.isLiveDrawing || !this.selection.reorderStep('forward')) return;
    this.updateTextContent(); this.notify();
  }

  sendSelectionBackward(): void {
    if (this.isLiveDrawing || !this.selection.reorderStep('backward')) return;
    this.updateTextContent(); this.notify();
  }

  // --- Layers & Objects (panel API) --------------------------------
  // The panel lists registered content layers and the objects in
  // them. Object rows are keyed by Paper item id; selecting a row
  // activates the object's layer first, because selection and
  // ordering operate within the active layer.

  listLayers(): LayerRecord[] { return this.layers.listLayers(); }

  activeLayerId(): string | null { return this.layers.activeLayerId; }

  createLayer(name?: string): LayerRecord {
    const record = this.layers.createLayer(name);
    this.documentManager.markEdited('scene');
    this.notify();
    return record;
  }

  deleteLayer(id: string): boolean {
    const removed = this.layers.deleteLayer(id);
    if (!removed) return false;
    for (const item of removed) {
      try { item.remove(); } catch { /* Already detached. */ }
    }
    this.scene.pruneRecords();
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
  }

  renameLayer(id: string, name: string): boolean {
    if (!this.layers.renameLayer(id, name)) return false;
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
  }

  moveLayer(id: string, dir: 'up' | 'down'): boolean {
    if (!this.layers.moveLayerRecord(id, dir)) return false;
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
  }

  setActiveLayer(id: string): boolean {
    if (!this.layers.setActiveLayer(id)) return false;
    this.notify();
    return true;
  }

  /** Remove registered content layers that are empty and were not
   * created by the latest scene decode (no layerRecordId flag). */
  private pruneStaleContentLayers(): void {
    try {
      const projectLayers = ((this.scope.project?.layers ?? []) as AnyItem[]);
      const anyDecoded = projectLayers.some((layer) => Boolean(layer.data?.layerRecordId));
      const stale = this.layers.contentLayers().filter((layer) => {
        const flagged = Boolean((layer as AnyItem).data?.layerRecordId);
        return !flagged && (layer.children?.length ?? 0) === 0;
      });
      // When the decode created layers, every pre-existing empty
      // content layer is stale. Otherwise keep at least one layer.
      const removable = anyDecoded ? stale : stale.slice(0, Math.max(0, this.layers.contentLayers().length - 1));
      for (const layer of removable) {
        try { layer.remove(); } catch { /* Detached. */ }
      }
    } catch { /* Headless. */ }
  }

  private objectKindLabel(item: AnyItem): string {
    try {
      if (item.data?.shapeTextGroup || item.data?.isShapeText) return 'Shape';
      switch (item.className) {
        case 'Raster': return 'Image';
        case 'PointText': return 'Text';
        case 'Group': return item.data?.isUserGroup ? 'Group' : 'Shape';
        case 'CompoundPath': return 'Compound Path';
        case 'Path': return 'Path';
        default: return 'Object';
      }
    } catch { return 'Object'; }
  }

  private listingInput(item: AnyItem): ListingObjectInput {
    const children = (item.children ?? []) as AnyItem[];
    const isGroup = item.className === 'Group';
    return {
      key: String(item.id),
      name: typeof item.name === 'string' ? item.name : undefined,
      kindLabel: this.objectKindLabel(item),
      visible: item.visible !== false,
      locked: Boolean(item.locked),
      opacity: typeof item.opacity === 'number' ? item.opacity : 1,
      children: isGroup
        ? children.filter((child) => { try { return !this.scene.isNonContentItem(child); } catch { return false; } })
          .map((child) => this.listingInput(child))
        : undefined,
    };
  }

  private objectByKey(key: string): { item: AnyItem; layerId: string } | null {
    for (const record of this.layers.listLayers()) {
      const layer = this.layers.layerForId(record.id);
      if (!layer) continue;
      const walk = (items: AnyItem[]): AnyItem | null => {
        for (const item of items) {
          if (String(item.id) === key) return item;
          const found = walk((item.children ?? []) as AnyItem[]);
          if (found) return found;
        }
        return null;
      };
      const found = walk([...(layer.children ?? [])] as AnyItem[]);
      if (found) return { item: found, layerId: record.id };
    }
    return null;
  }

  objectListing(): LayerListing[] {
    const inputs = this.layers.listLayers().map((record) => {
      const layer = this.layers.layerForId(record.id);
      // Layer state gates its objects' rows (Slice 20): a hidden
      // layer's objects read as hidden, a locked layer's as locked,
      // and layer opacity multiplies into each row.
      const gateVisible = layerVisible(record);
      const gateLocked = layerLocked(record);
      const gateOpacity = layerOpacity(record);
      const objects = ((layer?.children ?? []) as AnyItem[])
        .filter((child) => { try { return !this.scene.isNonContentItem(child); } catch { return false; } })
        .map((child) => {
          const input = this.listingInput(child);
          return {
            ...input,
            visible: input.visible && gateVisible,
            locked: input.locked || gateLocked,
            opacity: input.opacity * gateOpacity,
          };
        });
      return { record, objects };
    });
    return buildLayerListing(inputs);
  }

  // --- Layer presentation state (Slice 20) ---

  setLayerVisible(id: string, visible: boolean): void {
    if (!this.layers.setLayerVisible(id, visible)) return;
    this.documentManager.markEdited('scene');
    this.notify();
  }

  setLayerLocked(id: string, locked: boolean): void {
    if (!this.layers.setLayerLocked(id, locked)) return;
    this.documentManager.markEdited('scene');
    this.notify();
  }

  setLayerOpacity(id: string, opacity: number): void {
    if (!this.layers.setLayerOpacity(id, opacity)) return;
    this.documentManager.markEdited('scene');
    this.notify();
  }

  /** Select the object behind a panel row. Locked objects can be
   * selected here (so they can be unlocked) even though canvas
   * hit-testing skips them. Activates the object's layer first. */
  selectObjectByKey(key: string): boolean {
    const found = this.objectByKey(key);
    if (!found) return false;
    if (found.layerId !== this.layers.activeLayerId) this.layers.setActiveLayer(found.layerId);
    const top = this.selection.topUserGroupOf(found.item);
    this.clearOutSelection();
    this.addItemToSelection(top);
    this.updateTextContent(); this.notify();
    return true;
  }

  renameObjectByKey(key: string, name: string): boolean {
    const found = this.objectByKey(key);
    if (!found || name.trim().length === 0) return false;
    found.item.name = name.trim();
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
  }

  setObjectVisibleByKey(key: string, visible: boolean): boolean {
    const found = this.objectByKey(key);
    if (!found) return false;
    found.item.visible = visible;
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
  }

  setObjectLockedByKey(key: string, locked: boolean): boolean {
    const found = this.objectByKey(key);
    if (!found) return false;
    found.item.locked = locked;
    if (!locked) { /* Unlocking never changes the selection. */ }
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
  }

  setObjectOpacityByKey(key: string, opacity: number): boolean {
    const found = this.objectByKey(key);
    if (!found || !Number.isFinite(opacity)) return false;
    found.item.opacity = Math.min(1, Math.max(0, opacity));
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
  }

  /** Apply a visibility/lock/opacity change to every object in a
   * layer (the layer row's own toggles). */
  setLayerObjectsFlag(id: string, patch: { visible?: boolean; locked?: boolean }): boolean {
    const layer = this.layers.layerForId(id);
    if (!layer) return false;
    for (const child of [...(layer.children ?? [])] as AnyItem[]) {
      try {
        if (this.scene.isNonContentItem(child)) continue;
        if (patch.visible !== undefined) child.visible = patch.visible;
        if (patch.locked !== undefined) child.locked = patch.locked;
      } catch { /* Detached. */ }
    }
    this.documentManager.markEdited('scene');
    this.notify();
    return true;
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
    this.cancelSimpleTool();
    this.cancelFreehand();
    this.pendingLiveTransforms = null;
    this.pendingLiveSpec = null;
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
    if (this.simpleTool) {
      // Enter finishes a Line/Ellipse/Arc session: the current
      // cursor point completes it when one more point is needed.
      const cursor = this.cursorVec();
      if (cursor) this.simpleTool.points.push(cursor);
      this.depositSimpleTool();
      return;
    }
    if (this.compositePathTool.active) {
      this.compositePathTool.finishIntoScene(false);
      return;
    }
    const snap = this.captureDeposit();
    const deposited: Array<AnyItem | null> = [];
    if (this.isDrawingPath && this.path) {
      const transforms = this.repeatManager.beginDepositTransforms();
      const offsets = transforms ? [] : this.repeatManager.beginDeposit();
      const base = this.compositePathTool.finishLegacy().filter((item) => !!item);
      const copies = transforms
        ? this.repeatManager.finishDepositTransformed(base, transforms)
        : this.repeatManager.finishDeposit(base, offsets);
      if (transforms) this.tagReplication(base, copies, transforms.length, this.repeatManager.takeDepositSpec());
      deposited.push(...base, ...copies);
    } else if (this.isDrawingShape) deposited.push(...this.endShapeAsStroke());
    else if (this.isDrawingQuad && this.quadPath) deposited.push(this.quadTool.finish());
    const placed = deposited.map((item) => (item ? this.withArrowheads(item) : item));
    this.recordSceneCommand('Deposit shape', snap.before, snap.selected, placed);
    this.updateTextContent();
    this.notify();
  }

  polyLineKC(): void { this.compositePathTool.sharpKey(); }
  roundedPointKC(): void { this.compositePathTool.roundedKey(); }
  bowedPointKC(facing: 'left' | 'right'): void { this.compositePathTool.bowedKey(facing); }
  arcThreePointKC(): void { this.compositePathTool.arcKey(); }
  switchRoundingKC(): void { this.compositePathTool.switchRoundingKey(); }
  eraseLastPointKC(): void { this.compositePathTool.eraseLastKey(); }
  splinePointKC(): void { this.compositePathTool.splineKey(); }

  completeShapeWithSpline(): void { this.compositePathTool.completeWithSpline(); }

  // --- Pointer entry points (DOM attach + tests share these) --------
  // Interceptions ahead of the PointerController: freehand capture,
  // ruler-guide drags (Slice 5), and simple-tool preview refresh.

  inputMouseDown(event: unknown): void {
    // Freehand (Pencil) captures the press stream itself.
    if (this.freehandArmed && !this.isLiveDrawing && !this.isTypingText) {
      this.beginFreehand((event as { point?: AnyItem }).point);
      return;
    }
    // A press that lands on a ruler guide drags the guide
    // instead of steering the drawing cursor.
    if (!this.isLiveDrawing && this.beginGuideDragAt((event as { point?: AnyItem }).point)) return;
    this.pointer.onMouseDown(event as never);
  }

  inputMouseMove(event: unknown): void {
    this.pointer.onMouseMove(event as never);
    if (this.simpleTool) this.refreshSimplePreview();
  }

  inputMouseDrag(event: unknown): void {
    if (this.freehandCapture) {
      this.extendFreehand((event as { point?: AnyItem }).point);
      return;
    }
    if (this.guideDrag) {
      this.dragGuideTo((event as { point?: AnyItem }).point);
      return;
    }
    this.pointer.onMouseDrag(event as never);
  }

  inputMouseUp(): void {
    if (this.freehandCapture) { this.endFreehand(); return; }
    if (this.guideDrag) { this.endGuideDrag(); return; }
    this.pointer.releasePointer();
  }

  // --- Tier Two Slice 7: Line / Ellipse / Arc tools, Freehand,
  // arrowheads, and Stroke to Outline --------------------------------
  // The three click tools share one tiny session: each KC call
  // commits the cursor point; Line needs 2 points, Ellipse and Arc
  // need 3 (centre + two extents / start + through + end — the arc
  // is the three-point form, which fits the click pattern; centre+
  // angles would need a dialog the session model doesn't have).
  // Freehand is pointer-driven: drag captures a point stream that
  // deposits as an NGSmoothedPolyline model path.

  private simpleTool: { kind: 'line' | 'ellipse' | 'arc'; points: Vec2[] } | null = null;
  private simplePreviewItem: AnyItem = null;
  freehandArmed = false;
  freehandTension = 0.3;
  private freehandCapture: Vec2[] | null = null;
  private freehandPreviewItem: AnyItem = null;

  private cursorVec(): Vec2 | null {
    const p = this.mousePt;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x, y: p.y };
  }

  get activeSimpleTool(): 'line' | 'ellipse' | 'arc' | null {
    return this.simpleTool?.kind ?? null;
  }

  lineKC(): void { this.simpleToolCommit('line'); }
  ellipseKC(): void { this.simpleToolCommit('ellipse'); }
  arcKC(): void { this.simpleToolCommit('arc'); }

  private simpleToolCommit(kind: 'line' | 'ellipse' | 'arc'): void {
    if (this.isLiveDrawing || this.isTypingText) return;
    const point = this.cursorVec();
    if (!point) return;
    if (!this.simpleTool || this.simpleTool.kind !== kind) {
      this.simpleTool = { kind, points: [] };
    }
    this.simpleTool.points.push(point);
    const needed = kind === 'line' ? 2 : 3;
    if (this.simpleTool.points.length >= needed) this.depositSimpleTool();
    else this.refreshSimplePreview();
    this.notify();
  }

  /** Segments for a tool session; `live` is the in-progress cursor
   * point appended for previews. */
  private simpleSegments(points: Vec2[], live?: Vec2 | null): BezierSegment[] | null {
    const pts = live ? [...points, live] : points;
    const kind = this.simpleTool?.kind;
    if (!kind) return null;
    const plain = (list: Vec2[]): BezierSegment[] => list.map((point) => ({
      point: { ...point }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 },
    }));
    if (kind === 'line') {
      return pts.length >= 2 ? plain([pts[0], pts[1]]) : null;
    }
    if (kind === 'ellipse') {
      if (pts.length < 3) return null;
      const center = pts[0];
      const rx = Math.hypot(pts[1].x - center.x, pts[1].y - center.y);
      const ry = Math.hypot(pts[2].x - center.x, pts[2].y - center.y);
      const segments = ellipseSegments(center, rx, ry);
      return segments.length > 0 ? segments : null;
    }
    // arc
    if (pts.length < 3) return null;
    const info = arcThroughPoints(pts[0], pts[1], pts[2]);
    return info ? arcSegments(info) : plain(pts.slice(0, 3));
  }

  private pathFromSegments(segments: BezierSegment[], closed: boolean): AnyItem {
    const path = new this.scope.Path({
      segments: segments.map((s) => new this.scope.Segment(
        new this.scope.Point(s.point.x, s.point.y),
        new this.scope.Point(s.handleIn.x, s.handleIn.y),
        new this.scope.Point(s.handleOut.x, s.handleOut.y),
      )),
      closed,
      insert: false,
    });
    return path;
  }

  /** Build a Paper item from resolved model geometry. */
  private resolvedItem(geometry: ResolvedVectorGeometry): AnyItem {
    if (geometry.kind === 'path') return this.pathFromSegments(geometry.segments, geometry.closed);
    const compound = new this.scope.CompoundPath({ insert: false, fillRule: geometry.fillRule });
    for (const sub of geometry.paths) compound.addChild(this.pathFromSegments(sub.segments, sub.closed));
    return compound;
  }

  private depositSimpleTool(): void {
    const tool = this.simpleTool;
    if (!tool) return;
    const segments = this.simpleSegments(tool.points);
    this.cancelSimpleTool();
    if (!segments) { this.notify(); return; }
    const snap = this.captureDeposit();
    const item = this.pathFromSegments(segments, tool.kind === 'ellipse');
    this.styles.applyCurrentStyles(item);
    this.layers.addToActive(item);
    try { this.scene.retain(item); } catch { /* Geometry still lands. */ }
    const placed = this.withArrowheads(item);
    this.selection.restore([placed]);
    const label = tool.kind === 'line' ? 'Deposit line' : tool.kind === 'ellipse' ? 'Deposit ellipse' : 'Deposit arc';
    this.recordSceneCommand(label, snap.before, snap.selected, [placed], snap.retained);
    this.updateTextContent();
    this.notify();
  }

  private refreshSimplePreview(): void {
    this.clearSimplePreview();
    if (!this.simpleTool) return;
    const segments = this.simpleSegments(this.simpleTool.points, this.cursorVec());
    if (!segments) return;
    const item = this.pathFromSegments(segments, this.simpleTool.kind === 'ellipse');
    item.strokeColor = this.globalStrokeColor;
    item.strokeWidth = 1;
    item.dashArray = [5, 4];
    item.fillColor = null;
    item.guide = true;
    item.locked = true;
    this.mountGuideItem(item);
    this.simplePreviewItem = item;
  }

  private clearSimplePreview(): void {
    if (this.simplePreviewItem) {
      try { this.simplePreviewItem.remove(); } catch { /* Already gone. */ }
      this.simplePreviewItem = null;
    }
  }

  cancelSimpleTool(): void {
    this.simpleTool = null;
    this.clearSimplePreview();
  }

  // --- Freehand / Pencil ---------------------------------------------

  setFreehandArmed(on: boolean): void {
    this.freehandArmed = !!on;
    if (!this.freehandArmed) this.cancelFreehand();
    this.notify();
  }

  setFreehandTension(v: number): void {
    if (!Number.isFinite(v)) return;
    this.freehandTension = Math.max(0, Math.min(1, v));
    this.notify();
  }

  private beginFreehand(point: AnyItem): void {
    if (!point) return;
    this.freehandCapture = [{ x: point.x, y: point.y }];
    const preview: AnyItem = new this.scope.Path({
      segments: [new this.scope.Point(point.x, point.y)],
      insert: false,
    });
    preview.strokeColor = this.globalStrokeColor;
    preview.strokeWidth = this.globalStrokeWidth;
    preview.fillColor = null;
    (preview as AnyItem).guide = true;
    preview.locked = true;
    this.mountGuideItem(preview);
    this.freehandPreviewItem = preview;
  }

  private extendFreehand(point: AnyItem): void {
    if (!this.freehandCapture || !point) return;
    const last = this.freehandCapture[this.freehandCapture.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < 1.5) return;
    this.freehandCapture.push({ x: point.x, y: point.y });
    try { this.freehandPreviewItem?.add(new this.scope.Point(point.x, point.y)); } catch { /* Preview only. */ }
  }

  private endFreehand(): void {
    const points = this.freehandCapture;
    this.cancelFreehand();
    if (!points || points.length < 2) { this.notify(); return; }
    const source: NGSmoothedPolyline = {
      id: crypto.randomUUID(),
      mode: 'smoothedPolyline',
      closed: false,
      points,
      tension: this.freehandTension,
    };
    let item: AnyItem = null;
    try {
      item = this.resolvedItem(resolvePath(source));
    } catch { item = null; }
    if (!item) { this.notify(); return; }
    const snap = this.captureDeposit();
    this.styles.applyCurrentStyles(item);
    this.layers.addToActive(item);
    try { this.scene.retain(item, source); } catch { /* Geometry still lands. */ }
    const placed = this.withArrowheads(item);
    this.selection.restore([placed]);
    this.recordSceneCommand('Freehand', snap.before, snap.selected, [placed], snap.retained);
    this.updateTextContent();
    this.notify();
  }

  cancelFreehand(): void {
    this.freehandCapture = null;
    if (this.freehandPreviewItem) {
      try { this.freehandPreviewItem.remove(); } catch { /* Already gone. */ }
      this.freehandPreviewItem = null;
    }
  }

  get isFreehandCapturing(): boolean { return this.freehandCapture !== null; }

  // --- Arrowheads ------------------------------------------------------
  // Settings live in the stroke style state (globals) and, per item,
  // in item.data (arrowStart/arrowEnd). Rendering wraps the spine in
  // a group with the head items, tagged so refresh can rebuild them
  // when the spine or the settings change.

  setArrowStart(style: ArrowheadStyle): void { this.setArrowhead('start', style); }
  setArrowEnd(style: ArrowheadStyle): void { this.setArrowhead('end', style); }

  private setArrowhead(which: 'start' | 'end', style: ArrowheadStyle): void {
    if (!isArrowheadStyle(style)) return;
    if (which === 'start') this.paint.globalArrowStart = style;
    else this.paint.globalArrowEnd = style;
    for (const top of this.topLevelSelected()) {
      const spine = this.arrowSpineOf(top);
      if (!spine) continue;
      if (!top.data) top.data = {};
      if (!spine.data) spine.data = {};
      top.data[which === 'start' ? 'arrowStart' : 'arrowEnd'] = style;
      spine.data[which === 'start' ? 'arrowStart' : 'arrowEnd'] = style;
      this.refreshArrowheads(top);
    }
    this.documentManager.markEdited('scene');
    this.updateTextContent();
    this.notify();
  }

  /** The stroked path inside a top-level item that can carry
   * arrowheads: the item itself, or an arrow group's spine. Other
   * groups are left alone. */
  private arrowSpineOf(top: AnyItem): AnyItem | null {
    if (!top) return null;
    if (top.className === 'Path') return top;
    if (top.className === 'Group' && top.data?.arrowGroup && Array.isArray(top.children)) {
      return top.children.find((c: AnyItem) => c?.data?.arrowSpine)
        ?? top.children.find((c: AnyItem) => c?.className === 'Path' && !c?.data?.arrowhead)
        ?? null;
    }
    return null;
  }

  /** Stamp the global arrow settings onto a freshly deposited item
   * and render its heads. Returns the top-level item to select
   * (a group when heads exist, the item itself otherwise). */
  withArrowheads(item: AnyItem): AnyItem {
    if (!item || (item.className !== 'Path' && item.className !== 'CompoundPath')) return item;
    if (item.className === 'CompoundPath' || item.closed) return item;
    const start = this.paint.globalArrowStart;
    const end = this.paint.globalArrowEnd;
    if (start === 'none' && end === 'none') return item;
    if (!item.data) item.data = {};
    item.data.arrowStart = start;
    item.data.arrowEnd = end;
    return this.refreshArrowheads(item);
  }

  /** Rebuild an item's arrowhead items from its spine + settings.
   * Returns the top-level item (unwrapping the group when both
   * heads are 'none'). */
  refreshArrowheads(top: AnyItem): AnyItem {
    const spine = this.arrowSpineOf(top);
    if (!spine || spine.closed || !Array.isArray(spine.segments) || spine.segments.length < 2) return top;
    const start = isArrowheadStyle(top.data?.arrowStart) ? top.data.arrowStart
      : isArrowheadStyle(spine.data?.arrowStart) ? spine.data.arrowStart : 'none';
    const end = isArrowheadStyle(top.data?.arrowEnd) ? top.data.arrowEnd
      : isArrowheadStyle(spine.data?.arrowEnd) ? spine.data.arrowEnd : 'none';
    const isGroup = top.className === 'Group' && top.data?.arrowGroup;
    if (isGroup) {
      for (const child of [...top.children] as AnyItem[]) {
        if (child?.data?.arrowhead) { try { child.remove(); } catch { /* Gone. */ } }
      }
    }
    if (start === 'none' && end === 'none') {
      if (isGroup) {
        const parent = top.parent;
        const index = typeof top.index === 'number' ? top.index : 0;
        try { top.remove(); } catch { /* Gone. */ }
        if (parent) { try { parent.insertChild(index, spine); } catch { this.layers.addToActive(spine); } }
        if (spine.data) { delete spine.data.arrowSpine; }
        return spine;
      }
      return top;
    }
    const width = Number(spine.strokeWidth) > 0 ? Number(spine.strokeWidth) : this.paint.globalStrokeWidth;
    const heads: AnyItem[] = [];
    const build = (which: 'start' | 'end', style: ArrowheadStyle): void => {
      if (style === 'none') return;
      const atEnd = which === 'end';
      const tipSeg = atEnd ? spine.lastSegment : spine.firstSegment;
      if (!tipSeg) return;
      const tip = { x: tipSeg.point.x, y: tipSeg.point.y };
      let tangent: AnyItem = null;
      try { tangent = spine.getTangentAt(atEnd ? spine.length : 0); } catch { /* Fall back below. */ }
      if (!tangent || !(tangent.length > 0)) {
        const other = atEnd ? spine.segments[spine.segments.length - 2] : spine.segments[1];
        if (!other) return;
        tangent = atEnd
          ? { x: tip.x - other.point.x, y: tip.y - other.point.y }
          : { x: other.point.x - tip.x, y: other.point.y - tip.y };
      }
      const dir = atEnd
        ? { x: tangent.x, y: tangent.y }
        : { x: -tangent.x, y: -tangent.y };
      const geo = arrowheadGeometry(tip, dir, style, width);
      let head: AnyItem = null;
      if (geo.polygon) {
        head = new this.scope.Path({
          segments: geo.polygon.map((p) => new this.scope.Point(p.x, p.y)),
          closed: true,
          insert: false,
        });
        head.fillColor = spine.strokeColor ?? this.paint.globalStrokeColor;
        head.strokeColor = null;
      } else if (geo.polyline) {
        head = new this.scope.Path({
          segments: geo.polyline.map((p) => new this.scope.Point(p.x, p.y)),
          insert: false,
        });
        head.strokeColor = spine.strokeColor ?? this.paint.globalStrokeColor;
        head.strokeWidth = Math.max(1, width * 0.7);
        head.fillColor = null;
        head.strokeCap = 'round';
      }
      if (!head) return;
      if (!head.data) head.data = {};
      head.data.arrowhead = which;
      head.data.arrowStyle = style;
      heads.push(head);
    };
    build('start', start);
    build('end', end);
    if (heads.length === 0) return top;
    if (isGroup) {
      for (const head of heads) top.addChild(head);
      top.data.arrowStart = start;
      top.data.arrowEnd = end;
      return top;
    }
    const parent = spine.parent;
    const index = typeof spine.index === 'number' ? spine.index : 0;
    const group = new this.scope.Group();
    if (parent) { try { parent.insertChild(index, group); } catch { /* Append below. */ } }
    group.addChild(spine);
    for (const head of heads) group.addChild(head);
    if (!group.parent) this.layers.addToActive(group);
    if (!group.data) group.data = {};
    group.data.arrowGroup = true;
    group.data.arrowStart = start;
    group.data.arrowEnd = end;
    if (!spine.data) spine.data = {};
    spine.data.arrowSpine = true;
    return group;
  }

  /** Rotate the selection by the given degrees as one undo entry
   * (the Arrange panel's quarter-turn buttons; the same
   * TransformManager path the keyboard rotate and Operations
   * dialog use). */
  rotateSelectionBy(degrees: number): void {
    if (this.isLiveDrawing || !Number.isFinite(degrees) || degrees === 0) return;
    if (this.topLevelSelected().length === 0) return;
    this.rotateSelection(degrees);
    this.updateTextContent();
    this.notify();
  }

  /** Which path operations the current selection can take (the
   * Path Operations section's disabled states). Mirrors each op's
   * own target rules. */
  pathOpAvailability(): { noise: boolean; simplify: boolean; fit: boolean; hull: boolean; strokeOutline: boolean } {
    const selected = this.topLevelSelected();
    const paths = selected.filter((item) => (
      item?.className === 'Path' || item?.className === 'CompoundPath'
    ));
    return {
      noise: paths.length > 0,
      simplify: paths.length > 0,
      fit: paths.length > 0,
      hull: this.selectionAnchorPoints().length >= 3,
      strokeOutline: paths.some((item) => item.strokeColor && Number(item.strokeWidth) > 0),
    };
  }

  // --- Stroke to Outline ------------------------------------------------
  // Converts selected stroked paths into their outlined filled form
  // via the model's NGOutlinedStrokePath: the result stays a live
  // outlined-stroke path in the retained model (spine + width + cap/
  // join/dash/position), rendered as filled geometry.

  strokeToOutlineSelection(): number {
    const targets = this.topLevelSelected().filter((item) => (
      (item?.className === 'Path' || item?.className === 'CompoundPath')
      && item.strokeColor
      && Number(item.strokeWidth) > 0
    ));
    if (targets.length === 0) return 0;
    const snap = this.captureDeposit();
    const placed: AnyItem[] = [];
    for (const item of targets) {
      const spine = this.scene.bezierSource(item);
      const dash = Array.isArray(item.dashArray) ? item.dashArray : [];
      const outlined: NGOutlinedStrokePath = {
        id: crypto.randomUUID(),
        mode: 'outlinedStroke',
        spine,
        width: Number(item.strokeWidth),
        cap: item.strokeCap === 'round' || item.strokeCap === 'square' ? item.strokeCap : 'butt',
        join: item.strokeJoin === 'round' || item.strokeJoin === 'bevel' ? item.strokeJoin : 'miter',
        miterLimit: Number.isFinite(item.miterLimit) ? item.miterLimit : 10,
        dashLength: Number(dash[0]) || 0,
        gapLength: Number(dash[1]) || 0,
        position: displayedStrokePosition(item),
      };
      let geometry: ResolvedVectorGeometry;
      try {
        geometry = resolvePath(outlined);
      } catch { continue; }
      const converted = this.resolvedItem(geometry);
      converted.fillColor = item.strokeColor;
      converted.strokeColor = null;
      const parent = item.parent;
      const index = typeof item.index === 'number' ? item.index : undefined;
      if (parent && index !== undefined) {
        try { parent.insertChild(index, converted); } catch { this.layers.addToActive(converted); }
      } else {
        this.layers.addToActive(converted);
      }
      try { this.scene.retain(converted, outlined); } catch { /* Geometry still lands. */ }
      try { item.remove(); } catch { /* Already gone. */ }
      placed.push(converted);
    }
    if (placed.length > 0) {
      this.selection.restore(placed);
      this.recordSceneCommand('Stroke to outline', snap.before, snap.selected, placed, snap.retained);
    }
    this.updateTextContent();
    this.notify();
    return placed.length;
  }

  // --- Noise displacement (Slice 11) -------------------------------
  // Seeded gradient noise pushes a path's sampled points along
  // their normals; the displaced samples are refitted to cubics
  // through the shared polyline fit, so curves stay curves and
  // closed paths stay closed. Apply-as-geometry: the parameters
  // and seed are recorded on the resulting item's data
  // (noiseDisplacement), so the operation is reproducible, and the
  // replacement lands as ONE undo entry.

  noiseAmplitude = 12;
  noiseScale = 60;
  noiseSeed = 1;
  noisePreviewOn = false;
  private noisePreviewItems: AnyItem[] = [];

  setNoiseAmplitude(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(0, Math.min(200, v));
    if (next === this.noiseAmplitude) return;
    this.noiseAmplitude = next;
    this.refreshNoisePreview();
    this.notify();
  }

  setNoiseScale(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(5, Math.min(1000, v));
    if (next === this.noiseScale) return;
    this.noiseScale = next;
    this.refreshNoisePreview();
    this.notify();
  }

  setNoiseSeed(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(0, Math.min(999999, Math.round(v)));
    if (next === this.noiseSeed) return;
    this.noiseSeed = next;
    this.refreshNoisePreview();
    this.notify();
  }

  setNoisePreview(on: boolean): void {
    this.noisePreviewOn = on;
    this.refreshNoisePreview();
    this.notify();
  }

  private noiseParams(): { amplitude: number; scale: number; seed: number } {
    return { amplitude: this.noiseAmplitude, scale: this.noiseScale, seed: this.noiseSeed };
  }

  /** Sample one Paper path densely, displace each sample along its
   * normal by the seeded noise at its arc position, and refit. */
  private displacedSegments(
    path: AnyItem,
    params: { amplitude: number; scale: number; seed: number },
  ): BezierSegment[] | null {
    let length = 0;
    try { length = path.length; } catch { return null; }
    if (!(length > 0)) return null;
    const closed = !!path.closed;
    const steps = Math.max(8, Math.min(1200, Math.ceil(length / 3)));
    const points: Array<{ x: number; y: number }> = [];
    const count = closed ? steps : steps + 1;
    for (let i = 0; i < count; i++) {
      const offset = Math.min(length, (length * i) / steps);
      let point: AnyItem = null;
      let tangent: AnyItem = null;
      try {
        point = path.getPointAt(offset);
        tangent = path.getTangentAt(offset);
      } catch { return null; }
      if (!point || !tangent) return null;
      const d = params.amplitude * fbm1(params.seed, offset / params.scale, 3);
      points.push({ x: point.x + (-tangent.y) * d, y: point.y + tangent.x * d });
    }
    return reducePolyline(points, closed, 0.35);
  }

  /** Clone a path item and rebuild every subpath's segments
   * through `rebuild` (style and data ride along). Shared by the
   * noise, simplify, and fit operations. Null when no subpath
   * could be rebuilt. */
  private rebuildPathClone(
    item: AnyItem,
    rebuild: (path: AnyItem) => BezierSegment[] | null,
  ): AnyItem | null {
    let clone: AnyItem = null;
    try { clone = item.clone(); } catch { return null; }
    if (!clone) return null;
    const paths: AnyItem[] = clone.className === 'CompoundPath' ? [...(clone.children ?? [])] : [clone];
    let changed = false;
    for (const path of paths) {
      if (path?.className !== 'Path') continue;
      const fitted = rebuild(path);
      if (!fitted || fitted.length === 0) continue;
      try {
        path.removeSegments();
        for (const seg of fitted) {
          path.add(new this.scope.Segment(
            new this.scope.Point(seg.point.x, seg.point.y),
            new this.scope.Point(seg.handleIn.x, seg.handleIn.y),
            new this.scope.Point(seg.handleOut.x, seg.handleOut.y),
          ));
        }
        changed = true;
      } catch { /* Keep the cloned geometry for this subpath. */ }
    }
    if (!changed) {
      try { clone.remove(); } catch { /* detached */ }
      return null;
    }
    return clone;
  }

  /** Replace items with built replacements at their stack
   * positions, as ONE undo entry under `label`. Shared by the
   * path-geometry operations. Returns the placed replacements. */
  private replaceItems(
    targets: AnyItem[],
    label: string,
    buildOne: (item: AnyItem) => AnyItem | null,
  ): AnyItem[] {
    const snap = this.captureDeposit();
    const placed: AnyItem[] = [];
    for (const item of targets) {
      const converted = buildOne(item);
      if (!converted) continue;
      const parent = item.parent;
      const index = typeof item.index === 'number' ? item.index : undefined;
      if (parent && index !== undefined && converted.parent !== parent) {
        try { parent.insertChild(index, converted); } catch { this.layers.addToActive(converted); }
      }
      try { this.scene.retain(converted); } catch { /* Geometry still lands. */ }
      try { item.remove(); } catch { /* Already gone. */ }
      placed.push(converted);
    }
    if (placed.length > 0) {
      this.selection.restore(placed);
      this.recordSceneCommand(label, snap.before, snap.selected, placed, snap.retained);
    }
    return placed;
  }

  /** A displaced clone of a path item, or null when nothing could
   * be displaced. The clone records the parameters in its data for
   * reproducibility. */
  private displacedClone(
    item: AnyItem,
    params: { amplitude: number; scale: number; seed: number },
  ): AnyItem | null {
    const clone = this.rebuildPathClone(item, (path) => this.displacedSegments(path, params));
    if (clone?.data) {
      clone.data.noiseDisplacement = { version: 1, amplitude: params.amplitude, scale: params.scale, seed: params.seed };
    }
    return clone;
  }

  /** Show the displaced result as guide items over the selection.
   * Rebuilt whenever a parameter changes while preview is on; the
   * guides never enter content, history, or files. */
  refreshNoisePreview(): void {
    this.clearNoisePreview();
    if (!this.noisePreviewOn) return;
    const targets = this.topLevelSelected().filter((item) => (
      item?.className === 'Path' || item?.className === 'CompoundPath'
    ));
    for (const item of targets) {
      const clone = this.displacedClone(item, this.noiseParams());
      if (!clone) continue;
      clone.guide = true;
      clone.selected = false;
      this.noisePreviewItems.push(clone);
    }
  }

  clearNoisePreview(): void {
    for (const item of this.noisePreviewItems) {
      try { item.remove(); } catch { /* already gone */ }
    }
    this.noisePreviewItems = [];
  }

  /** Displace every selected path by the current noise parameters.
   * One undo entry; the source items are replaced by their
   * displaced versions. Returns how many items were displaced. */
  applyNoiseDisplacement(): number {
    const targets = this.topLevelSelected().filter((item) => (
      item?.className === 'Path' || item?.className === 'CompoundPath'
    ));
    if (targets.length === 0) return 0;
    this.clearNoisePreview();
    const params = this.noiseParams();
    const placed = this.replaceItems(targets, 'Noise displacement', (item) => this.displacedClone(item, params));
    this.updateTextContent();
    this.notify();
    return placed.length;
  }

  // --- Fit & simplify (Slice 12) -----------------------------------
  // Simplify reduces a path to a Douglas–Peucker polyline at a
  // user tolerance (shared DP module; the tracer uses the same
  // code). Fit converts a polyline or smoothed polyline into an
  // editable Bézier path through the Schneider fit and reports
  // the achieved error. Both replace the source in ONE undo entry
  // and leave a feedback line for the panel.

  simplifyTolerance = 2;
  fitTolerance = 1;
  /** Result line of the last fit/simplify operation, for the panel. */
  pathOpFeedback = '';

  setSimplifyTolerance(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(0.05, Math.min(100, v));
    if (next === this.simplifyTolerance) return;
    this.simplifyTolerance = next;
    this.notify();
  }

  setFitTolerance(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(0.05, Math.min(100, v));
    if (next === this.fitTolerance) return;
    this.fitTolerance = next;
    this.notify();
  }

  /** The points a fit/simplify runs on: a purely linear path
   * contributes its own vertices (exact); a curved path is sampled
   * densely along its length. */
  private pathInputPoints(path: AnyItem): { points: Array<{ x: number; y: number }>; closed: boolean } | null {
    const segments = path?.segments;
    if (!segments || segments.length === 0) return null;
    const closed = !!path.closed;
    const linear = segments.every((seg: AnyItem) => (
      Math.hypot(seg.handleIn?.x ?? 0, seg.handleIn?.y ?? 0) < 1e-9
      && Math.hypot(seg.handleOut?.x ?? 0, seg.handleOut?.y ?? 0) < 1e-9
    ));
    if (linear) {
      return { points: segments.map((seg: AnyItem) => ({ x: seg.point.x, y: seg.point.y })), closed };
    }
    let length = 0;
    try { length = path.length; } catch { return null; }
    if (!(length > 0)) return null;
    const steps = Math.max(8, Math.min(2000, Math.ceil(length / 2)));
    const points: Array<{ x: number; y: number }> = [];
    const count = closed ? steps : steps + 1;
    for (let i = 0; i < count; i++) {
      try {
        const p = path.getPointAt(Math.min(length, (length * i) / steps));
        if (p) points.push({ x: p.x, y: p.y });
      } catch { return null; }
    }
    return points.length >= 2 ? { points, closed } : null;
  }

  private selectedPathItems(): AnyItem[] {
    return this.topLevelSelected().filter((item) => (
      item?.className === 'Path' || item?.className === 'CompoundPath'
    ));
  }

  /** Simplify every selected path at the current tolerance. */
  simplifySelectionPaths(): number {
    const targets = this.selectedPathItems();
    if (targets.length === 0) return 0;
    const tolerance = this.simplifyTolerance;
    let before = 0;
    let after = 0;
    const placed = this.replaceItems(targets, 'Simplify path', (item) => {
      const clone = this.rebuildPathClone(item, (path) => {
        const input = this.pathInputPoints(path);
        if (!input || input.points.length < 3) return null;
        const kept = input.closed
          ? douglasPeuckerClosed(input.points, tolerance)
          : douglasPeucker(input.points, tolerance);
        if (kept.length < 2 || kept.length >= input.points.length) return null;
        before += input.points.length;
        after += kept.length;
        return kept.map((p) => ({ point: { ...p }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } }));
      });
      if (clone?.data) clone.data.simplifyRecord = { version: 1, tolerance };
      return clone;
    });
    if (placed.length > 0) {
      this.pathOpFeedback = `Simplified ${placed.length} path${placed.length === 1 ? '' : 's'} — ${before} points became ${after}.`;
    }
    this.updateTextContent();
    this.notify();
    return placed.length;
  }

  /** Fit Bézier curves to every selected path/polyline at the
   * current tolerance; the feedback line reports the achieved
   * error of the fit. */
  fitBeziersSelection(): number {
    const targets = this.selectedPathItems();
    if (targets.length === 0) return 0;
    const tolerance = this.fitTolerance;
    let before = 0;
    let after = 0;
    let maxError = 0;
    const placed = this.replaceItems(targets, 'Fit curves', (item) => {
      let itemError = 0;
      const clone = this.rebuildPathClone(item, (path) => {
        const input = this.pathInputPoints(path);
        if (!input || input.points.length < 3) return null;
        const fitted = fitPolylineWithError(input.points, input.closed, tolerance);
        if (fitted.segments.length === 0 || fitted.segments.length >= input.points.length) return null;
        before += input.points.length;
        after += fitted.segments.length;
        itemError = Math.max(itemError, fitted.maxError);
        return fitted.segments;
      });
      if (clone?.data) {
        clone.data.fitRecord = { version: 1, tolerance, maxError: itemError };
        maxError = Math.max(maxError, itemError);
      }
      return clone;
    });
    if (placed.length > 0) {
      this.pathOpFeedback = `Fit ${placed.length} path${placed.length === 1 ? '' : 's'} — ${before} points became ${after} anchors, largest error ${maxError.toFixed(2)}.`;
    }
    this.updateTextContent();
    this.notify();
    return placed.length;
  }

  // --- Concave hull (Slice 13) -------------------------------------
  // The hull of the selection's anchor points: paths contribute
  // their anchors (in world coordinates), other items their bounds
  // corners. The result is a NEW closed path in one undo entry;
  // the sources stay untouched. Concaveness 0..1 maps onto the
  // kNN hull's neighbour count k (1 -> k=3, tightest; 0 -> k=40,
  // near the convex hull), quadratically so the tight end — where
  // the hull changes fastest — gets finer control.

  hullConcaveness = 0.6;

  setHullConcaveness(v: number): void {
    if (!Number.isFinite(v)) return;
    const next = Math.max(0, Math.min(1, v));
    if (next === this.hullConcaveness) return;
    this.hullConcaveness = next;
    this.notify();
  }

  /** World-space anchor/vertex points of the current selection. */
  private selectionAnchorPoints(): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    const collectPath = (path: AnyItem): void => {
      for (const seg of path.segments ?? []) {
        try {
          const world = path.localToGlobal(new this.scope.Point(seg.point.x, seg.point.y));
          points.push({ x: world.x, y: world.y });
        } catch { /* skip unreadable anchors */ }
      }
    };
    const visit = (item: AnyItem): void => {
      if (!item || this.isNonContentItem(item)) return;
      if (item.className === 'Path') { collectPath(item); return; }
      if (item.className === 'CompoundPath') {
        for (const child of item.children ?? []) if (child?.className === 'Path') collectPath(child);
        return;
      }
      const children = item.children ?? [];
      if (children.length > 0) { for (const child of children) visit(child); return; }
      const b = item.bounds;
      if (b) {
        points.push(
          { x: b.topLeft.x, y: b.topLeft.y }, { x: b.topRight.x, y: b.topRight.y },
          { x: b.bottomRight.x, y: b.bottomRight.y }, { x: b.bottomLeft.x, y: b.bottomLeft.y },
        );
      }
    };
    for (const item of this.topLevelSelected()) visit(item);
    return points;
  }

  /** Build the concave hull of the selection's anchor points as a
   * new closed path. Returns 1 when a hull was deposited. */
  concaveHullSelection(): number {
    const points = this.selectionAnchorPoints();
    if (points.length < 3) return 0;
    const k = Math.round(3 + (1 - this.hullConcaveness) * (1 - this.hullConcaveness) * 37);
    const hull = concaveHull(points, k);
    if (!hull || hull.length < 3) {
      this.pathOpFeedback = 'No hull could be drawn around those points.';
      this.notify();
      return 0;
    }
    const snap = this.captureDeposit();
    const item = new this.scope.Path({
      segments: hull.map((p) => new this.scope.Point(p.x, p.y)),
      closed: true,
    });
    this.applyCurrentStyles(item);
    item.closed = true;
    if (item.data) {
      item.data.concaveHullRecord = { version: 1, concaveness: this.hullConcaveness, neighbours: k, anchors: points.length };
    }
    this.layers.addToActive(item);
    this.recordSceneCommand('Concave hull', snap.before, snap.selected, [item], snap.retained);
    this.pathOpFeedback = `Concave hull — ${hull.length} points around ${points.length} anchors.`;
    this.updateTextContent();
    this.notify();
    return 1;
  }

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
    // Snapshot repeat offsets/transforms before finish clears the
    // live session.
    const transforms = this.repeatManager.beginDepositTransforms();
    const offsets = transforms ? [] : this.repeatManager.beginDeposit();
    let base: AnyItem[] = [];
    if (this.circleTool.active) base = this.circleTool.finish();
    else if (this.rectangleTool.active) base = this.rectangleTool.finish();
    const placed = base.filter((item) => !!item);
    const copies = transforms
      ? this.repeatManager.finishDepositTransformed(placed, transforms)
      : this.repeatManager.finishDeposit(placed, offsets);
    if (transforms) this.tagReplication(placed, copies, transforms.length, this.repeatManager.takeDepositSpec());
    return [...placed, ...copies];
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
    this.finishPrint();
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

  resetZoom(): void {
    this.viewport.resetZoom();
  }

  /** View menu zoom steps (the ⌘/Ctrl +/- keys share stepZoom). */
  zoomIn(): void { this.stepZoom(1); }
  zoomOut(): void { this.stepZoom(-1); }

  /** Fit the active page rect into the view. False when no page is set. */
  fitPage(): boolean {
    const page = this.pageRect();
    return page ? this.viewport.fitToRect(page) : false;
  }

  /** Fit the union of the artwork into the view. */
  fitArtwork(): boolean {
    const art = this.artworkRect();
    return art ? this.viewport.fitToRect(art) : false;
  }

  /** Fit the current selection's bounds into the view. */
  fitSelection(): boolean {
    const items = this.topLevelSelected();
    if (items.length === 0) return false;
    const bounds = this.collectiveBounds(items);
    if (!bounds || !(bounds.width > 0 || bounds.height > 0)) return false;
    return this.viewport.fitToRect({
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    });
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

  /** Canvas double-click: project the cursor and let the pointer open
   * editable text for retyping. A click can never fail the canvas. */
  private handleDoubleClick(event: MouseEvent): void {
    let button = 0;
    try { button = typeof event.button === 'number' ? event.button : 0; } catch { /* Left by default. */ }
    try {
      const view = this.scope.view;
      const el = view.element as HTMLCanvasElement | null;
      if (el && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        const at = new this.scope.Point(event.clientX - rect.left, event.clientY - rect.top);
        this.pointer.onDoubleClick(view.viewToProject(at), button);
        return;
      }
    } catch { /* Fall through to the cursor point. */ }
    try { this.pointer.onDoubleClick(this.mousePt, button); } catch { /* Never fail a click. */ }
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
    if (this.pointEdit?.active && this.pointEdit.selection) {
      this.pointEdit.nudgeSelected({ x: dx, y: dy });
      return;
    }
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
      keyboardLayout: this.activeKeyboardLayoutId() === 'spline' ? 'Spline' : 'Base',
      roundingMode: this.compositeRoundingMode,
      bowAmplitude: this.bowAmplitude,
      bowAmplitudeIsPercent: this.bowAmplitudeIsPercent,
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
      platform: keyboardPlatform(),
      hideCommonKeymapRows: this.hideCommonKeymapRows,
    };
    this.setStatusSchema(buildStatusSchema(snapshot), buildKeymapRows(snapshot));
  }
}

function xy(point: { x: number; y: number } | null | undefined): { x: number; y: number } | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x, y: point.y };
}
