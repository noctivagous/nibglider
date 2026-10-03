// Pure semantic expansion. Straight edges bypass smoothing, hard corners
// repeat three controls, and rounded corners split incoming/outgoing runs.
// Radius trims are capped at half each adjacent leg, so neighboring corners
// cannot overlap. Bowed lines and staged arcs remain explicit future modes.
import type { NGCompositePath, NGPathPoint } from '../model/NGPath';
import type { ResolvedPath, Vec2 } from '../model/geometryResolution';
import { appendDistinct, distance, sampleBSpline, sampleCubic, type SamplingOptions } from './splineInterpolation';
import { validatePath } from '../model/serialization';

export type CenterlineCommand =
  | { kind: 'line'; from: Vec2; to: Vec2 }
  | { kind: 'splineControls'; points: Vec2[]; closed: boolean }
  | { kind: 'cubic'; from: Vec2; control1: Vec2; control2: Vec2; to: Vec2 };

interface Vertex { entry: Vec2; exit: Vec2; repeats: number; corner: CenterlineCommand[] }
function vertex(point: NGPathPoint, previous?: NGPathPoint, next?: NGPathPoint): Vertex {
  const result: Vertex = { entry: { x: point.x, y: point.y }, exit: { x: point.x, y: point.y }, repeats: point.kind === 'hardCorner' ? 3 : point.kind === 'roundedCorner' ? 2 : 1, corner: [] };
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

export function expandCompositePoints(path: NGCompositePath): CenterlineCommand[] {
  validatePath(path);
  const points = path.points; const n = points.length;
  if (points.some((p) => ['bowedLine', 'arcByThreeStart', 'arcByThreeEnd'].includes(p.kind) || ['bowedLine', 'arc'].includes(p.outgoing?.kind ?? ''))) {
    throw new Error('Bowed segments and three-point arcs are not implemented');
  }
  if (n < 2) return n ? [{ kind: 'splineControls', points: [{ x: points[0].x, y: points[0].y }], closed: false }] : [];
  const vertices = points.map((p, i) => vertex(p, i ? points[i - 1] : path.closed ? points[n - 1] : undefined,
    i + 1 < n ? points[i + 1] : path.closed ? points[0] : undefined));
  const isLine = (i: number) => points[i].outgoing?.kind === 'line' || (points[i].kind === 'line' && (!points[i].outgoing || points[i].outgoing.kind === 'inherit'));
  // Entire periodic spline: no artificial start/end clamp at the seam.
  if (path.closed && vertices.every((v, i) => !v.corner.length && !isLine(i))) {
    return [{ kind: 'splineControls', closed: true,
      points: vertices.flatMap((v) => Array.from({ length: v.repeats }, () => ({ ...v.exit }))) }];
  }
  // Put a closed mixed path's seam at a true boundary so an otherwise smooth
  // run crossing vertex zero is not accidentally split into clamped runs.
  const start = path.closed ? vertices.findIndex((v, i) => v.corner.length || isLine((i - 1 + n) % n)) : 0;
  const first = start < 0 ? 0 : start;
  const commands: CenterlineCommand[] = [];
  let controls: Vec2[] = [];
  const append = (v: Vertex, point: Vec2) => { for (let i = 0; i < v.repeats; i++) controls.push({ x: point.x, y: point.y }); };
  const flush = () => { if (controls.length > 1) commands.push({ kind: 'splineControls', points: controls, closed: false }); controls = []; };
  append(vertices[first], vertices[first].exit);
  for (let step = 0; step < (path.closed ? n : n - 1); step++) {
    const i = (first + step) % n; const j = (i + 1) % n;
    const a = vertices[i]; const b = vertices[j];
    if (isLine(i)) {
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
  for (const command of expandCompositePoints(path)) {
    const points = command.kind === 'line' ? [command.from, command.to]
      : command.kind === 'cubic' ? sampleCubic(command.from, command.control1, command.control2, command.to, options)
      : sampleBSpline(command.points, command.closed, options);
    points.forEach((p) => appendDistinct(samples, p));
  }
  if (path.closed && samples.length > 1 && distance(samples[0], samples[samples.length - 1]) <= 1e-9) samples.pop();
  return { kind: 'path', closed: path.closed, segments: samples.map((point) => ({ point, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } })) };
}
