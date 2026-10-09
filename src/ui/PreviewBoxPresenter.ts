// Shape-well SVG paths.
// Owns nothing. Reads path strings the caller already built.
// Writes the d attribute of #shapePreviewPath and #rectShapePreviewPath.
// Public: writePreviewPaths.
// Tested from tests/ui-state.test.mjs.

import type { CombineMode } from '../engine/types';

const COMBINE_PREVIEW_LABELS: Record<CombineMode, string> = {
  union: 'Union',
  subtract: 'Subtract',
  intersect: 'Intersect',
  crop: 'Crop',
  cut: 'Cut',
  interlace: 'Interlace',
};

// Label for the combinatorics titlebar preview box: the selected option,
// "None" when combinatorics is off.
export function combinePreviewBoxLabel(mode: CombineMode | 'none'): string {
  if (mode === 'none') return 'None';
  return COMBINE_PREVIEW_LABELS[mode] ?? 'Combinatorics';
}

export interface PreviewDocument {
  getElementById(id: string): { setAttribute(name: string, value: string): void } | null;
}

export function writePreviewPaths(
  doc: PreviewDocument,
  paths: { circle: string; rect: string },
): void {
  const circle = doc.getElementById('shapePreviewPath');
  if (circle) circle.setAttribute('d', paths.circle);
  const rect = doc.getElementById('rectShapePreviewPath');
  if (rect) rect.setAttribute('d', paths.rect);
}
