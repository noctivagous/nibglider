// Validated record serialization, not a native-document file format. No IO,
// migrations, scene objects, or external asset loading. Unknown fields and
// non-plain objects are rejected so Paper items cannot become document truth.
import type { NGDrawable } from './NGDrawable';
import type { NGPath } from './NGPath';

export class ModelValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ModelValidationError'; }
}
function requireValue(condition: boolean, path: string, expected: string): void {
  if (!condition) throw new ModelValidationError(`${path}: expected ${expected}`);
}
function record(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'plain record');
  const object = value as Record<string, unknown>;
  requireValue(Object.getPrototypeOf(object) === Object.prototype || Object.getPrototypeOf(object) === null, path, 'plain record');
  for (const key of Object.keys(object)) requireValue(keys.includes(key), `${path}.${key}`, 'known model field');
  return object;
}
function number(value: unknown, path: string, min = -Infinity, max = Infinity): void {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, path, `finite number in [${min}, ${max}]`);
}
function positive(value: unknown, path: string): void {
  number(value, path, 0);
  requireValue((value as number) > 0, path, 'positive number');
}
function string(value: unknown, path: string, nonempty = true): void {
  requireValue(typeof value === 'string' && (!nonempty || value.trim().length > 0), path, 'string');
}
function bool(value: unknown, path: string): void { requireValue(typeof value === 'boolean', path, 'boolean'); }
function choice(value: unknown, path: string, values: unknown[]): void { requireValue(values.includes(value), path, values.join(' | ')); }
function array(value: unknown, path: string): unknown[] {
  requireValue(Array.isArray(value), path, 'array');
  return value as unknown[];
}
function vec(value: unknown, path: string): void {
  const v = record(value, path, ['x', 'y']);
  number(v.x, `${path}.x`); number(v.y, `${path}.y`);
}
function points(value: unknown, path: string): unknown[] {
  const items = array(value, path);
  items.forEach((point, i) => vec(point, `${path}[${i}]`));
  return items;
}
export function validatePath(value: unknown, path = 'path'): asserts value is NGPath {
  const p = record(value, path, ['id', 'mode', 'contours', 'fillRule', 'closed', 'points', 'degree', 'tension',
    'spine', 'width', 'cap', 'join', 'miterLimit', 'dashLength', 'gapLength', 'position']);
  string(p.id, `${path}.id`);
  choice(p.mode, `${path}.mode`, ['bezier', 'bSpline', 'ngComposite', 'smoothedPolyline', 'outlinedStroke']);
  if (p.mode === 'outlinedStroke') {
    record(p, path, ['id', 'mode', 'spine', 'width', 'cap', 'join', 'miterLimit', 'dashLength', 'gapLength', 'position']);
    validatePath(p.spine, `${path}.spine`);
    const spine = p.spine as unknown as Record<string, unknown>;
    requireValue(spine.mode !== 'outlinedStroke' && spine.mode !== 'smoothedPolyline', `${path}.spine.mode`, 'non-nested resolvable spine');
    positive(p.width, `${path}.width`);
    choice(p.cap, `${path}.cap`, ['butt', 'round', 'square']);
    choice(p.join, `${path}.join`, ['miter', 'round', 'bevel']);
    number(p.miterLimit, `${path}.miterLimit`, 1);
    number(p.dashLength, `${path}.dashLength`, 0);
    number(p.gapLength, `${path}.gapLength`, 0);
    choice(p.position, `${path}.position`, ['center', 'inside', 'outside']);
    return;
  }
  if (p.mode === 'bezier') {
    record(p, path, ['id', 'mode', 'contours', 'fillRule']);
    choice(p.fillRule, `${path}.fillRule`, ['nonzero', 'evenodd']);
    array(p.contours, `${path}.contours`).forEach((contour, i) => {
      const name = `${path}.contours[${i}]`;
      const c = record(contour, name, ['closed', 'segments']);
      bool(c.closed, `${name}.closed`);
      array(c.segments, `${name}.segments`).forEach((segment, j) => {
        const label = `${name}.segments[${j}]`;
        const s = record(segment, label, ['point', 'handleIn', 'handleOut']);
        vec(s.point, `${label}.point`); vec(s.handleIn, `${label}.handleIn`); vec(s.handleOut, `${label}.handleOut`);
      });
    });
    return;
  }
  bool(p.closed, `${path}.closed`);
  if (p.mode === 'bSpline' || p.mode === 'smoothedPolyline') {
    record(p, path, ['id', 'mode', 'closed', 'points', p.mode === 'bSpline' ? 'degree' : 'tension']);
    points(p.points, `${path}.points`);
    if (p.mode === 'bSpline') choice(p.degree, `${path}.degree`, [3]);
    else number(p.tension, `${path}.tension`, 0, 1);
    return;
  }
  record(p, path, ['id', 'mode', 'closed', 'points']);
  const ids = new Set<string>();
  const semantic = array(p.points, `${path}.points`);
  semantic.forEach((point, i) => {
    const name = `${path}.points[${i}]`;
    const q = record(point, name, ['id', 'x', 'y', 'kind', 'corner', 'outgoing']);
    string(q.id, `${name}.id`);
    requireValue(!ids.has(q.id as string), `${name}.id`, 'unique point ID'); ids.add(q.id as string);
    number(q.x, `${name}.x`); number(q.y, `${name}.y`);
    choice(q.kind, `${name}.kind`, ['bSpline', 'hardCorner', 'roundedCorner', 'line', 'bowedLine', 'arcByThreeStart', 'arcByThreeEnd']);
    if (q.corner !== undefined) {
      requireValue(q.kind === 'roundedCorner', `${name}.corner`, 'roundedCorner point');
      const c = record(q.corner, `${name}.corner`, ['rounding', 'radius']);
      choice(c.rounding, `${name}.corner.rounding`, ['arc', 'bSpline', 'bevel']); number(c.radius, `${name}.corner.radius`, 0);
    }
    if (q.outgoing !== undefined) {
      const o = record(q.outgoing, `${name}.outgoing`, ['kind', 'bowOffset', 'bowFacing']);
      choice(o.kind, `${name}.outgoing.kind`, ['inherit', 'line', 'bSpline', 'bowedLine', 'arc']);
      if (o.bowOffset !== undefined) { requireValue(o.kind === 'bowedLine', name, 'bowedLine segment for bowOffset'); number(o.bowOffset, `${name}.bowOffset`); }
      if (o.bowFacing !== undefined) { requireValue(o.kind === 'bowedLine', name, 'bowedLine segment for bowFacing'); choice(o.bowFacing, `${name}.bowFacing`, ['left', 'right']); }
    }
    if (q.kind === 'arcByThreeStart') {
      requireValue(i + 1 < semantic.length && (semantic[i + 1] as Record<string, unknown>)?.kind === 'arcByThreeEnd', name, 'paired adjacent arc end');
    }
    if (q.kind === 'arcByThreeEnd') {
      requireValue(i > 0 && (semantic[i - 1] as Record<string, unknown>)?.kind === 'arcByThreeStart', name, 'paired adjacent arc start');
    }
  });
}

