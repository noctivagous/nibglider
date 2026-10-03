import type { LengthUnit } from '../types';
import { coordinates } from './CoordinateManager';

export type PageOrientation = 'portrait' | 'landscape' | 'square' | null;
export interface PageSettings {
  id: 'page-1';
  widthPt: number | null;
  heightPt: number | null;
  orientation: PageOrientation;
  unit: LengthUnit;
}
export interface DocumentChange { revision: number; dirty: boolean; reason: 'scene' | 'page' | 'clean' }

// The current canvas has one unbounded page. Dimensions can be assigned by a
// future page-settings UI without changing today's drawing/view behavior.
export class DocumentManager {
  private page: PageSettings = { id: 'page-1', widthPt: null, heightPt: null, orientation: null, unit: 'pt' };
  private revision = 0;
  private dirty = false;
  private readonly listeners = new Set<(change: DocumentChange) => void>();

  get pageSettings(): PageSettings { return { ...this.page }; }
  get isDirty(): boolean { return this.dirty; }
  get revisionNumber(): number { return this.revision; }
  subscribe(listener: (change: DocumentChange) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }
  setPageSize(width: number, height: number, unit: LengthUnit = this.page.unit): void {
    const widthPt = coordinates.toPoints(width, unit);
    const heightPt = coordinates.toPoints(height, unit);
    if (widthPt <= 0 || heightPt <= 0) throw new Error('Page dimensions must be positive');
    const orientation = widthPt === heightPt ? 'square' : widthPt > heightPt ? 'landscape' : 'portrait';
    if (this.page.widthPt === widthPt && this.page.heightPt === heightPt && this.page.unit === unit) return;
    this.page = { ...this.page, widthPt, heightPt, orientation, unit };
    this.markEdited('page');
  }
  setDisplayUnit(unit: LengthUnit): void {
    coordinates.fromPoints(1, unit); // Validate even while the page is unbounded.
    if (unit === this.page.unit) return;
    this.page = { ...this.page, unit };
    this.markEdited('page');
  }
  markEdited(reason: 'scene' | 'page' = 'scene'): void {
    this.revision++;
    this.dirty = true;
    this.emit(reason);
  }
  markClean(): void { if (this.dirty) { this.dirty = false; this.emit('clean'); } }
  private emit(reason: DocumentChange['reason']): void {
    const change = { revision: this.revision, dirty: this.dirty, reason };
    this.listeners.forEach((listener) => listener(change));
  }
}
