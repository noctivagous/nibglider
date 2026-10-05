import test from 'node:test';
import assert from 'node:assert/strict';
import {
  circleInnerShapeUnitPoints,
  isConvexQuad,
  parallelogramFrameST,
  quadArea,
  quadFrameMapper,
  quadFramePoint,
  quadHomography,
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

test('quad bilinear map pins corners, averages the center, and flags degeneracy', () => {
  const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  assert.deepEqual(quadFramePoint(square, 0, 0), { x: 0, y: 0 });
  assert.deepEqual(quadFramePoint(square, 1, 0), { x: 100, y: 0 });
  assert.deepEqual(quadFramePoint(square, 1, 1), { x: 100, y: 100 });
  assert.deepEqual(quadFramePoint(square, 0, 1), { x: 0, y: 100 });
  assert.deepEqual(quadFramePoint(square, 0.5, 0.5), { x: 50, y: 50 });
  // Orientation 1 maps (s, t) through rotST first: (0, 0) reads as (1, 0).
  assert.deepEqual(quadFramePoint(square, 0, 0, 1), { x: 100, y: 0 });
  const trap = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 80, y: 100 }, { x: 20, y: 100 }];
  assert.deepEqual(quadFramePoint(trap, 0.5, 0.5), { x: 50, y: 50 });
  assert.ok(quadArea(square) > 0);
  assert.ok(quadArea(trap) > 0);
  assert.equal(quadArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }]), 0);
});

test('projective quad map pins corners, centers on the diagonal crossing, matches bilinear when affine', () => {
  const road = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 160, y: 200 }, { x: 40, y: 200 }];
  assert.ok(isConvexQuad(road));
  const H = quadHomography(road);
  assert.ok(H);
  assert.ok(H.minW > 0.25);
  for (const [s, t, p] of [[0, 0, road[0]], [1, 0, road[1]], [1, 1, road[2]], [0, 1, road[3]]]) {
    const q = H.at(s, t);
    assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 1e-6);
  }
  // Projective unit-center lands on the diagonal crossing; bilinear averages the corners.
  const pc = H.at(0.5, 0.5);
  assert.ok(Math.hypot(pc.x - 100, pc.y - 125) < 1e-6);
  const bc = quadFramePoint(road, 0.5, 0.5);
  assert.deepEqual(bc, { x: 100, y: 100 });
  // Parallelogram frames: projective and bilinear agree everywhere.
  const para = [{ x: 10, y: 10 }, { x: 210, y: 30 }, { x: 170, y: 180 }, { x: -30, y: 160 }];
  const proj = quadFrameMapper(para, 0, 'projective');
  assert.ok(proj);
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const a = quadFramePoint(para, i / 4, j / 4);
      const b = proj(i / 4, j / 4);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
    }
  }
  // Concave and collinear frames reject projective but keep bilinear.
  const dart = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 100, y: 60 }];
  assert.equal(isConvexQuad(dart), false);
  assert.equal(quadFrameMapper(dart, 0, 'projective'), null);
  assert.ok(quadFrameMapper(dart, 0, 'bilinear'));
  assert.equal(isConvexQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }]), false);
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
