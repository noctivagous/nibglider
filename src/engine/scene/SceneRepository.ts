// Active-layer scene access and the catalog-backed identity bridge.
// Durable drawable records live in DrawableCatalog; this service keeps no
// model-item map of its own. Retained Paper paths (records) remain the
// legacy compatibility boundary until their source kinds are modeled.
// This service never builds geometry from a model; DrawableRenderer
// remains the model rendering boundary.
import type { NGPathDrawable } from '../model/NGDrawable';
import type { NGDrawable } from '../model/NGDrawable';
import type { NGPath, NGBezierPath } from '../model/NGPath';
import type { DrawableCatalog } from '../document/DrawableCatalog';
import { LayerManager } from '../document/LayerManager';

type Item = any;
export interface RetainedPath { source: NGPath; item: paper.PathItem; geometryKey: string }
export interface SceneOverlayRefs { gridLayer: Item; cursors: Item[]; previews: Item[] }
export interface CatalogAttachment {
  catalog: DrawableCatalog;
  resolvePage: () => string;
  currentItemOf?: (id: string) => paper.Item | undefined;
}

export class SceneRepository {
  readonly scope: paper.PaperScope;
  records = new Map<string, RetainedPath>();
  private catalogAttachment: CatalogAttachment | null = null;
  private readonly overlays: () => SceneOverlayRefs;
  private readonly layers: LayerManager;

  constructor(scope: paper.PaperScope, overlays: () => SceneOverlayRefs, layers = new LayerManager(scope)) {
    this.scope = scope; this.overlays = overlays; this.layers = layers;
  }
  get layer(): paper.Layer | null { return this.layers.activeOrNull; }

  isNonContentItem(value: Item): boolean {
    if (!value) return true;
    const item = typeof value.getClassName === 'function' && value.getClassName() === 'HitResult' ? value.item : value;
    if (!item) return true;
    if (item.guide || (item.layer && item.layer !== item && item.layer.guide)) return true;
    if (item.data?.isUICursor || item.data?.isPathPreview || item.data?.isCentroidMarker) return true;
    const refs = this.overlays();
    if (refs.gridLayer && (item === refs.gridLayer || item.layer === refs.gridLayer)) return true;
    return refs.cursors.includes(item) || refs.previews.includes(item);
  }

  contentItems(): Item[] {
    return this.layer ? [...this.layer.children].filter((item) => !this.isNonContentItem(item)) : [];
  }

  isInScene(item: Item): boolean {
    if (!item) return false;
    const layer = this.layer;
    for (let parent = item; parent; parent = parent.parent) if (parent === layer) return true;
    return false;
  }

  insertContentAt(item: Item, anchor: Item | null): void {
    const layer = this.layer;
    if (!layer) return;
    try {
      if (anchor && anchor.parent === layer) layer.insertChild(anchor.index, item);
      else layer.addChild(item);
    } catch {
      try { layer.addChild(item); } catch { /* Detached; nothing to restore. */ }
    }
  }

  snapshotRecords(): Map<string, RetainedPath> { return new Map(this.records); }
  restoreRecords(snapshot: Map<string, RetainedPath>): void { this.records = new Map(snapshot); }
  pruneRecords(): void {
    for (const [id, record] of this.records) if (!this.isInScene(record.item)) this.records.delete(id);
  }

  drawableIdOf(item: paper.Item): string | null {
    for (let candidate: paper.Item | null = item; candidate; candidate = candidate.parent) {
      const id: unknown = candidate.data?.drawableId;
      if (typeof id !== 'string' || !this.isInScene(candidate)) continue;
      if (this.records.get(id)?.item === candidate) return id;
      const attachment = this.catalogAttachment;
      if (attachment && attachment.catalog.has(id) &&
        (!attachment.currentItemOf || attachment.currentItemOf(id) === candidate)) return id;
    }
    return null;
  }

  attachCatalog(attachment: CatalogAttachment): void { this.catalogAttachment = attachment; }
  detachCatalog(): void { this.catalogAttachment = null; }

