// DrawableCatalog: the authoritative page-scoped document model.
// Owns ordered NGDrawable records and their stable IDs. Every persisted
// drawable, mutation, and command answers "what is the source for X?" here.
// Reads: NGDrawable records supplied by deposit/transaction callers.
// Mutations: upsert, remove, replaceAll, clearPage. Each mutation clones on
// the way in and out, so callers can never alias stored authoring truth.
// Emits CatalogChange events after every committed mutation; validation
// failures throw before any state changes.
// ID rules: an ID is stable through transform/style edits and changes only
// on duplication or conversion to a materially new result. Upserting an
// existing ID replaces it in place and preserves draw order; a new ID
// appends. Moving an ID across pages appends it to the new page.
// Tested from tests/drawable-catalog.test.mjs.
import type { NGDrawable } from '../model/NGDrawable';
import { validateDrawable } from '../model/serialization';

export type CatalogChangeType = 'upsert' | 'remove' | 'replace' | 'clear';
export interface CatalogChange {
  type: CatalogChangeType;
  pageId: string;
  id?: string;
}
export type CatalogListener = (change: CatalogChange) => void;

interface CatalogPage {
  order: string[];
  byId: Map<string, NGDrawable>;
}

function pageKey(pageId: string): string {
  if (typeof pageId !== 'string' || pageId.length === 0) throw new Error('Catalog page id must be a non-empty string');
  return pageId;
}

export class DrawableCatalog {
  private readonly pages = new Map<string, CatalogPage>();
  private readonly index = new Map<string, string>();
  private readonly listeners = new Set<CatalogListener>();

  subscribe(listener: CatalogListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  get(id: string): NGDrawable | null {
    const pageId = this.index.get(id);
    if (!pageId) return null;
    const drawable = this.pages.get(pageId)?.byId.get(id);
    return drawable ? structuredClone(drawable) : null;
  }

  has(id: string): boolean {
    return this.index.has(id);
  }

  pageOf(id: string): string | null {
    return this.index.get(id) ?? null;
  }

  pageIds(): string[] {
    return [...this.pages.keys()];
  }

  ordered(pageId: string): NGDrawable[] {
    const page = this.pages.get(pageKey(pageId));
    if (!page) return [];
    return page.order.map((id) => structuredClone(page.byId.get(id)!));
  }

  upsert(pageId: string, drawable: NGDrawable): void {
    const key = pageKey(pageId);
    validateDrawable(drawable);
    const stored = structuredClone(drawable);
    const previousPage = this.index.get(stored.id);
    if (previousPage !== undefined && previousPage !== key) {
      const old = this.pages.get(previousPage);
      if (old) {
        old.byId.delete(stored.id);
        old.order = old.order.filter((id) => id !== stored.id);
        if (old.order.length === 0) this.pages.delete(previousPage);
      }
    }
    let page = this.pages.get(key);
    if (!page) {
      page = { order: [], byId: new Map() };
      this.pages.set(key, page);
    }
    if (!page.byId.has(stored.id)) page.order.push(stored.id);
    page.byId.set(stored.id, stored);
    this.index.set(stored.id, key);
    this.emit({ type: 'upsert', pageId: key, id: stored.id });
  }

  remove(id: string): boolean {
    const pageId = this.index.get(id);
    if (!pageId) return false;
    const page = this.pages.get(pageId);
    if (!page) {
      this.index.delete(id);
      return false;
    }
    page.byId.delete(id);
    page.order = page.order.filter((candidate) => candidate !== id);
    if (page.order.length === 0) this.pages.delete(pageId);
    this.index.delete(id);
    this.emit({ type: 'remove', pageId, id });
    return true;
  }

  replaceAll(pageId: string, drawables: NGDrawable[]): void {
    const key = pageKey(pageId);
    if (!Array.isArray(drawables)) throw new Error('Catalog replaceAll expects an array');
    const seen = new Set<string>();
    const staged = new Map<string, NGDrawable>();
    const order: string[] = [];
    for (const drawable of drawables) {
      validateDrawable(drawable);
      if (seen.has(drawable.id)) throw new Error(`Duplicate drawable id ${drawable.id}`);
      seen.add(drawable.id);
      staged.set(drawable.id, structuredClone(drawable));
      order.push(drawable.id);
    }
    const previous = this.pages.get(key);
    const previousIds = new Set(previous?.order ?? []);
    for (const id of previousIds) if (this.index.get(id) === key) this.index.delete(id);
    this.pages.set(key, { order, byId: staged });
    for (const id of order) this.index.set(id, key);
    this.emit({ type: 'replace', pageId: key });
  }

  clearPage(pageId: string): void {
    const key = pageKey(pageId);
    const page = this.pages.get(key);
    if (!page || page.order.length === 0) return;
    for (const id of page.order) this.index.delete(id);
    this.pages.delete(key);
    this.emit({ type: 'clear', pageId: key });
  }

  private emit(change: CatalogChange): void {
    this.listeners.forEach((listener) => listener(change));
  }
}
