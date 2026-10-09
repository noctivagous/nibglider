import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenPixels, grayscalePixels } from '../src/engine/image/rasterOps.ts';

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
