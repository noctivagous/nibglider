import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { exportPngSize } from '../src/engine/model/NGExportFrame.ts';
import {
  encodeRaster,
  inspectImage,
  rasterizeSvgWithSharp,
} from '../src/engine/image/sharpCodec.ts';

async function redPng() {
  return sharp({
    create: {
      width: 16,
      height: 8,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  }).png().toBuffer();
}

test('inspectImage reports dimensions, format, and alpha of a PNG', async () => {
  const png = await redPng();
  const info = await inspectImage(png);
  assert.equal(info.width, 16);
  assert.equal(info.height, 8);
  assert.equal(info.format, 'png');
  assert.equal(info.hasAlpha, true);
  assert.equal(info.channels, 4);
});

test('encodeRaster converts PNG to JPEG and WebP at the same size', async () => {
  const png = await redPng();
  const jpeg = await encodeRaster(png, { format: 'jpeg', quality: 80 });
  assert.equal(jpeg.format, 'jpeg');
  assert.equal(jpeg.width, 16);
  assert.equal(jpeg.height, 8);
  const jpegInfo = await inspectImage(jpeg.bytes);
  assert.equal(jpegInfo.format, 'jpeg');
  assert.equal(jpegInfo.hasAlpha, false);

  const webp = await encodeRaster(png, { format: 'webp', quality: 80 });
  assert.equal(webp.format, 'webp');
  assert.equal(webp.width, 16);
  assert.equal(webp.height, 8);
  const webpInfo = await inspectImage(webp.bytes);
  assert.equal(webpInfo.format, 'webp');
});

test('rasterizeSvgWithSharp matches exportPngSize at 96dpi', async () => {
  const box = { x: 0, y: 0, width: 72, height: 36 };
  const size = exportPngSize(box, 1);
  assert.deepEqual(size, { width: 96, height: 48 });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="36"><rect width="72" height="36" fill="#00ff00"/></svg>';
  const png = await rasterizeSvgWithSharp(svg, size);
  assert.equal(png.format, 'png');
  assert.equal(png.width, 96);
  assert.equal(png.height, 48);
  const info = await inspectImage(png.bytes);
  assert.equal(info.format, 'png');
  assert.equal(info.width, 96);
  assert.equal(info.height, 48);
});

test('inspectImage rejects corrupt bytes', async () => {
  await assert.rejects(() => inspectImage(new Uint8Array([0, 1, 2, 3, 4])), /unsupported|corrupt|Input buffer/i);
});
