// Semantic shape construction and the Paper.js paths the drawing tools deposit.
// Owns no engine fields. Reads a ShapeBuildContext and style/text hooks passed
// in by the caller. Mutates only the Paper items it creates.
// describe() returns an NGShape when the figure still matches that record.
// Sector, segment, and semicircle stay Paper paths: sweep is not an NGShape.
// Fitting a circle, regular polygon, or supershape into a non-uniform frame
// drops the semantic record (null) because the fit breaks those invariants.
// Live circles stay Path.Circle and sectors stay arcTo. Supershape samples
// use SUPERSHAPE_STEPS from pathResolver, inclusive of the closing vertex.
// drawInnerShape places an inner figure in a circle or other frame.
// Circle frames inset by strokeWidth / 2. Other frames inset by
// strokeWidth * 1.5 and then scale the fit by 0.9.
// Tested from tests/shape-geometry.test.mjs and the engine drawing tests.
import { clampSectorAngle } from '../input/KeySettingsRegistry';
import type { NGShape } from '../model/NGShape';
import { tagCircleOrigin } from './shapeCenters';
import type { Vec2 } from '../model/geometryResolution';
import type { InnerShapeParams, PolygonRadiusMode } from '../types';
import { SUPERSHAPE_STEPS, supershapeRadius } from './pathResolver';
import {
  circleInnerShapeUnitPoints,
  fitUnitCoords,
  frameAngleShear,
  framePoint,
  parallelogramFrameST,
  placeUnitPoints,
  quadArea,
  quadFrameMapper,
  rectFrameBasis,
  rotST,
  rotWell,
  squareShear,
  trapezoidFrameST,
  type QuadCorners,
  type QuadMapping,
  type RectFrameInput,
  type UnitPoint,
} from './RectangleGeometry';

type Item = any;

export interface ShapeStyleHooks {
  applyStrokeGeometry(item: Item): void;
  applyStrokeDash(item: Item): void;
  applyFill(item: Item): void;
  withShapeText(item: Item, isPreview: boolean, textRotation?: number, center?: Item): Item;
  textForBoundary(boundary: Item, isPreview: boolean): Item | null;
  globalStrokeColor(): string;
  globalStrokeWidth(): number;
  textModeEnabled(): boolean;
}

export interface InnerShapeBuild {
  center: Item;
  radius: number;
  styleOrPreview?: string;
  rotationAngle?: number;
  shapeType: string | null;
  circleInnerShapeType: string;
  circleInnerShapeParams: InnerShapeParams;
  rectangleInnerShapeType: string;
  rectangleInnerShapeParams: InnerShapeParams;
  innerShapeType: string;
  innerShapeParams: InnerShapeParams;
  polygonRadiusMode: PolygonRadiusMode;
}

export interface InnerFrameDraw {
  shapeType: string | null;
  rectangleInnerShapeType: string;
  innerShapeType: string;
  quadActive: boolean;
  guideAngle: number;
  globalStrokeWidth: number;
  buildInner(center: Item, radius: number, style: string, rotation: number): Item;
  addToActive(item: Item): void;
}

export interface RectFrameBuild {
  styleOrPreview?: string;
  innerType: string;
  params: InnerShapeParams;
  shapeType: string | null;
  orientation: number;
  guideAngle: number;
  frame: RectFrameInput;
}

export interface QuadFrameBuild {
  styleOrPreview?: string;
  innerType: string;
  params: InnerShapeParams;
  shapeType: string | null;
  orientation: number;
  guideAngle: number;
  corners: QuadCorners | null;
  mapping?: QuadMapping;
  /** Force the projective mapper for fitted circles regardless of mapping. */
  perspectiveCircle?: boolean;
}

export class ShapeFactory {
  private readonly scope: paper.PaperScope;
  private readonly hooks: ShapeStyleHooks;
  constructor(scope: paper.PaperScope, hooks: ShapeStyleHooks) {
    this.scope = scope;
    this.hooks = hooks;
  }

