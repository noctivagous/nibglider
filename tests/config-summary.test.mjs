import test from 'node:test';
import assert from 'node:assert/strict';
import { formatZoomPercent, resolveLiveMeasure, resolveSummaryState } from '../src/ui/ConfigSummary.ts';

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

test('no live vector hides both readouts even when snapping is on', () => {
  const live = resolveLiveMeasure({ lengthOn: true, angleOn: true, vector: null, unit: 'pt' });
  assert.equal(live.lengthText, null);
  assert.equal(live.angleText, null);
});

test('live vector shows length and angle in the display unit when both snaps are on', () => {
  const live = resolveLiveMeasure({
    lengthOn: true,
    angleOn: true,
    vector: { lengthPt: 90, angleDeg: 45.4 },
    unit: 'pt',
  });
  assert.equal(live.lengthText, '90 pt');
  assert.equal(live.angleText, '45°');
});

test('live vector hides the readout whose snapping mode is off', () => {
  const lengthOnly = resolveLiveMeasure({
    lengthOn: true,
    angleOn: false,
    vector: { lengthPt: 36, angleDeg: -30.6 },
    unit: 'pt',
  });
  assert.equal(lengthOnly.lengthText, '36 pt');
  assert.equal(lengthOnly.angleText, null);
  const angleOnly = resolveLiveMeasure({
    lengthOn: false,
    angleOn: true,
    vector: { lengthPt: 36, angleDeg: -30.6 },
    unit: 'pt',
  });
  assert.equal(angleOnly.lengthText, null);
  assert.equal(angleOnly.angleText, '-31°');
});

test('non-finite live values hide both readouts', () => {
  const live = resolveLiveMeasure({
    lengthOn: true,
    angleOn: true,
    vector: { lengthPt: NaN, angleDeg: 10 },
    unit: 'pt',
  });
  assert.equal(live.lengthText, null);
  assert.equal(live.angleText, null);
});

test('zoom formats as a rounded percent', () => {
  assert.equal(formatZoomPercent(1), '100%');
  assert.equal(formatZoomPercent(1.25), '125%');
  assert.equal(formatZoomPercent(0.1), '10%');
  assert.equal(formatZoomPercent(NaN), '—');
});
