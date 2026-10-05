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
