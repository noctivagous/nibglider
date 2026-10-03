// Pure frame, unit-point, and orientation math for circle and rectangle keys.
// Owns no scene or engine state. Reads only the vectors and angles it is
// given. Mutates nothing. Paper path construction stays in ShapeFactory.
// Tested from tests/shape-geometry.test.mjs.
import { clampShapeAngle } from '../input/KeySettingsRegistry';
import type { Vec2 } from '../model/geometryResolution';

export type UnitPoint = [number, number];

export interface FrameBasis { o: Vec2; u: Vec2; v: Vec2 }

export interface RectFrameInput {
  shapeType: string | null;
  start: Vec2 | null;
  second: Vec2 | null;
  mouse: Vec2 | null;
  diagonalScale: number;
  /** Full centerline width for the current drag, already aspect-snapped. */
  centerlineWidth: number;
}

export function rotST(s: number, t: number, orientation: number): [number, number] {
  const o = ((orientation % 4) + 4) % 4;
  if (o === 1) return [1 - t, s];
  if (o === 2) return [1 - s, 1 - t];
  if (o === 3) return [t, 1 - s];
  return [s, t];
}

/** Preview-well rotation about the origin. Matches rotST's 90° steps. */
export function rotWell(x: number, y: number, orientation: number): [number, number] {
  const o = ((orientation % 4) + 4) % 4;
  if (o === 1) return [-y, x];
  if (o === 2) return [-x, -y];
  if (o === 3) return [y, -x];
  return [x, y];
}

export function squareShear(angleDeg: number): number {
  const theta = clampShapeAngle(angleDeg) * (Math.PI / 180);
  return Math.cos(theta) / Math.max(Math.sin(theta), 1e-6);
}

export function frameAngleShear(u: Vec2, v: Vec2, angleDeg: number): number {
  const theta = clampShapeAngle(angleDeg) * (Math.PI / 180);
  const lenU = Math.hypot(u.x, u.y);
  if (!(lenU > 0)) return 0;
  return (Math.hypot(v.x, v.y) / lenU) * (Math.cos(theta) / Math.sin(theta));
}

export function trapezoidFrameST(shear: number): UnitPoint[] {
  const inset = Math.max(-0.49, Math.min(0.49, shear));
  return [
    [inset, 0],
    [1 - inset, 0],
    [1, 1],
    [0, 1],
  ];
}

export function parallelogramFrameST(shear: number): UnitPoint[] {
  const k = Math.max(-0.9, Math.min(0.9, shear));
  return k >= 0
    ? [[0, 1], [1 - k, 1], [1, 0], [k, 0]]
    : [[-k, 1], [1, 1], [1 + k, 0], [0, 0]];
}

export function rectFrameBasis(input: RectFrameInput): FrameBasis | null {
  const { shapeType, start, second, mouse } = input;
  if (shapeType === 'rectangle_diagonal') {
    if (!start || !mouse) return null;
    const k = input.diagonalScale;
    const dx = (mouse.x - start.x) * k;
    const dy = (mouse.y - start.y) * k;
    if (dx === 0 || dy === 0) return null;
    return { o: { x: start.x, y: start.y }, u: { x: dx, y: 0 }, v: { x: 0, y: dy } };
  }
  if (shapeType === 'rectangle_two_edges') {
    if (!start || !second || !mouse) return null;
    const edge = sub(second, start);
    if (len(edge) === 0) return null;
    const dir1 = norm(edge);
    const v2 = sub(mouse, second);
    const perp = sub(v2, mul(dir1, dot(v2, dir1)));
    if (len(perp) === 0) return null;
    return { o: { x: start.x, y: start.y }, u: edge, v: perp };
  }
  if (shapeType === 'rectangle_centerline') {
    if (!start || !mouse) return null;
    const dir = sub(mouse, start);
    const halfLen = len(dir) / 2;
    if (halfLen === 0) return null;
    const center = mul(add(start, mouse), 0.5);
    const unitDir = norm(dir);
    const perp = { x: -unitDir.y, y: unitDir.x };
    const halfW = input.centerlineWidth / 2;
    return {
      o: sub(sub(center, mul(unitDir, halfLen)), mul(perp, halfW)),
      u: mul(unitDir, 2 * halfLen),
      v: mul(perp, 2 * halfW),
    };
  }
  return null;
}

