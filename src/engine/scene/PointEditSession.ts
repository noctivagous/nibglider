// PointEditSession: direct point editing for one deposited path.
// Shows anchors and Bézier handles as guide-layer overlays, lets the
// user pick them up with the mouse (key-click selection: steering
// to a point and pressing the point key selects it — see the
// engine's selectPointAtCursor), drag them, and run the TASKS.txt
// §PATH KEYS operations: Pick up (point), Move Edge, Split Point,
// Join, Select Point — plus delete point, corner↔smooth conversion
// and closing an open path.
//
// All geometry goes through the pure operations in
// geometry/pointEditing.ts over segment snapshots; the session only
// translates between Paper segments and snapshots. Each completed
// gesture or operation asks the host to commit exactly one history
// entry (before/after snapshots). The host owns the write-back to
// the retained source / catalog (segment edits lower semantic
// sources to plain Bézier, per the model README bridge).
// Tested from tests/point-edit-session.test.mjs.
import type { BezierSegment, Vec2 } from '../model/geometryResolution';
import {
  cloneSegments, convertPoint, deletePoint, insertPointOnSegment,
  isSmoothPoint, moveAnchor, moveEdge, moveHandle,
} from '../geometry/pointEditing';

type Item = any;

export interface ContourSnapshot {
  closed: boolean;
  segments: BezierSegment[];
}

export interface PointSelection {
  pathIndex: number;
  segmentIndex: number;
  handle: 'in' | 'out' | null;
}

export interface PointEditHost {
  scope: paper.PaperScope;
  mountOverlay(item: Item): void;
  removeOverlay(item: Item): void;
  /** Record one undoable edit with before/after contour snapshots. */
  commit(label: string, item: Item, before: ContourSnapshot[], after: ContourSnapshot[]): void;
  /** The edit is already applied live; refresh bridges/status. */
  notify(): void;
}

/** Snapshot a Path/CompoundPath item's contours (local coordinates). */
export function snapshotItem(item: Item): ContourSnapshot[] {
  const paths = item.className === 'CompoundPath'
    ? (item.children ?? []).filter((child: Item) => child.className === 'Path')
    : [item];
  return paths.map((path: Item) => ({
    closed: Boolean(path.closed),
    segments: (path.segments ?? []).map((seg: Item) => ({
      point: { x: seg.point.x, y: seg.point.y },
      handleIn: { x: seg.handleIn.x, y: seg.handleIn.y },
      handleOut: { x: seg.handleOut.x, y: seg.handleOut.y },
    })),
  }));
}

/** Write contour snapshots back onto a Path/CompoundPath item. */
export function applySnapshots(scope: paper.PaperScope, item: Item, snapshots: ContourSnapshot[]): void {
  const paths = item.className === 'CompoundPath'
    ? (item.children ?? []).filter((child: Item) => child.className === 'Path')
    : [item];
  snapshots.forEach((snapshot, i) => {
    const path = paths[i];
    if (!path) return;
    path.segments = snapshot.segments.map((seg) => new scope.Segment(
      new scope.Point(seg.point.x, seg.point.y),
      new scope.Point(seg.handleIn.x, seg.handleIn.y),
      new scope.Point(seg.handleOut.x, seg.handleOut.y),
    ));
    path.closed = snapshot.closed;
  });
}

interface DragState {
  kind: 'anchor' | 'handle' | 'edge';
  startGlobal: Vec2;
  pathIndex: number;
  segmentIndex: number;
  handle: 'in' | 'out';
  coupled: boolean;
  before: ContourSnapshot[];
  moved: boolean;
}

const HANDLE_SIZE = 5;

export class PointEditSession {
  private readonly scope: paper.PaperScope;
  private readonly host: PointEditHost;
  private item: Item = null;
  private overlays: Item[] = [];
  selection: PointSelection | null = null;
  private drag: DragState | null = null;

  constructor(host: PointEditHost) {
    this.host = host;
    this.scope = host.scope;
  }

  get active(): boolean { return this.item !== null; }
  get target(): Item { return this.item; }

  attach(item: Item): boolean {
    if (!item || (item.className !== 'Path' && item.className !== 'CompoundPath')) return false;
    this.detach();
    this.item = item;
    this.selection = null;
    this.refreshOverlay();
    return true;
  }

  detach(): void {
    this.clearOverlay();
    this.item = null;
    this.selection = null;
    this.drag = null;
  }

  private paths(): Item[] {
    if (!this.item) return [];
    return this.item.className === 'CompoundPath'
      ? (this.item.children ?? []).filter((child: Item) => child.className === 'Path')
      : [this.item];
  }

