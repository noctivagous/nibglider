// Document layers: a registry of real Paper layers the user owns.
// Layer record ids are stable (`paper-layer-<paper id>`, the format
// this class has always used); the first non-guide layer of the
// project is adopted as Layer 1. Overlay layers (page chrome, guides,
// grid — guide-flagged) are never registered and never listed.
// Stacking order in the registry is bottom-to-top, matching the
// project layer order restricted to registered layers; creating or
// moving a layer re-stacks the Paper layers so the project order
// agrees. The active layer is the one deposits land on and the one
// selection/ordering operations work within.
// Public ops are tested from tests/layers.test.mjs (pure logic in
// layerModel.ts; registry behaviour here against a Paper scope).
import {
  layerRecord, moveLayer, nextLayerName, type LayerRecord,
} from './layerModel';

export class LayerManager {
  private readonly scope: paper.PaperScope;
  private registry: LayerRecord[] | null = null;
  private activeId: string | null = null;

  constructor(scope: paper.PaperScope) { this.scope = scope; }

  get activeOrNull(): paper.Layer | null { return this.scope.project?.activeLayer ?? null; }
  get activeLayer(): paper.Layer { return this.scope.project.activeLayer; }
  get activeLayerId(): string | null {
    this.ensureRegistry();
    if (this.activeId) return this.activeId;
    const layer = this.activeOrNull;
    return layer ? `paper-layer-${layer.id}` : null;
  }

  layerForId(id: string): paper.Layer | null {
    const registered = this.ensureRegistry().find((record) => record.id === id);
    if (registered) return this.paperLayerFor(registered);
    const layer = this.activeOrNull;
    return layer && id === `paper-layer-${layer.id}` ? layer : null;
  }

  addToActive(item: paper.Item): void { this.activeLayer.addChild(item); }

  // --- Registry -----------------------------------------------------

  private paperLayerFor(record: LayerRecord): paper.Layer | null {
    const project = this.scope.project;
    if (!project) return null;
    for (const layer of project.layers) {
      if (`paper-layer-${layer.id}` === record.id) return layer as paper.Layer;
    }
    return null;
  }

  private isContentLayer(layer: paper.Layer): boolean {
    try { return !(layer as unknown as { guide?: boolean }).guide; } catch { return true; }
  }

  private ensureRegistry(): LayerRecord[] {
    if (this.registry) return this.registry;
    const records: LayerRecord[] = [];
    const project = this.scope.project;
    if (project) {
      for (const layer of project.layers) {
        if (!this.isContentLayer(layer as paper.Layer)) continue;
        records.push(layerRecord(
          `paper-layer-${layer.id}`,
          layer.name && layer.name.trim().length > 0 ? layer.name : `Layer ${records.length + 1}`,
        ));
      }
    }
    if (records.length === 0 && this.activeOrNull && this.isContentLayer(this.activeOrNull)) {
      records.push(layerRecord(`paper-layer-${this.activeOrNull.id}`, 'Layer 1'));
    }
    this.registry = records;
    const active = this.activeOrNull;
    this.activeId = active ? `paper-layer-${active.id}` : (records[0]?.id ?? null);
    if (this.activeId && !records.some((record) => record.id === this.activeId)) {
      this.activeId = records[0]?.id ?? null;
    }
    return this.registry;
  }

  /** Registered content layers, bottom-to-top. */
  listLayers(): LayerRecord[] {
    return [...this.ensureRegistry()];
  }

  /** The Paper layers backing the registry, bottom-to-top. */
  contentLayers(): paper.Layer[] {
    return this.ensureRegistry()
      .map((record) => this.paperLayerFor(record))
      .filter((layer): layer is paper.Layer => layer !== null);
  }

  /** Create a new empty layer above the active one and activate it. */
  createLayer(name?: string): LayerRecord {
    const records = this.ensureRegistry();
    const scope = this.scope;
    scope.activate();
    const layer = new scope.Layer();
    const record = layerRecord(
      `paper-layer-${layer.id}`,
      name && name.trim().length > 0 ? name : nextLayerName(records),
    );
    layer.name = record.name;
    const activeIndex = records.findIndex((r) => r.id === this.activeId);
    const at = activeIndex >= 0 ? activeIndex + 1 : records.length;
    records.splice(at, 0, record);
    this.restack();
    layer.activate();
    this.activeId = record.id;
    return record;
  }

