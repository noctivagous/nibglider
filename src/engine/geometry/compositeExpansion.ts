// Pure semantic expansion. Straight edges bypass smoothing, hard corners
// repeat three controls, and rounded corners split incoming/outgoing runs.
// Radius trims are capped at half each adjacent leg, so neighboring corners
// cannot overlap. Bowed lines bow their segment through peak(s) set by
// the full NGBowedParams record, and three-point arcs resolve through
// their through point (Tier Two, Slice 9; bow record completed in
// Slice 14, following TASKS-FMStroke.md: D2 legacy stays the global
// default, D3 the stored radius remains the truth for rounded corners).
import { BOWED_DEFAULTS, type NGCompositePath, type NGPathPoint } from '../model/NGPath';
import type { ResolvedPath, Vec2 } from '../model/geometryResolution';
import { appendDistinct, distance, sampleBSpline, sampleCubic, type SamplingOptions } from './splineInterpolation';
import { validatePath } from '../model/serialization';
import { arcSegments, arcThroughPoints } from './simpleGeometry';
import type { BezierSegment } from '../model/geometryResolution';

export type CenterlineCommand =
  | { kind: 'line'; from: Vec2; to: Vec2 }
  | { kind: 'splineControls'; points: Vec2[]; closed: boolean }
  | { kind: 'cubic'; from: Vec2; control1: Vec2; control2: Vec2; to: Vec2 };