  innerShapePreviewPath(
    type: string,
    params: InnerShapeParams,
    previewFrame: 'circle' | 'rect' = 'circle',
    orientation = 0,
    polygonRadiusMode: PolygonRadiusMode = 'inradius',
  ): string {
    const radius = 0.9;
    const steps = 72;
    const f = (x: number, y: number): string => `${x.toFixed(3)},${y.toFixed(3)} `;
    if (type === 'circle') {
      return (
        `M ${radius},0 A ${radius},${radius} 0 1,1 ${-radius},0 ` +
        `A ${radius},${radius} 0 1,1 ${radius},0 Z`
      );
    }
    if (type === 'sector' || type === 'semicircle' || type === 'segment') {
      const sweep = type === 'semicircle' ? 180 : clampSectorAngle(params.sector);
      return type === 'segment' ? segmentPreviewPath(radius, sweep) : sectorPreviewPath(radius, sweep);
    }
    if (type === 'rectangle' || type === 'exportFrame') {
      const h = radius * 0.7;
      return `M ${f(-h, -h)}L ${f(h, -h)}L ${f(h, h)}L ${f(-h, h)}Z`;
    }
    if (previewFrame === 'rect') {
      const e = radius;
      const w = (s: number, t: number): [number, number] => {
        const [rs, rt] = rotST(s, t, orientation);
        return [-e + 2 * e * rs, -e + 2 * e * rt];
      };
      let quad: UnitPoint[] | null = null;
      if (type === 'rightTriangle') quad = [[0, 1], [1, 1], [0, 0]];
      else if (type === 'trapezoid') quad = trapezoidFrameST(squareShear(params.angle));
      else if (type === 'parallelogram') quad = parallelogramFrameST(squareShear(params.angle));
      if (quad) {
        let d = 'M ';
        for (const [s, t] of quad) {
          const [x, y] = w(s, t);
          d += f(x, y);
        }
        return d + 'Z';
      }
    }
    const circumPts = circleInnerShapeUnitPoints(type, params.angle);
    if (circumPts) {
      let d = 'M ';
      for (const [x, y] of circumPts) {
        const [rx, ry] = previewFrame === 'rect' ? rotWell(x, y, orientation) : [x, y];
        d += f(radius * rx, radius * ry);
      }
      return d + 'Z';
    }
    if (type === 'polygon') {
      const sides = params.sides || 6;
      const angleStep = (Math.PI * 2) / sides;
      const alignOffset = polygonRadiusMode === 'inradius' ? angleStep / 2 : 0;
      let d = 'M ';
      for (let i = 0; i < sides; i++) {
        const angle = angleStep * i + alignOffset;
        const [rx, ry] = previewFrame === 'rect'
          ? rotWell(Math.cos(angle), Math.sin(angle), orientation)
          : [Math.cos(angle), Math.sin(angle)];
        d += f(radius * rx, radius * ry);
      }
      return d + 'Z';
    }
    if (type === 'supershape') {
      const { m = 5, n1 = 0.2, n2 = 1.7, n3 = 1.7, a1 = 1, a2 = 1 } = params;
      let d = 'M ';
      for (let i = 0; i <= steps; i++) {
        const phi = (i / steps) * Math.PI * 2;
        const r = supershapeRadius(phi, m, n1, n2, n3, a1, a2);
        const scaledR = radius * (r || 0);
        const [rx, ry] = previewFrame === 'rect'
          ? rotWell(Math.cos(phi), Math.sin(phi), orientation)
          : [Math.cos(phi), Math.sin(phi)];
        d += f(scaledR * rx, scaledR * ry);
      }
      return d + 'Z';
    }
    return 'M 0,0';
  }