  /**
   * Delete a layer and every item in it. Refuses to delete the last
   * remaining layer. Returns the removed items so the caller can
   * record history. Activates the nearest remaining layer.
   */
  deleteLayer(id: string): paper.Item[] | null {
    const records = this.ensureRegistry();
    if (records.length <= 1) return null;
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) return null;
    const layer = this.paperLayerFor(records[index]);
    const removed = layer ? [...layer.children] : [];
    records.splice(index, 1);
    if (layer) {
      try { layer.remove(); } catch { /* Already detached. */ }
    }
    if (this.activeId === id) {
      const fallback = records[Math.min(index, records.length - 1)];
      this.activeId = fallback?.id ?? null;
      const paper = fallback ? this.paperLayerFor(fallback) : null;
      if (paper) { try { paper.activate(); } catch { /* Headless. */ } }
    }
    return removed;
  }

  renameLayer(id: string, name: string): boolean {
    const records = this.ensureRegistry();
    const record = records.find((r) => r.id === id);
    if (!record || name.trim().length === 0) return false;
    record.name = name.trim();
    const layer = this.paperLayerFor(record);
    if (layer) layer.name = record.name;
    return true;
  }

  /** Move a layer one step up (towards the top) or down. */
  moveLayerRecord(id: string, dir: 'up' | 'down'): boolean {
    const before = this.ensureRegistry();
    const after = moveLayer(before, id, dir);
    if (after.every((record, i) => record.id === before[i].id)) return false;
    this.registry = after;
    this.restack();
    return true;
  }

  /** Activate a registered layer so deposits and selection land there. */
  setActiveLayer(id: string): boolean {
    const records = this.ensureRegistry();
    const record = records.find((r) => r.id === id);
    if (!record) return false;
    const layer = this.paperLayerFor(record);
    if (!layer) return false;
    try { layer.activate(); } catch { return false; }
    this.activeId = id;
    return true;
  }

  /**
   * Rebuild the registry from explicit records (scene load): existing
   * Paper layers already in the project are matched by name in order;
   * callers that create Paper layers per record (SceneIO v2 decode)
   * should instead use adoptLayer() per created layer.
   */
  adoptLayer(layer: paper.Layer, record: LayerRecord): void {
    const records = this.ensureRegistry();
    if (!records.some((r) => r.id === record.id)) records.push(record);
    else records[records.findIndex((r) => r.id === record.id)] = record;
    if (layer.name !== record.name) layer.name = record.name;
  }

  /** Registry id of the Paper layer a scene decode flagged with the
   * given payload record id, or null. */
  layerIdForRecordFlag(flagId: string): string | null {
    const project = this.scope.project;
    if (!project) return null;
    for (const layer of project.layers) {
      if ((layer as paper.Item).data?.layerRecordId === flagId) return `paper-layer-${layer.id}`;
    }
    return null;
  }

  /** Drop registry entries whose Paper layer no longer exists, then
   * adopt any unregistered non-guide Paper layer (scene decode
   * places items into freshly created layers). */
  syncWithProject(orderedRecords?: LayerRecord[]): void {
    const project = this.scope.project;
    if (!project) { this.registry = []; return; }
    const present = new Map<string, paper.Layer>();
    for (const layer of project.layers) {
      if (this.isContentLayer(layer as paper.Layer)) present.set(`paper-layer-${layer.id}`, layer as paper.Layer);
    }
    if (orderedRecords && orderedRecords.length > 0) {
      // Scene payloads name layers in order; Paper decode creates one
      // layer per record in that order, so match by position among
      // the layers the decoder created (flagged via data).
      const decoded = (project.layers as paper.Layer[]).filter(
        (layer) => (layer as paper.Item).data?.layerRecordId,
      );
      const next: LayerRecord[] = [];
      orderedRecords.forEach((record, i) => {
        const layer = decoded[i];
        if (layer) next.push(layerRecord(`paper-layer-${layer.id}`, record.name));
      });
      for (const [id, layer] of present) {
        if (!next.some((r) => r.id === id) && !decoded.includes(layer)) {
          next.push(layerRecord(id, layer.name && layer.name.trim() ? layer.name : `Layer ${next.length + 1}`));
        }
      }
      this.registry = next.length > 0 ? next : [...present.keys()].map((id, i) => layerRecord(id, `Layer ${i + 1}`));
    } else {
      const kept = this.ensureRegistry().filter((record) => present.has(record.id));
      for (const [id, layer] of present) {
        if (!kept.some((r) => r.id === id)) {
          kept.push(layerRecord(id, layer.name && layer.name.trim() ? layer.name : `Layer ${kept.length + 1}`));
        }
      }
      this.registry = kept;
    }
    const active = this.activeOrNull;
    this.activeId = active ? `paper-layer-${active.id}` : (this.registry[0]?.id ?? null);
    if (this.activeId && !this.registry.some((r) => r.id === this.activeId)) {
      this.activeId = this.registry[0]?.id ?? null;
    }
  }

  /** Re-stack Paper layers so project order matches registry order
   * for registered layers (overlay layers keep their own places as
   * far as Paper allows: registered layers are moved as a block in
   * registry order above the bottom-most registered layer). */
  private restack(): void {
    const project = this.scope.project;
    if (!project) return;
    const layers = this.contentLayers();
    for (const layer of layers) {
      try { project.addLayer(layer); } catch { /* Detached. */ }
    }
  }
}
