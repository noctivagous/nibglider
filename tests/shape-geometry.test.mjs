import test from 'node:test';
import assert from 'node:assert/strict';
import {
  circleInnerShapeUnitPoints,
  parallelogramFrameST,
  rectFrameBasis,
  rotST,
  trapezoidFrameST,
} from '../src/engine/geometry/RectangleGeometry.ts';
import { describeInnerShape, describeRectFrame, sectorPreviewPath } from '../src/engine/geometry/ShapeFactory.ts';
import { supershapeRadius } from '../src/engine/geometry/pathResolver.ts';

test('circle unit points keep Thales, kite thirds, and circum radius', () => {
  const triangle = circleInnerShapeUnitPoints('rightTriangle', 60);
  assert.deepEqual(triangle, [[-1, 0], [1, 0], [0, -1]]);
  const toLeft = [triangle[0][0] - triangle[2][0], triangle[0][1] - triangle[2][1]];
  const toRight = [triangle[1][0] - triangle[2][0], triangle[1][1] - triangle[2][1]];
  assert.equal(toLeft[0] * toRight[0] + toLeft[1] * toRight[1], 0);

  const kite = circleInnerShapeUnitPoints('kite', 60);
  assert.equal(kite[1][1], kite[3][1]);
  assert.ok(Math.abs(kite[1][0]) > 0.9);
  const toTop = Math.abs(kite[1][1] - kite[0][1]);
  const toBottom = Math.abs(kite[2][1] - kite[1][1]);
  assert.ok(toTop < toBottom);
});

test('frame quads clamp shear and orientation turns 90 degrees', () => {
  assert.equal(trapezoidFrameST(5)[0][0], 0.49);
  assert.equal(trapezoidFrameST(-5)[0][0], -0.49);
  for (const [s, t] of trapezoidFrameST(0.25)) {
    assert.ok(s >= 0 && s <= 1 && t >= 0 && t <= 1);
  }
  for (const shear of [2, -2, 0]) {
    for (const [s, t] of parallelogramFrameST(shear)) {
      assert.ok(s >= -1e-9 && s <= 1 + 1e-9 && t >= -1e-9 && t <= 1 + 1e-9);
    }
  }
  assert.deepEqual(rotST(0, 0, 1), [1, 0]);
  assert.deepEqual(rotST(1, 0, 1), [1, 1]);
});

test('supershape radius, sector clamp, and semantic records preserve parameters', () => {
  assert.equal(supershapeRadius(0, 4, 1, 1, 1, 1, 1), 1);
  const wide = sectorPreviewPath(1, 400);
  assert.match(wide, /0\.985,-0\.174/);

  const polygon = describeInnerShape({
    innerType: 'polygon', params: { sides: 6, m: 3, n1: 0.2, n2: 1.7, n3: 1.7, a1: 1, a2: 1, angle: 60, sector: 90 },
    polygonRadiusMode: 'inradius', shapeType: 'circle_radius',
    center: { x: 1, y: 2 }, radius: 10, rotation: 0,
  });
  assert.equal(polygon.type, 'regularPolygon');
  assert.ok(Math.abs(polygon.radius - 10 / Math.cos(Math.PI / 6)) < 1e-9);
  assert.equal(polygon.rotation, 30);

  const sector = describeInnerShape({
    innerType: 'sector', params: { sides: 6, m: 3, n1: 0.2, n2: 1.7, n3: 1.7, a1: 1, a2: 1, angle: 60, sector: 90 },
    polygonRadiusMode: 'circumradius', shapeType: 'circle_radius',
    center: { x: 0, y: 0 }, radius: 8, rotation: 0,
  });
  assert.equal(sector, null);

  const para = describeInnerShape({
    innerType: 'parallelogram', params: { sides: 6, m: 3, n1: 0.2, n2: 1.7, n3: 1.7, a1: 1, a2: 1, angle: 60, sector: 90 },
    polygonRadiusMode: 'circumradius', shapeType: 'circle_radius',
    center: { x: 0, y: 0 }, radius: 10, rotation: 0,
  });
  assert.equal(para.type, 'parallelogram');

  const frame = describeRectFrame({
    innerType: 'parallelogram',
    params: { sides: 6, m: 3, n1: 0.2, n2: 1.7, n3: 1.7, a1: 1, a2: 1, angle: 90, sector: 90 },
    shapeType: 'rectangle_diagonal', orientation: 0,
    frame: {
      shapeType: 'rectangle_diagonal', start: { x: 0, y: 0 }, second: null, mouse: { x: 40, y: 20 },
      diagonalScale: 1, centerlineWidth: 10,
    },
  });
  assert.equal(frame.type, 'parallelogram');
  for (const point of [frame.origin, { x: frame.origin.x + frame.edge1.x, y: frame.origin.y + frame.edge1.y }]) {
    assert.ok(point.x >= -1e-9 && point.x <= 40 + 1e-9);
    assert.ok(point.y >= -1e-9 && point.y <= 20 + 1e-9);
  }
  const basis = rectFrameBasis({
    shapeType: 'rectangle_diagonal', start: { x: 10, y: 10 }, second: null, mouse: { x: 0, y: 0 },
    diagonalScale: 1, centerlineWidth: 4,
  });
  assert.equal(basis.u.x, -10);
  assert.equal(basis.v.y, -10);
});
