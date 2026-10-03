// Owns polyline, spline, and composite-path sessions. Composite semantics,
// sampling, and Paper construction stay in PathDrawingSession, the path
// resolver, and PathRenderer. Callers place returned geometry through the host.
import type { NGCompositePath } from '../model/NGPath';
import type { Vec2 } from '../model/geometryResolution';
import type { DrawingHost } from './DrawingHost';
import { PathDrawingSession, type CompositePointKind } from './PathDrawingSession';
import { PathRenderer, type FrameScheduler } from './PathRenderer';

type Item = any;
export interface CompositeDeposit { source: NGCompositePath; item: paper.Path }

export class PathTool {
  private composite: PathDrawingSession | null = null;
  private renderer: PathRenderer | null = null;
  private host: DrawingHost | null = null;
  private readonly scope: paper.PaperScope;
  private readonly updated: (item: paper.Path) => void;
  private readonly scheduler?: FrameScheduler;
  private radius = 12;

  constructor(scope: paper.PaperScope, updated: (item: paper.Path) => void, scheduler?: FrameScheduler) {
    this.scope = scope; this.updated = updated; this.scheduler = scheduler;
  }

  bind(host: DrawingHost): void { this.host = host; }

  get active(): boolean { return this.composite !== null; }
  get preview(): paper.Path | null { return this.renderer?.preview ?? null; }
  get snapBase(): Vec2 | null { return this.composite?.snapBase ?? null; }
  get origin(): Vec2 | null { return this.composite?.origin ?? null; }
  get cornerRadius(): number { return this.radius; }

  setCornerRadius(radius: number): void {
    if (!Number.isFinite(radius) || radius < 0) return;
    this.radius = radius; this.composite?.setCornerRadius(radius); this.request();
  }

  point(kind: CompositePointKind, point: Vec2): void {
    if (!this.composite) {
      this.composite = new PathDrawingSession(crypto.randomUUID(), point, kind, this.radius);
      this.renderer = new PathRenderer(this.scope, this.updated, this.scheduler);
    } else this.composite.commit(kind, point);
    this.request();
  }

  move(point: Vec2): void { this.composite?.move(point); this.request(); }
  scale(factor: number): void { this.composite?.scale(factor); this.request(); }
  rotate(degrees: number): void { this.composite?.rotate(degrees); this.request(); }

  stamp(closed: boolean): CompositeDeposit | null {
    if (!this.composite || !this.renderer) return null;
    const source = this.composite.snapshot(closed);
    if (source.points.length < (closed ? 3 : 2)) return null;
    return { source, item: this.renderer.final(source) };
  }

  finish(closed: boolean): CompositeDeposit | null {
    const deposit = this.stamp(closed);
    this.cancel();
    return deposit;
  }

  flush(): void { this.renderer?.flush(); }

  cancel(): void {
    const preview = this.renderer?.preview ?? null;
    this.renderer?.dispose();
    this.renderer = null;
    this.composite = null;
    const live = this.host?.session;
    if (!live || !live.isDrawingPath) return;
    if (live.path && live.path !== preview) {
      try { if (live.path.parent != null) live.path.remove(); } catch { /* already gone */ }
    }
    live.path = null;
    live.isDrawingPath = false;
    this.host?.clearSplineText();
  }

  /** Pointer move. Composite updates semantic coordinates; legacy replaces the rubber-band segment. */
  track(point: Item): boolean {
    if (this.active) { this.move({ x: point.x, y: point.y }); return true; }
    const live = this.host?.session;
    const path = live?.path;
    if (!live?.isDrawingPath || !path) return false;
    if (path.segments.length === 1) path.add(point);
    if (path.segments.length > 1) {
      path.removeSegment(path.segments.length - 1);
      path.add(point);
    }
    this.host?.refreshSplineText();
    return true;
  }

  scaleLive(factor: number): boolean {
    if (this.active) { this.scale(factor); return true; }
    const path = this.host?.session.path;
    if (this.host?.session.isDrawingPath && path?.segments?.length) {
      path.scale(factor, path.segments[0].point);
      this.host.refreshSplineText();
      return true;
    }
    return false;
  }

  rotateLive(degrees: number): boolean {
    if (this.active) { this.rotate(degrees); return true; }
    const path = this.host?.session.path;
    if (this.host?.session.isDrawingPath && path?.segments?.length) {
      path.rotate(degrees, path.segments[0].point);
      this.host.refreshSplineText();
      return true;
    }
    return false;
  }