  createInnerShape(build: InnerShapeBuild): Item {
    const scope = this.scope;
    const center = build.center;
    const radius = build.radius;
    const styleOrPreview = build.styleOrPreview ?? 'stroke';
    const rotationAngle = build.rotationAngle ?? 0;
    const isPreview = styleOrPreview === 'preview';
    const hasStroke = !isPreview && (styleOrPreview === 'stroke' || styleOrPreview === 'fillstroke');
    const hasFill = !isPreview && (styleOrPreview === 'fill' || styleOrPreview === 'fillstroke');
    let path: Item = null;
    const useCircleInner = build.shapeType != null && build.shapeType.startsWith('circle_');
    const isRect = build.shapeType != null && build.shapeType.startsWith('rectangle_');
    const currentInnerType = useCircleInner
      ? build.circleInnerShapeType
      : isRect ? build.rectangleInnerShapeType : build.innerShapeType;
    const currentInnerParams: InnerShapeParams = useCircleInner
      ? build.circleInnerShapeParams
      : isRect ? build.rectangleInnerShapeParams : build.innerShapeParams;
    let geoRotates = true;
    switch (currentInnerType) {
      case 'circle':
        path = new scope.Path.Circle(center, radius);
        tagCircleOrigin(path, center);
        geoRotates = false;
        break;
      case 'sector':
      case 'semicircle':
      case 'segment': {
        const sweep = currentInnerType === 'semicircle' ? 180 : clampSectorAngle(currentInnerParams.sector);
        path = currentInnerType === 'segment'
          ? this.createSegmentShape(center, radius, sweep, rotationAngle)
          : this.createSectorShape(center, radius, sweep, rotationAngle);
        if (build.shapeType === 'circle_diameter') path.rotate(180, center);
        break;
      }
      case 'rectangle':
        path = new scope.Path.Rectangle({ center, size: new scope.Size(radius * 1.4, radius * 1.4) });
        geoRotates = false;
        break;
      case 'rightTriangle':
      case 'rightTriangleB':
      case 'trapezoid':
      case 'parallelogram':
      case 'rhombus':
      case 'kite': {
        const unit = circleInnerShapeUnitPoints(currentInnerType, currentInnerParams.angle);
        if (unit) path = this.createCircumShape(center, radius, unit, rotationAngle);
        break;
      }
      case 'regularTriangle':
        path = this.createRegularPolygon(center, radius, 3, rotationAngle);
        break;
      case 'regularPolygon':
      case 'polygon':
        path = this.createRegularPolygon(
          center, radius, currentInnerParams.sides || 6, rotationAngle, build.polygonRadiusMode,
        );
        if (build.shapeType === 'circle_diameter') path.rotate(180, center);
        break;
      case 'supershape':
        path = this.createSupershape(center, radius, currentInnerParams, rotationAngle);
        break;
      default:
        break;
    }
    if (path) {
      if (isPreview) {
        path.strokeColor = this.hooks.globalStrokeColor();
        path.strokeWidth = this.hooks.globalStrokeWidth();
        path.strokeDasharray = [3, 3];
        path.opacity = 0.7;
        path.fillColor = null;
      } else {
        path.strokeColor = hasStroke ? this.hooks.globalStrokeColor() : null;
        path.strokeWidth = hasStroke ? this.hooks.globalStrokeWidth() * 0.7 : 0;
        if (hasFill) this.hooks.applyFill(path);
        else path.fillColor = null;
        this.hooks.applyStrokeDash(path);
      }
      this.hooks.applyStrokeGeometry(path);
    }
    return this.hooks.withShapeText(path, isPreview, geoRotates ? 0 : rotationAngle, center);
  }

  createRectFrameShape(build: RectFrameBuild): Item {
    const scope = this.scope;
    const basis = rectFrameBasis(build.frame);
    if (!basis) return null;
    const o = new scope.Point(basis.o.x, basis.o.y);
    const u = new scope.Point(basis.u.x, basis.u.y);
    const v = new scope.Point(basis.v.x, basis.v.y);
    const P0 = (s: number, t: number): Item => o.add(u.multiply(s)).add(v.multiply(t));
    const P = (s: number, t: number): Item => {
      const [rs, rt] = rotST(s, t, build.orientation);
      return P0(rs, rt);
    };
    const isPreview = (build.styleOrPreview ?? 'stroke') === 'preview';
    if (build.innerType === 'rectangle') {
      if (!this.hooks.textModeEnabled()) return null;
      const frame = new scope.Path({ segments: [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], closed: true });
      const text = this.hooks.textForBoundary(frame, isPreview);
      frame.remove();
      return text;
    }
    const params = build.params;
    let path: Item = null;
    switch (build.innerType) {
      case 'rightTriangle':
        path = new scope.Path({ segments: [P(0, 1), P(1, 1), P(0, 0)], closed: true });
        break;
      case 'trapezoid': {
        const quad = trapezoidFrameST(frameAngleShear(basis.u, basis.v, params.angle));
        path = new scope.Path({ segments: quad.map(([s, t]) => P(s, t)), closed: true });
        break;
      }
      case 'parallelogram': {
        const quad = parallelogramFrameST(frameAngleShear(basis.u, basis.v, params.angle));
        path = new scope.Path({ segments: quad.map(([s, t]) => P(s, t)), closed: true });
        break;
      }
      case 'rhombus':
        path = new scope.Path({ segments: [P(0.5, 0), P(1, 0.5), P(0.5, 1), P(0, 0.5)], closed: true });
        break;
      case 'kite':
        path = new scope.Path({
          segments: build.shapeType === 'rectangle_centerline'
            ? [P(0, 0.5), P(1 / 3, 0), P(1, 0.5), P(1 / 3, 1)]
            : [P(0.5, 0), P(1, 1 / 3), P(0.5, 1), P(0, 1 / 3)],
          closed: true,
        });
        break;
      case 'circle':
      case 'polygon': {
        const sides = build.innerType === 'circle' ? 72 : params.sides || 6;
        const start = (build.guideAngle * Math.PI) / 180;
        const unit: UnitPoint[] = [];
        for (let i = 0; i < sides; i++) {
          const a = start + (i / sides) * Math.PI * 2;
          unit.push([Math.cos(a), Math.sin(a)]);
        }
        path = this.pathFromFitted(unit, P);
        break;
      }
      case 'supershape': {
        const { m = 3, n1 = 0.2, n2 = 1.7, n3 = 1.7, a1 = 1, a2 = 1 } = params;
        const unit: UnitPoint[] = [];
        for (let i = 0; i <= SUPERSHAPE_STEPS; i++) {
          const phi = (i / SUPERSHAPE_STEPS) * Math.PI * 2;
          const r = supershapeRadius(phi, m, n1, n2, n3, a1, a2) || 0;
          unit.push([r * Math.cos(phi), r * Math.sin(phi)]);
        }
        path = this.pathFromFitted(unit, P);
        break;
      }
      default:
        break;
    }
    if (!path) return null;
    if (isPreview) {
      path.strokeColor = this.hooks.globalStrokeColor();
      path.strokeWidth = this.hooks.globalStrokeWidth();
      path.strokeDasharray = [3, 3];
      path.opacity = 0.7;
      path.fillColor = null;
    }
    this.hooks.applyStrokeGeometry(path);
    return this.hooks.withShapeText(path, isPreview);
  }

