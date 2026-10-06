// Composition root shared by the facade.
// Owns the PaperScope, the React subscription, and the service instances.
// Does not own paint, text settings, or the drawing session, and does not
// copy them. The facade assigns each service once during construction.
// Public: scope, subscribe, getVersion, notify, and the service fields.
// Tested from tests/engine-context.test.mjs.

import type { DropController } from './document/DropController';
import type { DocumentManager } from './document/DocumentManager';
import type { LayerManager } from './document/LayerManager';
import type { ViewportManager } from './document/ViewportManager';
import type { CircleTool } from './drawing/CircleTool';
import type { PathTool } from './drawing/PathTool';
import type { QuadTool } from './drawing/QuadTool';
import type { RectangleTool } from './drawing/RectangleTool';
import type { StyleManager } from './appearance/StyleManager';
import type { TextLayout } from './appearance/TextLayout';
import type { ShapeFactory } from './geometry/ShapeFactory';
import type { HistoryManager } from './history/HistoryManager';
import type { TransformManager } from './history/TransformManager';
import type { CombinatoricsManager } from './scene/CombinatoricsManager';
import type { InterlaceManager } from './scene/InterlaceManager';
import type { SceneRepository } from './scene/SceneRepository';
import type { SelectionManager } from './scene/SelectionManager';
import type { GridRenderer } from './snapping/GridRenderer';
import type { SnappingManager } from './snapping/SnappingManager';

export class EngineContext {
  readonly scope: paper.PaperScope;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  styles!: StyleManager;
  textLayout!: TextLayout;
  shapes!: ShapeFactory;
  layers!: LayerManager;
  viewport!: ViewportManager;
  documentManager!: DocumentManager;
  scene!: SceneRepository;
  history!: HistoryManager;
  selection!: SelectionManager;
  combinatorics!: CombinatoricsManager;
  interlace!: InterlaceManager;
  drops!: DropController;
  transforms!: TransformManager;
  gridRenderer!: GridRenderer;
  snapping!: SnappingManager;
  compositePathTool!: PathTool;
  circleTool!: CircleTool;
  rectangleTool!: RectangleTool;
  quadTool!: QuadTool;

  constructor(scope: paper.PaperScope) {
    this.scope = scope;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getVersion = (): number => this.version;

  notify(): void {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
}