  private toLocal(pathIndex: number, globalPoint: Vec2): Vec2 {
    const path = this.paths()[pathIndex];
    if (!path) return globalPoint;
    const local = path.globalToLocal(new this.scope.Point(globalPoint.x, globalPoint.y));
    return { x: local.x, y: local.y };
  }

  private toGlobal(pathIndex: number, localPoint: Vec2): Vec2 {
    const path = this.paths()[pathIndex];
    if (!path) return localPoint;
    const global = path.localToGlobal(new this.scope.Point(localPoint.x, localPoint.y));
    return { x: global.x, y: global.y };
  }

  // --- Overlay --------------------------------------------------------

  private clearOverlay(): void {
    for (const overlay of this.overlays) {
      try { this.host.removeOverlay(overlay); } catch { /* Detached. */ }
      try { overlay.remove(); } catch { /* Detached. */ }
    }
    this.overlays = [];
  }

  refreshOverlay(): void {
    this.clearOverlay();
    if (!this.item) return;
    const scope = this.scope;
    const snapshots = snapshotItem(this.item);
    snapshots.forEach((snapshot, pathIndex) => {
      snapshot.segments.forEach((seg, segmentIndex) => {
        const anchor = this.toGlobal(pathIndex, seg.point);
        const selected = this.selection?.pathIndex === pathIndex
          && this.selection?.segmentIndex === segmentIndex;
        // Handles of the selected anchor: line + knob per handle.
        if (selected) {
          for (const which of ['in', 'out'] as const) {
            const handle = which === 'in' ? seg.handleIn : seg.handleOut;
            if (handle.x === 0 && handle.y === 0) continue;
            const end = this.toGlobal(pathIndex, { x: seg.point.x + handle.x, y: seg.point.y + handle.y });
            const line = new scope.Path.Line(
              new scope.Point(anchor.x, anchor.y), new scope.Point(end.x, end.y),
            );
            line.strokeColor = new scope.Color('#2b6cb0');
            line.strokeWidth = 1;
            const knob = new scope.Path.Circle(new scope.Point(end.x, end.y), HANDLE_SIZE * 0.7);
            knob.fillColor = new scope.Color('#ffffff');
            knob.strokeColor = new scope.Color('#2b6cb0');
            knob.data.pointEditHandle = which;
            this.mount(line); this.mount(knob);
          }
        }
        const box = new scope.Path.Rectangle(
          new scope.Point(anchor.x - HANDLE_SIZE / 2, anchor.y - HANDLE_SIZE / 2),
          new scope.Size(HANDLE_SIZE, HANDLE_SIZE),
        );
        box.fillColor = new scope.Color(selected ? '#2b6cb0' : '#ffffff');
        box.strokeColor = new scope.Color('#2b6cb0');
        box.strokeWidth = 1;
        box.data.pointEditAnchor = true;
        this.mount(box);
      });
    });
  }

  private mount(item: Item): void {
    item.guide = true;
    item.locked = true;
    if (!item.data) item.data = {};
    item.data.isPointEditOverlay = true;
    this.host.mountOverlay(item);
    this.overlays.push(item);
  }

  // --- Picking --------------------------------------------------------

  /** Hit-test anchors (then the selected anchor's handles) at a
   * global point within `tolerance` (global units). */
  pick(globalPoint: Vec2, tolerance: number): PointSelection | null {
    if (!this.item) return null;
    const snapshots = snapshotItem(this.item);
    // Handles first when a point is selected: they sit on top.
    if (this.selection) {
      const { pathIndex, segmentIndex } = this.selection;
      const seg = snapshots[pathIndex]?.segments[segmentIndex];
      if (seg) {
        for (const which of ['in', 'out'] as const) {
          const handle = which === 'in' ? seg.handleIn : seg.handleOut;
          if (handle.x === 0 && handle.y === 0) continue;
          const end = this.toGlobal(pathIndex, { x: seg.point.x + handle.x, y: seg.point.y + handle.y });
          if (Math.hypot(end.x - globalPoint.x, end.y - globalPoint.y) <= tolerance) {
            return { pathIndex, segmentIndex, handle: which };
          }
        }
      }
    }
    let best: PointSelection | null = null;
    let bestDist = Infinity;
    snapshots.forEach((snapshot, pathIndex) => {
      snapshot.segments.forEach((seg, segmentIndex) => {
        const anchor = this.toGlobal(pathIndex, seg.point);
        const dist = Math.hypot(anchor.x - globalPoint.x, anchor.y - globalPoint.y);
        if (dist <= tolerance && dist < bestDist) {
          bestDist = dist;
          best = { pathIndex, segmentIndex, handle: null };
        }
      });
    });
    return best;
  }

  /** Select Point: pick whatever is under the cursor (key-click). */
  selectAt(globalPoint: Vec2, tolerance: number): boolean {
    const picked = this.pick(globalPoint, tolerance);
    if (!picked) return false;
    this.selection = picked;
    this.refreshOverlay();
    this.host.notify();
    return true;
  }

