// Shape-well SVG paths.
// Owns nothing. Reads path strings the caller already built.
// Writes the d attribute of #shapePreviewPath and #rectShapePreviewPath.
// Public: writePreviewPaths.
// Tested from tests/ui-state.test.mjs.

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