  /**
   * The selected Rect Keys shape fitted to a general quad frame. Mirrors
   * createRectFrameShape, but the (s, t) projection maps over the four
   * quad corners instead of the affine rect basis: bilinear by default, or
   * projective when requested (or forced for circles by perspectiveCircle)
   * and the frame is convex and well-conditioned.
   * Returns null for the plain 'rectangle' setting (the caller deposits the
   * raw quad) and for missing, degenerate, or projectively unusable corners.
   */
  createQuadFrameShape(build: QuadFrameBuild): Item {
    const scope = this.scope;
    const corners = build.corners;
    if (!corners || quadArea(corners) < 1e-6) return null;
    if (build.innerType === 'rectangle') return null;
    const mapping = build.innerType === 'circle' && build.perspectiveCircle
      ? 'projective'
      : (build.mapping ?? 'bilinear');
    const toPt = quadFrameMapper(corners, build.orientation, mapping);
    if (!toPt) return null;
    const P = (s: number, t: number): Item => {
      const q = toPt(s, t);
      return new scope.Point(q.x, q.y);
    };
    const isPreview = (build.styleOrPreview ?? 'stroke') === 'preview';
    const params = build.params;
    let path: Item = null;
    switch (build.innerType) {
      case 'rightTriangle':
        path = new scope.Path({ segments: [P(0, 1), P(1, 1), P(0, 0)], closed: true });
        break;
      case 'trapezoid': {
        const quad = trapezoidFrameST(squareShear(params.angle));
        path = new scope.Path({ segments: quad.map(([s, t]) => P(s, t)), closed: true });
        break;
      }
      case 'parallelogram': {
        const quad = parallelogramFrameST(squareShear(params.angle));
        path = new scope.Path({ segments: quad.map(([s, t]) => P(s, t)), closed: true });
        break;
      }
      case 'rhombus':
        path = new scope.Path({ segments: [P(0.5, 0), P(1, 0.5), P(0.5, 1), P(0, 0.5)], closed: true });
        break;
      case 'kite':
        path = new scope.Path({
          segments: build.shapeType === 'rectangle_centerline'
            ? [P(0, 0.5), P(1 / 3, 0), P(1, 0.5), P(1 / 3, 1)]
            : [P(0.5, 0), P(1, 1 / 3), P(0.5, 1), P(0, 1 / 3)],
          closed: true,
        });
        break;
      case 'circle':
      case 'polygon': {
        const sides = build.innerType === 'circle' ? 72 : params.sides || 6;
        const start = (build.guideAngle * Math.PI) / 180;
        const unit: UnitPoint[] = [];
        for (let i = 0; i < sides; i++) {
          const a = start + (i / sides) * Math.PI * 2;
          unit.push([Math.cos(a), Math.sin(a)]);
        }
        path = this.pathFromFitted(unit, P);
        break;
      }
      case 'supershape': {
        const { m = 3, n1 = 0.2, n2 = 1.7, n3 = 1.7, a1 = 1, a2 = 1 } = params;
        const unit: UnitPoint[] = [];
        for (let i = 0; i <= SUPERSHAPE_STEPS; i++) {
          const phi = (i / SUPERSHAPE_STEPS) * Math.PI * 2;
          const r = supershapeRadius(phi, m, n1, n2, n3, a1, a2) || 0;
          unit.push([r * Math.cos(phi), r * Math.sin(phi)]);
        }
        path = this.pathFromFitted(unit, P);
        break;
      }
      default:
        break;
    }
    if (!path) return null;
    if (isPreview) {
      path.strokeColor = this.hooks.globalStrokeColor();
      path.strokeWidth = this.hooks.globalStrokeWidth();
      path.strokeDasharray = [3, 3];
      path.opacity = 0.7;
      path.fillColor = null;
    }
    this.hooks.applyStrokeGeometry(path);
    return this.hooks.withShapeText(path, isPreview);
  }

