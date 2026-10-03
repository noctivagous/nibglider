import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import paper from 'paper';
import { deserializeDrawable, serializeDrawable, ModelValidationError } from '../src/engine/model/serialization.ts';
import { resolveDrawableGeometry, GeometryResolutionError } from '../src/engine/geometry/pathResolver.ts';
import { DrawableRenderer } from '../src/engine/scene/DrawableRenderer.ts';

const fixture = (name) => deserializeDrawable(readFileSync(new URL(`./fixtures/${name}-drawable.json`, import.meta.url), 'utf8'));
const roundTrip = (model) => deserializeDrawable(serializeDrawable(model));
const point = (p) => ({ x: p.x, y: p.y });
function scene() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 300));
  const layer = scope.project.activeLayer;
  const renderer = new DrawableRenderer(scope, {
    layerForId: (id) => id === 'artwork' ? layer : null,
    styleForId: (id) => id === 'blue-stroke' ? { strokeColor: '#107cff', fillColor: null, strokeWidth: 4 } : undefined,
  });
  return { scope, layer, renderer };
}
function square(x, y, size) {
  return { closed: true, segments: [[x, y], [x + size, y], [x + size, y + size], [x, y + size]].map(([x, y]) => ({
    point: { x, y }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 },
  })) };
}

test('Bézier, circle, and composite fixtures retain exact authoring data through JSON', () => {
  for (const name of ['bezier', 'circle', 'composite']) {
    const model = fixture(name);
    assert.deepEqual(roundTrip(model), model);
  }
});

test('renderer preserves relative handles, style, and drawable identity', () => {
  const { scope, renderer, layer } = scene();
  try {
    const model = fixture('bezier');
    const item = renderer.render(model);
    assert.equal(item.parent, layer);
    assert.equal(item.closed, false);
    assert.equal(item.strokeWidth, 4);
    assert.equal(item.strokeColor.toCSS(true), '#107cff');
    assert.equal(item.fillColor, null);
    for (let i = 0; i < item.segments.length; i++) {
      const source = model.source.contours[0].segments[i];
      assert.deepEqual(point(item.segments[i].point), source.point);
      assert.deepEqual(point(item.segments[i].handleIn), source.handleIn);
      assert.deepEqual(point(item.segments[i].handleOut), source.handleOut);
    }
    assert.equal(item.data.drawableId, model.id);
    assert.equal(renderer.drawableIdOf(item), model.id);
    assert.equal(renderer.getItem(model.id), item);
  } finally { scope.project.remove(); }
});

test('mutating resolved geometry or Paper segments never changes authoring truth; rebuild restores it', () => {
  const { scope, renderer, layer } = scene();
  try {
    const model = fixture('bezier');
    const before = serializeDrawable(model);
    const resolved = resolveDrawableGeometry(model);
    resolved.segments[0].point.x = 999;
    const first = renderer.render(model);
    first.segments[0].point.x = 777;
    assert.equal(serializeDrawable(model), before);
    const rebuilt = renderer.render(roundTrip(model));
    assert.equal(first.parent, null);
    assert.equal(renderer.drawableIdOf(first), null);
    assert.equal(rebuilt.segments[0].point.x, 10);
    assert.equal(layer.children.length, 1);
    renderer.clear();
    assert.equal(layer.children.length, 0);
    assert.equal(renderer.getItem(model.id), undefined);
  } finally { scope.project.remove(); }
});

test('semantic circle derives four cubic curves, retains radius, and rebuilds with new parameters', () => {
  const { scope, renderer } = scene();
  try {
    const model = fixture('circle');
    const item = renderer.render(model);
    assert.equal(item.closed, true);
    assert.equal(item.segments.length, 4);
    assert.equal(item.bounds.width, 60);
    assert.equal(item.bounds.height, 60);
    assert.deepEqual(point(item.bounds.center), { x: 120, y: 80 });
    assert.equal(model.source.radius, 30);
    model.source.radius = 45;
    assert.equal(renderer.render(roundTrip(model)).bounds.width, 90);
    assert.equal(model.source.type, 'circle');
  } finally { scope.project.remove(); }
});

test('affine transforms and page-item flags apply once on every rebuild', () => {
  const { scope, renderer } = scene();
  try {
    const model = fixture('circle');
    model.transform = { a: 2, b: 0, c: 0, d: 3, tx: 10, ty: -5 };
    model.visible = false; model.locked = true;
    for (let i = 0; i < 2; i++) {
      const item = renderer.render(model);
      assert.deepEqual(point(item.bounds.center), { x: 250, y: 235 });
      assert.equal(item.bounds.width, 120); assert.equal(item.bounds.height, 180);
      assert.equal(item.visible, false); assert.equal(item.locked, true);
      assert.equal(item.opacity, 0.8); assert.equal(item.name, 'Parametric circle');
    }
    assert.deepEqual(model.source.center, { x: 120, y: 80 });
  } finally { scope.project.remove(); }
});

test('compound paths retain an even-odd hole, closure, and child identity', () => {
  const { scope, renderer } = scene();
  try {
    const model = fixture('bezier');
    model.source.fillRule = 'evenodd';
    model.source.contours = [square(0, 0, 100), square(25, 25, 50)];
    const item = renderer.render(roundTrip(model));
    assert.equal(item.className, 'CompoundPath');
    assert.equal(item.fillRule, 'evenodd');
    assert.equal(item.children.length, 2);
    assert.equal(item.contains(new scope.Point(10, 10)), true);
    assert.equal(item.contains(new scope.Point(50, 50)), false);
    for (const child of item.children) {
      assert.equal(child.closed, true);
      assert.equal(child.data.drawableId, model.id);
      assert.equal(renderer.drawableIdOf(child), model.id);
    }
  } finally { scope.project.remove(); }
});

