import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { SnappingManager } from '../src/engine/snapping/SnappingManager.ts';
import { SceneRepository } from '../src/engine/scene/SceneRepository.ts';
import { SelectionManager } from '../src/engine/scene/SelectionManager.ts';
import { HistoryManager } from '../src/engine/history/HistoryManager.ts';
import { TransformManager } from '../src/engine/history/TransformManager.ts';
import { ShapeFactory } from '../src/engine/geometry/ShapeFactory.ts';
import {
  localCentroidOf,
  polygonCentroid,
  readCircleOrigin,
  tagCircleOrigin,
} from '../src/engine/geometry/shapeCenters.ts';

function setup() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 300));
  const overlays = { gridLayer: null, cursors: [], previews: [] };
  const scene = new SceneRepository(scope, () => overlays);
  let selection;
  const history = new HistoryManager(scene, () => selection, () => {});
  selection = new SelectionManager(scene, history,
    (original, clone) => scene.retainClone(original, clone, (item) => item));
  return { scope, scene, selection, history, cleanup: () => scope.project.remove() };
}

function near(point, x, y, epsilon = 1e-6) {
  assert.ok(point, 'expected a snap point');
  assert.ok(Math.abs(point.x - x) < epsilon, `x ${point.x} ~= ${x}`);
  assert.ok(Math.abs(point.y - y) < epsilon, `y ${point.y} ~= ${y}`);
}

/** Midpoint of a hexagon's opposite vertices in global coordinates: its
 * circumcenter derived purely from live geometry, independent of any tag. */
function oppositeMidpoint(item) {
  const a = item.localToGlobal(item.segments[0].point);
  const b = item.localToGlobal(item.segments[3].point);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function snapState() {
  return {
    gridEnabled: false, gridSnapping: false, gridType: 'square', gridSpacing: 20,
    path: false, point: true, angle: false, length: false, aspect: false,
    angleDegrees: 45, lengthStep: 10, aspectA: 3, aspectB: 4,
  };
}

function shapeFactory(scope) {
  const noop = () => {};
  return new ShapeFactory(scope, {
    applyStrokeGeometry: noop,
    applyStrokeDash: noop,
    applyFill: noop,
    withShapeText: (item) => item,
    textForBoundary: () => null,
    globalStrokeColor: () => '#000000',
    globalStrokeWidth: () => 1,
    textModeEnabled: () => false,
  });
}

function innerBuild(center, radius, innerType, params = {}) {
  return {
    center, radius, styleOrPreview: 'stroke', rotationAngle: 0,
    shapeType: null, circleInnerShapeType: innerType, circleInnerShapeParams: params,
    rectangleInnerShapeType: 'rectangle', rectangleInnerShapeParams: {},
    innerShapeType: innerType, innerShapeParams: params, polygonRadiusMode: 'circumradius',
  };
}

test('polygon area centroid matches the triangle average, not its bounds center', () => {
  const centroid = polygonCentroid([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 0, y: 60 }]);
  near(centroid, 20, 20);
});

test('circle-origin tag round-trips and rejects non-finite values', () => {
  const { scope, cleanup } = setup();
  try {
    const item = new scope.Path.Rectangle({ from: [0, 0], to: [10, 10] });
    assert.equal(readCircleOrigin(item), null);
    tagCircleOrigin(item, new scope.Point(4, 5));
    near(readCircleOrigin(item), 4, 5);
    item.data.circleOrigin = { x: NaN, y: 1 };
    assert.equal(readCircleOrigin(item), null);
  } finally { cleanup(); }
});

test('radial inner shapes keep their construction center as circle origin', () => {
  const { scope, cleanup } = setup();
  try {
    const factory = shapeFactory(scope);
    const center = new scope.Point(100, 80);
    const circle = factory.createInnerShape(innerBuild(center, 40, 'circle'));
    near(readCircleOrigin(circle), 100, 80);
    const triangle = factory.createInnerShape(
      innerBuild(center, 40, 'polygon', { sides: 3 }));
    near(readCircleOrigin(triangle), 100, 80);
    // An odd-sided polygon's bounds center is off-center; the tag stays exact.
    const bounds = triangle.internalBounds.center;
    assert.ok(Math.abs(bounds.x - 100) > 1 || Math.abs(bounds.y - 80) > 1);
    const segment = factory.createInnerShape(
      innerBuild(center, 50, 'segment', { sector: 90 }));
    near(readCircleOrigin(segment), 100, 80);
    const sector = factory.createInnerShape(
      innerBuild(center, 50, 'sector', { sector: 90 }));
    near(readCircleOrigin(sector), 100, 80);
  } finally { cleanup(); }
});