  createCircumShape(center: Item, radius: number, unitPoints: UnitPoint[], rotationAngle = 0): Item {
    const scope = this.scope;
    const rot = (rotationAngle * Math.PI) / 180;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const path = new scope.Path();
    for (const [x, y] of unitPoints) {
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      path.add(center.add(new scope.Point(rx * radius, ry * radius)));
    }
    path.closed = true;
    tagCircleOrigin(path, center);
    return path;
  }

  createSectorShape(center: Item, radius: number, sweepDeg: number, rotationAngle = 0): Item {
    return this.arcShape(center, radius, sweepDeg, rotationAngle, true);
  }

  createSegmentShape(center: Item, radius: number, sweepDeg: number, rotationAngle = 0): Item {
    return this.arcShape(center, radius, sweepDeg, rotationAngle, false);
  }

  createRegularPolygon(
    center: Item, radius: number, sides: number, rotationAngle = 0, radiusMode = 'circumradius',
  ): Item {
    const scope = this.scope;
    const angleStep = (Math.PI * 2) / sides;
    const startAngle = (rotationAngle * Math.PI) / 180;
    const actualRadius = radiusMode === 'circumradius' ? radius : radius / Math.cos(Math.PI / sides);
    const path = new scope.Path();
    for (let i = 0; i < sides; i++) {
      const angle = startAngle + i * angleStep;
      path.add(center.add(new scope.Point(Math.cos(angle) * actualRadius, Math.sin(angle) * actualRadius)));
    }
    if (radiusMode === 'inradius') path.rotate(360 / sides / 2, center);
    path.closed = true;
    tagCircleOrigin(path, center);
    return path;
  }

  createSupershape(center: Item, radius: number, params: InnerShapeParams, rotationAngle = 0): Item {
    const scope = this.scope;
    const rotationRad = (rotationAngle * Math.PI) / 180;
    const path = new scope.Path();
    const { m = 3, n1 = 0.2, n2 = 1.7, n3 = 1.7, a1 = 1, a2 = 1 } = params;
    for (let i = 0; i <= SUPERSHAPE_STEPS; i++) {
      const phi = (i / SUPERSHAPE_STEPS) * Math.PI * 2;
      const r = supershapeRadius(phi, m, n1, n2, n3, a1, a2);
      const scaledR = radius * (r || 0);
      path.add(new scope.Point(
        center.x + scaledR * Math.cos(phi + rotationRad),
        center.y + scaledR * Math.sin(phi + rotationRad),
      ));
    }
    path.closed = true;
    this.hooks.applyStrokeGeometry(path);
    tagCircleOrigin(path, center);
    return path;
  }

  private arcShape(center: Item, radius: number, sweepDeg: number, rotationAngle: number, pie: boolean): Item {
    const scope = this.scope;
    const sweep = clampSectorAngle(sweepDeg);
    const start = (rotationAngle * Math.PI) / 180;
    const end = start + (sweep * Math.PI) / 180;
    const mid = (start + end) / 2;
    const pt = (ang: number): Item => center.add(new scope.Point(Math.cos(ang) * radius, Math.sin(ang) * radius));
    const path = new scope.Path();
    if (pie) path.moveTo(center);
    else path.moveTo(pt(start));
    if (pie) path.lineTo(pt(start));
    path.arcTo(pt(mid), pt(end));
    path.closed = true;
    tagCircleOrigin(path, center);
    return path;
  }

