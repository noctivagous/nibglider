// Pure semantic expansion. Straight edges bypass smoothing, hard corners
// repeat three controls, and rounded corners split incoming/outgoing runs.
// Radius trims are capped at half each adjacent leg, so neighboring corners
// cannot overlap. Bowed lines and staged arcs remain explicit future modes.
import type { NGBowedParams, NGCompositePath, NGPathPoint } from '../model/NGPath';
import type { ResolvedPath, Vec2 } from '../model/geometryResolution';
import { appendDistinct, distance, sampleBSpline, sampleCircleThrough3, sampleCubic, type SamplingOptions } from './splineInterpolation';
import { sampleClothoid } from './clothoidFit';
import { validatePath } from '../model/serialization';

export type CenterlineCommand =
  | { kind: 'line'; from: Vec2; to: Vec2 }
  | { kind: 'splineControls'; points: Vec2[]; closed: boolean }
  | { kind: 'cubic'; from: Vec2; control1: Vec2; control2: Vec2; to: Vec2 }
  | { kind: 'bowedControls'; points: Vec2[] }
  | { kind: 'arc'; from: Vec2; through: Vec2; to: Vec2 };

interface Vertex { entry: Vec2; exit: Vec2; repeats: number; corner: CenterlineCommand[] }
function vertex(point: NGPathPoint, previous?: NGPathPoint, next?: NGPathPoint): Vertex {
  const repeats = point.kind === 'hardCorner' || point.kind === 'clothoidCorner' || point.kind === 'arcByThreeStart' ? 3
    : point.kind === 'roundedCorner' ? 2 : 1;
  // FM-literal: a bowed point's own corner is corner-point multiplicity,
  // never entry/exit trims. The target vertex keeps its trims.
  if (point.outgoing?.kind === 'bowedLine') {
    const at = { x: point.x, y: point.y };
    return { entry: { ...at }, exit: { ...at }, repeats, corner: [] };
  }
  const result: Vertex = { entry: { x: point.x, y: point.y }, exit: { x: point.x, y: point.y }, repeats, corner: [] };
  if (point.kind === 'roundedCorner' && point.corner?.radius === 0) result.repeats = 3;
  if (point.kind !== 'roundedCorner' || !previous || !next || !point.corner?.radius) return result;
  const incoming = distance(previous, point); const outgoing = distance(point, next);
  if (incoming < 1e-9 || outgoing < 1e-9) return result;
  const u = { x: (previous.x - point.x) / incoming, y: (previous.y - point.y) / incoming };
  const v = { x: (next.x - point.x) / outgoing, y: (next.y - point.y) / outgoing };
  const theta = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
  if (theta < 1e-6 || Math.PI - theta < 1e-6) return result;
  const trim = Math.min(point.corner.radius / Math.tan(theta / 2), incoming / 2, outgoing / 2);
  result.entry = { x: point.x + u.x * trim, y: point.y + u.y * trim };
  result.exit = { x: point.x + v.x * trim, y: point.y + v.y * trim };
  if (point.corner.rounding === 'bevel') {
    result.corner = [{ kind: 'line', from: result.entry, to: result.exit }];
  } else if (point.corner.rounding === 'bSpline') {
    result.corner = [{ kind: 'splineControls', points: [result.entry, point, point, result.exit], closed: false }];
  } else {
    const radius = trim * Math.tan(theta / 2);
    const bisectorLength = Math.hypot(u.x + v.x, u.y + v.y);
    const centerDistance = radius / Math.sin(theta / 2);
    const center = { x: point.x + (u.x + v.x) / bisectorLength * centerDistance,
      y: point.y + (u.y + v.y) / bisectorLength * centerDistance };
    const startAngle = Math.atan2(result.entry.y - center.y, result.entry.x - center.x);
    const direction = (-u.x * v.y + u.y * v.x) > 0 ? 1 : -1;
    const sweep = direction * (Math.PI - theta);
    const count = Math.ceil(Math.abs(sweep) / (Math.PI / 2));
    for (let i = 0; i < count; i++) {
      const a = startAngle + sweep * i / count; const b = startAngle + sweep * (i + 1) / count;
      const handle = 4 / 3 * Math.tan((b - a) / 4) * radius;
      const from = i === 0 ? result.entry : { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) };
      const to = i === count - 1 ? result.exit : { x: center.x + radius * Math.cos(b), y: center.y + radius * Math.sin(b) };
      result.corner.push({ kind: 'cubic', from, to,
        control1: { x: from.x - handle * Math.sin(a), y: from.y + handle * Math.cos(a) },
        control2: { x: to.x + handle * Math.sin(b), y: to.y - handle * Math.cos(b) } });
    }
  }
  return result;
}