/** Stretch unit points onto [0, 1] × [0, 1] so the result meets every edge. */
export function fitUnitCoords(unit: UnitPoint[]): UnitPoint[] | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [ux, uy] of unit) {
    if (ux < minX) minX = ux;
    if (ux > maxX) maxX = ux;
    if (uy < minY) minY = uy;
    if (uy > maxY) maxY = uy;
  }
  if (!(maxX > minX) || !(maxY > minY)) return null;
  return unit.map(([ux, uy]) => [(ux - minX) / (maxX - minX), (uy - minY) / (maxY - minY)]);
}

export function framePoint(basis: FrameBasis, s: number, t: number, orientation = 0): Vec2 {
  const [rs, rt] = rotST(s, t, orientation);
  return add(basis.o, add(mul(basis.u, rs), mul(basis.v, rt)));
}

export function placeUnitPoints(
  center: Vec2,
  radius: number,
  unit: UnitPoint[],
  rotationDeg = 0,
): Vec2[] {
  const rot = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return unit.map(([x, y]) => {
    const rx = x * c - y * s;
    const ry = x * s + y * c;
    return { x: center.x + rx * radius, y: center.y + ry * radius };
  });
}

export function circleInnerShapeUnitPoints(
  type: string,
  angleDeg = 60,
): UnitPoint[] | null {
  const circum = (pts: UnitPoint[]): UnitPoint[] => {
    let maxR = 0;
    for (const [x, y] of pts) {
      const r = Math.hypot(x, y);
      if (r > maxR) maxR = r;
    }
    if (!(maxR > 0)) return pts;
    return pts.map(([x, y]) => [x / maxR, y / maxR]);
  };
  switch (type) {
    case 'rightTriangle':
    case 'rightTriangleB':
      return [[-1, 0], [1, 0], [0, -1]];
    case 'trapezoid':
      return trapezoidUnitPoints(angleDeg);
    case 'parallelogram':
      return circum(parallelogramUnitPoints(angleDeg));
    case 'rhombus':
      return circum([[0, -0.9], [0.7, 0], [0, 0.9], [-0.7, 0]]);
    case 'kite':
      return circum([[0, -1], [1, -1 / 3], [0, 1], [-1, -1 / 3]]);
    default:
      return null;
  }
}

export function trapezoidUnitPoints(angleDeg: number): UnitPoint[] {
  const theta = clampShapeAngle(angleDeg) * (Math.PI / 180);
  const cos = Math.cos(theta);
  const sin = Math.max(Math.sin(theta), 1e-6);
  const bottomHalf = 1;
  const topHalf = 1 - cos;
  const h = sin;
  const yb = h / 2;
  const yt = -h / 2;
  const cy = (bottomHalf * bottomHalf - topHalf * topHalf) / (2 * h);
  const radius = Math.hypot(bottomHalf, yb - cy) || 1;
  return [
    [-topHalf / radius, (yt - cy) / radius],
    [topHalf / radius, (yt - cy) / radius],
    [bottomHalf / radius, (yb - cy) / radius],
    [-bottomHalf / radius, (yb - cy) / radius],
  ];
}

export function parallelogramUnitPoints(angleDeg: number): UnitPoint[] {
  const theta = clampShapeAngle(angleDeg) * (Math.PI / 180);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    [-0.5 - 0.5 * c, 0.5 * s],
    [0.5 - 0.5 * c, 0.5 * s],
    [0.5 + 0.5 * c, -0.5 * s],
    [-0.5 + 0.5 * c, -0.5 * s],
  ];
}

export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function mul(a: Vec2, s: number): Vec2 { return { x: a.x * s, y: a.y * s }; }
export function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
export function len(a: Vec2): number { return Math.hypot(a.x, a.y); }
export function norm(a: Vec2): Vec2 {
  const n = len(a) || 1;
  return { x: a.x / n, y: a.y / n };
}