  bindDrawable(drawable: NGDrawable, item: paper.Item): void {
    if (!this.isInScene(item) || item.data?.drawableId !== drawable.id) throw new Error('Drawable item is not in the active scene');
    const attachment = this.catalogAttachment;
    if (!attachment) throw new Error('SceneRepository has no catalog: attach a DrawableCatalog before binding drawables');
    attachment.catalog.upsert(attachment.resolvePage(), drawable);
  }
  unbindDrawable(_id: string): void {
    // Derived-item removal flows through SceneSynchronizer/DrawableRenderer
    // and never deletes catalog data; nothing is stored here to unbind.
  }
  drawableOf(id: string): NGDrawable | null {
    // Model-first: catalog data stays authoritative even when the derived
    // item is detached. Derived-item presence is the renderer's concern.
    return this.catalogAttachment?.catalog.get(id) ?? null;
  }

  getRetainedPathDrawable(id: string): NGPathDrawable | null {
    const retained = this.records.get(id);
    if (!retained || !this.isInScene(retained.item)) return null;
    const item = retained.item; const t = item.globalMatrix;
    // An arbitrary Paper segment edit invalidates semantic intent. Preserve
    // the archive for undo, but expose the current geometry as a Bezier source.
    const source = this.pathGeometryKey(item) === retained.geometryKey
      ? structuredClone(retained.source) : this.bezierSource(item, retained.source.id);
    return { id, kind: 'path', layerId: this.layers.activeLayerId!,
      source, transform: { a: t.a, b: t.b, c: t.c, d: t.d, tx: t.tx, ty: t.ty },
      opacity: item.opacity, visible: item.visible, locked: item.locked };
  }

  retain(item: paper.PathItem, source?: NGPath): string {
    const id = crypto.randomUUID();
    item.applyMatrix = false;
    const tag = (child: paper.Item) => { child.data.drawableId = id; child.children?.forEach(tag); };
    tag(item);
    this.records.set(id, { source: structuredClone(source ?? this.bezierSource(item)), item,
      geometryKey: this.pathGeometryKey(item) });
    return id;
  }

  retainClone(original: Item, clone: Item, shapePartOf: (item: Item) => Item): void {
    if (!original || !clone) return;
    const oldKids = original.children ?? []; const newKids = clone.children ?? [];
    for (let i = 0; i < Math.min(oldKids.length, newKids.length); i++) this.retainClone(oldKids[i], newKids[i], shapePartOf);
    const oldId = original.data?.drawableId;
    const retained = typeof oldId === 'string' ? this.records.get(oldId) : undefined;
    if (retained && retained.item === original && (clone instanceof this.scope.Path || clone instanceof this.scope.CompoundPath)) {
      const source = structuredClone(retained.source); source.id = crypto.randomUUID();
      this.retain(clone, source);
    } else if (oldId) {
      const childId = shapePartOf(clone)?.data.drawableId;
      if (childId && childId !== oldId) clone.data.drawableId = childId;
      else delete clone.data.drawableId;
    }
  }

  bezierSource(item: paper.PathItem, id: string = crypto.randomUUID()): NGBezierPath {
    const paths = item instanceof this.scope.Path ? [item] : item.children.filter((p) => p instanceof this.scope.Path) as paper.Path[];
    return { id, mode: 'bezier', fillRule: item.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
      contours: paths.map((path) => {
        const t = path === item ? new this.scope.Matrix() : path.matrix;
        const handle = (h: paper.Point) => ({ x: t.a * h.x + t.c * h.y, y: t.b * h.x + t.d * h.y });
        return { closed: path.closed, segments: path.segments.map((s) => {
          const p = t.transform(s.point);
          return { point: { x: p.x, y: p.y }, handleIn: handle(s.handleIn), handleOut: handle(s.handleOut) };
        }) };
      }) };
  }

  pathGeometryKey(item: paper.PathItem): string {
    return JSON.stringify(this.bezierSource(item, 'geometry').contours);
  }
}
