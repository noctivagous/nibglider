// Document gallery persistence.
// Owns the named SVG document list and the currently open document id.
// Reads and writes the store passed in. No DOM, no engine access.
// Public: GalleryDoc, listDocuments, saveDocument, renameDocument,
// deleteDocument, currentId, currentName, setCurrent.
// Tested from tests/document-gallery.test.mjs.

import { browserStore, type KeyValueStore } from './GUIManager';

export interface GalleryDoc {
  id: string;
  name: string;
  /** Scene payload: nibglider-scene JSON, or legacy SVG. */
  svg: string;
  updatedAt: number;
}

export const GALLERY_DOCS_KEY = 'nibglider.gallery.documents';
export const GALLERY_CURRENT_KEY = 'nibglider.gallery.currentId';

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `doc-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

function parseDocs(raw: string | null): GalleryDoc[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: GalleryDoc[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const doc = entry as Record<string, unknown>;
      if (typeof doc.id !== 'string' || typeof doc.name !== 'string' || typeof doc.svg !== 'string') continue;
      out.push({
        id: doc.id,
        name: doc.name,
        svg: doc.svg,
        updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function writeDocs(store: KeyValueStore, docs: GalleryDoc[]): void {
  try {
    store.setItem(GALLERY_DOCS_KEY, JSON.stringify(docs));
  } catch { /* Storage can be unavailable in private browsing. */ }
}

/** All saved documents, newest first. */
export function listDocuments(store: KeyValueStore = browserStore()): GalleryDoc[] {
  return parseDocs(store.getItem(GALLERY_DOCS_KEY))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Number already used by an Untitled name. Bare "Untitled" is 0.
 * "Untitled 3" is 3. Other names are not in the sequence. */
export function untitledSequenceNumber(name: string): number | null {
  const match = /^Untitled(?: (\d+))?$/.exec(name.trim());
  if (!match) return null;
  if (match[1] == null) return 0;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** Next gallery name in the Untitled sequence: one past the highest
 * number already used. Bare "Untitled" does not count as a number, so
 * a gallery that only has that name still offers "Untitled 1". */
export function nextUntitledName(store: KeyValueStore = browserStore()): string {
  let last = 0;
  for (const doc of parseDocs(store.getItem(GALLERY_DOCS_KEY))) {
    const n = untitledSequenceNumber(doc.name);
    if (n != null && n > last) last = n;
  }
  return `Untitled ${last + 1}`;
}

/** Name for a document that does not exist yet. A blank or a bare
 * "Untitled" takes the next number. A numbered Untitled that is already
 * in the gallery does too. Any other name is kept. */
export function newDocumentName(store: KeyValueStore, requested: string): string {
  const trimmed = requested.trim();
  const next = nextUntitledName(store);
  if (!trimmed || trimmed === 'Untitled') return next;
  const number = untitledSequenceNumber(trimmed);
  if (number == null) return trimmed;
  const taken = parseDocs(store.getItem(GALLERY_DOCS_KEY)).some((doc) => doc.name === trimmed);
  return taken ? next : trimmed;
}

/** Create a document entry and make it current. Returns the new id. */
export function saveDocument(
  store: KeyValueStore,
  name: string,
  svg: string,
  id: string | null = currentId(store),
): string {
  const docs = parseDocs(store.getItem(GALLERY_DOCS_KEY));
  const now = Date.now();
  if (id) {
    const existing = docs.find((doc) => doc.id === id);
    if (existing) {
      const trimmed = name.trim() || existing.name;
      existing.name = trimmed;
      existing.svg = svg;
      existing.updatedAt = now;
      writeDocs(store, docs);
      setCurrent(store, id);
      return id;
    }
  }
  const next: GalleryDoc = { id: makeId(), name: newDocumentName(store, name), svg, updatedAt: now };
  docs.push(next);
  writeDocs(store, docs);
  setCurrent(store, next.id);
  return next.id;
}

/** Rename the named document. Returns false when the id is unknown. */
export function renameDocument(store: KeyValueStore, id: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const docs = parseDocs(store.getItem(GALLERY_DOCS_KEY));
  const existing = docs.find((doc) => doc.id === id);
  if (!existing) return false;
  existing.name = trimmed;
  existing.updatedAt = Date.now();
  writeDocs(store, docs);
  return true;
}

/** Delete the named document. Clears the current id when it points at it. */
export function deleteDocument(store: KeyValueStore, id: string): boolean {
  const docs = parseDocs(store.getItem(GALLERY_DOCS_KEY));
  const next = docs.filter((doc) => doc.id !== id);
  if (next.length === docs.length) return false;
  writeDocs(store, next);
  if (currentId(store) === id) setCurrent(store, null);
  return true;
}

/** Id of the currently open gallery document, if it still exists. */
export function currentId(store: KeyValueStore = browserStore()): string | null {
  let id: string | null = null;
  try {
    id = store.getItem(GALLERY_CURRENT_KEY);
  } catch {
    return null;
  }
  if (!id) return null;
  const docs = parseDocs(store.getItem(GALLERY_DOCS_KEY));
  return docs.some((doc) => doc.id === id) ? id : null;
}

/** The named gallery document, or null when the id is unknown. */
export function getDocument(store: KeyValueStore, id: string): GalleryDoc | null {
  return parseDocs(store.getItem(GALLERY_DOCS_KEY)).find((doc) => doc.id === id) ?? null;
}

/** The document to restore on startup: the current one when it still
 * exists and holds artwork. Null means start with a blank canvas. */
export function restorableDocument(store: KeyValueStore = browserStore()): GalleryDoc | null {
  const id = currentId(store);
  if (!id) return null;
  const doc = getDocument(store, id);
  return doc && doc.svg.trim().length > 0 ? doc : null;
}

/** Name of the currently open gallery document, or null for untitled work. */
export function currentName(store: KeyValueStore = browserStore()): string | null {
  const id = currentId(store);
  if (!id) return null;
  return parseDocs(store.getItem(GALLERY_DOCS_KEY)).find((doc) => doc.id === id)?.name ?? null;
}

export function setCurrent(store: KeyValueStore, id: string | null): void {
  try {
    if (id) store.setItem(GALLERY_CURRENT_KEY, id);
    else store.setItem(GALLERY_CURRENT_KEY, '');
  } catch { /* ignore */ }
}

/** Name for the title bar and panel label: the open document, or Untitled. */
export function docDisplayName(store: KeyValueStore = browserStore()): string {
  return currentName(store) ?? 'Untitled';
}

/** Minimal scene surface autosave needs. The engine satisfies this. */
export interface AutosaveScene {
  isDocumentDirty(): boolean;
  exportScene(): string;
  markDocumentClean(): void;
}

/** Persist dirty artwork to the gallery. The first save creates a
 * document named with the next Untitled number, so it does not reuse a
 * bare "Untitled" already in the gallery. Returns false when there was
 * nothing to save. */
export function autosaveDocument(
  scene: AutosaveScene,
  store: KeyValueStore = browserStore(),
): boolean {
  if (!scene.isDocumentDirty()) return false;
  const payload = scene.exportScene();
  if (!payload || !payload.trim()) return false;
  const id = currentId(store);
  saveDocument(store, (id && currentName(store)) || nextUntitledName(store), payload, id);
  scene.markDocumentClean();
  return true;
}
