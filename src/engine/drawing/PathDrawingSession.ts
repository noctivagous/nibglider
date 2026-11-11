// Owns one semantic path and its trailing rubber-band point. No Paper items,
// browser events, or history. Callers snap BEFORE move/commit; snapshot() is
// an independent copy so renderers and finished records cannot mutate a run.
import { BOWED_DEFAULTS, type NGBowedParams, type NGCompositePath, type NGCornerParams, type NGPathPoint } from '../model/NGPath';
import type { Vec2 } from '../model/geometryResolution';
import { distance } from '../geometry/splineInterpolation';

export type CompositePointKind = 'bSpline' | 'hardCorner' | 'roundedCorner' | 'bowedLine';
export class PathDrawingSession {
  private readonly path: NGCompositePath;
  private sequence = 0;
  private radius: number;
  /** True between an arc through-point commit and its end commit. */
  private arcOpen = false;
  /** Bow parameter snapshot stamped onto bowed points at deposit
   * (Phase 4.1): later settings changes never rewrite points already
   * committed in this session. */
  private bowParams: Omit<NGBowedParams, 'facing'> = {
    amplitude: BOWED_DEFAULTS.amplitude,
    amplitudeIsPercent: BOWED_DEFAULTS.amplitudeIsPercent,
    peakLocation: BOWED_DEFAULTS.peakLocation,
    peakLocationMultiplier: BOWED_DEFAULTS.peakLocationMultiplier,
    isArc: BOWED_DEFAULTS.isArc,
    dualDistance: BOWED_DEFAULTS.dualDistance,
    corneredApex: BOWED_DEFAULTS.corneredApex,
  };
  /** Corner rounding stamped onto subsequently deposited rounded
   * points (Phase 4.4); the switch-rounding key cycles it. */
  private rounding: NGCornerParams['rounding'] = 'arc';

  constructor(id: string, point: Vec2, kind: CompositePointKind, radius = 12) {
    this.radius = radius;
    this.path = { id, mode: 'ngComposite', closed: false, points: [] };
    this.assertPoint(point);
    this.path.points.push(this.point(point, kind), this.point(point, 'bSpline'));
  }
  get trailingPointId(): string { return this.path.points[this.path.points.length - 1].id; }
  get snapBase(): Vec2 { const p = this.path.points[this.path.points.length - 2]; return { x: p.x, y: p.y }; }
  get origin(): Vec2 { const p = this.path.points[0]; return { x: p.x, y: p.y }; }
  move(point: Vec2): void {
    this.assertPoint(point);
    Object.assign(this.path.points[this.path.points.length - 1], { x: point.x, y: point.y });
  }
  commit(kind: CompositePointKind, point: Vec2): void {
    this.move(point);
    // Key-click convention: retype the previous committed point, commit the
    // rubber-band point, then append a new trailing spline point.
    const previous = this.path.points[this.path.points.length - 2];
    if (this.arcOpen) {
      // Any point key completes an open three-point arc: the point
      // being committed is its end (FM: the arc resolves at P2).
      previous.kind = 'arcByThreeEnd';
      previous.outgoing = { kind: 'bSpline' };
      delete previous.corner;
      this.arcOpen = false;
    } else {
      this.setKind(previous, kind);
    }
    this.path.points.push(this.point(point, 'bSpline'));
  }

  /** Replace the bow parameter snapshot stamped at deposit. */
  setBowParams(params: Partial<Omit<NGBowedParams, 'facing'>>): void {
    this.bowParams = { ...this.bowParams, ...params };
  }

  private bowRecord(facing: 'A' | 'B'): NGBowedParams {
    return { ...this.bowParams, facing };
  }

  /** Retype the last committed point as a bowed-line point whose
   * outgoing segment bows toward the given facing ('left' is FM's
   * facing A, 'right' is facing B). Guard: an unfinished arc slot is
   * closed first (the bowed key completes the arc instead). */
  stampBowed(facing: 'left' | 'right'): void {
    const previous = this.path.points[this.path.points.length - 2];
    previous.kind = 'bowedLine';
    previous.outgoing = { kind: 'bowedLine', bow: this.bowRecord(facing === 'left' ? 'A' : 'B') };
    delete previous.corner;
  }

  /** Commit the rubber-band point as a bowed point (B / Shift+B). */
  commitBowed(point: Vec2, facing: 'left' | 'right'): void {
    this.move(point);
    if (this.arcOpen) { this.commit('bSpline', point); return; }
    this.stampBowed(facing);
    this.path.points.push(this.point(point, 'bSpline'));
  }

  /** Commit the rubber-band point as an arc through point; the
   * next commit (any point key) becomes the arc's end. */
  commitArcThrough(point: Vec2): void {
    this.move(point);
    const previous = this.path.points[this.path.points.length - 2];
    if (this.arcOpen) { this.commit('bSpline', point); return; }
    if (this.path.points.length < 3) {
      // An arc needs a start point before the through point; with
      // none, FM's fallback is a plain hard corner.
      this.setKind(previous, 'hardCorner');
      this.path.points.push(this.point(point, 'bSpline'));
      return;
    }
    previous.kind = 'arcByThreeStart';
    previous.outgoing = { kind: 'bSpline' };
    delete previous.corner;
    this.arcOpen = true;
    this.path.points.push(this.point(point, 'bSpline'));
  }

