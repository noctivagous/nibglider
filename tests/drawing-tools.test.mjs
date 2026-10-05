import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';

function scope() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  return s;
}
function engine() {
  const s = scope();
  const e = new NibGliderEngine(s, () => {});
  return {
    s, e, layer: s.project.activeLayer,
    cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); },
  };
}

test('circle start enters shape mode and cancel removes the guide without history', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.mousePt = new s.Point(40, 50);
    e.circleKC('radius');
    assert.equal(e.isDrawingShape, true);
    assert.equal(e.shapeType, 'circle_radius');
    assert.equal(e.isDrawingPath, false);
    assert.ok(e.previewShape);
    assert.equal(layer.children.length, 2);
    e.pointer.onMouseMove({ point: new s.Point(90, 50) });
    assert.equal(e.previewShape.radius, 50);
    e.cancelCurrentDrawingOperation();
    assert.equal(e.isDrawingShape, false);
    assert.equal(e.shapeType, null);
    assert.equal(e.previewShape, null);
    assert.equal(e.previewLine, null);
    assert.equal(layer.children.length, 0);
    assert.equal(e.canUndo(), false);
  } finally { cleanup(); }
});

test('legacy path end keeps the deposited stroke and quad completion records one undo step', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.mousePt = new s.Point(0, 0); e.polyLineKC();
    e.mousePt = new s.Point(40, 0); e.polyLineKC();
    e.pointer.onMouseMove({ point: new s.Point(40, 30) });
    e.endPathOrShape();
    assert.equal(e.isDrawingPath, false);
    assert.equal(e.path, null);
    assert.equal(layer.children.length, 1);
    assert.equal(e.undoLabel(), 'Deposit shape');
    e.undo();
    assert.equal(layer.children.length, 0);

    for (const point of [[0, 0], [80, 0], [80, 60], [0, 60]]) {
      e.mousePt = new s.Point(point[0], point[1]);
      e.quadPointKC();
    }
    assert.equal(e.isDrawingQuad, false);
    assert.equal(e.quadPath, null);
    assert.equal(e.quadPointCount, 0);
    assert.equal(layer.children.length, 1);
    assert.equal(layer.children[0].closed, true);
    assert.equal(e.undoLabel(), 'Deposit shape');
    e.undo();
    assert.equal(layer.children.length, 0);
    assert.equal(e.canUndo(), false);
  } finally { cleanup(); }
});

test('circle END deposits the preview size when the stroke is thick', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.setStrokeWidth(30);
    e.circleInnerShapeType = 'circle';
    e.mousePt = new s.Point(100, 100);
    e.circleKC('radius');
    e.pointer.onMouseMove({ point: new s.Point(200, 100) });
    const guideRadius = e.previewShape.radius;
    const previewWidth = e.previewInner.bounds.width;
    // The live shape is the guide minus the 1px overlay, not half the 30pt stroke.
    assert.ok(previewWidth > 2 * (guideRadius - 30 / 2) + 10);
    e.endPathOrShape();
    assert.equal(e.isDrawingShape, false);
    assert.equal(layer.children.length, 1);
    const deposited = layer.children[0];
    assert.ok(Math.abs(deposited.bounds.width - previewWidth) < 0.05);
    assert.ok(Math.abs(deposited.bounds.height - previewWidth) < 0.05);
    assert.equal(deposited.strokeWidth, 30);

    e.mousePt = new s.Point(0, 0);
    e.circleKC('diameter');
    e.pointer.onMouseMove({ point: new s.Point(160, 0) });
    const diameterPreview = e.previewInner.bounds.width;
    const before = new Set(layer.children);
    e.stampCurrentPreview();
    const stamped = layer.children.find((item) => !before.has(item));
    assert.equal(e.isDrawingShape, true);
    assert.ok(stamped);
    assert.ok(Math.abs(stamped.bounds.width - diameterPreview) < 0.05);
  } finally { cleanup(); }
});