  selectNext(dir: 1 | -1): boolean {
    if (!this.item) return false;
    const snapshots = snapshotItem(this.item);
    const flat: Array<{ pathIndex: number; segmentIndex: number }> = [];
    snapshots.forEach((snapshot, pathIndex) => {
      snapshot.segments.forEach((_seg, segmentIndex) => flat.push({ pathIndex, segmentIndex }));
    });
    if (flat.length === 0) return false;
    let at = this.selection
      ? flat.findIndex((f) => f.pathIndex === this.selection!.pathIndex && f.segmentIndex === this.selection!.segmentIndex)
      : -1;
    at = (at + dir + flat.length) % flat.length;
    this.selection = { ...flat[at], handle: null };
    this.refreshOverlay();
    this.host.notify();
    return true;
  }

  // --- Dragging ---------------------------------------------------------

  /** Begin a drag on an anchor or handle. Returns false when the
   * press misses both (the caller falls back to normal selection). */
  pointerDown(globalPoint: Vec2, tolerance: number, alt: boolean): boolean {
    const picked = this.pick(globalPoint, tolerance);
    if (!picked) return false;
    this.selection = picked;
    const snapshots = snapshotItem(this.item);
    const snapshot = snapshots[picked.pathIndex];
    const coupled = !alt && picked.handle !== null
      ? isSmoothPoint(snapshot.segments, picked.segmentIndex, snapshot.closed)
      : false;
    this.drag = {
      kind: picked.handle ? 'handle' : (alt ? 'edge' : 'anchor'),
      startGlobal: { ...globalPoint },
      pathIndex: picked.pathIndex,
      segmentIndex: picked.segmentIndex,
      handle: picked.handle ?? 'out',
      coupled,
      before: snapshots,
      moved: false,
    };
    this.refreshOverlay();
    return true;
  }

  pointerDrag(globalPoint: Vec2): boolean {
    if (!this.drag || !this.item) return false;
    const drag = this.drag;
    const local = this.toLocal(drag.pathIndex, globalPoint);
    const current = drag.kind === 'edge'
      ? structuredClone(drag.before) as ContourSnapshot[]
      : snapshotItem(this.item);
    const contour = current[drag.pathIndex];
    let next: BezierSegment[];
    if (drag.kind === 'edge') {
      const startLocal = this.toLocal(drag.pathIndex, drag.startGlobal);
      next = moveEdge(contour.segments, drag.segmentIndex, {
        x: local.x - startLocal.x, y: local.y - startLocal.y,
      }, contour.closed);
    } else if (drag.kind === 'anchor') {
      next = moveAnchor(contour.segments, drag.segmentIndex, local, contour.closed);
    } else {
      next = moveHandle(contour.segments, drag.segmentIndex, drag.handle, local, {
        coupled: drag.coupled, closed: contour.closed,
      });
    }
    current[drag.pathIndex] = { closed: contour.closed, segments: next };
    applySnapshots(this.scope, this.item, current);
    drag.moved = true;
    this.refreshOverlay();
    return true;
  }

  pointerUp(): boolean {
    if (!this.drag) return false;
    const drag = this.drag;
    this.drag = null;
    if (drag.moved && this.item) {
      const after = snapshotItem(this.item);
      this.host.commit(drag.kind === 'anchor' ? 'Move Point' : drag.kind === 'edge' ? 'Move Edge' : 'Move Handle', this.item, drag.before, after);
    }
    this.refreshOverlay();
    this.host.notify();
    return true;
  }

  get dragging(): boolean { return this.drag !== null; }

  // --- Operations (each one commit) -------------------------------------

  private applyAndCommit(label: string, mutate: (snapshots: ContourSnapshot[]) => ContourSnapshot[]): boolean {
    if (!this.item) return false;
    const before = snapshotItem(this.item);
    const after = mutate(structuredClone(before) as ContourSnapshot[]);
    if (JSON.stringify(after) === JSON.stringify(before)) return false;
    applySnapshots(this.scope, this.item, after);
    this.host.commit(label, this.item, before, after);
    this.refreshOverlay();
    this.host.notify();
    return true;
  }

  /** Nudge the selected anchor by a delta in global units. */
  nudgeSelected(delta: Vec2): boolean {
    if (!this.selection) return false;
    const { pathIndex, segmentIndex } = this.selection;
    return this.applyAndCommit('Nudge Point', (snapshots) => {
      const contour = snapshots[pathIndex];
      const local = this.toLocal(pathIndex, {
        x: this.toGlobal(pathIndex, contour.segments[segmentIndex].point).x + delta.x,
        y: this.toGlobal(pathIndex, contour.segments[segmentIndex].point).y + delta.y,
      });
      contour.segments = moveAnchor(contour.segments, segmentIndex, local, contour.closed);
      return snapshots;
    });
  }