  private pathFromFitted(unit: UnitPoint[], P: (s: number, t: number) => Item): Item {
    const fitted = fitUnitCoords(unit);
    if (!fitted) return null;
    const path = new this.scope.Path();
    for (const [s, t] of fitted) path.add(P(s, t));
    path.closed = true;
    return path;
  }

  drawInnerShape(frameItem: Item, style: string, draw: InnerFrameDraw): void {
    const scope = this.scope;
    if (
      (draw.shapeType != null &&
        draw.shapeType.startsWith('rectangle_') &&
        draw.rectangleInnerShapeType === 'rectangle') ||
      (!draw.shapeType && draw.innerShapeType === 'none') ||
      draw.quadActive
    ) {
      return;
    }
    const strokeW = frameItem.strokeWidth || draw.globalStrokeWidth;
    let center: Item;
    let iradius: number;
    if (typeof frameItem.radius !== 'undefined') {
      center = frameItem.position;
      iradius = Math.max(0, frameItem.radius - strokeW / 2);
      const innerPath = draw.buildInner(center, iradius, style, draw.guideAngle);
      if (innerPath) {
        innerPath.selected = false;
        draw.addToActive(innerPath);
      }
      return;
    }
    const bounds = frameItem.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    const inset = strokeW * 1.5;
    const innerBounds = new scope.Rectangle(
      bounds.x + inset,
      bounds.y + inset,
      bounds.width - 2 * inset,
      bounds.height - 2 * inset,
    );
    if (innerBounds.width <= 0 || innerBounds.height <= 0) return;
    center = innerBounds.center;
    iradius = (Math.min(innerBounds.width, innerBounds.height) / 2) * 0.9;
    const innerPath = draw.buildInner(center, iradius, style, draw.guideAngle);
    if (innerPath) {
      innerPath.selected = false;
      draw.addToActive(innerPath);
    }
  }
}

export function sectorPreviewPath(radius: number, sweepDeg: number): string {
  const sweep = clampSectorAngle(sweepDeg);
  const a = (sweep * Math.PI) / 180;
  const x2 = radius * Math.cos(a);
  const y2 = radius * Math.sin(a);
  const large = sweep > 180 ? 1 : 0;
  return (
    `M 0,0 L ${radius.toFixed(3)},0 ` +
    `A ${radius.toFixed(3)},${radius.toFixed(3)} 0 ${large},1 ` +
    `${x2.toFixed(3)},${y2.toFixed(3)} Z`
  );
}

export function segmentPreviewPath(radius: number, sweepDeg: number): string {
  const sweep = clampSectorAngle(sweepDeg);
  const a = (sweep * Math.PI) / 180;
  const x2 = radius * Math.cos(a);
  const y2 = radius * Math.sin(a);
  const large = sweep > 180 ? 1 : 0;
  return (
    `M ${radius.toFixed(3)},0 ` +
    `A ${radius.toFixed(3)},${radius.toFixed(3)} 0 ${large},1 ` +
    `${x2.toFixed(3)},${y2.toFixed(3)} Z`
  );
}

export interface DescribeInner {
  innerType: string;
  params: InnerShapeParams;
  polygonRadiusMode: PolygonRadiusMode;
  shapeType: string | null;
  center: Vec2;
  radius: number;
  rotation: number;
}