function validateShape(value: unknown, path: string): void {
  const s = record(value, path, ['type', 'center', 'radius', 'sides', 'rotation', 'vertices', 'origin', 'edge1', 'edge2', 'bottomWidth', 'topWidth', 'height', 'topOffset', 'scale', 'm', 'n1', 'n2', 'n3', 'a', 'b']);
  switch (s.type) {
    case 'circle':
    case 'regularPolygon':
      record(s, path, s.type === 'circle' ? ['type', 'center', 'radius'] : ['type', 'center', 'radius', 'sides', 'rotation']);
      vec(s.center, `${path}.center`); positive(s.radius, `${path}.radius`);
      if (s.type === 'regularPolygon') { number(s.sides, `${path}.sides`, 3); requireValue(Number.isSafeInteger(s.sides), `${path}.sides`, 'integer sides'); number(s.rotation, `${path}.rotation`); }
      return;
    case 'polygon':
    case 'quadrilateral': {
      record(s, path, ['type', 'vertices']);
      const vertices = points(s.vertices, `${path}.vertices`);
      requireValue(s.type === 'polygon' ? vertices.length >= 3 : vertices.length === 4, `${path}.vertices`, s.type === 'polygon' ? 'at least three vertices' : 'four vertices');
      return;
    }
    case 'parallelogram': {
      record(s, path, ['type', 'origin', 'edge1', 'edge2']);
      vec(s.origin, `${path}.origin`); vec(s.edge1, `${path}.edge1`); vec(s.edge2, `${path}.edge2`);
      const a = s.edge1 as { x: number; y: number }; const b = s.edge2 as { x: number; y: number };
      requireValue(a.x * b.y - a.y * b.x !== 0, path, 'non-collinear edges');
      return;
    }
    case 'trapezoid':
      record(s, path, ['type', 'origin', 'bottomWidth', 'topWidth', 'height', 'topOffset']);
      vec(s.origin, `${path}.origin`); positive(s.bottomWidth, `${path}.bottomWidth`); positive(s.topWidth, `${path}.topWidth`); positive(s.height, `${path}.height`); number(s.topOffset, `${path}.topOffset`);
      return;
    case 'supershape':
      record(s, path, ['type', 'center', 'scale', 'rotation', 'm', 'n1', 'n2', 'n3', 'a', 'b']);
      vec(s.center, `${path}.center`); vec(s.scale, `${path}.scale`);
      for (const key of ['rotation', 'm', 'n2', 'n3']) number(s[key], `${path}.${key}`);
      for (const key of ['n1', 'a', 'b']) positive(s[key], `${path}.${key}`);
      return;
    default: throw new ModelValidationError(`${path}.type: unsupported shape`);
  }
}