test('point snapping hits a segment arc centroid at its stored circle origin', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 300));
  try {
    const factory = shapeFactory(scope);
    const segment = factory.createInnerShape(
      innerBuild(new scope.Point(100, 100), 50, 'segment', { sector: 90 }));
    scope.project.activeLayer.addChild(segment);
    const manager = new SnappingManager(scope, snapState,
      () => new Set(), (item) => !!item.guide,
      { mount: () => {}, pathCursor: () => {}, pointCursor: () => {} });
    const snapped = manager.snapPoint(new scope.Point(103, 102));
    assert.ok(snapped);
    near(snapped, 100, 100, 1e-4);
  } finally { scope.project.remove(); }
});

test('point snapping hits the true center of an untagged triangle', () => {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(400, 300));
  try {
    const triangle = new scope.Path({
      segments: [[0, 0], [60, 0], [0, 60]], closed: true,
    });
    assert.equal(readCircleOrigin(triangle), null);
    const manager = new SnappingManager(scope, snapState,
      () => new Set(), (item) => !!item.guide,
      { mount: () => {}, pathCursor: () => {}, pointCursor: () => {} });
    const snapped = manager.snapPoint(new scope.Point(21, 21));
    assert.ok(snapped);
    near(snapped, 20, 20, 1e-4);
  } finally { scope.project.remove(); }
});

test('localCentroidOf prefers a stored origin over the bounds center', () => {
  const { scope, cleanup } = setup();
  try {
    const rect = new scope.Path.Rectangle({ from: [0, 0], to: [60, 30] });
    near(localCentroidOf(rect), 30, 15);
    tagCircleOrigin(rect, new scope.Point(10, 10));
    near(localCentroidOf(rect), 10, 10);
    const open = new scope.Path({ segments: [[0, 0], [60, 0]] });
    assert.equal(localCentroidOf(open), null);
  } finally { cleanup(); }
});

test('selection reveals centroids, hides them on clear, and excludes markers', () => {
  const { scope, scene, selection, cleanup } = setup();
  try {
    const rect = new scope.Path.Rectangle({ from: [0, 0], to: [60, 30] });
    selection.add(rect);
    assert.equal(selection.centroidIndicators.length, 1);
    const mark = selection.centroidIndicators[0];
    near(mark.position, 30, 15, 1e-4);
    assert.equal(mark.guide, true);
    assert.equal(mark.data.isCentroidMarker, true);
    assert.equal(scene.isNonContentItem(mark), true);
    assert.deepEqual(scene.contentItems(), [rect]);
    selection.clear();
    assert.equal(selection.centroidIndicators.length, 0);
    assert.ok(!scope.project.activeLayer.children.includes(mark));
  } finally { cleanup(); }
});

test('selection marks a stored circle origin instead of the bounds center', () => {
  const { scope, selection, cleanup } = setup();
  try {
    const factory = shapeFactory(scope);
    const segment = factory.createInnerShape(
      innerBuild(new scope.Point(100, 100), 50, 'segment', { sector: 90 }));
    scope.project.activeLayer.addChild(segment);
    selection.add(segment);
    assert.equal(selection.centroidIndicators.length, 1);
    near(selection.centroidIndicators[0].position, 100, 100, 1e-4);
  } finally { cleanup(); }
});

test('selection shows no marker for open paths', () => {
  const { scope, selection, cleanup } = setup();
  try {
    const line = new scope.Path({ segments: [[0, 0], [60, 0]] });
    selection.add(line);
    assert.equal(selection.centroidIndicators.length, 0);
  } finally { cleanup(); }
});

test('stored circle origin follows a move and point-snaps at the new center', () => {
  const { scope, scene, selection, history, cleanup } = setup();
  try {
    const transforms = new TransformManager(scene, selection, history);
    const factory = shapeFactory(scope);
    const hexagon = factory.createInnerShape(
      innerBuild(new scope.Point(100, 100), 50, 'polygon', { sides: 6 }));
    selection.add(hexagon);
    transforms.moveSelectionBy(new scope.Point(200, 0));
    const manager = new SnappingManager(scope, snapState,
      () => new Set(), (item) => !!item.guide,
      { mount: () => {}, pathCursor: () => {}, pointCursor: () => {} });
    // Paper bakes position changes into segment points, so the tag must be
    // carried along: snapping near the moved center must hit (300, 100),
    // not the stale construction center (100, 100).
    const snapped = manager.snapPoint(new scope.Point(303, 102));
    assert.ok(snapped);
    near(snapped, 300, 100, 1e-4);
  } finally { cleanup(); }
});

test('stored circle origin follows moves of a grouped shape', () => {
  const { scope, scene, selection, history, cleanup } = setup();
  try {
    const transforms = new TransformManager(scene, selection, history);
    const factory = shapeFactory(scope);
    const hexagon = factory.createInnerShape(
      innerBuild(new scope.Point(100, 100), 50, 'polygon', { sides: 6 }));
    const label = new scope.PointText(new scope.Point(100, 100));
    label.content = 'x';
    const group = new scope.Group([hexagon, label]);
    selection.add(group);
    transforms.moveSelectionBy(new scope.Point(50, 25));
    const manager = new SnappingManager(scope, snapState,
      () => new Set(), (item) => !!item.guide,
      { mount: () => {}, pathCursor: () => {}, pointCursor: () => {} });
    const snapped = manager.snapPoint(new scope.Point(152, 126));
    assert.ok(snapped);
    near(snapped, 150, 125, 1e-4);
  } finally { cleanup(); }
});