/**
 * Bow peak positions for a bowed segment, following FM's `BowedInfo` math:
 * peak base = corner + f x (next - corner) with f = peakLocation x
 * multiplier; dual peaks sit at f +/- dualDistance / 2 along the chord;
 * each peak offsets along the chord normal (facing A = -90 deg).
 * Cornered apexes repeat the peak: 2 copies total when rounded, 3 when
 * hard, including the original. A degenerate chord emits just the peak.
 */
export function bowPeakPoints(from: Vec2, to: Vec2, bow: NGBowedParams): Vec2[] {
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) {
    throw new Error('Invalid bowed chord');
  }
  const chord = distance(from, to);
  const at = (f: number): Vec2 => ({ x: from.x + f * (to.x - from.x), y: from.y + f * (to.y - from.y) });
  const push = (out: Vec2[], peak: Vec2): void => {
    out.push(peak);
    if (bow.corneredApex === 'rounded') out.push({ ...peak });
    else if (bow.corneredApex === 'hard') out.push({ ...peak }, { ...peak });
  };
  if (chord <= 1e-9) return [{ ...from }];
  const angle = Math.atan2(to.y - from.y, to.x - from.x) + (bow.facing === 'A' ? -Math.PI / 2 : Math.PI / 2);
  const travel = bow.amplitudeIsPercent ? (bow.amplitude / 100) * chord : bow.amplitude;
  const offset = (base: Vec2): Vec2 => ({
    x: base.x + travel * Math.cos(angle),
    y: base.y + travel * Math.sin(angle),
  });
  const f = bow.peakLocation * bow.peakLocationMultiplier;
  const out: Vec2[] = [];
  if (bow.dualDistance === 0) {
    push(out, offset(at(f)));
    return out;
  }
  push(out, offset(at(f - bow.dualDistance / 2)));
  push(out, offset(at(f + bow.dualDistance / 2)));
  return out;
}

