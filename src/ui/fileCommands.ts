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
  'export',
  'import',
] as const;

export type FileCommand = (typeof FILE_COMMANDS)[number];

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