export function validateDrawable(value: unknown): asserts value is NGDrawable {
  const d = record(value, 'drawable', ['id', 'kind', 'layerId', 'transform', 'opacity', 'visible', 'locked', 'name', 'styleId', 'source']);
  string(d.id, 'drawable.id'); string(d.layerId, 'drawable.layerId');
  if (d.name !== undefined) string(d.name, 'drawable.name', false);
  if (d.styleId !== undefined) string(d.styleId, 'drawable.styleId');
  const transform = record(d.transform, 'drawable.transform', ['a', 'b', 'c', 'd', 'tx', 'ty']);
  for (const key of ['a', 'b', 'c', 'd', 'tx', 'ty']) number(transform[key], `drawable.transform.${key}`);
  number(d.opacity, 'drawable.opacity', 0, 1); bool(d.visible, 'drawable.visible'); bool(d.locked, 'drawable.locked');
  switch (d.kind) {
    case 'path': validatePath(d.source, 'drawable.source'); return;
    case 'shape': validateShape(d.source, 'drawable.source'); return;
    case 'text': {
      const t = record(d.source, 'drawable.source', ['content', 'fontFamily', 'fontSize', 'fontWeight', 'italic', 'layout', 'pathId']);
      string(t.content, 'text.content', false); string(t.fontFamily, 'text.fontFamily'); positive(t.fontSize, 'text.fontSize'); string(t.fontWeight, 'text.fontWeight'); bool(t.italic, 'text.italic'); choice(t.layout, 'text.layout', ['display', 'body', 'path']);
      if (t.pathId !== undefined) string(t.pathId, 'text.pathId');
      if (t.layout === 'path') string(t.pathId, 'text.pathId');
      return;
    }
    case 'image': {
      const image = record(d.source, 'drawable.source', ['assetId', 'assetKind', 'width', 'height', 'boundary', 'mask']);
      string(image.assetId, 'image.assetId'); choice(image.assetKind, 'image.assetKind', ['raster', 'svg']); positive(image.width, 'image.width'); positive(image.height, 'image.height');
      if (image.boundary !== undefined) validatePath(image.boundary, 'image.boundary');
      if (image.mask !== undefined) validatePath(image.mask, 'image.mask');
      return;
    }
    case 'group': {
      const group = record(d.source, 'drawable.source', ['childIds', 'interlace']);
      const ids = array(group.childIds, 'group.childIds');
      ids.forEach((id) => { string(id, 'group.childId'); requireValue(id !== d.id, 'group.childId', 'child other than self'); });
      requireValue(new Set(ids).size === ids.length, 'group.childIds', 'unique IDs');
      if (group.interlace !== undefined) {
        const ix = record(group.interlace, 'group.interlace', ['phase', 'padding', 'firstId']);
        choice(ix.phase, 'group.interlace.phase', [0, 1]);
        number(ix.padding, 'group.interlace.padding', 0);
        string(ix.firstId, 'group.interlace.firstId');
        requireValue((ids as unknown[]).includes(ix.firstId), 'group.interlace.firstId', 'member ID');
      }
      return;
    }
    default: throw new ModelValidationError('drawable.kind: unsupported drawable');
  }
}
export function serializeDrawable(drawable: NGDrawable): string {
  validateDrawable(drawable);
  return JSON.stringify(drawable);
}
export function deserializeDrawable(json: string): NGDrawable {
  const value: unknown = JSON.parse(json);
  validateDrawable(value);
  return value;
}
