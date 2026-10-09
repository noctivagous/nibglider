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
