import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSummaryState } from '../src/ui/ConfigSummary.ts';

function paint(over = {}) {
  return {
    strokeOn: true,
    strokeColor: '#107cff',
    strokeWidth: 4,
    strokeCap: 'butt',
    strokeJoin: 'miter',
    strokePosition: 'center',
    miterLimit: 10,
    dashLength: 0,
    gapLength: 0,
    fillOn: false,
    fillColor: '#000000',
    fillSpec: { type: 'solid', color: '#000000', endColor: '#ffffff', angle: 0, inner: 0 },
    ...over,
  };
}

test('no selection resolves to the global defaults', () => {
  const globals = paint({ strokeWidth: 7 });
  const state = resolveSummaryState(null, 0, globals);
  assert.equal(state.mode, 'defaults');
  assert.equal(state.mixed, false);
  assert.equal(state.paint.strokeWidth, 7);
});

test('a single selection resolves to the selected path paint', () => {
  const globals = paint();
  const selected = paint({ strokeWidth: 12, strokeColor: '#ff0000', fillOn: true });
  const state = resolveSummaryState(selected, 1, globals);
  assert.equal(state.mode, 'selection');
  assert.equal(state.mixed, false);
  assert.equal(state.paint.strokeWidth, 12);
  assert.equal(state.paint.strokeColor, '#ff0000');
  assert.equal(state.paint.fillOn, true);
});

test('multiple selections flag mixed and keep the first item paint', () => {
  const globals = paint();
  const selected = paint({ strokeWidth: 3 });
  const state = resolveSummaryState(selected, 4, globals);
  assert.equal(state.mode, 'selection');
  assert.equal(state.mixed, true);
  assert.equal(state.paint.strokeWidth, 3);
});

test('stroke-off and fill-off paint passes through for the empty preview', () => {
  const globals = paint();
  const selected = paint({ strokeOn: false, fillOn: false });
  const state = resolveSummaryState(selected, 1, globals);
  assert.equal(state.paint.strokeOn, false);
  assert.equal(state.paint.fillOn, false);
});
