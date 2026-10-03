// Current single active layer. Layer IDs are stable for this Paper project;
// creating and editing document layers belongs to a later UI phase.
export class LayerManager {
  private readonly scope: paper.PaperScope;
  constructor(scope: paper.PaperScope) { this.scope = scope; }
  get activeOrNull(): paper.Layer | null { return this.scope.project?.activeLayer ?? null; }
  get activeLayer(): paper.Layer { return this.scope.project.activeLayer; }
  get activeLayerId(): string | null {
    const layer = this.activeOrNull;
    return layer ? `paper-layer-${layer.id}` : null;
  }
  layerForId(id: string): paper.Layer | null {
    const layer = this.activeOrNull;
    return layer && id === `paper-layer-${layer.id}` ? layer : null;
  }
  addToActive(item: paper.Item): void { this.activeLayer.addChild(item); }
}
