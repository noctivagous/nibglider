// Paper.js side of Printify garments. Garments are groups: one locked
// outline item (visual guide only) plus one live area rect per Printify
// placeholder. Area rects behave like export frames: artwork contained in
// or intersecting an area exports at that area's exact pixel size, without
// clipping the live elements. Outlines and areas are never artwork: export
// and artwork queries must filter them out explicitly.
import {
  frameMatchesArtwork,
  type ExportFrameBox,
} from '../model/NGExportFrame';
import {
  validatePrintifyGarment,
  type PrintifyGarmentRecord,
} from '../model/NGPrintifyGarment';

type Item = any;

export const PRINTIFY_GARMENT_DATA_KEY = 'isPrintifyGarment';
export const PRINTIFY_GARMENT_RECORD_KEY = 'printifyGarment';
export const PRINTIFY_AREA_DATA_KEY = 'isPrintifyArea';
export const PRINTIFY_AREA_GARMENT_KEY = 'printifyGarmentId';
export const PRINTIFY_AREA_POSITION_KEY = 'printifyAreaPosition';

export function isPrintifyGarmentItem(item: Item): boolean {
  return !!item && item.data?.[PRINTIFY_GARMENT_DATA_KEY] === true;
}

export function isPrintifyAreaItem(item: Item): boolean {
  return !!item && item.data?.[PRINTIFY_AREA_DATA_KEY] === true;
}

/** Non-artwork items: export frames, garment outlines, and garment areas. */
export function isNonArtworkItem(item: Item): boolean {
  return isPrintifyGarmentItem(item) || isPrintifyAreaItem(item)
    || item?.data?.isExportFrame === true;
}

/** Read and validate the garment record on an outline item. */
export function readPrintifyGarment(item: Item): PrintifyGarmentRecord | null {
  if (!isPrintifyGarmentItem(item)) return null;
  try {
    const record = structuredClone(item.data?.[PRINTIFY_GARMENT_RECORD_KEY]);
    validatePrintifyGarment(record);
    return record;
  } catch {
    return null;
  }
}

/** Artwork contained in or intersecting one garment area. The outline and
 * all area rects are never included. Pass the live area bounds so dragged
 * or resized areas match exactly. */
export function garmentAreaArtwork(
  area: ExportFrameBox,
  items: Item[],
  liveRect?: ExportFrameBox,
): Item[] {
  const box = liveRect ?? area;
  return items.filter((item) => {
    if (isNonArtworkItem(item)) return false;
    let bounds: ExportFrameBox | null = null;
    try {
      const b = item.bounds;
      if (!b) return false;
      bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
      return false;
    }
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    return frameMatchesArtwork(box, bounds);
  });
}