  sharpKey(): void { this.key('hardCorner', false); }
  roundedKey(): void { this.key('roundedCorner', true); }
  splineKey(): void { this.key('bSpline', false); }

  /** Stamp the composite session and record it. Returns false when this is not the active composite tool. */
  stampComposite(closed: boolean): boolean {
    if (!this.active || !this.host) return false;
    const deposit = this.stamp(closed);
    if (deposit) this.commitComposite(deposit, 'Stamp');
    return true;
  }

  /** Clone the legacy stroke without ending the session. */
  stampLegacy(): void {
    const host = this.host;
    const path = host?.session.path;
    if (!host || !host.session.isDrawingPath || !path || this.active) return;
    const stampedBase = path.clone();
    host.applyCurrentStyles(stampedBase);
    if (host.fillEnabled()) stampedBase.closed = true;
    const stamped = host.withShapeText(stampedBase, false);
    stamped.selected = false;
    const placed = host.place(stamped, { front: true, opacity: 1 });
    if (placed) placed.selected = false;
  }

  finishIntoScene(close: boolean): void {
    const host = this.host;
    if (!host || !this.active) return;
    const origin = this.origin;
    const mouse = host.session.mousePt;
    const nearStart = origin && mouse && Math.hypot(mouse.x - origin.x, mouse.y - origin.y) <= host.endpointTolerance();
    const closed = close || host.fillEnabled() || (host.depositPointMode() === 1 && !!nearStart);
    if (closed && nearStart) this.move(origin!);
    const deposit = this.finish(closed);
    host.session.path = null;
    host.session.isDrawingPath = false;
    host.session.resetLiveAdjust();
    host.clearSplineText();
    if (deposit) this.commitComposite(deposit, 'Deposit composite path');
    host.updateTextContent();
    host.notify();
  }

  /** End the legacy stroke. Returns the item passed to history, matching the pre-combine path. */
  finishLegacy(): Item[] {
    const host = this.host;
    const path = host?.session.path;
    if (!host || !host.session.isDrawingPath || !path || this.active) return [];
    const segs = path.segments;
    const first = segs.length > 0 ? segs[0].point : null;
    const mouse = host.session.mousePt;
    const autoJoin = host.depositPointMode() === 1;
    if (autoJoin && first && segs.length >= 3 && mouse && mouse.getDistance(first) <= host.endpointTolerance()) {
      path.removeSegment(segs.length - 1);
      path.add(first.clone());
      host.applyCurrentStyles(path);
      path.closed = true;
    } else if (autoJoin && mouse) {
      const hit = host.findOpenEndpointNear(mouse);
      if (hit) this.joinDrawingInto(hit.path, hit.atStart);
      else {
        const startHit = first && segs.length >= 2 ? host.findOpenEndpointNear(first) : null;
        if (startHit) this.joinDrawingStartInto(startHit.path, startHit.atStart);
        else {
          host.applyCurrentStyles(path);
          if (host.fillEnabled()) path.closed = true;
        }
      }
    } else {
      host.applyCurrentStyles(path);
      if (host.fillEnabled()) path.closed = true;
    }
    const finished = host.withShapeText(host.session.path, false);
    finished.selected = false;
    const placed = host.place(finished);
    if (placed) placed.selected = false;
    host.session.releasePath();
    host.session.resetLiveAdjust();
    return [finished];
  }

  completeWithSpline(): void {
    if (this.active) { this.finishIntoScene(true); return; }
    const host = this.host;
    if (!host) return;
    const session = host.session;
    if (!session.isDrawingPath || !session.path || !session.mousePt) return;
    const snap = host.capture();
    const completed = this.closeLegacy();
    host.commit('Deposit shape', snap, [completed]);
    host.updateTextContent();
    host.notify();
  }

  private key(kind: CompositePointKind, compositeOnly: boolean): void {
    const host = this.host;
    if (!host) return;
    if (host.pathDrawingMode() === 'ngComposite') {
      this.compositePoint(kind);
      return;
    }
    if (compositeOnly) return;
    const session = host.session;
    if (!session.mousePt) return;
    if (kind === 'bSpline') this.addSplinePoint();
    else this.addSharpPoint();
    if (!session.isDrawingPath) {
      session.isDrawingPath = true;
      session.resetLiveAdjust();
    }
    host.updateTextContent();
    host.notify();
  }

  private compositePoint(kind: CompositePointKind): void {
    const host = this.host;
    if (!host) return;
    const session = host.session;
    if (!session.mousePt || session.isDrawingShape || session.isDrawingQuad) return;
    this.point(kind, session.mousePt);
    session.path = this.preview;
    session.isDrawingPath = true;
    host.updateTextContent();
    host.notify();
  }

