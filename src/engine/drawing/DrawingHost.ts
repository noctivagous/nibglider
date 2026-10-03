// Services a drawing tool may use. Geometry factories and history stay behind
// this boundary so tools do not read unrelated engine fields or copy deposit.
import type { CircleRadiusAnchor } from '../types';
import type { DrawingSession } from './DrawingSession';

type Item = any;

export interface OpenEndpoint { path: Item; atStart: boolean }

export interface DepositSnap {
  before: Item[];
  selected: Item[];
  retained: Map<string, any>;
}

export interface PlaceOptions { front?: boolean; opacity?: number }

export interface DrawingHost {
  readonly session: DrawingSession;
  scope(): paper.PaperScope;
  pathDrawingMode(): 'legacy' | 'ngComposite';
  splineTension(): number;
  fillEnabled(): boolean;
  strokeEnabled(): boolean;
  globalStrokeColor(): string;
  globalStrokeWidth(): number;
  depositPointMode(): number;
  circleRadiusAnchor(): CircleRadiusAnchor;
  rectangleInnerShapeType(): string;
  innerShapeType(): string;
  endpointTolerance(): number;
  rectDiagonalScale(): number;
  centerlineWidthForLength(length: number): number;
  lastCenterlineWidth(): number;
  setLastCenterlineWidth(width: number): void;
  layerChildren(): Item[];
  isNonContentItem(item: Item): boolean;
  addToActive(item: Item): void;
  applyStrokeGeometry(item: Item): void;
  applyStrokeDash(item: Item): void;
  applyCurrentStyles(item: Item): void;
  applyFill(item: Item): void;
  stylePreviewFrame(item: Item, brightness?: number): void;
  addPreviewShadow(item: Item): void;
  clearShadow(item: Item): void;
  withShapeText(item: Item, isPreview: boolean): Item;
  resetStampedText(item: Item): void;
  shapePartOf(item: Item): Item;
  createInnerShape(center: Item, radius: number, style: string, rotation?: number): Item;
  createRectFrameShape(style: string): Item;
  drawInnerShape(frame: Item, style: string): void;
  refreshSplineText(): void;
  clearSplineText(): void;
  findOpenEndpointNear(point: Item): OpenEndpoint | null;
  removeFromSelection(item: Item): void;
  dropItem(item: Item): void;
  place(item: Item, opts?: PlaceOptions): Item | null;
  capture(): DepositSnap;
  commit(label: string, snap: DepositSnap, placed: Item[], retain?: boolean): void;
  isRetained(shape: Item): boolean;
  bezierSource(item: Item): any;
  retainResult(item: Item, source?: any): void;
  pruneRecords(): void;
  updateTextContent(): void;
  notify(): void;
  cancelDrawing(): void;
}
