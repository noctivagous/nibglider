export interface Point2 { x: number; y: number }
export type GridKind = 'square' | 'diamond';

export function snapGrid(point: Point2, spacing: number, kind: GridKind): Point2 {
  if (!(Number.isFinite(spacing) && spacing > 0)) return { ...point };
  if (kind === 'diamond') {
    const diagonal = spacing / Math.SQRT2;
    const step = spacing * Math.SQRT2;
    const i = Math.round((point.x + point.y) / step);
    const j = Math.round((point.x - point.y) / step);
    return { x: (i + j) * diagonal, y: (i - j) * diagonal };
  }
  return { x: Math.round(point.x / spacing) * spacing, y: Math.round(point.y / spacing) * spacing };
}

export function snapAngle(base: Point2, target: Point2, degrees: number): Point2 {
  const dx = target.x - base.x; const dy = target.y - base.y;
  const length = Math.hypot(dx, dy);
  if (!length) return { ...target };
  const step = ((Number.isFinite(degrees) && degrees > 0 ? degrees : 15) * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: base.x + Math.cos(angle) * length, y: base.y + Math.sin(angle) * length };
}

export function snapLength(base: Point2, target: Point2, increment: number): Point2 {
  const dx = target.x - base.x; const dy = target.y - base.y;
  const length = Math.hypot(dx, dy);
  if (!length) return { ...target };
  const step = Number.isFinite(increment) && increment > 0 ? increment : 10;
  const snapped = Math.max(step, Math.round(length / step) * step);
  return { x: base.x + dx / length * snapped, y: base.y + dy / length * snapped };
}

export function aspectSecond(first: number, a: number, b: number): number {
  if (!(first > 0)) return b;
  return first * (Math.abs(b) || 1) / (Math.abs(a) || 1);
}

export function snapAspect(base: Point2, target: Point2, a: number, b: number): Point2 {
  const dx = target.x - base.x; const dy = target.y - base.y;
  if (!dx && !dy) return { ...target };
  const width = Math.abs(a) || 1; const height = Math.abs(b) || 1;
  const scale = Math.max(Math.abs(dx) / width, Math.abs(dy) / height);
  return { x: base.x + (dx === 0 ? 1 : Math.sign(dx)) * width * scale,
    y: base.y + (dy === 0 ? 1 : Math.sign(dy)) * height * scale };
}