test('missing layers, foreign-project layers, styles, and unsupported sources leave the scene intact', () => {
  const { scope, renderer, layer } = scene();
  try {
    const model = fixture('bezier');
    const item = renderer.render(model);
    for (const invalid of [
      { ...model, layerId: 'missing' }, { ...model, styleId: 'missing' },
      { ...model, source: fixture('composite').source },
    ]) assert.throws(() => renderer.render(invalid));
    assert.equal(renderer.getItem(model.id), item);
    assert.equal(item.parent, layer);
    assert.equal(layer.children.length, 1);
    const other = new paper.PaperScope(); other.setup(new other.Size(400, 300));
    try {
      const foreign = new DrawableRenderer(scope, { layerForId: () => other.project.activeLayer });
      assert.throws(() => foreign.render(fixture('circle')), /No layer in this project/);
    } finally { other.project.remove(); }
  } finally { scope.project.remove(); }
});

test('future semantic modes retain parameters but cannot silently render as a different path mode', () => {
  const composite = fixture('composite');
  assert.equal(composite.source.points[2].corner.radius, 12);
  const base = fixture('bezier');
  for (const source of [composite.source,
    { id: 'spline', mode: 'bSpline', degree: 3, closed: false, points: [{ x: 0, y: 0 }] },
    { id: 'smooth', mode: 'smoothedPolyline', tension: 0.4, closed: false, points: [{ x: 0, y: 0 }] },
  ]) {
    const model = roundTrip({ ...base, source });
    assert.deepEqual(model.source, source);
    assert.throws(() => resolveDrawableGeometry(model), GeometryResolutionError);
  }
});

test('text, raster/SVG image, and group records round-trip without pretending to be vector paths', () => {
  const base = fixture('circle');
  const records = [
    { ...base, kind: 'text', source: { content: 'Editable', fontFamily: 'Arial', fontSize: 12, fontWeight: '400', italic: false, layout: 'body' } },
    ...['raster', 'svg'].map((assetKind) => ({ ...base, kind: 'image', source: { assetId: 'asset-1', assetKind, width: 640, height: 480, mask: fixture('bezier').source } })),
    { ...base, kind: 'group', source: { childIds: ['child-2', 'child-1'] } },
  ];
  for (const model of records) {
    assert.deepEqual(roundTrip(model), model);
    assert.throws(() => resolveDrawableGeometry(model), GeometryResolutionError);
  }
});

test('validation rejects invalid coordinates, handles, metadata, and scene references before serialization', () => {
  const cases = [
    (d) => { d.source.contours[0].segments[0].point.x = NaN; },
    (d) => { d.source.contours[0].segments[0].handleIn.y = Infinity; },
    (d) => { d.opacity = 1.1; }, (d) => { d.transform.a = NaN; },
    (d) => { d.layerId = ''; }, (d) => { d.visible = 'yes'; },
    (d) => { d.sceneItem = {}; },
    (d) => { d.source.contours[0].segments[0].point = new paper.Point(1, 2); },
    (d) => { d.source.mode = 'unknown'; },
  ];
  for (const mutate of cases) {
    const model = fixture('bezier'); mutate(model);
    assert.throws(() => serializeDrawable(model), ModelValidationError);
  }
  const json = JSON.parse(serializeDrawable(fixture('circle')));
  json.source.radius = -2;
  assert.throws(() => deserializeDrawable(JSON.stringify(json)), ModelValidationError);
});

test('composite validation rejects duplicate point IDs, invalid radius, and dangling arcs', () => {
  const cases = [
    (d) => { d.source.points[1].id = 'p1'; },
    (d) => { d.source.points[2].corner.radius = -1; },
    (d) => { d.source.points[0].kind = 'arcByThreeStart'; },
    (d) => { d.source.points[0].kind = 'arcByThreeEnd'; },
    (d) => { d.source.points[0].outgoing.bowOffset = 20; },
  ];
  for (const mutate of cases) {
    const model = fixture('composite'); mutate(model);
    assert.throws(() => serializeDrawable(model), ModelValidationError);
  }
});

test('parametric shape records retain constraints and derived polygon vertices', () => {
  const base = fixture('circle');
  const sources = [
    { type: 'regularPolygon', center: { x: 0, y: 0 }, radius: 10, sides: 4, rotation: 0 },
    { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 10 }] },
    { type: 'quadrilateral', vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }] },
    { type: 'parallelogram', origin: { x: 0, y: 0 }, edge1: { x: 20, y: 0 }, edge2: { x: 5, y: 10 } },
    { type: 'trapezoid', origin: { x: 0, y: 0 }, bottomWidth: 20, topWidth: 10, height: 10, topOffset: 5 },
  ];
  for (const source of sources) {
    const model = roundTrip({ ...base, source });
    assert.deepEqual(model.source, source);
    const geometry = resolveDrawableGeometry(model);
    assert.equal(geometry.closed, true);
    assert.equal(geometry.segments.length, source.type === 'polygon' ? 3 : 4);
    assert.deepEqual(model.source, source);
  }
  assert.throws(() => serializeDrawable({ ...base, source: { ...sources[0], sides: 2.5 } }), ModelValidationError);
  assert.throws(() => serializeDrawable({ ...base, source: { ...sources[3], edge2: { x: 40, y: 0 } } }), ModelValidationError);
});
