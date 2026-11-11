// Placed-image crop and masking (Tier Two, Slice 8).
//
// A placed image (a Paper Raster in the app; any content item in
// tests) is wrapped in a group when it gains a crop or a mask:
//   Group(data.imageMaskGroup, data.imageCrop, data.imageMaskPathData)
//     [0] effective mask item (clipMask) — rebuilt from the records
//     [1] the image content, untouched pixels
// The records mirror the NGImage model: `boundary` is the crop
// rectangle, `mask` is the clipping shape (kept as SVG path data so
// curves survive and the record is plain JSON). The effective clip
// is mask ∩ crop. Booleans against an image rewrite the mask
// record — the decided rule: clip the mask, never the pixels.

type Item = any;

export interface ImageCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isImageMaskGroup(item: Item): boolean {
  return !!item && item.className === 'Group' && item.data?.imageMaskGroup === true;
}

/** The image content inside a mask group, or the item itself. */
export function imageContentOf(root: Item): Item {
  if (isImageMaskGroup(root)) {
    return (root.children ?? []).find((c: Item) => c.data?.imageMaskPath !== true) ?? null;
  }
  return root ?? null;
}

/** The group wrapping an image, or null when it is bare. */
export function imageGroupOf(root: Item): Item {
  return isImageMaskGroup(root) ? root : null;
}

function rectPathData(rect: ImageCropRect): string {
  const { x, y, width: w, height: h } = rect;
  return `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
}

/** Wrap bare image content in a mask group (identity transform, so
 * document coordinates stay valid inside it). Returns the group. */
export function ensureImageGroup(scope: any, content: Item): Item {
  if (isImageMaskGroup(content)) return content;
  const group = new scope.Group();
  group.data = { ...(group.data ?? {}), imageMaskGroup: true, imageCrop: null, imageMaskPathData: null };
  const parent = content.parent;
  const index = parent ? parent.children.indexOf(content) : -1;
  if (parent && index >= 0) parent.insertChild(index, group);
  group.addChild(content);
  return group;
}

/** Rebuild the effective clip-mask item from the stored records. */
export function rebuildImageMask(scope: any, group: Item): void {
  if (!isImageMaskGroup(group)) return;
  for (const child of [...(group.children ?? [])]) {
    if (child.data?.imageMaskPath === true) child.remove();
  }
  const content = imageContentOf(group);
  const crop: ImageCropRect | null = group.data.imageCrop ?? null;
  const maskPathData: string | null = group.data.imageMaskPathData ?? null;
  if (!content || (!crop && !maskPathData)) return;
  let maskItem: Item = maskPathData
    ? new scope.CompoundPath(maskPathData)
    : new scope.Path(rectPathData({
        x: content.bounds.x, y: content.bounds.y,
        width: content.bounds.width, height: content.bounds.height,
      }));
  if (crop && maskPathData) {
    const cropItem = new scope.Path(rectPathData(crop));
    const clipped = maskItem.intersect(cropItem, { insert: false });
    maskItem.remove();
    cropItem.remove();
    maskItem = clipped;
  } else if (crop && !maskPathData) {
    maskItem.remove();
    maskItem = new scope.Path(rectPathData(crop));
  }
  maskItem.clipMask = true;
  maskItem.fillColor = new scope.Color('white');
  maskItem.strokeColor = null;
  maskItem.data = { ...(maskItem.data ?? {}), imageMaskPath: true };
  group.insertChild(0, maskItem);
}

/** Set (or clear, with null) the crop rectangle — the NGImage
 * boundary record. Returns the resulting root (group or content). */
export function setImageCrop(scope: any, root: Item, crop: ImageCropRect | null): Item {
  let group = imageGroupOf(root);
  if (!group) {
    if (!crop) return root;
    group = ensureImageGroup(scope, root);
  }
  group.data = { ...group.data, imageCrop: crop };
  rebuildImageMask(scope, group);
  return maybeUnwrap(group);
}

/** Set the shape mask from a geometry item's path data — the
 * NGImage mask record. Returns the resulting root. */
export function setImageMask(scope: any, root: Item, maskGeometry: Item): Item {
  const group = imageGroupOf(root) ?? ensureImageGroup(scope, root);
  group.data = { ...group.data, imageMaskPathData: maskGeometry.pathData ?? null };
  rebuildImageMask(scope, group);
  return group;
}

/** Clear the shape mask record (crop, if any, stays). */
export function clearImageMask(scope: any, root: Item): Item {
  const group = imageGroupOf(root);
  if (!group) return root;
  group.data = { ...group.data, imageMaskPathData: null };
  rebuildImageMask(scope, group);
  return maybeUnwrap(group);
}

/**
 * Boolean an image against a tool shape by rewriting its mask:
 * subtract cuts the tool out of the visible region, intersect/crop
 * keep only the overlap, union adds the tool's area (clipped to
 * the image's own bounds — no pixels exist beyond them).
 */
export function booleanImageMask(
  scope: any,
  root: Item,
  mode: 'subtract' | 'intersect' | 'crop' | 'union',
  toolGeometry: Item,
): Item {
  const content = imageContentOf(root);
  if (!content || !toolGeometry) return root;
  const group = imageGroupOf(root) ?? ensureImageGroup(scope, root);
  const bounds = content.bounds;
  const currentData: string = group.data.imageMaskPathData
    ?? rectPathData({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  const current = new scope.CompoundPath(currentData);
  const tool = new scope.CompoundPath(toolGeometry.pathData ?? '');
  let result: Item;
  if (mode === 'subtract') result = current.subtract(tool, { insert: false });
  else if (mode === 'union') {
    const grown = current.unite(tool, { insert: false });
    const boundsItem = new scope.Path(rectPathData({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }));
    result = grown.intersect(boundsItem, { insert: false });
    grown.remove();
    boundsItem.remove();
  } else {
    result = current.intersect(tool, { insert: false });
  }
  current.remove();
  tool.remove();
  group.data = { ...group.data, imageMaskPathData: result?.pathData ?? null };
  result?.remove();
  rebuildImageMask(scope, group);
  return group;
}

/** Remove the group when neither crop nor mask remains. */
function maybeUnwrap(group: Item): Item {
  if (group.data?.imageCrop || group.data?.imageMaskPathData) return group;
  const content = imageContentOf(group);
  if (!content) return group;
  const parent = group.parent;
  const index = parent ? parent.children.indexOf(group) : -1;
  if (parent && index >= 0) parent.insertChild(index, content);
  else content.remove();
  for (const child of [...(group.children ?? [])]) {
    if (child !== content) child.remove();
  }
  group.remove();
  return content;
}