export function expandCompositePoints(path: NGCompositePath): CenterlineCommand[] {
  // Live snapshots may hold one unfinished arc at the trailing edge, which
  // previews as a hard corner; persisted strictness lives at serialization.
  validatePath(path, 'path', { allowStagedArc: true });
  const points = path.points; const n = points.length;
  if (n < 2) return n ? [{ kind: 'splineControls', points: [{ x: points[0].x, y: points[0].y }], closed: false }] : [];
  const vertices = points.map((p, i) => vertex(p, i ? points[i - 1] : path.closed ? points[n - 1] : undefined,
    i + 1 < n ? points[i + 1] : path.closed ? points[0] : undefined));
  const isLine = (i: number) => points[i].outgoing?.kind === 'line' || (points[i].kind === 'line' && (!points[i].outgoing || points[i].outgoing.kind === 'inherit'));
  const isBowed = (i: number) => points[i].outgoing?.kind === 'bowedLine' && !!points[i].outgoing.bow;
  // A three-point arc needs (prev, start, end): prev exists for every
  // closed-path vertex, and for open-path vertices past the first.
  const hasPrev = (i: number) => path.closed || i > 0;
  const isArcPair = (i: number) => {
    const j = (i + 1) % n;
    return points[i].kind === 'arcByThreeStart' && points[j].kind === 'arcByThreeEnd' && hasPrev(i);
  };
  const isCut = (k: number) => isLine(k) || isBowed(k) || isArcPair(k);
  // Entire periodic spline: no artificial start/end clamp at the seam.
  if (path.closed && vertices.every((v, i) => !v.corner.length && !isCut(i))) {
    return [{ kind: 'splineControls', closed: true,
      points: vertices.flatMap((v) => Array.from({ length: v.repeats }, () => ({ ...v.exit }))) }];
  }
  // Put a closed mixed path's seam at a true boundary so an otherwise smooth
  // run crossing vertex zero is not accidentally split into clamped runs.
  // An arc starting at the seam would reference a vertex past the walk's
  // end, so the seam moves to the arc's end instead.
  let first = path.closed ? vertices.findIndex((v, i) => v.corner.length || isCut((i - 1 + n) % n)) : 0;
  if (first < 0) first = 0;
  if (path.closed && isArcPair(first)) first = (first + 1) % n;
  const commands: CenterlineCommand[] = [];
  let controls: Vec2[] = [];
  const append = (v: Vertex, point: Vec2) => { for (let i = 0; i < v.repeats; i++) controls.push({ x: point.x, y: point.y }); };
  const flush = () => { if (controls.length > 1) commands.push({ kind: 'splineControls', points: controls, closed: false }); controls = []; };
  append(vertices[first], vertices[first].exit);
  for (let step = 0; step < (path.closed ? n : n - 1); step++) {
    const i = (first + step) % n; const j = (i + 1) % n;
    const a = vertices[i]; const b = vertices[j];
    const bow = points[i].outgoing?.kind === 'bowedLine' ? points[i].outgoing.bow : undefined;
    // Circle through (prev exit, start, end entry): FM emits the arc in
    // place of the start's corner points, so the start's repeats (appended
    // last round, or in the initial append) are dropped first. The arc also
    // subsumes an explicit line/bowed leg into the start: keeping it would
    // draw the prev->start leg twice (once straight, once as the arc's
    // opening), spiking back to prev. A plain spline run into the start
    // stays, matching FM's flow-through.
    if (isArcPair(i)) {
      const prev = (i - 1 + n) % n;
      const drop = vertices[i].repeats;
      controls.splice(Math.max(0, controls.length - drop), drop);
      flush();
      const startPos = { x: points[i].x, y: points[i].y };
      const tail = commands[commands.length - 1];
      if ((tail?.kind === 'line' || tail?.kind === 'bowedControls')
        && distance(tail.kind === 'line' ? tail.to : tail.points.at(-1)!, startPos) <= 1e-9) {
        commands.pop();
      }
      commands.push({
        kind: 'arc',
        from: { ...vertices[prev].exit },
        through: startPos,
        to: { ...b.entry },
      });
      append(b, b.entry);
    } else if (bow) {
      flush();
      if (bow.isArc) {
        // Arc-mode bow: circle through (corner, peak, next), dual peaks
        // and cornered apexes ignored like FM's arc branch.
        const [peak] = bowPeakPoints(a.exit, b.entry, { ...bow, dualDistance: 0, corneredApex: 'none' });
        commands.push({
          kind: 'arc',
          from: { ...a.exit },
          through: peak ?? { ...a.exit },
          to: { ...b.entry },
        });
      } else {
        commands.push({
          kind: 'bowedControls',
          points: [a.exit, ...bowPeakPoints(a.exit, b.entry, bow), b.entry],
        });
      }
      append(b, b.entry);
    } else if (isLine(i)) {
      flush(); commands.push({ kind: 'line', from: a.exit, to: b.entry });
      append(b, b.entry);
    } else append(b, b.entry);
    if (b.corner.length) {
      flush(); commands.push(...b.corner); append(b, b.exit);
    }
  }
  flush();
  return commands;
}

export function resolveCompositePath(path: NGCompositePath, options: SamplingOptions = {}): ResolvedPath {
  const samples: Vec2[] = [];
  const clothoid = path.points.some((p) => p.kind === 'g4' || p.kind === 'g2'
    || p.kind === 'clothoidCorner' || p.kind === 'prevConstraint' || p.kind === 'nextConstraint');
  for (const command of expandCompositePoints(path)) {
    // Bowed runs always sample as B-splines, even inside clothoid paths:
    // FM has no clothoid vocabulary and bow peaks are explicit controls.
    const points = command.kind === 'line' ? [command.from, command.to]
      : command.kind === 'cubic' ? sampleCubic(command.from, command.control1, command.control2, command.to, options)
      : command.kind === 'bowedControls' ? sampleBSpline(command.points, false, options)
      : command.kind === 'arc' ? sampleCircleThrough3(command.from, command.through, command.to, options)
      : clothoid ? sampleClothoid(command.points, command.closed, options)
      : sampleBSpline(command.points, command.closed, options);
    points.forEach((p) => appendDistinct(samples, p));
  }
  if (path.closed && samples.length > 1 && distance(samples[0], samples[samples.length - 1]) <= 1e-9) samples.pop();
  return { kind: 'path', closed: path.closed, segments: samples.map((point) => ({ point, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } })) };
}
