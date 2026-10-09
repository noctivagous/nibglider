// Browser-side raster pixel math for the Image menu. Pure functions over
// RGBA pixel buffers only — no DOM at module scope — so the Node test suite
// can exercise these directly (see tests/image-raster-ops.test.mjs).
// Canvas orchestration (read/write/encode a placed Paper Raster) lives with
// the engine callers. Sharp (./sharpCodec.ts) stays the Node-only counterpart
// for file-level encode work; never import it from the browser graph.

/** Rec. 709 luma of one sRGB pixel, rounded to a byte. */
function luma(r: number, g: number, b: number): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

/** In-place grayscale: luma into R/G/B, alpha untouched. */
export function grayscalePixels(data: Uint8ClampedArray): void {
  for (let i = 0; i + 3 < data.length + 1; i += 4) {
    const y = luma(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
  }
}

/** In-place negative: RGB mirrored, alpha untouched. */
export function invertPixels(data: Uint8ClampedArray): void {
  for (let i = 0; i + 3 < data.length + 1; i += 4) {
    data[i] = 255 - (data[i] ?? 0);
    data[i + 1] = 255 - (data[i + 1] ?? 0);
    data[i + 2] = 255 - (data[i + 2] ?? 0);
  }
}

/** In-place brightness shift: delta (-255..255) added to RGB, alpha
 * untouched. Assignment clamps to the byte range. */
export function brightnessPixels(data: Uint8ClampedArray, delta: number): void {
  const shift = Number.isFinite(delta) ? delta : 0;
  for (let i = 0; i + 3 < data.length + 1; i += 4) {
    data[i] = Math.round((data[i] ?? 0) + shift);
    data[i + 1] = Math.round((data[i + 1] ?? 0) + shift);
    data[i + 2] = Math.round((data[i + 2] ?? 0) + shift);
  }
}

/** In-place contrast about mid-grey: factor 1 is a no-op, above 1
 * strengthens, below 1 flattens. Alpha untouched. */
export function contrastPixels(data: Uint8ClampedArray, factor: number): void {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  for (let i = 0; i + 3 < data.length + 1; i += 4) {
    data[i] = Math.round(((data[i] ?? 0) - 128) * f + 128);
    data[i + 1] = Math.round(((data[i + 1] ?? 0) - 128) * f + 128);
    data[i + 2] = Math.round(((data[i + 2] ?? 0) - 128) * f + 128);
  }
}

function channelAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
): number {
  const cx = Math.min(width - 1, Math.max(0, x));
  const cy = Math.min(height - 1, Math.max(0, y));
  return data[(cy * width + cx) * 4 + channel] ?? 0;
}

/** Box blur with edge replication. Returns a new buffer; the input is
 * untouched so sharpen can diff against it. Radius below 1 copies. */
export function boxBlurPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const r = Math.floor(radius);
  if (!(r >= 1) || width < 1 || height < 1) return out;
  const size = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rs = 0; let gs = 0; let bs = 0;
      for (let ky = -r; ky <= r; ky++) {
        for (let kx = -r; kx <= r; kx++) {
          rs += channelAt(data, width, height, x + kx, y + ky, 0);
          gs += channelAt(data, width, height, x + kx, y + ky, 1);
          bs += channelAt(data, width, height, x + kx, y + ky, 2);
        }
      }
      const at = (y * width + x) * 4;
      out[at] = Math.round(rs / (size * size));
      out[at + 1] = Math.round(gs / (size * size));
      out[at + 2] = Math.round(bs / (size * size));
    }
  }
  return out;
}

/** Unsharp mask against a box blur of the same radius: detail amplified by
 * amount (1 ≈ classic strength). Returns a new buffer. Alpha untouched. */
export function sharpenPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  amount: number,
): Uint8ClampedArray {
  const blurred = boxBlurPixels(data, width, height, radius);
  const out = new Uint8ClampedArray(data);
  const k = Number.isFinite(amount) ? amount : 1;
  for (let i = 0; i + 3 < data.length + 1; i += 4) {
    out[i] = Math.round((data[i] ?? 0) + ((data[i] ?? 0) - (blurred[i] ?? 0)) * k);
    out[i + 1] = Math.round((data[i + 1] ?? 0) + ((data[i + 1] ?? 0) - (blurred[i + 1] ?? 0)) * k);
    out[i + 2] = Math.round((data[i + 2] ?? 0) + ((data[i + 2] ?? 0) - (blurred[i + 2] ?? 0)) * k);
  }
  return out;
}

/** In-place alpha composite onto an opaque background (default white,
// matching Sharp's JPEG flatten default). Result pixels are fully opaque. */
export function flattenPixels(
  data: Uint8ClampedArray,
  r = 255,
  g = 255,
  b = 255,
): void {
  for (let i = 0; i + 3 < data.length + 1; i += 4) {
    const a = (data[i + 3] ?? 255) / 255;
    data[i] = Math.round((data[i] ?? 0) * a + r * (1 - a));
    data[i + 1] = Math.round((data[i + 1] ?? 0) * a + g * (1 - a));
    data[i + 2] = Math.round((data[i + 2] ?? 0) * a + b * (1 - a));
    data[i + 3] = 255;
  }
}