  get isArcOpen(): boolean { return this.arcOpen; }

  /** The rounding the switch-rounding key has selected. */
  get roundingMode(): NGCornerParams['rounding'] { return this.rounding; }

  /** Switch-rounding key (Phase 4.4): cycle arc → bSpline → bevel
   * for subsequently deposited rounded points. Points already
   * committed keep the rounding they were stamped with. */
  cycleRounding(): NGCornerParams['rounding'] {
    const order: NGCornerParams['rounding'][] = ['arc', 'bSpline', 'bevel'];
    this.rounding = order[(order.indexOf(this.rounding) + 1) % order.length];
    return this.rounding;
  }

  /** Erase-last key (Phase 4.5): remove the last committed point,
   * keeping the trailing rubber-band point live. No-op when only the
   * first point is committed. While an arc is open the removed point
   * is its pending end: the arc is abandoned (its through point
   * reverts to a spline point, the slot closes). Removing a
   * completed arc's end likewise abandons the arc, so the session
   * never holds an unpaired arc start. */
  eraseLast(): boolean {
    const points = this.path.points;
    if (points.length <= 2) return false;
    const removed = points[points.length - 2];
    points.splice(points.length - 2, 1);
    if (this.arcOpen) {
      const through = points[points.length - 2];
      if (through && through.kind === 'arcByThreeStart') {
        through.kind = 'bSpline';
        through.outgoing = { kind: 'bSpline' };
      }
      this.arcOpen = false;
    } else if (removed.kind === 'arcByThreeEnd') {
      const before = points[points.length - 2];
      if (before && before.kind === 'arcByThreeStart') {
        before.kind = 'bSpline';
        before.outgoing = { kind: 'bSpline' };
      }
    }
    return true;
  }

  setCornerRadius(radius: number): void {
    if (!Number.isFinite(radius) || radius < 0) throw new Error('Corner radius must be nonnegative');
    this.radius = radius;
    // Radius edits rewrite live rounded points (Tier Two behaviour);
    // each point keeps the rounding type it was stamped with.
    for (const point of this.path.points) if (point.kind === 'roundedCorner' && point.corner) point.corner = { rounding: point.corner.rounding, radius };
  }
  scale(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) throw new Error('Invalid live scale');
    const origin = this.origin;
    for (const point of this.path.points) {
      point.x = origin.x + (point.x - origin.x) * factor;
      point.y = origin.y + (point.y - origin.y) * factor;
      if (point.corner) point.corner.radius *= factor;
      // Phase 4.6: an absolute bow amplitude is a length in the
      // drawing, so it scales with the path; a percentage amplitude
      // rides the chord and needs no change. Rotation moves points
      // only — bow parameters are chord-relative and stay put.
      const bow = point.outgoing?.bow;
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
    const last = copy.points[copy.points.length - 1];
    const previous = copy.points[copy.points.length - 2];
    if (this.arcOpen) {
      // The point committed with the arc key is the arc's end; the
      // trailing point then inherits from it like any other finish.
      previous.kind = 'arcByThreeEnd';
      previous.outgoing = { kind: 'bSpline' };
      delete previous.corner;
      last.kind = previous.kind;
      last.outgoing = structuredClone(previous.outgoing);
    } else if (previous.kind === 'arcByThreeStart') {
      // Finishing mid-arc completes the arc at the final point, so a
      // snapshot always satisfies the start/end pairing rule. Ending
      // exactly on the through point abandons the arc instead (FM's
      // unfinished-arc fallback is a plain corner point).
      if (distance(last, previous) <= 1e-9) {
        previous.kind = 'bSpline';
        previous.outgoing = { kind: 'bSpline' };
        last.kind = 'bSpline';
        last.outgoing = { kind: 'bSpline' };
      } else {
        last.kind = 'arcByThreeEnd';
        last.outgoing = { kind: 'bSpline' };
        delete last.corner;
      }
    } else {
      // A final rubber-band endpoint inherits the convention of its incoming
      // committed point, so closing an all-sharp path stays all straight.
      last.kind = previous.kind;
      last.outgoing = structuredClone(previous.outgoing);
      if (previous.corner) last.corner = structuredClone(previous.corner);
    }
    if (distance(last, previous) <= 1e-9) copy.points.pop();
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
    point.kind = kind;
    point.outgoing = { kind: kind === 'hardCorner' ? 'line' : 'bSpline' };
    delete point.corner;
    if (kind === 'roundedCorner') point.corner = { rounding: this.rounding, radius: this.radius };
    if (kind === 'bowedLine') point.outgoing = { kind: 'bowedLine', bow: this.bowRecord('A') };
  }
  private assertPoint(point: Vec2): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Invalid drawing coordinate');
  }
}
