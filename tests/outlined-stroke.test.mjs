import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { deserializeDrawable, serializeDrawable, ModelValidationError } from '../src/engine/model/serialization.ts';
import { resolveDrawableGeometry } from '../src/engine/geometry/pathResolver.ts';
import { DrawableRenderer } from '../src/engine/scene/DrawableRenderer.ts';
import { SceneRepository } from '../src/engine/scene/SceneRepository.ts';

const segment = (x, y) => ({ point: { x, y }, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } });
const lineSpine = (from, to, id = 'spine') => ({
  id, mode: 'bezier', fillRule: 'nonzero',
  contours: [{ closed: false, segments: [segment(...from), segment(...to)] }],
});
const outlined = (spine, params = {}) => ({
  id: 'outlined-1', mode: 'outlinedStroke', spine,
  width: 10, cap: 'butt', join: 'miter', miterLimit: 10,
  dashLength: 0, gapLength: 0, position: 'center', ...params,
});
const drawable = (source) => ({
  id: 'drawable-1', kind: 'path', layerId: 'artwork', styleId: 'blue-stroke',
  transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  opacity: 1, visible: true, locked: false, source,
});
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

test('outlined stroke round-trips through JSON and keeps the spine editable', () => {
  const model = drawable(outlined(lineSpine([0, 0], [100, 0])));
  const back = deserializeDrawable(serializeDrawable(model));
  assert.deepEqual(back, model);
  const before = structuredClone(model.source);
  const geometry = resolveDrawableGeometry(model);
  assert.equal(geometry.kind, 'path');
  assert.deepEqual(model.source, before);
});

test('outlined stroke validation rejects bad params and nested spines', () => {
  const good = drawable(outlined(lineSpine([0, 0], [100, 0])));
  const cases = [
    (d) => { d.source.width = 0; },
    (d) => { d.source.width = -4; },
    (d) => { d.source.cap = 'oval'; },
    (d) => { d.source.join = 'arc'; },
    (d) => { d.source.miterLimit = 0.5; },
    (d) => { d.source.dashLength = -1; },
    (d) => { d.source.position = 'middle'; },
    (d) => { d.source.spine = outlined(lineSpine([0, 0], [10, 0]), { id: 'nested' }); },
    (d) => { d.source.spine = { id: 's', mode: 'smoothedPolyline', tension: 0.4, closed: false, points: [{ x: 0, y: 0 }] }; },
  ];
  for (const mutate of cases) {
    const model = deserializeDrawable(serializeDrawable(good));
    mutate(model);
    assert.throws(() => serializeDrawable(model), ModelValidationError);
  }
});

test('open spine expands to a centered band; caps extend past the endpoints', () => {
  for (const [cap, minX, maxX] of [['butt', 0, 100], ['square', -5, 105], ['round', -5, 105]]) {
    const model = drawable(outlined(lineSpine([0, 0], [100, 0]), { cap }));
    const geometry = resolveDrawableGeometry(model);
    assert.equal(geometry.kind, 'path');
    assert.equal(geometry.closed, true);
    const xs = geometry.segments.map((s) => s.point.x);
    const ys = geometry.segments.map((s) => s.point.y);
    assert.ok(Math.min(...xs) <= minX + 1e-6 && Math.max(...xs) >= maxX - 1e-6);
    assert.deepEqual([Math.min(...ys), Math.max(...ys)].map((v) => Math.round(v)), [-5, 5]);
  }
});