test('quad with a Rect Keys shape previews after three points and deposits the fitted shape', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.rectangleInnerShapeType = 'kite';
    for (const point of [[0, 0], [100, 0], [100, 100]]) {
      e.mousePt = new s.Point(point[0], point[1]);
      e.quadPointKC();
    }
    assert.equal(e.isDrawingQuad, true);
    assert.equal(e.quadPointCount, 3);
    // Live fourth corner still on the third point: no preview yet.
    assert.equal(e.previewInner, null);
    e.pointer.onMouseMove({ point: new s.Point(0, 100) });
    assert.ok(e.previewInner);
    assert.equal(e.previewInner.segments.length, 4);
    e.mousePt = new s.Point(0, 100);
    e.quadPointKC();
    assert.equal(e.isDrawingQuad, false);
    assert.equal(e.previewInner, null);
    assert.equal(e.quadPointCount, 0);
    const deposited = layer.children[layer.children.length - 1];
    assert.equal(deposited.closed, true);
    assert.equal(deposited.segments.length, 4);
    // Kite fitted to the unit-square quad: edge midpoints and thirds.
    const pts = deposited.segments.map((seg) => [seg.point.x, seg.point.y]);
    assert.deepEqual(pts[0], [50, 0]);
    assert.deepEqual(pts[2], [50, 100]);
    assert.equal(e.undoLabel(), 'Deposit shape');
    e.undo();
    assert.equal(e.previewInner, null);
  } finally { cleanup(); }
});

test('quad with a Rect Keys shape falls back to the raw quad when corners are degenerate', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.rectangleInnerShapeType = 'circle';
    const before = layer.children.length;
    for (const point of [[0, 0], [10, 0], [20, 0], [30, 0]]) {
      e.mousePt = new s.Point(point[0], point[1]);
      e.quadPointKC();
    }
    assert.equal(e.isDrawingQuad, false);
    assert.equal(layer.children.length, before + 1);
    assert.equal(layer.children[before].closed, true);
  } finally { cleanup(); }
});

test('quad projective mapping shifts the fitted shape off the bilinear midpoints', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.quadMapping = 'projective';
    e.rectangleInnerShapeType = 'rhombus';
    for (const point of [[0, 0], [200, 0], [160, 200]]) {
      e.mousePt = new s.Point(point[0], point[1]);
      e.quadPointKC();
    }
    e.pointer.onMouseMove({ point: new s.Point(40, 200) });
    assert.ok(e.previewInner);
    assert.equal(e.previewInner.segments.length, 4);
    e.mousePt = new s.Point(40, 200);
    e.quadPointKC();
    assert.equal(e.isDrawingQuad, false);
    assert.equal(e.previewInner, null);
    const deposited = layer.children[layer.children.length - 1];
    assert.equal(deposited.closed, true);
    assert.equal(deposited.segments.length, 4);
    const pts = deposited.segments.map((seg) => [seg.point.x, seg.point.y]);
    // Symmetric edges agree; the right edge midpoint moves down the slope.
    assert.ok(Math.hypot(pts[0][0] - 100, pts[0][1] - 0) < 1e-6);
    assert.ok(Math.hypot(pts[1][0] - 175, pts[1][1] - 125) < 1e-6);
    assert.ok(Math.hypot(pts[2][0] - 100, pts[2][1] - 200) < 1e-6);
    e.undo();
  } finally { cleanup(); }
});

test('quad projective mapping falls back to the raw quad on a concave frame', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.quadMapping = 'projective';
    e.rectangleInnerShapeType = 'kite';
    const before = layer.children.length;
    for (const point of [[0, 0], [200, 0], [200, 200], [100, 60]]) {
      e.mousePt = new s.Point(point[0], point[1]);
      e.quadPointKC();
    }
    assert.equal(e.isDrawingQuad, false);
    assert.equal(e.previewInner, null);
    assert.equal(layer.children.length, before + 1);
    assert.equal(layer.children[before].closed, true);
  } finally { cleanup(); }
});

test('rectangle diagonal cancel drops the frame and a fitted stamp does not end the session', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    e.mousePt = new s.Point(10, 10);
    e.rectDiagonalKC();
    assert.equal(e.shapeType, 'rectangle_diagonal');
    e.pointer.onMouseMove({ point: new s.Point(110, 70) });
    assert.equal(e.previewShape.size.width, 100);
    assert.equal(e.previewShape.size.height, 60);
    e.cancelCurrentDrawingOperation();
    assert.equal(e.isDrawingShape, false);
    assert.equal(layer.children.length, 0);

    e.mousePt = new s.Point(10, 10);
    e.rectCenterlineKC();
    e.pointer.onMouseMove({ point: new s.Point(110, 10) });
    e.stampCurrentPreview();
    assert.equal(e.isDrawingShape, true);
    assert.equal(e.shapeType, 'rectangle_centerline');
    assert.equal(e.undoLabel(), 'Stamp');
    assert.ok(layer.children.some((item) => item !== e.previewLine && item !== e.previewRect && item !== e.previewInner));
  } finally { cleanup(); }
});