/** Semantic record for a circle-keys (or legacy) inner shape, or null. */
export function describeInnerShape(input: DescribeInner): NGShape | null {
  const { innerType, params, center, radius, rotation } = input;
  if (!(radius > 0)) return null;
  if (innerType === 'circle') return { type: 'circle', center: { ...center }, radius };
  if (innerType === 'polygon' || innerType === 'regularPolygon' || innerType === 'regularTriangle') {
    const sides = innerType === 'regularTriangle' ? 3 : params.sides || 6;
    let rotationOut = rotation;
    let radiusOut = radius;
    if (input.polygonRadiusMode === 'inradius') {
      radiusOut = radius / Math.cos(Math.PI / sides);
      rotationOut += 360 / sides / 2;
    }
    if (input.shapeType === 'circle_diameter') rotationOut += 180;
    return { type: 'regularPolygon', center: { ...center }, radius: radiusOut, sides, rotation: rotationOut };
  }
  if (innerType === 'supershape') {
    return {
      type: 'supershape',
      center: { ...center },
      scale: { x: radius, y: radius },
      rotation,
      m: params.m ?? 3, n1: params.n1 ?? 0.2, n2: params.n2 ?? 1.7, n3: params.n3 ?? 1.7,
      a: params.a1 ?? 1, b: params.a2 ?? 1,
    };
  }
  if (innerType === 'sector' || innerType === 'semicircle' || innerType === 'segment' || innerType === 'rectangle') {
    return null;
  }
  const unit = circleInnerShapeUnitPoints(innerType, params.angle);
  if (!unit) return null;
  return shapeFromVertices(placeUnitPoints(center, radius, unit, rotation));
}

export interface DescribeFrame {
  innerType: string;
  params: InnerShapeParams;
  shapeType: string | null;
  orientation: number;
  frame: RectFrameInput;
}

/** Semantic record for a rectangle-frame inner shape. Uniform-scale types return null. */
export function describeRectFrame(input: DescribeFrame): NGShape | null {
  const basis = rectFrameBasis(input.frame);
  if (!basis) return null;
  const at = (s: number, t: number): Vec2 => framePoint(basis, s, t, input.orientation);
  switch (input.innerType) {
    case 'rightTriangle':
      return shapeFromVertices([at(0, 1), at(1, 1), at(0, 0)]);
    case 'trapezoid':
      return shapeFromVertices(trapezoidFrameST(frameAngleShear(basis.u, basis.v, input.params.angle)).map(([s, t]) => at(s, t)));
    case 'parallelogram':
      return shapeFromVertices(parallelogramFrameST(frameAngleShear(basis.u, basis.v, input.params.angle)).map(([s, t]) => at(s, t)));
    case 'rhombus':
      return shapeFromVertices([at(0.5, 0), at(1, 0.5), at(0.5, 1), at(0, 0.5)]);
    case 'kite':
      return shapeFromVertices(input.shapeType === 'rectangle_centerline'
        ? [at(0, 0.5), at(1 / 3, 0), at(1, 0.5), at(1 / 3, 1)]
        : [at(0.5, 0), at(1, 1 / 3), at(0.5, 1), at(0, 1 / 3)]);
    default:
      return null;
  }
}

function shapeFromVertices(vertices: Vec2[]): NGShape | null {
  const pts = vertices.map((p) => ({ x: p.x, y: p.y }));
  if (pts.length < 3) return null;
  if (pts.length === 3) return { type: 'polygon', vertices: pts };
  if (pts.length !== 4) return { type: 'polygon', vertices: pts };
  const para = asParallelogram(pts);
  if (para) return para;
  const trap = asTrapezoid(pts);
  if (trap) return trap;
  return { type: 'quadrilateral', vertices: [pts[0], pts[1], pts[2], pts[3]] };
}

function asParallelogram(pts: [Vec2, Vec2, Vec2, Vec2] | Vec2[]): NGShape | null {
  const [a, b, c, d] = pts;
  const edge1 = { x: b.x - a.x, y: b.y - a.y };
  const edge2 = { x: d.x - a.x, y: d.y - a.y };
  const gapX = c.x - (a.x + edge1.x + edge2.x);
  const gapY = c.y - (a.y + edge1.y + edge2.y);
  if (Math.hypot(gapX, gapY) > 1e-6) return null;
  if (Math.abs(edge1.x * edge2.y - edge1.y * edge2.x) < 1e-9) return null;
  return { type: 'parallelogram', origin: { ...a }, edge1, edge2 };
}

function asTrapezoid(pts: Vec2[]): NGShape | null {
  const [a, b, c, d] = pts;
  const bottomY = d.y;
  if (Math.abs(a.y - b.y) > 1e-6 || Math.abs(c.y - d.y) > 1e-6) return null;
  if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) return null;
  const height = bottomY - a.y;
  if (!(height > 0)) return null;
  const bottomWidth = b.x - a.x;
  const topWidth = c.x - d.x;
  if (!(bottomWidth > 0) || !(topWidth > 0)) return null;
  return {
    type: 'trapezoid',
    origin: { x: a.x, y: a.y },
    bottomWidth,
    topWidth,
    height,
    topOffset: d.x - a.x,
  };
}
