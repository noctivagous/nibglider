// SceneSynchronizer: the only production path that creates, updates, or
// removes derived content Paper.js items for catalog entries.
// Reads: DrawableCatalog records. Writes: derived Paper items through
// DrawableRenderer, which tags every item with its drawableId.
// Rebuilding a catalog-backed item never requires the original Paper
// content item: geometry always resolves from model data.
// Stacking: rebuildDrawable preserves the item's layer index, so a single
// edit never disturbs draw order. rebuildPage renders the page in catalog
// order and converges the layer to that order; call it after reorders,
// imports, or page loads. removeDrawable drops the derived item only;
// catalog data stays authoritative and is removed via DrawableCatalog.
// Tested from tests/scene-synchronizer.test.mjs.
import type { DrawableCatalog } from '../document/DrawableCatalog';
import type { DrawableRenderer } from './DrawableRenderer';

export class SceneSynchronizer {
  private readonly catalog: DrawableCatalog;
  private readonly renderer: DrawableRenderer;
  private readonly built = new Map<string, Set<string>>();

  constructor(catalog: DrawableCatalog, renderer: DrawableRenderer) {
    this.catalog = catalog;
    this.renderer = renderer;
  }

  rebuildDrawable(id: string): paper.PathItem | null {
    const drawable = this.catalog.get(id);
    if (!drawable) return null;
    const pageId = this.catalog.pageOf(id)!;
    const previous = this.renderer.getItem(id);
    const layer = previous?.parent ?? null;
    const index = layer ? previous!.index : -1;
    const item = this.renderer.render(drawable);
    if (layer && item.parent === layer && index >= 0 && item.index !== index) {
      try {
        layer.insertChild(Math.min(index, layer.children.length - 1), item);
      } catch { /* Order restore is best-effort; the render itself succeeded. */ }
    }
    this.remember(pageId, id);
    return item;
  }

  removeDrawable(id: string): void {
    this.renderer.remove(id);
    this.forget(id);
  }

  rebuildPage(pageId: string): paper.PathItem[] {
    const ordered = this.catalog.ordered(pageId);
    const wanted = new Set(ordered.map((drawable) => drawable.id));
    const previous = this.built.get(pageId) ?? new Set<string>();
    for (const id of previous) if (!wanted.has(id)) this.removeDrawable(id);
    const items: paper.PathItem[] = [];
    for (const drawable of ordered) items.push(this.renderer.render(drawable));
    this.built.set(pageId, wanted);
    return items;
  }

  private remember(pageId: string, id: string): void {
    let set = this.built.get(pageId);
    if (!set) {
      set = new Set<string>();
      this.built.set(pageId, set);
    }
    set.add(id);
  }

  private forget(id: string): void {
    for (const set of this.built.values()) set.delete(id);
  }
}
