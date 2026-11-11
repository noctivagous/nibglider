import type { LengthUnit } from '../types';
import { coordinates } from './CoordinateManager';
import {
  createDrawingPage,
  type DrawingPage,
  type DrawingPageOrientation,
} from './DrawingPage';

export type PageOrientation = 'portrait' | 'landscape' | 'square' | null;
/** Settings-shaped view of the active page. The runtime record is
 * DrawingPage (which adds layerId); this shape stays stable for the
 * Document Info window and existing tests. */
export interface PageSettings {
  id: string;
  widthPt: number | null;
  heightPt: number | null;
  orientation: PageOrientation;
  unit: LengthUnit;
}
export interface DocumentChange { revision: number; dirty: boolean; reason: 'scene' | 'page' | 'clean' }

// The board owns a page list with an active page. Only one page is
// exposed in the UI today, but adding a second needs no remodel.
export class DocumentManager {
  private pages: DrawingPage[] = [];
  private activePageId: string | null = null;
  private displayUnit: LengthUnit = 'pt';
  private pageSeq = 0;
  private revision = 0;
  private dirty = false;
  private readonly listeners = new Set<(change: DocumentChange) => void>();

  get pageSettings(): PageSettings {
    const page = this.activePage();
    if (!page) {
      return { id: 'page-1', widthPt: null, heightPt: null, orientation: null, unit: this.displayUnit };
    }
    return {
      id: page.id,
      widthPt: page.widthPt,
      heightPt: page.heightPt,
      orientation: page.orientation as PageOrientation,
      unit: page.unit,
    };
  }
  get pageList(): DrawingPage[] { return this.pages.map((page) => ({ ...page })); }
  get currentPageId(): string | null { return this.activePageId; }
  get isDirty(): boolean { return this.dirty; }
  get revisionNumber(): number { return this.revision; }
  subscribe(listener: (change: DocumentChange) => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  activePage(): DrawingPage | null {
    return this.pages.find((page) => page.id === this.activePageId) ?? null;
  }
  /** Assign the active page's dimensions, creating page-1 when unbounded.
   * Dimensions stay in the caller's unit; orientation derives from them. */
  setPageSize(width: number, height: number, unit: LengthUnit = this.displayUnit): void {
    const widthPt = coordinates.toPoints(width, unit);
    const heightPt = coordinates.toPoints(height, unit);
    if (widthPt <= 0 || heightPt <= 0) throw new Error('Page dimensions must be positive');
    const orientation: DrawingPageOrientation =
      widthPt === heightPt ? 'square' : widthPt > heightPt ? 'landscape' : 'portrait';
    const current = this.activePage();
    if (current && current.widthPt === widthPt && current.heightPt === heightPt && current.unit === unit) return;
    if (current) {
      current.widthPt = widthPt;
      current.heightPt = heightPt;
      current.unit = unit;
      current.orientation = orientation;
    } else {
      const page = createDrawingPage(this.nextId(), widthPt, heightPt, unit);
      this.pages.push(page);
      this.activePageId = page.id;
    }
    this.markEdited('page');
  }
  /** Append a page and make it active. The board can hold more than one;
   * the UI activates among them. */
  addPage(widthPt: number, heightPt: number, unit: LengthUnit): DrawingPage {
    const page = createDrawingPage(this.nextId(), widthPt, heightPt, unit);
    this.pages.push(page);
    this.activePageId = page.id;
    this.markEdited('page');
    return { ...page };
  }
  /** Activate a page by id. Unknown ids are ignored. */
  setActivePage(id: string): boolean {
    if (!this.pages.some((page) => page.id === id)) return false;
    if (id === this.activePageId) return false;
    this.activePageId = id;
    this.markEdited('page');
    return true;
  }
  /** Display names for pages, kept beside the dimension records so
   * DrawingPage stays a pure geometry record. */
  private readonly names = new Map<string, string>();
  pageName(id: string): string {
    const known = this.names.get(id);
    if (known) return known;
    const index = this.pages.findIndex((page) => page.id === id);
    return index >= 0 ? `Page ${index + 1}` : 'Page';
  }
  renamePage(id: string, name: string): boolean {
    if (!this.pages.some((page) => page.id === id)) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    this.names.set(id, trimmed);
    this.markEdited('page');
    return true;
  }
  /** Page list with display names, in document order. */
  pageListNamed(): Array<{ page: DrawingPage; name: string }> {
    return this.pages.map((page) => ({ page: { ...page }, name: this.pageName(page.id) }));
  }
  /** Duplicate a page's dimensions under a fresh id, inserted right
   * after the source and made active. Content duplication is the
   * engine's job (it owns the scenes); this clones the record. */
  duplicatePage(id: string): DrawingPage | null {
    const index = this.pages.findIndex((page) => page.id === id);
    if (index < 0) return null;
    const source = this.pages[index];
    const copy = createDrawingPage(this.nextId(), source.widthPt, source.heightPt, source.unit);
    this.pages.splice(index + 1, 0, copy);
    this.names.set(copy.id, `${this.pageName(id)} copy`);
    this.activePageId = copy.id;
    this.markEdited('page');
    return { ...copy };
  }
  /** Remove a page. The last remaining page cannot be removed. When
   * the active page goes, the previous page (or the next) activates. */
  removePage(id: string): boolean {
    const index = this.pages.findIndex((page) => page.id === id);
    if (index < 0 || this.pages.length <= 1) return false;
    this.pages.splice(index, 1);
    this.names.delete(id);
    if (this.activePageId === id) {
      const next = this.pages[Math.min(index, this.pages.length - 1)];
      this.activePageId = next ? next.id : null;
    }
    this.markEdited('page');
    return true;
  }
  /** Move a page one step in document order. */
  movePage(id: string, dir: 'up' | 'down'): boolean {
    const index = this.pages.findIndex((page) => page.id === id);
    if (index < 0) return false;
    const swap = dir === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= this.pages.length) return false;
    [this.pages[index], this.pages[swap]] = [this.pages[swap], this.pages[index]];
    this.markEdited('page');
    return true;
  }
  /** Replace the whole page list (native document open). Pages keep
   * their stored ids; the id sequence advances past any numeric
   * suffix in use so future pages never collide. */
  setPageList(pages: DrawingPage[], activeId: string | null, names?: ReadonlyMap<string, string>): void {
    this.pages = pages.map((page) => ({ ...page }));
    this.names.clear();
    if (names) for (const [id, name] of names) this.names.set(id, name);
    this.activePageId = activeId && this.pages.some((page) => page.id === activeId)
      ? activeId
      : (this.pages[0]?.id ?? null);
    for (const page of this.pages) {
      const match = /^page-(\d+)$/.exec(page.id);
      if (match) this.pageSeq = Math.max(this.pageSeq, Number(match[1]));
    }
    const active = this.activePage();
    if (active) this.displayUnit = active.unit;
    this.markEdited('page');
  }
  /** Register an externally-created page record (native open of a
   * page whose dimensions were never set: it joins the list with the
   * given fallback size so the list stays total). */
  ensurePage(id: string, widthPt: number, heightPt: number, unit: LengthUnit): DrawingPage {
    const existing = this.pages.find((page) => page.id === id);
    if (existing) return { ...existing };
    const page = createDrawingPage(id, widthPt, heightPt, unit);
    this.pages.push(page);
    const match = /^page-(\d+)$/.exec(id);
    if (match) this.pageSeq = Math.max(this.pageSeq, Number(match[1]));
    return { ...page };
  }
  setDisplayUnit(unit: LengthUnit): void {
    coordinates.fromPoints(1, unit); // Validate even while the page is unbounded.
    const current = this.activePage();
    if (unit === this.displayUnit && (!current || unit === current.unit)) return;
    this.displayUnit = unit;
    if (current) current.unit = unit;
    this.markEdited('page');
  }
  markEdited(reason: 'scene' | 'page' = 'scene'): void {
    this.revision++;
    this.dirty = true;
    this.emit(reason);
  }
  /** Pan and zoom belong to the document, but they must not notify:
   * a full app render on every pan event is what the view channel avoids. */
  markViewDirty(): void {
    this.dirty = true;
  }
  markClean(): void { if (this.dirty) { this.dirty = false; this.emit('clean'); } }
  private nextId(): string {
    this.pageSeq += 1;
    return this.pageSeq === 1 ? 'page-1' : `page-${this.pageSeq}`;
  }
  private emit(reason: DocumentChange['reason']): void {
    const change = { revision: this.revision, dirty: this.dirty, reason };
    this.listeners.forEach((listener) => listener(change));
  }
}
