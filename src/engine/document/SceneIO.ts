// Native scene persistence for Paper.js artwork.
// Gallery autosave stores this JSON. SVG remains an interchange format
// (File → Export / Import / drop). Paper's project.exportSVG writes a
// viewBox the size of the viewport; importSVG then plants a clip-mask
// rectangle of those bounds, which looks like a selected page frame.
import { readGuideRecords, type GuideRecord } from './guides';
import { readPrintSetup, type PrintSetup } from './printSetup';

type Item = any;

export const SCENE_FORMAT = 'nibglider-scene';
/** Current scene version. v1 payloads (flat items, no layers) stay
 * readable forever: they decode onto the active layer. v2 groups
 * items by document layer so a saved document keeps its layers. */
export const SCENE_VERSION = 2;

/** View to restore with the document. Optional on older saves. */
export interface SceneView {
  centerX: number;
  centerY: number;
  zoom: number;
}

/** One document layer as stored in a v2 payload, bottom-to-top. */
export interface SceneLayer {
  id: string;
  name: string;
  items: unknown[];
}

export interface ScenePayload {
  format: typeof SCENE_FORMAT;
  version: number;
  items: unknown[];
  view?: SceneView;
  layers?: SceneLayer[];
  activeLayerId?: string;
  /** Optional extras (guides + print setup) carried since Tier Two.
   * Absent in older payloads; readers treat absence as "none". */
  guides?: GuideRecord[];
  printSetup?: PrintSetup;
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
    version: 1,
    items: items.map((item) => JSON.parse(item.exportJSON())),
  };
  const stored = view ? sceneViewOf(view) : null;
  if (stored) payload.view = stored;
  return JSON.stringify(payload);
}

/** Layer records named by a payload, bottom-to-top; empty for v1. */
export function readSceneLayers(json: string): Array<{ id: string; name: string }> {
  try {
    const parsed = JSON.parse(json) as Partial<ScenePayload>;
    if (!Array.isArray(parsed.layers)) return [];
    return parsed.layers
      .filter((layer) => layer && typeof layer.id === 'string' && typeof layer.name === 'string')
      .map((layer) => ({ id: layer.id as string, name: layer.name as string }));
  } catch {
    return [];
  }
}

/**
 * v2 encode: items grouped under their document layers.
 * `entries` pairs each item with the record id of its layer;
 * `layers` is the full bottom-to-top layer stack (empty layers are
 * preserved). Items naming an unknown layer fall into the first.
 */
export function encodeSceneDocument(
  entries: Array<{ item: Item; layerId: string }>,
  layers: Array<{ id: string; name: string }>,
  view?: SceneView | null,
  activeLayerId?: string | null,
  extras?: { guides?: readonly GuideRecord[]; printSetup?: PrintSetup | null },
): string {
  const groups = new Map<string, unknown[]>();
  for (const layer of layers) groups.set(layer.id, []);
  const fallback = layers[0]?.id;
  for (const entry of entries) {
    const key = groups.has(entry.layerId) ? entry.layerId : fallback;
    if (key === undefined) continue;
    groups.get(key)!.push(JSON.parse(entry.item.exportJSON()));
  }
  const payload: ScenePayload = {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    items: [],
    layers: layers.map((layer) => ({ id: layer.id, name: layer.name, items: groups.get(layer.id) ?? [] })),
  };
  if (activeLayerId) payload.activeLayerId = activeLayerId;
  const stored = view ? sceneViewOf(view) : null;
  if (stored) payload.view = stored;
  if (extras?.guides && extras.guides.length > 0) {
    payload.guides = extras.guides.map((guide) => ({ ...guide }));
  }
  if (extras?.printSetup) payload.printSetup = extras.printSetup;
  return JSON.stringify(payload);
}

/** Guides stored with a scene payload; empty for older payloads. */
export function readSceneGuides(json: string): GuideRecord[] {
  try {
    const parsed = JSON.parse(json) as Partial<ScenePayload>;
    return readGuideRecords(parsed.guides);
  } catch {
    return [];
  }
}

/** Print setup stored with a scene payload, or null when absent. */
export function readScenePrintSetup(json: string): PrintSetup | null {
  try {
    const parsed = JSON.parse(json) as Partial<ScenePayload>;
    return readPrintSetup(parsed.printSetup);
  } catch {
    return null;
  }
}

/** Active layer record id stored with a v2 scene, or null. */
export function readSceneActiveLayerId(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as Partial<ScenePayload>;
    return typeof parsed.activeLayerId === 'string' ? parsed.activeLayerId : null;
  } catch {
    return null;
  }
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
  const placed: Item[] = [];
  const placeInto = (layer: Item, entries: unknown[]): void => {
    if (!layer) return;
    for (const entry of entries) {
      const raw = typeof entry === 'string' ? entry : JSON.stringify(entry);
      // Item#importJSON inserts when the JSON class differs from the target.
      // Project#importJSON creates items with insert:false and they stay detached.
      const item = layer.importJSON(raw);
      if (!item) continue;
      clearTransient(item);
      placed.push(item);
    }
  };
  if (parsed.version >= 2 && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
    // v2: one fresh Paper layer per stored layer, in stack order,
    // flagged with the record id so LayerManager.syncWithProject can
    // adopt them in order. The previously active layer keeps any
    // items the caller did not clear (clipboard paste path).
    const scope = (project as unknown as { _scope?: unknown })._scope as
      { Layer?: new () => Item } | undefined;
    // Reuse empty non-guide layers already in the project, in order,
    // before creating new ones: a scene replace empties the current
    // layers first, and reusing them keeps the active layer's
    // identity (and everything that looks only at it) stable.
    const reusable = (project.layers as Item[]).filter(
      (layer) => !(layer as { guide?: boolean }).guide && (layer.children?.length ?? 0) === 0,
    );
    let reuseIndex = 0;
    for (const stored of parsed.layers) {
      let layer: Item = reusable[reuseIndex] ?? null;
      if (layer) reuseIndex += 1;
      if (!layer && scope?.Layer) {
        try {
          layer = new scope.Layer();
          project.addLayer(layer);
        } catch { layer = null; }
      }
      if (!layer) layer = project.activeLayer;
      if (layer) {
        try {
          layer.name = stored.name;
          if (!layer.data) layer.data = {};
          layer.data.layerRecordId = stored.id;
        } catch { /* Read-only layer. */ }
      }
      placeInto(layer, Array.isArray(stored.items) ? stored.items : []);
    }
    return placed;
  }
  const layer = project.activeLayer;
  if (!layer) return [];
  placeInto(layer, Array.isArray(parsed.items) ? parsed.items : []);
  return placed;
}
