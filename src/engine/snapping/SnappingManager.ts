import { snapAngle, snapAspect, aspectSecond, snapGrid, snapLength } from './snappingMath';
import { localCentroidOf } from '../geometry/shapeCenters';
import type { GridType } from '../types';

type Item = any;
export interface SnappingState {
  gridEnabled: boolean; gridSnapping: boolean; gridType: GridType; gridSpacing: number;
  path: boolean; point: boolean; angle: boolean; length: boolean; aspect: boolean;
  angleDegrees: number; lengthStep: number; aspectA: number; aspectB: number;
}
export interface SnapIndicators { mount(item: paper.Item): void; pathCursor(item: Item | null): void; pointCursor(item: Item | null): void }

// Pure constraints are exposed above; this manager owns Paper scene searches
// and indicator items, never document geometry or drawing-session state.
export class SnappingManager {
  private readonly scope: paper.PaperScope;
  private readonly state: () => SnappingState;
  private readonly ignored: () => Set<Item>;
  private readonly isGuide: (item: Item) => boolean;
  private readonly indicators: SnapIndicators;
  private pathCursor: Item = null;
  private pointCursor: Item = null;
  constructor(scope: paper.PaperScope, state: () => SnappingState, ignored: () => Set<Item>,
    isGuide: (item: Item) => boolean, indicators: SnapIndicators) {
    this.scope = scope; this.state = state; this.ignored = ignored; this.isGuide = isGuide; this.indicators = indicators;
  }
  get pathIndicator(): Item { return this.pathCursor; }
  get pointIndicator(): Item { return this.pointCursor; }
  grid(point: paper.Point): paper.Point {
    const state = this.state();
    if (!state.gridSnapping) return point;
    const snapped = snapGrid(point, state.gridSpacing, state.gridType);
    return new this.scope.Point(snapped.x, snapped.y);
  }
  angle(base: paper.Point, target: paper.Point): paper.Point {
    const state = this.state(); if (!state.angle || !base || !target) return target;
    const snapped = snapAngle(base, target, state.angleDegrees); return new this.scope.Point(snapped.x, snapped.y);
  }
  length(base: paper.Point, target: paper.Point): paper.Point {
    const state = this.state(); if (!state.length || !base || !target) return target;
    const snapped = snapLength(base, target, state.lengthStep); return new this.scope.Point(snapped.x, snapped.y);
  }
  aspect(base: paper.Point, target: paper.Point): paper.Point {
    const state = this.state(); if (!state.aspect || !base || !target) return target;
    const snapped = snapAspect(base, target, state.aspectA, state.aspectB); return new this.scope.Point(snapped.x, snapped.y);
  }
  aspectSecond(first: number, second: number): number {
    const state = this.state(); return state.aspect ? aspectSecond(first, state.aspectA, state.aspectB) : second;
  }
  snapPath(original: paper.Point): paper.Point | null {
    const state = this.state();
    if (!state.path || !original) { this.hidePath(); return null; }
    const ignored = this.ignored(); let best: paper.Point | null = null; let distance = Infinity;
    const items: Item[] = this.scope.project.getItems({ match: (item: Item) =>
      !!item && item.visible && !this.isGuide(item) && !ignored.has(item) &&
      (typeof item.getNearestPoint === 'function' || item.segments || item.curves) });
    for (const item of items) {
      const nearest = typeof item.getNearestPoint === 'function'
        ? item.localToGlobal(item.getNearestPoint(item.globalToLocal(original))) : item.position;
      if (!nearest) continue;
      const next = nearest.getDistance(original);
      if (next < distance) { distance = next; best = nearest; }
    }
    if (!best || distance > 12) { this.hidePath(); return null; }
    if (!this.pathCursor) this.pathCursor = this.indicator(best, '#ff0000');
    this.pathCursor.position = best; this.pathCursor.visible = true; this.indicators.mount(this.pathCursor); this.indicators.pathCursor(this.pathCursor);
    return new this.scope.Point(best.x, best.y);
  }
  snapPoint(original: paper.Point): paper.Point | null {
    const state = this.state();
    if (!state.point || !original) { this.hidePoint(); return null; }
    const ignored = this.ignored(); type Kind = 'point' | 'midpoint' | 'centroid';
    const colors: Record<Kind, string> = { point: '#ffd43b', midpoint: '#4dabf7', centroid: '#69db7c' };
    let best: paper.Point | null = null; let kind: Kind = 'point'; let distance = Infinity;
    const consider = (candidate: paper.Point | null, candidateKind: Kind) => {
      if (!candidate) return; const next = candidate.getDistance(original);
      if (next < distance) { distance = next; best = candidate; kind = candidateKind; }
    };
    const leaves: Item[] = [];
    const collect = (item: Item): void => {
      if (!item || !item.visible || ignored.has(item)) return;
      if (item.children?.length) { item.children.forEach(collect); return; }
      if (!item.segments?.length) return;
      leaves.push(item);
      item.segments.forEach((segment: Item) => consider(item.localToGlobal(segment.point), 'point'));
      item.curves?.forEach((curve: Item) => consider(item.localToGlobal(curve.getPointAt(curve.length / 2)), 'midpoint'));
      // Stored circle origins (sectors, segments, regular polygons) win over
      // the bounds center; other straight closed paths use their area centroid.
      const local = localCentroidOf(item);
      if (local) {
        try {
          consider(item.localToGlobal(new this.scope.Point(local.x, local.y)), 'centroid');
        } catch { /* Detached mid-search. */ }
      }
    };
    const items: Item[] = this.scope.project.getItems({ match: (item: Item) =>
      !!item && item.visible && !this.isGuide(item) && !ignored.has(item) &&
      !!(item.segments || item.curves || item.children?.length) });
    items.forEach(collect);
    // Path crossings snap as points: pairwise intersections (including each
    // path's self-intersections) compete with vertices, midpoints, and
    // centroids for the nearest candidate within tolerance.
    const TOLERANCE = 12;
    const nearCursor = (leaf: Item): boolean => {
      try {
        if (typeof leaf.getNearestPoint !== 'function' || typeof leaf.globalToLocal !== 'function') return true;
        const nearest = leaf.getNearestPoint(leaf.globalToLocal(original));
        if (!nearest) return true;
        return leaf.localToGlobal(nearest).getDistance(original) <= TOLERANCE;
      } catch { return true; }
    };
    const nearby = leaves.filter(nearCursor).slice(0, 50);
    const considerLocations = (locations: Item[] | null | undefined): void => {
      if (!locations || typeof (locations as Item[]).length !== 'number') return;
      for (const location of locations as Item[]) {
        if (location?.point) consider(location.point, 'point');
      }
    };
    for (let i = 0; i < nearby.length; i++) {
      for (let j = i; j < nearby.length; j++) {
        try {
          considerLocations(nearby[i].getIntersections?.(nearby[j]));
        } catch { /* Detached or degenerate geometry mid-search. */ }
      }
    }
    if (!best || distance > TOLERANCE) { this.hidePoint(); return null; }
    const winner = best as paper.Point;
    const snapped = new this.scope.Point(winner.x, winner.y);
    if (!this.pointCursor) this.pointCursor = this.indicator(snapped, colors[kind]);
    this.pointCursor.position = snapped; this.pointCursor.fillColor = new this.scope.Color(colors[kind]); this.pointCursor.visible = true;
    this.indicators.mount(this.pointCursor); this.indicators.pointCursor(this.pointCursor);
    return snapped;
  }
  private indicator(point: paper.Point, color: string): Item {
    const item: Item = new this.scope.Shape.Circle(point, 4);
    item.fillColor = new this.scope.Color(color); item.strokeColor = new this.scope.Color(0, 0, 0, 1); item.strokeWidth = 2;
    return item;
  }
  private hidePath(): void { if (this.pathCursor) this.pathCursor.visible = false; }
  private hidePoint(): void { if (this.pointCursor) this.pointCursor.visible = false; }
}
