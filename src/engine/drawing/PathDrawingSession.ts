// Owns one semantic path and its trailing rubber-band point. No Paper items,
// browser events, or history. Callers snap BEFORE move/commit; snapshot() is
// an independent copy so renderers and finished records cannot mutate a run.
import type { NGBowedParams, NGCompositePath, NGPathPoint } from '../model/NGPath';
import type { Vec2 } from '../model/geometryResolution';
import { distance } from '../geometry/splineInterpolation';

export type CompositePointKind = 'bSpline' | 'hardCorner' | 'roundedCorner' | 'line'
  | 'g4' | 'g2' | 'clothoidCorner' | 'prevConstraint' | 'nextConstraint'
  | 'arcByThreeStart' | 'arcByThreeEnd';
export class PathDrawingSession {
  private readonly path: NGCompositePath;
  private sequence = 0;
  private radius: number;
  private roundingMode: 'arc' | 'bSpline' | 'bevel' = 'arc';

  constructor(id: string, point: Vec2, kind: CompositePointKind, radius = 12, bow?: NGBowedParams) {
    this.radius = radius;
    this.path = { id, mode: 'ngComposite', closed: false, points: [] };
    this.assertPoint(point);
    this.path.points.push(this.point(point, kind), this.point(point, 'bSpline'));
    if (bow && (kind === 'hardCorner' || kind === 'roundedCorner')) {
      this.path.points[0].outgoing = { kind: 'bowedLine', bow: { ...bow } };
    }
  }
  get trailingPointId(): string { return this.path.points[this.path.points.length - 1].id; }
  /** True when any committed point carries Spiro/clothoid vocabulary. */
  get isClothoid(): boolean {
    return this.path.points.some((p) => p.kind === 'g4' || p.kind === 'g2'
      || p.kind === 'clothoidCorner' || p.kind === 'prevConstraint' || p.kind === 'nextConstraint');
  }
  get snapBase(): Vec2 { const p = this.path.points[this.path.points.length - 2]; return { x: p.x, y: p.y }; }
  get origin(): Vec2 { const p = this.path.points[0]; return { x: p.x, y: p.y }; }
  move(point: Vec2): void {
    this.assertPoint(point);
    Object.assign(this.path.points[this.path.points.length - 1], { x: point.x, y: point.y });
  }
  commit(kind: CompositePointKind, point: Vec2): void {
    // FM guard: a new deposit closes an unfinished arc slot first.
    this.dropArcStart();
    this.move(point);
    // Key-click convention: retype the previous committed point, commit the
    // rubber-band point, then append a new trailing spline point.
    // A paired arc end is immutable: retyping it would orphan its start and
    // invalidate the document, so the new kind lands on the rubber point.
    const previous = this.path.points[this.path.points.length - 2];
    const before = this.path.points[this.path.points.length - 3];
    if (previous.kind === 'arcByThreeEnd' && before?.kind === 'arcByThreeStart') {
      const trail = this.path.points[this.path.points.length - 1];
      this.setKind(trail, kind);
    } else {
      this.setKind(previous, kind);
    }
    this.path.points.push(this.point(point, 'bSpline'));
  }
  /** Bowed deposit: move the trailing point to the cursor, retype it to a
   * corner carrying the bow, then append a fresh neutral trailing point.
   * Unlike commit (which retypes the previous point), history is never
   * rewritten. Each deposit stamps its own copy of the params, so later
   * settings never rewrite earlier points. */
  commitBowed(corner: 'hardCorner' | 'roundedCorner', bow: NGBowedParams, point: Vec2): void {
    // FM guard: a new deposit closes an unfinished arc slot first.
    this.dropArcStart();
    this.assertPoint(point);
    const trail = this.path.points[this.path.points.length - 1];
    trail.x = point.x; trail.y = point.y;
    this.setKind(trail, corner);
    trail.outgoing = { kind: 'bowedLine', bow: { ...bow } };
    this.path.points.push(this.point({ x: trail.x, y: trail.y }, 'bSpline'));
  }
  /** Last committed point (the rubber band excluded), or null when empty. */
  get lastCommitted(): NGPathPoint | null {
    return this.path.points.length >= 2 ? this.path.points[this.path.points.length - 2] : null;
  }
  /** Start an arc: freeze the trailing point as its hard-corner separator,
   * then append the start and a fresh trailing point. */
  startArc(point: Vec2): void {
    this.assertPoint(point);
    this.dropArcStart();
    const trail = this.path.points[this.path.points.length - 1];
    this.move(point);
    this.setKind(trail, 'hardCorner');
    const start = this.point({ x: trail.x, y: trail.y }, 'arcByThreeStart');
    this.path.points.push(start, this.point({ x: trail.x, y: trail.y }, 'bSpline'));
  }
  /** Complete a staged arc: the rubber band becomes the end point. */
  finishArc(point: Vec2): void {
    this.assertPoint(point);
    this.move(point);
    const trail = this.path.points[this.path.points.length - 1];
    this.setKind(trail, 'arcByThreeEnd');
    this.path.points.push(this.point({ x: trail.x, y: trail.y }, 'bSpline'));
  }
  /** Arc key: complete a staged start, or start a new arc. */
  toggleArc(point: Vec2): void {
    this.assertPoint(point);
    if (this.lastCommitted?.kind === 'arcByThreeStart') this.finishArc(point);
    else this.startArc(point);
  }
  /** Drop a trailing unfinished arc start (keep its separator). Returns
   * true when a staged start was removed. Persisted paths stay strict. */
  dropArcStart(): boolean {
    if (this.path.points.length >= 2 && this.path.points[this.path.points.length - 2].kind === 'arcByThreeStart') {
      this.path.points.splice(this.path.points.length - 2, 1);
      return true;
    }
    return false;
  }
  /** Remove the last deposited point, keeping the trailing point live.
   * Key-click deposits land in two ways: commit retypes the previous point
   * (its kind lags one press behind the cursor) while bowed and arc deposits
   * land on the cursor itself. Either way the newest deposit is the last
   * non-rubber point walking back from the live end, skipping only neutral
   * points still coincident with the cursor (the live rubber dup). The
   * initial point is never removed: erasing down to it is a no-op.
   * Erasing an arc end dissolves the pair into a plain corner so the
   * document stays valid. */
  eraseLast(): boolean {
    const points = this.path.points;
    if (points.length <= 2) return false;
    const live = points[points.length - 1];
    let i = points.length - 2;
    while (i > 0 && points[i].kind === 'bSpline' && distance(points[i], live) <= 1e-9) i--;
    if (i <= 0) return false;
    const [removed] = points.splice(i, 1);
    if (removed.kind === 'arcByThreeEnd') {
      const prev = points[i - 1];
      if (prev?.kind === 'arcByThreeStart') this.setKind(prev, 'hardCorner');
    }
    return true;
  }
  /** Cycle the session rounding for subsequently deposited rounded points:
   * arc -> bSpline -> bevel -> arc. Never rewrites deposited points. */
  cycleRoundingMode(): 'arc' | 'bSpline' | 'bevel' {
    this.roundingMode = this.roundingMode === 'arc' ? 'bSpline' : this.roundingMode === 'bSpline' ? 'bevel' : 'arc';
    return this.roundingMode;
  }
  get rounding(): 'arc' | 'bSpline' | 'bevel' { return this.roundingMode; }
  setCornerRadius(radius: number): void {
    if (!Number.isFinite(radius) || radius < 0) throw new Error('Corner radius must be nonnegative');
    this.radius = radius;
    for (const point of this.path.points) if (point.kind === 'roundedCorner' && point.corner) point.corner.radius = radius;
  }
  scale(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) throw new Error('Invalid live scale');
    const origin = this.origin;
    for (const point of this.path.points) {
      point.x = origin.x + (point.x - origin.x) * factor;
      point.y = origin.y + (point.y - origin.y) * factor;
      if (point.corner) point.corner.radius *= factor;
      // Absolute bows scale with the path; percent bows stay relative.
      const bow = point.outgoing?.kind === 'bowedLine' ? point.outgoing.bow : undefined;
      if (bow && !bow.amplitudeIsPercent) bow.amplitude *= factor;
    }
  }
  rotate(degrees: number): void {
    if (!Number.isFinite(degrees)) throw new Error('Invalid live rotation');
    const origin = this.origin; const a = degrees * Math.PI / 180;
    for (const point of this.path.points) {
      const x = point.x - origin.x; const y = point.y - origin.y;
      point.x = origin.x + x * Math.cos(a) - y * Math.sin(a);
      point.y = origin.y + x * Math.sin(a) + y * Math.cos(a);
    }
  }
  snapshot(closed = false): NGCompositePath {
    const copy = structuredClone(this.path);
    let last = copy.points[copy.points.length - 1];
    let previous = copy.points[copy.points.length - 2];
    // An unfinished arc previews as a hard corner ending at the start (FM):
    // drop the rubber band so the staged start trails, exactly what live
    // validation permits. Stamp/finish drop the start itself beforehand.
    if (previous?.kind === 'arcByThreeStart' && last.kind !== 'arcByThreeEnd') {
      copy.points.pop();
      if (copy.points.length < 2) { copy.closed = closed; return copy; }
      last = copy.points[copy.points.length - 1];
      previous = copy.points[copy.points.length - 2];
    }
    // A final rubber-band endpoint inherits the convention of its incoming
    // committed point, so closing an all-sharp path stays all straight.
    last.kind = previous.kind;
    last.outgoing = structuredClone(previous.outgoing);
    if (previous.corner) last.corner = structuredClone(previous.corner);
    while (copy.points.length > 1 && distance(last, previous) <= 1e-9) {
      copy.points.pop();
      last = copy.points[copy.points.length - 1];
      previous = copy.points[copy.points.length - 2];
    }
    if (closed && copy.points.length > 1 && distance(copy.points[0], copy.points[copy.points.length - 1]) <= 1e-9) copy.points.pop();
    copy.closed = closed;
    return copy;
  }
  private point(position: Vec2, kind: CompositePointKind): NGPathPoint {
    const point: NGPathPoint = { id: `${this.path.id}:p${++this.sequence}`, x: position.x, y: position.y, kind };
    this.setKind(point, kind);
    return point;
  }
  private setKind(point: NGPathPoint, kind: CompositePointKind): void {
    // A retype to a corner keeps a stamped bow: the bow belongs to the
    // corner, and only a cross-family retype clears it. This is what lets
    // a bowed point survive the next key-click while staying provisional.
    const bow = (kind === 'hardCorner' || kind === 'roundedCorner')
      && point.outgoing?.kind === 'bowedLine' ? point.outgoing.bow : undefined;
    point.kind = kind;
    if (kind === 'arcByThreeStart') point.outgoing = { kind: 'arc' };
    else if (kind === 'arcByThreeEnd') point.outgoing = { kind: 'bSpline' };
    else if (bow) point.outgoing = { kind: 'bowedLine', bow };
    else point.outgoing = { kind: kind === 'hardCorner' || kind === 'clothoidCorner' || kind === 'line' ? 'line' : 'bSpline' };
    const keepCorner = kind === 'roundedCorner' && point.kind === 'roundedCorner' ? point.corner : undefined;
    delete point.corner;
    // A retype never rewrites an existing corner's rounding: only fresh
    // deposits take the current session mode (Phase 4.4).
    if (kind === 'roundedCorner') point.corner = keepCorner ?? { rounding: this.roundingMode, radius: this.radius };
  }
  private assertPoint(point: Vec2): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Invalid drawing coordinate');
  }
}