test('miter keeps the outer corner point while bevel cuts it', () => {
  const spine = {
    id: 'ell', mode: 'bezier', fillRule: 'nonzero',
    contours: [{ closed: false, segments: [segment(0, 0), segment(100, 0), segment(100, 100)] }],
  };
  const { scope } = scene();
  try {
    const deps = {
      layerForId: () => scope.project.activeLayer,
      styleForId: () => ({ strokeColor: '#000000', fillColor: null, strokeWidth: 1 }),
    };
    const miter = new DrawableRenderer(scope, deps)
      .render(drawable(outlined(spine, { width: 20, join: 'miter' })));
    const bevel = new DrawableRenderer(scope, deps)
      .render(drawable(outlined(spine, { width: 20, join: 'bevel' })));
    // The corner triangle belongs to the mitered band but not the beveled one.
    assert.equal(miter.contains(new scope.Point(107, -7)), true);
    assert.equal(bevel.contains(new scope.Point(107, -7)), false);
    assert.equal(miter.contains(new scope.Point(50, 0)), true);
    assert.equal(bevel.contains(new scope.Point(50, 0)), true);
  } finally { scope.project.remove(); }
});

test('closed spine renders a ring; inside/outside select one side of it', () => {
  const square = {
    id: 'sq', mode: 'bezier', fillRule: 'nonzero',
    contours: [{ closed: true, segments: [segment(0, 0), segment(100, 0), segment(100, 100), segment(0, 100)] }],
  };
  const center = resolveDrawableGeometry(drawable(outlined(square, { width: 10 })));
  assert.equal(center.kind, 'compoundPath');
  assert.equal(center.paths.length, 2);
  const { scope } = scene();
  try {
    const render = (position) => new DrawableRenderer(scope, {
      layerForId: () => scope.project.activeLayer,
      styleForId: () => ({ strokeColor: '#000000', fillColor: null, strokeWidth: 1 }),
    }).render(drawable(outlined(square, { width: 10, position })));
    const ring = render('center');
    assert.equal(ring.contains(new scope.Point(50, 50)), false);
    assert.equal(ring.contains(new scope.Point(2, 50)), true);
    assert.equal(ring.contains(new scope.Point(-7, 50)), false);
    // Inside keeps the spine bounds; outside grows past them; center splits the difference.
    assert.deepEqual([render('inside').bounds.width, render('outside').bounds.width, ring.bounds.width]
      .map((v) => Math.round(v)), [100, 110, 110]);
  } finally { scope.project.remove(); }
});

test('dashes split the band into separate loops', () => {
  const model = drawable(outlined(lineSpine([0, 0], [100, 0]), { width: 6, dashLength: 10, gapLength: 10 }));
  const geometry = resolveDrawableGeometry(model);
  assert.equal(geometry.kind, 'compoundPath');
  assert.equal(geometry.paths.length, 5);
  const solid = resolveDrawableGeometry(drawable(outlined(lineSpine([0, 0], [100, 0]), { width: 6 })));
  assert.equal(solid.kind, 'path');
});

test('renderer fills the band with the stroke color and paints no stroke', () => {
  const { scope, renderer } = scene();
  try {
    const model = drawable(outlined(lineSpine([0, 0], [100, 0]), { width: 10 }));
    const item = renderer.render(model);
    assert.equal(item.fillColor.toCSS(true), '#107cff');
    assert.equal(item.strokeColor, null);
    assert.equal(Math.round(item.bounds.height), 10);
    assert.equal(renderer.drawableIdOf(item), model.id);
    assert.deepEqual(model.source.spine.contours[0].segments[1].point, { x: 100, y: 0 });
  } finally { scope.project.remove(); }
});

test('baked booleans lower the expansion to plain bezier', () => {
  const { scope, layer } = scene();
  try {
    const repository = new SceneRepository(scope, () => ({ gridLayer: null, cursors: [], previews: [] }));
    const renderer = new DrawableRenderer(scope, {
      layerForId: () => layer,
      styleForId: () => ({ strokeColor: '#000000', fillColor: null, strokeWidth: 1 }),
    });
    const item = renderer.render(drawable(outlined(lineSpine([0, 0], [100, 0]), { id: 'spine-bake', width: 10 })));
    const baked = repository.bezierSource(item, 'baked');
    assert.equal(baked.mode, 'bezier');
    assert.ok(baked.contours.length >= 1 && baked.contours[0].segments.length >= 4);
  } finally { scope.project.remove(); }
});
