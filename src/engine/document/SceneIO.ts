// Native scene persistence for Paper.js artwork.
// Gallery autosave stores this JSON. SVG remains an interchange format
// (File → Export / Import / drop). Paper's project.exportSVG writes a
// viewBox the size of the viewport; importSVG then plants a clip-mask
// rectangle of those bounds, which looks like a selected page frame.

type Item = any;

export const SCENE_FORMAT = 'nibglider-scene';
export const SCENE_VERSION = 1;

/** View to restore with the document. Optional on older saves. */
export interface SceneView {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface ScenePayload {
  format: typeof SCENE_FORMAT;
  version: number;
  items: unknown[];
  view?: SceneView;
}

function sceneViewOf(value: unknown): SceneView | null {
  if (!value || typeof value !== 'object') return null;
  const view = value as Partial<SceneView>;
  const { centerX, centerY, zoom } = view;
  if (typeof centerX !== 'number' || typeof centerY !== 'number' || typeof zoom !== 'number') return null;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !Number.isFinite(zoom) || zoom <= 0) return null;
  return { centerX, centerY, zoom };
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

export function encodeSceneItems(items: Item[], view?: SceneView | null): string {
  const payload: ScenePayload = {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    items: items.map((item) => JSON.parse(item.exportJSON())),
  };
  const stored = view ? sceneViewOf(view) : null;
  if (stored) payload.view = stored;
  return JSON.stringify(payload);
}

/** View stored with a scene, or null when the payload has none. */
export function readSceneView(json: string): SceneView | null {
  try {
    const parsed = JSON.parse(json) as Partial<ScenePayload>;
    return sceneViewOf(parsed.view);
  } catch {
    return null;
  }
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
