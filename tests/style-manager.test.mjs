import test from 'node:test';
import assert from 'node:assert/strict';
import paper from 'paper';
import { StyleManager } from '../src/engine/appearance/StyleManager.ts';
import { installStrokePositionRenderer } from '../src/engine/appearance/strokePosition.ts';

function harness() {
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(200, 200));
  const state = {
    globalStrokeWidth: 4, maxStrokeWidth: 200, globalStrokeColor: '#107cff',
    globalFillColor: '#000000', globalFillType: 'solid', globalFillEndColor: '#ffffff',
    globalFillAngle: 0, globalFillInner: 0, globalStrokeCap: 'butt', globalStrokeJoin: 'miter',
    globalStrokePosition: 'center',
    globalMiterLimit: 10, globalDashLength: 0, globalGapLength: 0,
    strokeEnabled: true, fillEnabled: false,
  };
  const selected = [];
  const styles = new StyleManager(scope, {
    state: () => state,
    hasSelection: () => selected.length > 0,
    applyToSelection: (fn) => { for (const item of selected) fn(item); },
    liveItems: () => [],
    livePath: () => null,
    isDrawingShape: () => false,
    updateShapePreview: () => {},
  });
  return { scope, state, selected, styles };
}

test('stroke width writes the global until a selection is painted', () => {
  const { scope, state, selected, styles } = harness();
  try {
    styles.setStrokeWidth(9);
    assert.equal(state.globalStrokeWidth, 9);
    const path = new scope.Path.Circle(new scope.Point(20, 20), 10);
    path.strokeWidth = 1;
    selected.push(path);
    styles.setStrokeWidth(3);
    assert.equal(path.strokeWidth, 3);
    assert.equal(state.globalStrokeWidth, 9);
    styles.setStrokeDash(100, -4);
    assert.equal(state.globalDashLength, 0);
    assert.deepEqual(path.dashArray, [80, 0]);
  } finally { scope.project.remove(); }
});

test('fill inspection reads a linear angle and falls back to globals', () => {
  const { scope, state, styles } = harness();
  try {
    const path = new scope.Path.Rectangle({ from: [0, 0], to: [40, 20] });
    state.globalFillType = 'linear';
    state.globalFillAngle = 45;
    state.globalFillEndColor = '#ff0000';
    styles.applyFillSpec(path);
    const spec = styles.fillSpecOf(path);
    assert.equal(spec.type, 'linear');
    assert.ok(Math.abs(spec.angle - 45) < 0.2);
    path.strokeColor = null;
    path.strokeWidth = 0;
    const paint = styles.selectionPaint(path);
    assert.equal(paint.strokeOn, false);
    assert.equal(paint.strokeColor, state.globalStrokeColor);
    assert.equal(paint.strokeWidth, state.globalStrokeWidth);
    assert.equal(styles.selectionPaint(null), null);
  } finally { scope.project.remove(); }
});

test('stroke position is global until selected and is stored on the Paper item', () => {
  const { scope, state, selected, styles } = harness();
  try {
    styles.setStrokePosition('outside');
    assert.equal(state.globalStrokePosition, 'outside');
    const path = new scope.Path.Rectangle({ from: [0, 0], to: [40, 20] });
    selected.push(path);
    styles.setStrokePosition('inside');
    assert.equal(state.globalStrokePosition, 'outside');
    assert.equal(styles.selectionPaint(path).strokePosition, 'inside');
    styles.applyCurrentStyles(path);
    assert.equal(styles.selectionPaint(path).strokePosition, 'outside');
    installStrokePositionRenderer(scope);
    path.strokePosition = 'inside';
    assert.equal(path.strokePosition, 'inside');
  } finally { scope.project.remove(); }
});
