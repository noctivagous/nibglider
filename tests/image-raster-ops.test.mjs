import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boxBlurPixels,
  brightnessPixels,
  contrastPixels,
  flattenPixels,
  grayscalePixels,
  invertPixels,
  sharpenPixels,
} from '../src/engine/image/rasterOps.ts';

function pixels(values) {
  return new Uint8ClampedArray(values);
}

test('grayscale maps to Rec. 709 luma and preserves alpha', () => {
  const data = pixels([255, 0, 0, 255, 0, 0, 255, 128]);
  grayscalePixels(data);
  assert.equal(data[0], 54);
  assert.equal(data[1], 54);
  assert.equal(data[2], 54);
  assert.equal(data[3], 255);
  assert.equal(data[4], 18);
  assert.equal(data[5], 18);
  assert.equal(data[6], 18);
  assert.equal(data[7], 128);
});

test('grayscale leaves mid-grey and white unchanged', () => {
  const data = pixels([128, 128, 128, 255, 255, 255, 255, 255]);
  grayscalePixels(data);
  assert.deepEqual([...data], [128, 128, 128, 255, 255, 255, 255, 255]);
});

test('flatten composites semi-transparent pixels onto white', () => {
  const data = pixels([255, 0, 0, 128, 0, 0, 0, 0, 10, 20, 30, 255]);
  flattenPixels(data);
  assert.deepEqual([...data], [255, 127, 127, 255, 255, 255, 255, 255, 10, 20, 30, 255]);
});

test('flatten honors an explicit background color', () => {
  const data = pixels([255, 0, 0, 128]);
  flattenPixels(data, 0, 0, 0);
  assert.deepEqual([...data], [128, 0, 0, 255]);
});

test('invert mirrors RGB and preserves alpha', () => {
  const data = pixels([10, 20, 30, 128]);
  invertPixels(data);
  assert.deepEqual([...data], [245, 235, 225, 128]);
});

test('brightness shifts RGB and clamps to the byte range', () => {
  const up = pixels([100, 100, 100, 255]);
  brightnessPixels(up, 10);
  assert.deepEqual([...up], [110, 110, 110, 255]);
  const down = pixels([100, 100, 100, 255]);
  brightnessPixels(down, -300);
  assert.deepEqual([...down], [0, 0, 0, 255]);
});

test('contrast pivots about mid-grey', () => {
  const data = pixels([100, 100, 100, 255, 128, 128, 128, 255]);
  contrastPixels(data, 2);
  assert.deepEqual([...data], [72, 72, 72, 255, 128, 128, 128, 255]);
});

test('box blur averages with edge replication; radius below 1 copies', () => {
  const data = pixels([0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255]);
  const out = boxBlurPixels(data, 3, 1, 1);
  assert.deepEqual([...out].filter((_, i) => i % 4 === 0), [85, 85, 85]);
  assert.notEqual(out, data);
  const single = pixels([5, 6, 7, 255]);
  const copied = boxBlurPixels(single, 1, 1, 0);
  assert.deepEqual([...copied], [5, 6, 7, 255]);
  assert.notEqual(copied, single);
});

test('sharpen amplifies detail against the blur', () => {
  const data = pixels([100, 0, 0, 255, 200, 0, 0, 255, 100, 0, 0, 255]);
  const out = sharpenPixels(data, 3, 1, 1, 1);
  assert.deepEqual([...out].filter((_, i) => i % 4 === 0), [67, 255, 67]);
  assert.deepEqual([...out].filter((_, i) => i % 4 === 3), [255, 255, 255]);
});