test('stored circle origin follows scale and rotate about another center', () => {
  const { scope, scene, selection, history, cleanup } = setup();
  try {
    const transforms = new TransformManager(scene, selection, history);
    const factory = shapeFactory(scope);
    const hexagon = factory.createInnerShape(
      innerBuild(new scope.Point(100, 100), 50, 'polygon', { sides: 6 }));
    const rect = new scope.Path.Rectangle({ from: [190, 190], to: [210, 210] });
    selection.add(hexagon);
    selection.add(rect);
    const manager = new SnappingManager(scope, snapState,
      () => new Set(), (item) => !!item.guide,
      { mount: () => {}, pathCursor: () => {}, pointCursor: () => {} });
    // Scale 2x about the union-bounds center; the tag must land where the
    // same affine carries the construction center.
    const before = selection.collectiveBounds([hexagon, rect]).center;
    const wantScaled = {
      x: before.x + (100 - before.x) * 2,
      y: before.y + (100 - before.y) * 2,
    };
    transforms.scale(2);
    const scaled = manager.snapPoint(new scope.Point(wantScaled.x + 2, wantScaled.y + 1));
    assert.ok(scaled);
    near(scaled, wantScaled.x, wantScaled.y, 1e-4);
    // Rotate 90 degrees clockwise about the new union center. The hexagon's
    // opposite vertices stay antipodal, so their midpoint is an independent
    // geometric oracle for the traveled center.
    const mid = selection.collectiveBounds([hexagon, rect]).center;
    const wantRotated = {
      x: mid.x - (wantScaled.y - mid.y),
      y: mid.y + (wantScaled.x - mid.x),
    };
    transforms.rotate(90);
    const opposite = oppositeMidpoint(hexagon);
    near(opposite, wantRotated.x, wantRotated.y, 1e-4);
    const rotated = manager.snapPoint(new scope.Point(opposite.x + 2, opposite.y + 1));
    assert.ok(rotated);
    near(rotated, opposite.x, opposite.y, 1e-4);
  } finally { cleanup(); }
});

test('move undo and redo carry the stored circle origin both ways', () => {
  const { scope, scene, selection, history, cleanup } = setup();
  try {
    const transforms = new TransformManager(scene, selection, history);
    const factory = shapeFactory(scope);
    const hexagon = factory.createInnerShape(
      innerBuild(new scope.Point(100, 100), 50, 'polygon', { sides: 6 }));
    selection.add(hexagon);
    const manager = new SnappingManager(scope, snapState,
      () => new Set(), (item) => !!item.guide,
      { mount: () => {}, pathCursor: () => {}, pointCursor: () => {} });
    transforms.nudge(30, 0);
    near(manager.snapPoint(new scope.Point(132, 101)), 130, 100, 1e-4);
    history.undo();
    near(manager.snapPoint(new scope.Point(102, 101)), 100, 100, 1e-4);
    history.redo();
    near(manager.snapPoint(new scope.Point(132, 101)), 130, 100, 1e-4);
  } finally { cleanup(); }
});

test('duplicate carries the stored circle origin by the offset step', () => {
  const { scope, selection, cleanup } = setup();
  try {
    const factory = shapeFactory(scope);
    const hexagon = factory.createInnerShape(
      innerBuild(new scope.Point(100, 100), 50, 'polygon', { sides: 6 }));
    selection.add(hexagon);
    assert.ok(selection.duplicate());
    const manager = new SnappingManager(scope, snapState,
      () => new Set(), (item) => !!item.guide,
      { mount: () => {}, pathCursor: () => {}, pointCursor: () => {} });
    // The clone lands at (120, 120); its tag must travel with it.
    const snapped = manager.snapPoint(new scope.Point(122, 121));
    assert.ok(snapped);
    near(snapped, 120, 120, 1e-4);
  } finally { cleanup(); }
});

test('centroid markers follow moves, nudges, and their undo', () => {
  const { scope, scene, selection, history, cleanup } = setup();
  try {
    const transforms = new TransformManager(scene, selection, history);
    const rect = new scope.Path.Rectangle({ from: [0, 0], to: [60, 30] });
    selection.add(rect);
    near(selection.centroidIndicators[0].position, 30, 15, 1e-4);
    rect.position = rect.position.add(new scope.Point(15, 0));
    selection.refreshCentroids();
    assert.equal(selection.centroidIndicators.length, 1);
    near(selection.centroidIndicators[0].position, 45, 15, 1e-4);
    transforms.nudge(10, 0);
    near(selection.centroidIndicators[0].position, 55, 15, 1e-4);
    history.undo();
    near(selection.centroidIndicators[0].position, 45, 15, 1e-4);
  } finally { cleanup(); }
});
