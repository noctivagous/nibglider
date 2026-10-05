import { HistoryManager, type MoveEntry } from './HistoryManager';
import { SelectionManager } from '../scene/SelectionManager';
import { SceneRepository } from '../scene/SceneRepository';

type Item = any;
// Applies live movement and transforms. Only completed gestures and discrete
// keyboard actions produce history entries; preview movement never does.
export class TransformManager {
  private readonly scene: SceneRepository;
  private readonly selection: SelectionManager;
  private readonly history: HistoryManager;
  constructor(scene: SceneRepository, selection: SelectionManager, history: HistoryManager) {
    this.scene = scene; this.selection = selection; this.history = history;
  }
  beginDrag(): void { this.history.beginMoveGesture(this.selection.snapshot()); }
  cancelDrag(): void { this.history.cancelMoveGesture(); }
  commitDrag(coalesceKey?: string): void { this.history.commitMoveGesture(coalesceKey); }
  moveSelectionBy(delta: paper.Point): void {
    if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return;
    for (const item of this.selection.selectedItems) if (this.scene.isInScene(item)) {
      item.position = item.position.add(delta);
    }
    this.selection.refreshCentroids();
  }
  nudge(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return;
    this.commitDrag();
    const items = this.selection.snapshot();
    const before = items.map((item) => item.position.clone());
    this.moveSelectionBy(new this.scene.scope.Point(dx, dy));
    const entries: MoveEntry[] = items.map((item, i) => ({ item, before: before[i], after: item.position.clone() }));
    this.history.recordMove(entries, 'nudge');
  }
  scale(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    const items = this.selection.topLevelSelected();
    if (!items.length) return;
    const center = this.selection.collectiveCenter(items);
    items.forEach((item) => item.scale(factor, center));
    this.selection.refreshCentroids();
    this.history.recordScale(items, factor, center);
  }
  rotate(degrees: number): void {
    if (!Number.isFinite(degrees) || degrees === 0) return;
    const items = this.selection.topLevelSelected();
    if (!items.length) return;
    const center = this.selection.collectiveCenter(items);
    items.forEach((item) => item.rotate(degrees, center));
    this.selection.refreshCentroids();
    this.history.recordRotate(items, degrees, center);
  }
  scalePreview(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.applyPreview((items, center) => items.forEach((item) => item.scale(factor, center)));
  }
  rotatePreview(degrees: number): void {
    if (!Number.isFinite(degrees) || degrees === 0) return;
    this.applyPreview((items, center) => items.forEach((item) => item.rotate(degrees, center)));
  }
  private applyPreview(mutator: (items: Item[], center: paper.Point) => void): void {
    const items = this.selection.topLevelSelected();
    if (!items.length) return;
    const center = this.selection.collectiveCenter(items);
    mutator(items, center);
  }
}
