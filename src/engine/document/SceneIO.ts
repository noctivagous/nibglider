// Native scene persistence for Paper.js artwork.
// Gallery autosave stores this JSON. SVG remains an interchange format
// (File → Export / Import / drop). Paper's project.exportSVG writes a
// viewBox the size of the viewport; importSVG then plants a clip-mask
// rectangle of those bounds, which looks like a selected page frame.

type Item = any;

export const SCENE_FORMAT = 'nibglider-scene';
export const SCENE_VERSION = 1;

export interface ScenePayload {
  format: typeof SCENE_FORMAT;
  version: number;
  items: unknown[];
}

export function isSceneJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed) as Partial<ScenePayload>;
    return parsed.format === SCENE_FORMAT && Array.isArray(parsed.items);
  } catch {
    return false;
  }
}

export function isSvgMarkup(text: string): boolean {
  return /<svg[\s>]/i.test(text.slice(0, 4096));
}

/** Drop Paper selection/glow so they are not written into the save. */
export function clearTransient(item: Item): void {
  if (!item) return;
  try {
    item.selected = false;
    item.shadowColor = null;
    item.shadowBlur = 0;
  } catch { /* Detached already. */ }
  const children = item.children;
  if (children) {
    for (const child of children) clearTransient(child);
  }
}

/** Remove viewBox clip-masks Paper.js adds when importing an SVG document. */
export function stripSvgClips(item: Item): void {
  if (!item) return;
  const children = item.children ? [...item.children] : [];
  for (const child of children) {
    if (child && child.clipMask) {
      try { child.remove(); } catch { /* Already gone. */ }
      continue;
    }
    stripSvgClips(child);
  }
}

export function encodeSceneItems(items: Item[]): string {
  const payload: ScenePayload = {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    items: items.map((item) => JSON.parse(item.exportJSON())),
  };
  return JSON.stringify(payload);
}

export function decodeSceneItems(project: paper.Project, json: string): Item[] {
  const parsed = JSON.parse(json) as ScenePayload;
  const layer = project.activeLayer;
  if (!layer) return [];
  const placed: Item[] = [];
  for (const entry of parsed.items) {
    const raw = typeof entry === 'string' ? entry : JSON.stringify(entry);
    // Item#importJSON inserts when the JSON class differs from the target.
    // Project#importJSON creates items with insert:false and they stay detached.
    const item = layer.importJSON(raw);
    if (!item) continue;
    clearTransient(item);
    placed.push(item);
  }
  return placed;
}
