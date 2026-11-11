// The native NibGlider document file: the NG model on disk.
//
// A .nibglider.json file is a JSON envelope carrying everything a
// document is: its catalog drawables (validated with the model
// serialization validators), its retained Bézier path sources, its
// layers, page settings and view — plus the nibglider-scene payload
// that carries the live Paper geometry for every item, model-backed
// or not. The scene payload stays the geometry carrier so artwork
// made before the model existed (and artwork the model does not
// describe) round-trips losslessly; the model sections are the
// document's semantic record and are restored into the catalog and
// the retained-source registry on open.
//
// Legacy stays readable: nibglider-scene v1/v2 JSON and the gallery
// (whose bodies are scene payloads) open through the same engine
// entry point; this module only defines the native envelope, its
// schema version, and its migrations. Version history:
//   v0 — pre-release drafts: no `version` field, no model sections.
//   v1 — first shipped format: one page, sections at the top level.
//   v2 — multi-page: a `pages` array of full page records (each with
//        its own layers, drawables, retained paths, scene and
//        guides), an `activePageId`, and a document `printSetup`.
//        The v1 top-level sections remain, mirroring the ACTIVE
//        page, so a v1 reader still opens the page you were on.
// Tested from tests/native-document.test.mjs and
// tests/pages-guides-print.test.mjs.
import { validateDrawable } from '../model/serialization';
import type { NGDrawable, NGPathDrawable } from '../model/NGDrawable';
import {
  isSceneJson, readSceneActiveLayerId, readSceneLayers, readSceneView,
  type SceneView,
} from './SceneIO';
import { readGuideRecords, type GuideRecord } from './guides';
import { readPrintSetup, type PrintSetup } from './printSetup';

export const NATIVE_FORMAT = 'nibglider-document';
export const NATIVE_VERSION = 2;
export const NATIVE_FILE_EXTENSION = '.nibglider.json';

export interface NativeLayerRecord {
  id: string;
  name: string;
}

export interface NativePageSettings {
  widthPt: number | null;
  heightPt: number | null;
  orientation: string | null;
  unit: string;
}

/** One page of a v2 document: a complete scene of its own, with its
 * own layers and model sections, sharing the document's settings. */
export interface NativePageRecord {
  id: string;
  name: string;
  page: NativePageSettings | null;
  layers: NativeLayerRecord[];
  activeLayerId: string | null;
  drawables: NGDrawable[];
  retainedPaths: NGPathDrawable[];
  scene: string;
  guides: GuideRecord[];
}

export interface NativeDocumentFile {
  format: typeof NATIVE_FORMAT;
  version: number;
  name: string;
  savedAt: string;
  /** Document layers in stack order (bottom first). Mirrors the
   * active page in v2. */
  layers: NativeLayerRecord[];
  activeLayerId: string | null;
  /** Catalog drawables for the document's page, in stack order.
   * Mirrors the active page in v2. */
  drawables: NGDrawable[];
  /** Retained Bézier sources for non-catalog items, keyed by the
   * drawableId the scene items carry. */
  retainedPaths: NGPathDrawable[];
  page: NativePageSettings | null;
  view: SceneView | null;
  /** nibglider-scene payload (current scene version) with the live
   * geometry of every item in the document. Mirrors the active page
   * in v2. */
  scene: string;
  /** All pages, in document order (v2). */
  pages: NativePageRecord[];
  activePageId: string | null;
  /** Printer page setup, separate from Document Size (v2). */
  printSetup: PrintSetup | null;
}

export interface NativeDocumentParts {
  name: string;
  savedAt: string;
  layers: NativeLayerRecord[];
  activeLayerId: string | null;
  drawables: NGDrawable[];
  retainedPaths: NGPathDrawable[];
  page: NativePageSettings | null;
  view: SceneView | null;
  scene: string;
  pages?: NativePageRecord[];
  activePageId?: string | null;
  printSetup?: PrintSetup | null;
}

/** The single page record a pre-v2 document amounts to. */
export function synthesizedPage(parts: {
  page: NativePageSettings | null;
  layers: NativeLayerRecord[];
  activeLayerId: string | null;
  drawables: NGDrawable[];
  retainedPaths: NGPathDrawable[];
  scene: string;
  guides?: GuideRecord[];
}): NativePageRecord {
  return {
    id: 'page-1',
    name: 'Page 1',
    page: parts.page,
    layers: parts.layers.map((layer) => ({ id: layer.id, name: layer.name })),
    activeLayerId: parts.activeLayerId,
    drawables: parts.drawables,
    retainedPaths: parts.retainedPaths,
    scene: parts.scene,
    guides: parts.guides ? parts.guides.map((guide) => ({ ...guide })) : [],
  };
}

