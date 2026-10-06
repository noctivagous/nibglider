import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUBBLE_PARK_GAP,
  chooseParkCorner,
  cornerPosition,
  demoFootprint,
  overlapArea,
  totalOverlap,
} from '../src/tutorial/bubbleParking.ts';

const VIEW = { width: 1280, height: 800 };
const SIZE = { width: 320, height: 260 };

test('corner slots sit inside the viewport with gap margins', () => {
  assert.deepEqual(cornerPosition('top-left', VIEW, SIZE), { left: BUBBLE_PARK_GAP, top: BUBBLE_PARK_GAP });
  assert.deepEqual(cornerPosition('top-right', VIEW, SIZE), {
    left: VIEW.width - SIZE.width - BUBBLE_PARK_GAP,
    top: BUBBLE_PARK_GAP,
  });
  assert.deepEqual(cornerPosition('bottom-left', VIEW, SIZE), {
    left: BUBBLE_PARK_GAP,
    top: VIEW.height - SIZE.height - BUBBLE_PARK_GAP,
  });
  assert.deepEqual(cornerPosition('bottom-right', VIEW, SIZE), {
    left: VIEW.width - SIZE.width - BUBBLE_PARK_GAP,
    top: VIEW.height - SIZE.height - BUBBLE_PARK_GAP,
  });
});

test('corner slots clamp onscreen when the viewport is smaller than the bubble', () => {
  const tiny = { width: 200, height: 200 };
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const pos = cornerPosition(corner, tiny, SIZE);
    assert.ok(pos.left >= BUBBLE_PARK_GAP, corner);
    assert.ok(pos.top >= BUBBLE_PARK_GAP, corner);
  }
});

test('overlapArea measures intersection and zero for disjoint rects', () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(overlapArea(a, { x: 200, y: 200, width: 50, height: 50 }), 0);
  assert.equal(overlapArea(a, { x: 50, y: 50, width: 100, height: 100 }), 2500);
  assert.equal(overlapArea(a, { x: 10, y: 10, width: 10, height: 10 }), 100);
  assert.equal(totalOverlap(a, [{ x: 200, y: 200, width: 10, height: 10 }]), 0);
});

test('chooseParkCorner dodges a covered corner for the first clear one', () => {
  // Occupy the whole top-left slot.
  const avoid = [{ x: 0, y: 0, width: 340, height: 280 }];
  assert.equal(chooseParkCorner(VIEW, SIZE, avoid), 'top-right');
});

test('chooseParkCorner minimizes overlap when every corner is touched', () => {
  // Full-viewport avoid hits every corner equally: deterministic first wins.
  const avoid = [{ x: 0, y: 0, width: VIEW.width, height: VIEW.height }];
  assert.equal(chooseParkCorner(VIEW, SIZE, avoid), 'top-left');
});

test('an authored anchor wins even over an avoid rect (deliberate overlap)', () => {
  const avoid = [{ x: 0, y: 0, width: VIEW.width, height: VIEW.height }];
  assert.equal(chooseParkCorner(VIEW, SIZE, avoid, 'bottom-right'), 'bottom-right');
});

test('demoFootprint maps canvas fractions, keycaps, and point-at targets', () => {
  const canvas = { x: 100, y: 100, width: 800, height: 600 };
  const keycap = { x: 40, y: 700, width: 60, height: 60 };
  const resolve = (id) => {
    if (id === 'key-i') return keycap;
    if (id === 'status') return { x: 100, y: 10, width: 300, height: 60 };
    return null;
  };
  const rects = demoFootprint(
    [
      { kind: 'move-cursor-xy', x: 0.5, y: 0.5 },
      { kind: 'press-key', key: 'I' },
      { kind: 'point-at', target: 'status' },
      { kind: 'point-at', target: 'missing-target' },
      { kind: 'narrate', title: 'T', body: 'B' },
      { kind: 'wait', ms: 100 },
    ],
    resolve,
    canvas,
    90,
  );
  assert.equal(rects.length, 3);
  // Canvas center (100 + 400, 100 + 300) padded by 90.
  assert.deepEqual(rects[0], { x: 410, y: 310, width: 180, height: 180 });
  assert.deepEqual(rects[1], keycap);
  assert.deepEqual(rects[2], { x: 100, y: 10, width: 300, height: 60 });
});

test('demoFootprint covers move-cursor canvas and skips xy without a canvas', () => {
  const canvas = { x: 0, y: 0, width: 1000, height: 800 };
  const full = demoFootprint([{ kind: 'move-cursor', to: 'canvas' }], () => null, canvas);
  assert.deepEqual(full, [canvas]);
  assert.deepEqual(demoFootprint([{ kind: 'move-cursor-xy', x: 0.5, y: 0.5 }], () => null, null), []);
});

test('demoFootprint dedupes identical rects', () => {
  const keycap = { x: 1, y: 2, width: 3, height: 4 };
  const rects = demoFootprint(
    [
      { kind: 'press-key', key: 'i' },
      { kind: 'open-popover', key: 'i' },
    ],
    () => keycap,
    null,
  );
  assert.deepEqual(rects, [keycap]);
});