  private addSharpPoint(): void {
    const host = this.host!;
    const scope = host.scope();
    const session = host.session;
    if (!session.path) {
      session.path = new scope.Path({
        segments: [session.mousePt],
        strokeColor: host.globalStrokeColor(),
        strokeWidth: host.globalStrokeWidth(),
        fullySelected: true,
      });
      host.applyStrokeGeometry(session.path);
      host.applyStrokeDash(session.path);
    } else {
      const added = session.path.add(session.mousePt);
      if (added) {
        added.handleIn = new scope.Point(0, 0);
        added.handleOut = new scope.Point(0, 0);
      }
    }
  }

  private addSplinePoint(): void {
    const host = this.host!;
    const scope = host.scope();
    const session = host.session;
    if (!session.path) {
      session.path = new scope.Path({
        segments: [session.mousePt],
        strokeColor: host.globalStrokeColor(),
        strokeWidth: host.globalStrokeWidth(),
        fullySelected: true,
      });
      host.applyStrokeGeometry(session.path);
      host.applyStrokeDash(session.path);
    } else this.smoothLastSplineJoint(session.path.add(session.mousePt));
  }

  private closeLegacy(): Item {
    const host = this.host!;
    const scope = host.scope();
    const path = host.session.path;
    if (path.segments.length > 1) path.removeSegment(path.segments.length - 1);
    let endPt = host.session.mousePt;
    const first = path.segments.length > 0 ? path.segments[0].point : null;
    if (first && endPt.getDistance(first) <= host.endpointTolerance()) endPt = first.clone();
    const added = path.add(endPt);
    const joint = path.segments.length >= 2 ? path.segments[path.segments.length - 2] : null;
    if (this.jointIsSpline(joint)) this.smoothLastSplineJoint(added);
    else if (added) {
      added.handleIn = new scope.Point(0, 0);
      added.handleOut = new scope.Point(0, 0);
    }
    host.applyCurrentStyles(path);
    path.closed = true;
    const completed = host.withShapeText(path, false);
    completed.selected = false;
    const placed = host.place(completed);
    if (placed) placed.selected = false;
    host.session.releasePath();
    host.session.resetLiveAdjust();
    return completed;
  }

  private smoothLastSplineJoint(added: Item): void {
    const path = this.host?.session.path;
    if (!added || !path || path.segments.length < 3) return;
    const curr = path.segments[path.segments.length - 2];
    const p0 = path.segments[path.segments.length - 3].point;
    const d01 = curr.point.subtract(p0);
    const d12 = added.point.subtract(curr.point);
    const tension = this.host!.splineTension();
    added.handleIn = d12.multiply(tension * 0.5);
    curr.handleOut = d01.multiply(tension * 0.5);
    if (curr.handleIn) curr.handleIn = curr.handleOut.multiply(-1);
  }

  private jointIsSpline(seg: Item): boolean {
    if (!seg) return false;
    const hi = seg.handleIn;
    const ho = seg.handleOut;
    return (!!hi && (hi.x !== 0 || hi.y !== 0)) || (!!ho && (ho.x !== 0 || ho.y !== 0));
  }

  private joinDrawingStartInto(target: Item, atStart: boolean): void {
    const host = this.host!;
    const drawing = host.session.path;
    const ours = drawing.segments;
    const joint = atStart ? target.segments[0].point : target.segments[target.segments.length - 1].point;
    ours[0].point = joint.clone();
    if (atStart) {
      for (let i = 1; i < ours.length; i++) {
        const seg = ours[i];
        const inserted = target.insertSegment(0, seg.point.clone());
        if (inserted) {
          if (seg.handleOut) inserted.handleIn = seg.handleOut.clone();
          if (seg.handleIn) inserted.handleOut = seg.handleIn.clone();
        }
      }
    } else {
      for (let i = 1; i < ours.length; i++) this.cloneSegmentInto(target, ours[i]);
    }
    host.session.path = target;
    drawing.remove();
  }

  private joinDrawingInto(target: Item, atStart: boolean): void {
    const host = this.host!;
    const ours = host.session.path.segments;
    const joint = atStart ? target.segments[0].point : target.segments[target.segments.length - 1].point;
    ours[ours.length - 1].point = joint.clone();
    if (atStart) {
      for (let i = 1; i < target.segments.length; i++) this.cloneSegmentInto(host.session.path, target.segments[i]);
      host.removeFromSelection(target);
      target.remove();
      host.applyCurrentStyles(host.session.path);
      if (host.fillEnabled()) host.session.path.closed = true;
    } else {
      const drawing = host.session.path;
      for (let i = 0; i < ours.length - 1; i++) this.cloneSegmentInto(target, ours[i]);
      host.session.path = target;
      drawing.remove();
    }
  }