export function buildNativeDocument(parts: NativeDocumentParts): NativeDocumentFile {
  const pages = parts.pages && parts.pages.length > 0
    ? parts.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => ({ id: layer.id, name: layer.name })),
      guides: page.guides.map((guide) => ({ ...guide })),
    }))
    : [synthesizedPage(parts)];
  const activePageId = parts.activePageId && pages.some((page) => page.id === parts.activePageId)
    ? parts.activePageId
    : pages[0].id;
  return {
    format: NATIVE_FORMAT,
    version: NATIVE_VERSION,
    name: parts.name,
    savedAt: parts.savedAt,
    layers: parts.layers.map((layer) => ({ id: layer.id, name: layer.name })),
    activeLayerId: parts.activeLayerId,
    drawables: parts.drawables,
    retainedPaths: parts.retainedPaths,
    page: parts.page,
    view: parts.view,
    scene: parts.scene,
    pages,
    activePageId,
    printSetup: parts.printSetup ?? null,
  };
}

export function serializeNativeDocument(doc: NativeDocumentFile): string {
  return JSON.stringify(doc, null, 2);
}

/** Cheap sniff: does this text claim to be a native document? */
export function isNativeDocumentText(text: string): boolean {
  if (typeof text !== 'string') return false;
  const head = text.slice(0, 4096);
  return head.includes(`"format": "${NATIVE_FORMAT}"`) || head.includes(`"format":"${NATIVE_FORMAT}"`);
}

export type NativeParseResult =
  | { ok: true; doc: NativeDocumentFile }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readLayers(value: unknown): NativeLayerRecord[] {
  if (!Array.isArray(value)) return [];
  const layers: NativeLayerRecord[] = [];
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.id === 'string' && typeof entry.name === 'string') {
      layers.push({ id: entry.id, name: entry.name });
    }
  }
  return layers;
}

function readPage(value: unknown): NativePageSettings | null {
  if (!isRecord(value)) return null;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    widthPt: num(value.widthPt),
    heightPt: num(value.heightPt),
    orientation: typeof value.orientation === 'string' ? value.orientation : null,
    unit: typeof value.unit === 'string' ? value.unit : 'pt',
  };
}

function readView(value: unknown): SceneView | null {
  if (!isRecord(value)) return null;
  const { centerX, centerY, zoom } = value as Partial<SceneView>;
  if (typeof centerX !== 'number' || typeof centerY !== 'number' || typeof zoom !== 'number') return null;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !Number.isFinite(zoom) || zoom <= 0) return null;
  return { centerX, centerY, zoom };
}

/** v0 → v1: drafts had no version field and no model sections; the
 * scene payload (and the layers/view readable from it) is the whole
 * document. Stamp the current version and default the rest. */
function migrate0to1(raw: Record<string, unknown>): Record<string, unknown> {
  const scene = typeof raw.scene === 'string' ? raw.scene : '';
  return {
    ...raw,
    format: NATIVE_FORMAT,
    version: 1,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Untitled',
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    layers: readSceneLayers(scene),
    activeLayerId: readSceneActiveLayerId(scene),
    drawables: [],
    retainedPaths: [],
    page: null,
    view: readSceneView(scene),
    scene,
  };
}

/** v1 → v2: the single set of top-level sections becomes the one
 * page; the top level stays as its mirror. Guides and print setup
 * start empty/default. */
function migrate1to2(raw: Record<string, unknown>): Record<string, unknown> {
  const page: Record<string, unknown> = {
    id: 'page-1',
    name: 'Page 1',
    page: raw.page ?? null,
    layers: Array.isArray(raw.layers) ? raw.layers : [],
    activeLayerId: typeof raw.activeLayerId === 'string' ? raw.activeLayerId : null,
    drawables: Array.isArray(raw.drawables) ? raw.drawables : [],
    retainedPaths: Array.isArray(raw.retainedPaths) ? raw.retainedPaths : [],
    scene: typeof raw.scene === 'string' ? raw.scene : '',
    guides: [],
  };
  return { ...raw, version: 2, pages: [page], activePageId: 'page-1', printSetup: null };
}

const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  0: migrate0to1,
  1: migrate1to2,
};