interface Vertex { entry: Vec2; exit: Vec2; repeats: number; corner: CenterlineCommand[] }
function vertex(point: NGPathPoint, previous?: NGPathPoint, next?: NGPathPoint): Vertex {
  // Bowed corner multiplicity follows FM: the bowed point softens like a
  // rounded corner (2 controls); its segment curve is explicit below.
  const result: Vertex = { entry: { x: point.x, y: point.y }, exit: { x: point.x, y: point.y }, repeats: point.kind === 'hardCorner' ? 3 : point.kind === 'roundedCorner' || point.kind === 'bowedLine' ? 2 : 1, corner: [] };
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

function segmentsToCubics(segments: BezierSegment[]): CenterlineCommand[] {
  const out: CenterlineCommand[] = [];
  for (let i = 0; i + 1 < segments.length; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    out.push({
      kind: 'cubic',
      from: { ...a.point },
      control1: { x: a.point.x + a.handleOut.x, y: a.point.y + a.handleOut.y },
      control2: { x: b.point.x + b.handleIn.x, y: b.point.y + b.handleIn.y },
      to: { ...b.point },
    });
  }
  return out;
}

/** Unit normal to the left of travel (screen space, y down). */
function leftNormal(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return { x: 0, y: -1 };
  return { x: dy / len, y: -dx / len };
}

/** Quadratic through `through` (at its parametric midpoint), as an
 * exact cubic. */
function quadThroughCubic(from: Vec2, to: Vec2, through: Vec2): CenterlineCommand {
  const q = { x: 2 * through.x - (from.x + to.x) / 2, y: 2 * through.y - (from.y + to.y) / 2 };
  return {
    kind: 'cubic',
    from: { ...from },
    control1: { x: from.x + (2 / 3) * (q.x - from.x), y: from.y + (2 / 3) * (q.y - from.y) },
    control2: { x: to.x + (2 / 3) * (q.x - to.x), y: to.y + (2 / 3) * (q.y - to.y) },
    to: { ...to },
  };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * A bowed segment, resolved from the full NGBowedParams record
 * (TASKS-FMStroke Phase 3.1; an absent record uses BOWED_DEFAULTS,
 * which is exactly Tier Two's behaviour):
 * - the peak sits at peakLocation × peakLocationMultiplier along the
 *   chord, displaced along the chord normal by the amplitude
 *   (absolute points, or a percentage of the chord when
 *   amplitudeIsPercent); facing 'A' bows left of travel, 'B' right.
 * - spline mode (isArc false): one peak resolves as an exact
 *   quadratic through the peak; two peaks (dualDistance > 0) chain
 *   two quadratics through both peaks with the saddle on the line
 *   between them; a cornered apex instead emits the peak as a
 *   repeated B-spline control (×2 rounded, ×3 hard — FM's
 *   multiplicity technique, never deduplicated).
 * - arc mode (isArc true): the circle through start, peak, end,
 *   falling back to straight segments when the three are collinear.
 * A degenerate (zero-length) chord resolves as just its endpoints.
 */
function bowedCommands(from: Vec2, to: Vec2, outgoing?: NGPathPoint['outgoing']): CenterlineCommand[] {
  const bow = outgoing?.bow ?? BOWED_DEFAULTS;
  const len = distance(from, to);
  if (!(len > 1e-9)) return [{ kind: 'line', from: { ...from }, to: { ...to } }];
  const amount = bow.amplitudeIsPercent ? (bow.amplitude / 100) * len : bow.amplitude;
  const side = bow.facing === 'A' ? 1 : -1;
  const normal = leftNormal(from, to);
  const peakAt = (t: number): Vec2 => ({
    x: from.x + (to.x - from.x) * t + normal.x * amount * side,
    y: from.y + (to.y - from.y) * t + normal.y * amount * side,
  });
  const t = clamp01(bow.peakLocation * bow.peakLocationMultiplier);
  if (bow.isArc) {
    const arc = arcThroughPoints(from, peakAt(t), to);
    if (!arc) {
      const peak = peakAt(t);
      return [
        { kind: 'line', from: { ...from }, to: peak },
        { kind: 'line', from: peak, to: { ...to } },
      ];
    }
    return segmentsToCubics(arcSegments(arc));
  }
  const dual = bow.dualDistance > 0;
  const t1 = dual ? clamp01(t - bow.dualDistance / 2) : t;
  const t2 = dual ? clamp01(t + bow.dualDistance / 2) : t;
  const apexRepeats = bow.corneredApex === 'rounded' ? 2 : bow.corneredApex === 'hard' ? 3 : 1;
  if (apexRepeats > 1) {
    // Peak(s) as repeated spline controls: the quadratic control of
    // each peak, repeated, pulls the spline's apex toward it.
    const controlOf = (peak: Vec2, a: Vec2, b: Vec2): Vec2 => ({
      x: 2 * peak.x - (a.x + b.x) / 2, y: 2 * peak.y - (a.y + b.y) / 2,
    });
    const controls: Vec2[] = [{ ...from }];
    const peaks = dual && t2 - t1 > 1e-6 ? [peakAt(t1), peakAt(t2)] : [peakAt(t)];
    for (const peak of peaks) {
      const q = controlOf(peak, from, to);
      for (let i = 0; i < apexRepeats; i++) controls.push({ ...q });
    }
    controls.push({ ...to });
    return [{ kind: 'splineControls', points: controls, closed: false }];
  }
  if (dual && t2 - t1 > 1e-6) {
    const p1 = peakAt(t1);
    const p2 = peakAt(t2);
    const saddle = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return [quadThroughCubic(from, saddle, p1), quadThroughCubic(saddle, to, p2)];
  }
  return [quadThroughCubic(from, to, peakAt(t))];
}

/** An 'arc' outgoing segment with no through point: the semicircle
 * on the chord, bulging left of travel (radius = half the chord is
 * the stored geometry's own truth, per D3's spirit). */
function arcChordCubics(from: Vec2, to: Vec2): CenterlineCommand[] {
  const len = distance(from, to);
  if (!(len > 1e-9)) return [{ kind: 'line', from: { ...from }, to: { ...to } }];
  const normal = leftNormal(from, to);
  const through = {
    x: (from.x + to.x) / 2 + normal.x * (len / 2),
    y: (from.y + to.y) / 2 + normal.y * (len / 2),
  };
  const arc = arcThroughPoints(from, through, to);
  if (!arc) return [{ kind: 'line', from: { ...from }, to: { ...to } }];
  return segmentsToCubics(arcSegments(arc));
}

export function expandCompositePoints(path: NGCompositePath): CenterlineCommand[] {
  validatePath(path);
  const points = path.points; const n = points.length;
  if (n < 2) return n ? [{ kind: 'splineControls', points: [{ x: points[0].x, y: points[0].y }], closed: false }] : [];
  const vertices = points.map((p, i) => vertex(p, i ? points[i - 1] : path.closed ? points[n - 1] : undefined,
    i + 1 < n ? points[i + 1] : path.closed ? points[0] : undefined));
  const isLine = (i: number) => points[i].outgoing?.kind === 'line' || (points[i].kind === 'line' && (!points[i].outgoing || points[i].outgoing.kind === 'inherit'));
  const isBowed = (i: number) => points[i].outgoing?.kind === 'bowedLine' || points[i].kind === 'bowedLine';
  const isArcChord = (i: number) => points[i].outgoing?.kind === 'arc';
  const hasSpecial = points.some((p, i) => isBowed(i) || isArcChord(i)
    || p.kind === 'arcByThreeStart' || p.kind === 'arcByThreeEnd');
  // Entire periodic spline: no artificial start/end clamp at the seam.
  if (path.closed && !hasSpecial && vertices.every((v, i) => !v.corner.length && !isLine(i))) {
    return [{ kind: 'splineControls', closed: true,
      points: vertices.flatMap((v) => Array.from({ length: v.repeats }, () => ({ ...v.exit }))) }];
  }
  // Put a closed mixed path's seam at a true boundary so an otherwise smooth
  // run crossing vertex zero is not accidentally split into clamped runs.
  // The seam must also never land on a three-point arc's through or end
  // point: the arc branch consumes the two segments after the arc's
  // anchor, so a walk starting at the through/end point would strand
  // the triple as ordinary vertices (Slice 14). Prefer a true boundary
  // that is seam-safe, then any seam-safe vertex; a ring made only of
  // through/end points has no anchor to start from and keeps the
  // ordinary-vertex fallback.
  const seamSafe = (i: number) => points[i].kind !== 'arcByThreeStart' && points[i].kind !== 'arcByThreeEnd';
  let start = -1;
  if (path.closed) {
    start = vertices.findIndex((v, i) => (v.corner.length || isLine((i - 1 + n) % n)) && seamSafe(i));
    if (start < 0) start = vertices.findIndex((_, i) => seamSafe(i));
  } else start = 0;
  const first = start < 0 ? 0 : start;
  const commands: CenterlineCommand[] = [];
  let controls: Vec2[] = [];
  const append = (v: Vertex, point: Vec2) => { for (let i = 0; i < v.repeats; i++) controls.push({ x: point.x, y: point.y }); };
  const flush = () => { if (controls.length > 1) commands.push({ kind: 'splineControls', points: controls, closed: false }); controls = []; };
  append(vertices[first], vertices[first].exit);
  const totalSteps = path.closed ? n : n - 1;
  let step = 0;
  while (step < totalSteps) {
    const i = (first + step) % n; const j = (i + 1) % n;
    const a = vertices[i]; const b = vertices[j];
    // Three-point arc: points[j] is the through point
    // (arcByThreeStart), points[k] the end (arcByThreeEnd); the arc
    // replaces both segments a->j and j->k. The seam choice above
    // keeps triples whole across the array seam; only a ring with no
    // anchor vertex at all falls back to ordinary vertex handling.
    const k = (j + 1) % n;
    if (points[j].kind === 'arcByThreeStart' && points[k].kind === 'arcByThreeEnd' && step + 2 <= totalSteps) {
      flush();
      const through = { x: points[j].x, y: points[j].y };
      const endVertex = vertices[k];
      const arc = arcThroughPoints(a.exit, through, endVertex.entry);
      if (arc) commands.push(...segmentsToCubics(arcSegments(arc)));
      else {
        commands.push({ kind: 'line', from: { ...a.exit }, to: through });
        commands.push({ kind: 'line', from: through, to: { ...endVertex.entry } });
      }
      append(endVertex, endVertex.entry);
      if (endVertex.corner.length) {
        flush(); commands.push(...endVertex.corner); append(endVertex, endVertex.exit);
      }
      step += 2;
      continue;
    }
    if (isBowed(i)) {
      flush(); commands.push(...bowedCommands(a.exit, b.entry, points[i].outgoing));
      append(b, b.entry);
    } else if (isArcChord(i)) {
      flush(); commands.push(...arcChordCubics(a.exit, b.entry));
      append(b, b.entry);
    } else if (isLine(i)) {
      flush(); commands.push({ kind: 'line', from: a.exit, to: b.entry });
      append(b, b.entry);
    } else append(b, b.entry);
    if (b.corner.length) {
      flush(); commands.push(...b.corner); append(b, b.exit);
    }
    step += 1;
  }
  flush();
  return commands;
}

export function resolveCompositePath(path: NGCompositePath, options: SamplingOptions = {}): ResolvedPath {
  const samples: Vec2[] = [];
  for (const command of expandCompositePoints(path)) {
    const points = command.kind === 'line' ? [command.from, command.to]
      : command.kind === 'cubic' ? sampleCubic(command.from, command.control1, command.control2, command.to, options)
      : sampleBSpline(command.points, command.closed, options);
    points.forEach((p) => appendDistinct(samples, p));
  }
  if (path.closed && samples.length > 1 && distance(samples[0], samples[samples.length - 1]) <= 1e-9) samples.pop();
  return { kind: 'path', closed: path.closed, segments: samples.map((point) => ({ point, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } })) };
}
