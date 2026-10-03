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