function readDrawables(value: unknown, section: string): NGDrawable[] | string {
  const out: NGDrawable[] = [];
  if (value === undefined) return out;
  if (!Array.isArray(value)) return `That document has a malformed ${section} section.`;
  for (const entry of value) {
    try {
      validateDrawable(entry);
      out.push(entry);
    } catch (err) {
      return `That document contains an invalid drawable: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return out;
}

function readRetained(value: unknown): NGPathDrawable[] | string {
  const out: NGPathDrawable[] = [];
  if (value === undefined) return out;
  if (!Array.isArray(value)) return 'That document has a malformed retained-paths section.';
  for (const entry of value) {
    try {
      validateDrawable(entry);
      if (entry.kind !== 'path') throw new Error('retained entry is not a path');
      out.push(entry);
    } catch (err) {
      return `That document contains an invalid retained path: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return out;
}

/** Read the v2 pages array. Returns an error string on failure. */
function readPages(value: unknown): NativePageRecord[] | string {
  if (!Array.isArray(value) || value.length === 0) return 'That document has a malformed pages section.';
  const pages: NativePageRecord[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) return 'That document has a malformed pages section.';
    if (typeof entry.id !== 'string' || entry.id.length === 0 || ids.has(entry.id)) {
      return 'That document has a malformed pages section.';
    }
    ids.add(entry.id);
    if (typeof entry.scene !== 'string' || !isSceneJson(entry.scene)) {
      return 'That document is missing its scene payload.';
    }
    const drawables = readDrawables(entry.drawables, 'drawables');
    if (typeof drawables === 'string') return drawables;
    const retainedPaths = readRetained(entry.retainedPaths);
    if (typeof retainedPaths === 'string') return retainedPaths;
    const layers = readLayers(entry.layers);
    pages.push({
      id: entry.id,
      name: typeof entry.name === 'string' && entry.name ? entry.name : 'Page',
      page: readPage(entry.page),
      layers: layers.length > 0 ? layers : readSceneLayers(entry.scene),
      activeLayerId: typeof entry.activeLayerId === 'string'
        ? entry.activeLayerId
        : readSceneActiveLayerId(entry.scene),
      drawables,
      retainedPaths,
      scene: entry.scene,
      guides: readGuideRecords(entry.guides),
    });
  }
  return pages;
}

/**
 * Parse + migrate + validate a native document. Never throws: every
 * failure is a message the UI can show. Drawables are validated with
 * the model's own validators, so a file the model would reject is
 * rejected here, at the border.
 */
export function parseNativeDocument(text: string): NativeParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!isRecord(raw)) return { ok: false, error: 'That file is not a NibGlider document.' };
  if (raw.format !== NATIVE_FORMAT) {
    return { ok: false, error: 'That file is not a NibGlider document.' };
  }
  let version = typeof raw.version === 'number' ? raw.version : 0;
  if (!Number.isInteger(version) || version < 0) {
    return { ok: false, error: 'That document has an invalid schema version.' };
  }
  if (version > NATIVE_VERSION) {
    return {
      ok: false,
      error: `That document was saved by a newer NibGlider (format v${version}); this one reads up to v${NATIVE_VERSION}.`,
    };
  }
  let current: Record<string, unknown> = raw;
  while (version < NATIVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, error: `No migration exists from format v${version}.` };
    current = migrate(current);
    version += 1;
  }
  if (typeof current.scene !== 'string' || !isSceneJson(current.scene)) {
    return { ok: false, error: 'That document is missing its scene payload.' };
  }
  const drawablesRead = readDrawables(current.drawables, 'drawables');
  if (typeof drawablesRead === 'string') return { ok: false, error: drawablesRead };
  const drawables = drawablesRead;
  const retainedRead = readRetained(current.retainedPaths);
  if (typeof retainedRead === 'string') return { ok: false, error: retainedRead };
  const retainedPaths = retainedRead;
  const pagesRead = readPages(current.pages);
  if (typeof pagesRead === 'string') return { ok: false, error: pagesRead };
  const pages = pagesRead;
  const scene = current.scene as string;
  const layers = readLayers(current.layers);
  const activePageId = typeof current.activePageId === 'string'
    && pages.some((page) => page.id === current.activePageId)
    ? current.activePageId
    : pages[0].id;
  return {
    ok: true,
    doc: {
      format: NATIVE_FORMAT,
      version: NATIVE_VERSION,
      name: typeof current.name === 'string' && current.name ? current.name : 'Untitled',
      savedAt: typeof current.savedAt === 'string' ? current.savedAt : '',
      layers: layers.length > 0 ? layers : readSceneLayers(scene),
      activeLayerId: typeof current.activeLayerId === 'string'
        ? current.activeLayerId
        : readSceneActiveLayerId(scene),
      drawables,
      retainedPaths,
      page: readPage(current.page),
      view: readView(current.view) ?? readSceneView(scene),
      scene,
      pages,
      activePageId,
      printSetup: readPrintSetup(current.printSetup),
    },
  };
}

/**
 * Wrap a bare scene payload (a gallery document body) as a native
 * document so gallery documents can be exported to a file without
 * opening them first. Gallery bodies carry no separate model state —
 * the scene is all they ever stored — so nothing is lost. Returns
 * null when the body is not a scene payload (legacy SVG bodies are
 * exported as SVG by the caller instead).
 */
export function wrapSceneAsNativeDocument(
  name: string,
  sceneJson: string,
  savedAt: string,
): NativeDocumentFile | null {
  if (!isSceneJson(sceneJson)) return null;
  return buildNativeDocument({
    name,
    savedAt,
    layers: readSceneLayers(sceneJson),
    activeLayerId: readSceneActiveLayerId(sceneJson),
    drawables: [],
    retainedPaths: [],
    page: null,
    view: readSceneView(sceneJson),
    scene: sceneJson,
  });
}

/** File name for saving a document under `name`. */
export function nativeFileName(name: string): string {
  const base = (name || 'Untitled').trim().replace(/[\\/:*?"<>|]+/g, '-');
  return `${base || 'Untitled'}${NATIVE_FILE_EXTENSION}`;
}
