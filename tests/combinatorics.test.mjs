import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { NibGliderEngine } from '../src/engine/engine.ts';
import { hasBooleanArea, operandAvailability, RESULT_SOURCE_MODE } from '../src/engine/geometry/booleanResolver.ts';

function engine() {
  const s = new paper.PaperScope();
  s.setup(new s.Size(800, 600));
  const e = new NibGliderEngine(s, () => {});
  return { s, e, layer: s.project.activeLayer, cleanup: () => { e.cancelCurrentDrawingOperation(); s.project.remove(); } };
}

test('boolean policy lowers path geometry and rejects empty area', () => {
  assert.equal(operandAvailability('Path'), 'geometry');
  assert.equal(operandAvailability('CompoundPath'), 'geometry');
  assert.equal(operandAvailability('Raster'), 'unavailable');
  assert.equal(operandAvailability('Group'), 'unavailable');
  assert.equal(hasBooleanArea(0), false);
  assert.equal(hasBooleanArea(1), true);
  assert.equal(RESULT_SOURCE_MODE, 'bezier');
});

test('selection combine records one undo and lowers the result to a Bézier path', () => {
  for (const mode of ['union', 'subtract', 'intersect']) {
    const { s, e, layer, cleanup } = engine();
    try {
      const base = new s.Path.Rectangle({ from: [0, 0], to: [120, 80], fillColor: 'black' });
      const tool = new s.Path.Rectangle({ from: [40, 20], to: [160, 100], fillColor: 'red' });
      e.addItemToSelection(base);
      e.addItemToSelection(tool);
      e.combineSelection(mode);
      assert.equal(layer.children.length, 1);
      assert.equal(e.lastCombineNote, '');
      assert.equal(e.undoLabel(), mode[0].toUpperCase() + mode.slice(1));
      const result = layer.children[0];
      assert.equal(e.getRetainedPathDrawable(result.data.drawableId).source.mode, 'bezier');
      e.undo();
      assert.equal(layer.children.length, 2);
      assert.ok(layer.children.includes(base));
      assert.ok(layer.children.includes(tool));
      assert.equal(e.getRetainedPathDrawable(result.data.drawableId), null);
    } finally { cleanup(); }
  }
});

test('a selection combine with no overlap adds no history entry', () => {
  const { s, e, layer, cleanup } = engine();
  try {
    const base = new s.Path.Rectangle({ from: [0, 0], to: [20, 20], fillColor: 'black' });
    const tool = new s.Path.Rectangle({ from: [80, 80], to: [100, 100], fillColor: 'red' });
    e.addItemToSelection(base);
    e.addItemToSelection(tool);
    e.combineSelection('intersect');
    assert.equal(e.lastCombineNote, 'No result — shapes may not overlap.');
    assert.equal(e.canUndo(), false);
    assert.equal(layer.children.length, 2);
  } finally { cleanup(); }
});
