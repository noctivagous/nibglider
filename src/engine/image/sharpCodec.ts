// Node-only Sharp wrapper. Do not import from App, engine.ts, DropController,
// exportFrames, or any other Vite browser graph — Sharp is a native addon.
import sharp from 'sharp';

type SharpPipeline = ReturnType<typeof sharp>;

export type SharpRasterFormat = 'png' | 'jpeg' | 'webp' | 'avif';

export interface SharpImageInfo {
  width: number;
  height: number;
  format: string;
  space: string;
  channels: number;
  hasAlpha: boolean;
}

export interface SharpEncodeOptions {
  format: SharpRasterFormat;
  /** Lossy quality 1..100. Ignored for PNG. */
  quality?: number;
  /** Flatten alpha onto this fill. JPEG always flattens (default #ffffff). */
  background?: string;
}

export interface SharpRasterResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  format: string;
}

export interface SharpSvgRasterOptions {
  format?: 'png' | 'jpeg' | 'webp';
  background?: string | null;
  /** SVG render DPI. Default 96 to match exportPngSize. */
  density?: number;
}

const INPUT = { failOn: 'warning' as const };

function clampQuality(raw: number | undefined): number {
  if (!Number.isFinite(raw as number)) return 80;
  return Math.min(100, Math.max(1, Math.round(raw as number)));
}

function asBytes(buffer: Uint8Array): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

async function finish(pipeline: SharpPipeline): Promise<SharpRasterResult> {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    bytes: asBytes(data),
    width: info.width,
    height: info.height,
    format: info.format,
  };
}

function applyFormat(pipeline: SharpPipeline, format: SharpRasterFormat, quality: number): SharpPipeline {
  if (format === 'png') return pipeline.png();
  if (format === 'jpeg') return pipeline.jpeg({ quality });
  if (format === 'webp') return pipeline.webp({ quality });
  return pipeline.avif({ quality });
}

function flattenIfNeeded(
  pipeline: SharpPipeline,
  format: SharpRasterFormat,
  background: string | null | undefined,
): SharpPipeline {
  if (format === 'jpeg') {
    return pipeline.flatten({ background: background ?? '#ffffff' });
  }
  if (background) return pipeline.flatten({ background });
  return pipeline;
}

/** Read width, height, format, and alpha from encoded image bytes. */
export async function inspectImage(bytes: Uint8Array): Promise<SharpImageInfo> {
  const meta = await sharp(bytes, INPUT).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  return {
    width,
    height,
    format: meta.format ?? '',
    space: meta.space ?? '',
    channels: meta.channels ?? 0,
    hasAlpha: meta.hasAlpha === true,
  };
}

/** Re-encode raster bytes into PNG, JPEG, WebP, or AVIF. */
export async function encodeRaster(
  bytes: Uint8Array,
  opts: SharpEncodeOptions,
): Promise<SharpRasterResult> {
  const quality = clampQuality(opts.quality);
  let pipeline = sharp(bytes, INPUT);
  pipeline = flattenIfNeeded(pipeline, opts.format, opts.background);
  pipeline = applyFormat(pipeline, opts.format, quality);
  return finish(pipeline);
}

/** Rasterize an SVG string at a pixel size. Node-only; browser export stays
 * on exportFrames.rasterizeSvg (DOM canvas). */
export async function rasterizeSvgWithSharp(
  svg: string,
  size: { width: number; height: number },
  opts?: SharpSvgRasterOptions,
): Promise<SharpRasterResult> {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  const format: SharpRasterFormat = opts?.format ?? 'png';
  const density = Number.isFinite(opts?.density) && (opts?.density as number) > 0
    ? opts?.density as number
    : 96;
  const quality = clampQuality(undefined);
  let pipeline = sharp(new TextEncoder().encode(svg), { ...INPUT, density });
  pipeline = pipeline.resize(width, height, { fit: 'fill' });
  pipeline = flattenIfNeeded(pipeline, format, opts?.background ?? undefined);
  pipeline = applyFormat(pipeline, format, quality);
  return finish(pipeline);
}
