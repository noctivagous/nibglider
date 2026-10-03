// Pure model -> derived geometry. Owns no caches or scene state and never
// mutates source parameters. Semantic interpolation is deliberately deferred
// to Phase 4b, and text/image/group rendering to their later services.
import type { NGPath } from '../model/NGPath';
import type { NGShape } from '../model/NGShape';
import type { NGDrawable } from '../model/NGDrawable';
import type { BezierSegment, ResolvedVectorGeometry, Vec2 } from '../model/geometryResolution';
import { validateDrawable, validatePath } from '../model/serialization';

export class GeometryResolutionError extends Error {
  constructor(message: string) { super(message); this.name = 'GeometryResolutionError'; }
}

export function resolvePath(path: NGPath): ResolvedVectorGeometry {
  validatePath(path);
  if (path.mode !== 'bezier') throw new GeometryResolutionError(`Interpolation for ${path.mode} is not implemented yet`);
  const paths = path.contours.map((contour) => ({
    kind: 'path' as const, closed: contour.closed,
    segments: structuredClone(contour.segments),
  }));
  // Even a single contour may rely on even-odd winding (self intersections).
  if (paths.length === 1 && path.fillRule === 'nonzero') return paths[0];
  return { kind: 'compoundPath', paths, fillRule: path.fillRule };
}

function polygon(vertices: Vec2[]): ResolvedVectorGeometry {
  return { kind: 'path', closed: true, segments: vertices.map((point) => ({
    point: { ...point }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 },
  })) };
}
function resolveShape(shape: NGShape): ResolvedVectorGeometry {
  switch (shape.type) {
    case 'circle': {
      const { center, radius } = shape;
      const k = radius * 4 * (Math.SQRT2 - 1) / 3;
      const segments: BezierSegment[] = [
        { point: { x: center.x + radius, y: center.y }, handleIn: { x: 0, y: -k }, handleOut: { x: 0, y: k } },
        { point: { x: center.x, y: center.y + radius }, handleIn: { x: k, y: 0 }, handleOut: { x: -k, y: 0 } },
        { point: { x: center.x - radius, y: center.y }, handleIn: { x: 0, y: k }, handleOut: { x: 0, y: -k } },
        { point: { x: center.x, y: center.y - radius }, handleIn: { x: -k, y: 0 }, handleOut: { x: k, y: 0 } },
      ];
      return { kind: 'path', closed: true, segments };
    }
    case 'regularPolygon': {
      const vertices = Array.from({ length: shape.sides }, (_, i) => {
        const angle = shape.rotation * Math.PI / 180 + i * 2 * Math.PI / shape.sides;
        return { x: shape.center.x + shape.radius * Math.cos(angle), y: shape.center.y + shape.radius * Math.sin(angle) };
      });
      return polygon(vertices);
    }
    case 'polygon':
    case 'quadrilateral': return polygon(shape.vertices);
    case 'parallelogram': {
      const { origin: o, edge1: a, edge2: b } = shape;
      return polygon([o, { x: o.x + a.x, y: o.y + a.y }, { x: o.x + a.x + b.x, y: o.y + a.y + b.y }, { x: o.x + b.x, y: o.y + b.y }]);
    }
    case 'trapezoid': {
      const { origin: o, bottomWidth: w, topWidth: t, height: h, topOffset: x } = shape;
      return polygon([o, { x: o.x + w, y: o.y }, { x: o.x + x + t, y: o.y + h }, { x: o.x + x, y: o.y + h }]);
    }
    case 'supershape': throw new GeometryResolutionError('Supershape resolution is deferred to the geometry extraction');
  }
}

export function resolveDrawableGeometry(drawable: NGDrawable): ResolvedVectorGeometry {
  validateDrawable(drawable);
  if (drawable.kind === 'path') return resolvePath(drawable.source);
  if (drawable.kind === 'shape') return resolveShape(drawable.source);
  throw new GeometryResolutionError(`${drawable.kind} requires its own geometry/rendering service`);
}