  /** Move Edge: drag-equivalent op moving the selected segment's edge. */
  moveSelectedEdge(delta: Vec2): boolean {
    if (!this.selection) return false;
    const { pathIndex, segmentIndex } = this.selection;
    return this.applyAndCommit('Move Edge', (snapshots) => {
      const contour = snapshots[pathIndex];
      // Delta is global; edges move in local space — convert by
      // mapping the zero point through the same transform.
      const origin = this.toLocal(pathIndex, { x: 0, y: 0 });
      const moved = this.toLocal(pathIndex, delta);
      const localDelta = { x: moved.x - origin.x, y: moved.y - origin.y };
      contour.segments = moveEdge(contour.segments, segmentIndex, localDelta, contour.closed);
      return snapshots;
    });
  }

  /** Split Point: insert a point on the segment nearest a global
   * point (or on the selected segment at its midpoint). */
  insertPointAt(globalPoint: Vec2 | null): boolean {
    if (!this.item) return false;
    const snapshots = snapshotItem(this.item);
    let target: { pathIndex: number; segmentIndex: number; t: number } | null = null;
    if (globalPoint) {
      let bestDist = Infinity;
      snapshots.forEach((snapshot, pathIndex) => {
        const count = snapshot.closed ? snapshot.segments.length : snapshot.segments.length - 1;
        for (let i = 0; i < count; i += 1) {
          const j = (i + 1) % snapshot.segments.length;
          const a = snapshot.segments[i];
          const b = snapshot.segments[j];
          // Sample the cubic in local space, compare in global space.
          for (let step = 0; step <= 16; step += 1) {
            const t = step / 16;
            const u = 1 - t;
            const p = {
              x: u ** 3 * a.point.x + 3 * u * u * t * (a.point.x + a.handleOut.x)
                + 3 * u * t * t * (b.point.x + b.handleIn.x) + t ** 3 * b.point.x,
              y: u ** 3 * a.point.y + 3 * u * u * t * (a.point.y + a.handleOut.y)
                + 3 * u * t * t * (b.point.y + b.handleIn.y) + t ** 3 * b.point.y,
            };
            const global = this.toGlobal(pathIndex, p);
            const dist = Math.hypot(global.x - globalPoint.x, global.y - globalPoint.y);
            if (dist < bestDist) { bestDist = dist; target = { pathIndex, segmentIndex: i, t }; }
          }
        }
      });
    } else if (this.selection) {
      target = { pathIndex: this.selection.pathIndex, segmentIndex: this.selection.segmentIndex, t: 0.5 };
    }
    if (!target) return false;
    const chosen = target;
    return this.applyAndCommit('Split Point', (all) => {
      const contour = all[chosen.pathIndex];
      contour.segments = insertPointOnSegment(contour.segments, chosen.segmentIndex, chosen.t, contour.closed);
      return all;
    });
  }

  deleteSelectedPoint(): boolean {
    if (!this.selection) return false;
    const { pathIndex, segmentIndex } = this.selection;
    const ok = this.applyAndCommit('Delete Point', (snapshots) => {
      const contour = snapshots[pathIndex];
      contour.segments = deletePoint(contour.segments, segmentIndex, contour.closed);
      return snapshots;
    });
    if (ok) this.selection = null;
    return ok;
  }

  convertSelected(to: 'corner' | 'smooth'): boolean {
    if (!this.selection) return false;
    const { pathIndex, segmentIndex } = this.selection;
    return this.applyAndCommit(to === 'corner' ? 'Corner Point' : 'Smooth Point', (snapshots) => {
      const contour = snapshots[pathIndex];
      contour.segments = convertPoint(contour.segments, segmentIndex, to, contour.closed);
      return snapshots;
    });
  }

  closeSelectedContour(): boolean {
    const pathIndex = this.selection?.pathIndex ?? 0;
    return this.applyAndCommit('Close Path', (snapshots) => {
      if (snapshots[pathIndex]) snapshots[pathIndex].closed = true;
      return snapshots;
    });
  }

  /** Snapshot of one contour for engine-level joins. */
  contourSnapshot(pathIndex = 0): ContourSnapshot | null {
    return snapshotItem(this.item)[pathIndex] ?? null;
  }

  /** Replace one contour (engine-level join writes the merged one). */
  replaceContour(pathIndex: number, contour: ContourSnapshot, label: string): boolean {
    return this.applyAndCommit(label, (snapshots) => {
      snapshots[pathIndex] = { closed: contour.closed, segments: cloneSegments(contour.segments) };
      return snapshots;
    });
  }
}
