// Top File menu command layer. The File entries in menus.xml (open, new,
// save, rename, export, import) route through here so the menu bar and any
// future caller share one dispatch: App enables these commands and forwards
// them to the panel, which owns the gallery/new-document dialogs.
// Settings and Tutorial keep their existing App handlers.
// Tested from tests/file-commands.test.mjs.
import { currentId, currentName } from './DocumentGallery';
import type { KeyValueStore } from './GUIManager';

/** File menu commands with a shared handler (menus.xml ids). */
export const FILE_COMMANDS = [
  'open-gallery',
  'new-document',
  'save-gallery',
  'rename-document',
  'import',
] as const;

export type FileCommand = (typeof FILE_COMMANDS)[number];

/** File > Export scope leaves, one per Export submenu (menus.xml ids).
 * Handled in App because the active raster/vector format and the JPG
 * quality dialog live there; the submenu parents (export-raster,
 * export-vector) only expand and never dispatch. */
export const EXPORT_COMMANDS = [
  'export-raster-canvas',
  'export-raster-viewport',
  'export-raster-selection',
  'export-vector-canvas',
  'export-vector-viewport',
  'export-vector-selection',
] as const;

export type ExportCommand = (typeof EXPORT_COMMANDS)[number];

/** Raster formats offered by the Export Raster segmented control. Only
 * PNG and JPG export today; WEBP stays visible but disabled. */
export const RASTER_FORMATS = ['png', 'jpg', 'webp'] as const;

export type RasterFormat = (typeof RASTER_FORMATS)[number];

/** Vector formats offered by the Export Vector segmented control. SVG is
 * the default; PDF and DXF stay visible but disabled. */
export const VECTOR_FORMATS = ['svg', 'pdf', 'dxf'] as const;

export type VectorFormat = (typeof VECTOR_FORMATS)[number];

export type ExportScopeId = 'canvas' | 'viewport' | 'selection';

/** Split an export leaf command into its scope. Null for anything else. */
export function exportScopeOf(command: string): ExportScopeId | null {
  const match = /^export-(?:raster|vector)-(canvas|viewport|selection)$/.exec(command);
  if (!match) return null;
  return match[1] as ExportScopeId;
}

/** Download filename for a File > Export scope: the document stem plus
 * the scope, with the local date and hour/minute appended last, each
 * part underscore-separated, e.g. `untitled-canvas_2026-10-07_14-30.svg`. */
export function exportFileName(
  stem: string,
  scope: ExportScopeId,
  ext: string,
  now: Date = new Date(),
): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${stem}-${scope}_${date}_${time}.${ext}`;
}

/** Where a save should go: straight to the open gallery document, or into
 * the gallery save dialog when the work is still untitled. */
export type SaveTarget = { kind: 'direct'; name: string } | { kind: 'gallery' };

export function saveTarget(store: KeyValueStore): SaveTarget {
  if (!currentId(store)) return { kind: 'gallery' };
  return { kind: 'direct', name: currentName(store) ?? 'Untitled' };
}

/** Rename needs an open document; untitled work falls back to save. */
export function renameTarget(store: KeyValueStore): 'rename' | 'save' {
  return currentId(store) ? 'rename' : 'save';
}
