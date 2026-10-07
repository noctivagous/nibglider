// Paper.js side of Export Frames. Frames are ordinary selectable items on
// the artwork layer (so native save, undo, marquee-select, and hit-testing
// keep working) tagged with validated records in item data. They are never
// artwork: export and artwork queries must filter them out explicitly.
import {
  frameMatchesArtwork,
  resolveExportBoxes,
  validateExportFrame,
  type ExportFrameBox,
  type ExportFrameRecord,
} from '../model/NGExportFrame';

type Item = any;

export const EXPORT_FRAME_DATA_KEY = 'isExportFrame';
export const EXPORT_FRAME_RECORD_KEY = 'exportFrame';
/** Short aliases used at deposit/read sites. */
export const EXPORT_FRAME_KEY = EXPORT_FRAME_DATA_KEY;
export const EXPORT_FRAME_RECORD = EXPORT_FRAME_RECORD_KEY;

export function isExportFrameItem(item: Item): boolean {
  return !!item && item.data?.[EXPORT_FRAME_DATA_KEY] === true;
}

/** Read and validate the frame record on an item. Returns null for
 * non-frames and for corrupt records instead of throwing into callers. */
export function readExportFrame(item: Item): ExportFrameRecord | null {
  if (!isExportFrameItem(item)) return null;
  try {
    const record = structuredClone(item.data?.[EXPORT_FRAME_RECORD_KEY]);
    validateExportFrame(record);
    return record;
  } catch {
    return null;
  }
}

/** Artwork items only: everything on the layer except export frames. */
export function artworkItems(items: Item[]): Item[] {
  return items.filter((item) => !isExportFrameItem(item));
}

export function exportFrameItems(items: Item[]): Item[] {
  return items.filter(isExportFrameItem);
}

function paperRect(box: { x: number; y: number; width: number; height: number }): ExportFrameBox {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

export interface RasterizeOptions {
  /** Canvas 2D mime type, e.g. 'image/png' or 'image/jpeg'. */
  mime: string;
  /** Encoder quality 0..1; only meaningful for lossy mime types. */
  quality?: number;
  /** Opaque background fill, or null for transparent (PNG only). */
  background: string | null;
}

/** Rasterize an exported SVG string to an image blob at the given pixel
 * size. Needs DOM (Image + canvas); returns null when rasterization is
 * unavailable so callers can report instead of downloading garbage. */
export function rasterizeSvg(
  svg: string,
  size: { width: number; height: number },
  options: RasterizeOptions,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      if (typeof document === 'undefined' || typeof Image === 'undefined') {
        resolve(null);
        return;
      }
      const sized = svg.replace(/<svg([^>]*)>/, (_match, attrs: string) => {
        const stripped = String(attrs)
          .replace(/\swidth="[^"]*"/, '')
          .replace(/\sheight="[^"]*"/, '');
        return `<svg${stripped} width="${size.width}" height="${size.height}">`;
      });
      const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
      const image = new Image();
      image.onload = (): void => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size.width;
          canvas.height = size.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }
          if (options.background) {
            ctx.fillStyle = options.background;
            ctx.fillRect(0, 0, size.width, size.height);
          } else if (options.mime === 'image/jpeg') {
            // JPEG has no alpha channel: an unfilled canvas encodes as
            // black, so default to an opaque white base instead.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size.width, size.height);
          } else {
            ctx.clearRect(0, 0, size.width, size.height);
          }
          ctx.drawImage(image, 0, 0, size.width, size.height);
          URL.revokeObjectURL(url);
          const quality = Number.isFinite(options.quality)
            ? Math.min(1, Math.max(0, options.quality as number))
            : undefined;
          canvas.toBlob((blob) => resolve(blob), options.mime, quality);
        } catch {
          try { URL.revokeObjectURL(url); } catch { /* ignore */ }
          resolve(null);
        }
      };
      image.onerror = (): void => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        resolve(null);
      };
      image.src = url;
    } catch {
      resolve(null);
    }
  });
}

/** PNG entry point kept for the export-frame path. */
export function rasterizeSvgToPng(
  svg: string,
  size: { width: number; height: number },
  background: string | null,
): Promise<Blob | null> {
  return rasterizeSvg(svg, size, { mime: 'image/png', background });
}

/** Artwork contained in or intersecting the frame. The frame itself and
 * other frames are never included. Pass the live frame bounds so dragged
 * or resized frames match exactly. */
export function frameArtwork(frame: ExportFrameRecord, items: Item[], liveRect?: ExportFrameBox): Item[] {
  const boxes = resolveExportBoxes(frame, liveRect);
  return artworkItems(items).filter((item) => {
    let bounds: ExportFrameBox | null = null;
    try {
      const b = item.bounds;
      if (!b) return false;
      bounds = paperRect({ x: b.x, y: b.y, width: b.width, height: b.height });
    } catch {
      return false;
    }
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    return boxes.some((box) => frameMatchesArtwork(box, bounds));
  });
}