  private cloneSegmentInto(path: Item, seg: Item): void {
    const added = path.add(seg.point.clone());
    if (!added) return;
    if (seg.handleIn) added.handleIn = seg.handleIn.clone();
    if (seg.handleOut) added.handleOut = seg.handleOut.clone();
  }

  private commitComposite(deposit: CompositeDeposit, label: string): void {
    const host = this.host;
    if (!host) return;
    const snap = host.capture();
    const geometry = label === 'Stamp' ? deposit.item : this.joinCompositeDeposit(deposit.item);
    host.applyCurrentStyles(geometry);
    const finished = host.withShapeText(geometry, false);
    const placed = host.place(finished);
    if (placed) {
      const shape = host.shapePartOf(placed);
      if (shape instanceof this.scope.Path || shape instanceof this.scope.CompoundPath) {
        const source = placed === finished && geometry === deposit.item ? deposit.source : host.bezierSource(shape);
        host.retainResult(placed, source);
      }
    }
    this.retainNewResults(snap.before);
    host.pruneRecords();
    host.commit(label, snap, placed ? [placed] : [], true);
    host.updateTextContent();
    host.notify();
  }

  private retainNewResults(before: Item[]): void {
    const host = this.host!;
    const previous = new Set(before);
    for (const item of host.capture().before) {
      if (previous.has(item)) continue;
      if (!host.isRetained(host.shapePartOf(item))) host.retainResult(item);
    }
  }

  private joinCompositeDeposit(item: paper.Path): paper.Path {
    const host = this.host!;
    if (item.closed || host.depositPointMode() !== 1 || !item.segments.length) return item;
    const end = item.segments[item.segments.length - 1].point;
    const endHit = this.findCompositeEndpoint(end);
    const hit = endHit ?? this.findCompositeEndpoint(item.segments[0].point);
    if (!hit) return item;
    const target = hit.path;
    const matrix = target.globalMatrix;
    const targetSegments = target.segments.map((s: paper.Segment) => {
      const transformHandle = (p: paper.Point) => new this.scope.Point(matrix.a * p.x + matrix.c * p.y, matrix.b * p.x + matrix.d * p.y);
      return new this.scope.Segment(target.localToGlobal(s.point), transformHandle(s.handleIn), transformHandle(s.handleOut));
    });
    const drawing = item.segments.map((s: paper.Segment) => s.clone());
    const reverse = (segments: paper.Segment[]) => segments.reverse().map((s) => new this.scope.Segment(s.point, s.handleOut, s.handleIn));
    const merge = (left: paper.Segment[], right: paper.Segment[]) => {
      left[left.length - 1].handleOut = right[0].handleOut.clone();
      return [...left, ...right.slice(1)];
    };
    const joint = targetSegments[hit.atStart ? 0 : targetSegments.length - 1].point;
    let segments: paper.Segment[];
    if (endHit) {
      drawing[drawing.length - 1].point = joint.clone();
      segments = hit.atStart ? merge(drawing, targetSegments) : merge(targetSegments, reverse(drawing));
    } else {
      drawing[0].point = joint.clone();
      segments = hit.atStart ? merge(reverse(drawing), targetSegments) : merge(targetSegments, drawing);
    }
    const joined = new this.scope.Path({ insert: false, applyMatrix: false, segments });
    item.remove();
    host.dropItem(target);
    return joined;
  }

  private findCompositeEndpoint(point: paper.Point): { path: paper.Path; atStart: boolean } | null {
    const host = this.host!;
    let best: { path: paper.Path; atStart: boolean } | null = null;
    let distance = host.endpointTolerance();
    for (const item of host.layerChildren()) {
      if (!(item instanceof this.scope.Path) || item.closed || !item.segments.length || host.isNonContentItem(item)) continue;
      for (const atStart of [false, true]) {
        const segment = item.segments[atStart ? 0 : item.segments.length - 1];
        const d = item.localToGlobal(segment.point).getDistance(point);
        if (d <= distance) { distance = d; best = { path: item, atStart }; }
      }
    }
    return best;
  }

  private request(): void {
    if (this.composite && this.renderer) this.renderer.request(() => this.composite!.snapshot());
  }
}
