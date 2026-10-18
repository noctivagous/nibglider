// Document gallery persistence.
// Document names, scene bodies, and the open document id live in IndexedDB.
// UI preferences stay in localStorage and are not read here.
// No DOM and no engine access.
// Public: GalleryDoc, GalleryMeta, GalleryDatabase, GallerySession,
// memoryGallery, browserGallery, browserGallerySession, and the async
// gallery operations below.
// Tested from tests/document-gallery.test.mjs.

export interface GalleryMeta {
  id: string;
  name: string;
  updatedAt: number;
}

export interface GalleryDoc extends GalleryMeta {
  /** Scene payload: nibglider-scene JSON, or legacy SVG. */
  svg: string;
}

export interface GallerySnapshot {
  docs: GalleryMeta[];
  currentId: string | null;
  currentName: string | null;
  displayName: string;
  ready: boolean;
}

/** Async document store. Bodies are separate from the name index. */
export interface GalleryDatabase {
  listMeta(): Promise<GalleryMeta[]>;
  get(id: string): Promise<GalleryDoc | null>;
  /** Writes the name, the body, and the current id together. */
  putCurrent(doc: GalleryDoc): Promise<void>;
  /** Updates the name only. The scene body stays where it is. */
  rename(id: string, name: string, updatedAt: number): Promise<boolean>;
  /** Removes the name and the body. Clears the current id when it matches. */
  remove(id: string): Promise<boolean>;
  getCurrentId(): Promise<string | null>;
  setCurrentId(id: string | null): Promise<void>;
}

const DB_NAME = 'nibglider';
const DB_VERSION = 1;
const CURRENT_KEY = 'currentId';

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `doc-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

function isMeta(value: unknown): value is GalleryMeta {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Record<string, unknown>;
  return typeof doc.id === 'string' && doc.id.length > 0
    && typeof doc.name === 'string'
    && typeof doc.updatedAt === 'number';
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (): void => {
      if (settled) return;
      settled = true;
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    tx.onabort = fail;
    tx.onerror = () => {
      fail();
    };
  });
}

class IndexedGallery implements GalleryDatabase {
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  listMeta(): Promise<GalleryMeta[]> {
    const tx = this.db.transaction('docs', 'readonly');
    const req = tx.objectStore('docs').getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        resolve(rows.filter(isMeta));
      };
      req.onerror = () => reject(req.error);
    });
  }

  get(id: string): Promise<GalleryDoc | null> {
    const tx = this.db.transaction(['docs', 'bodies'], 'readonly');
    const metaReq = tx.objectStore('docs').get(id);
    const bodyReq = tx.objectStore('bodies').get(id);
    return new Promise((resolve, reject) => {
      let meta: unknown;
      let body: unknown;
      let pending = 2;
      const fail = (): void => reject(metaReq.error ?? bodyReq.error);
      const finish = (): void => {
        pending -= 1;
        if (pending > 0) return;
        if (!isMeta(meta)) {
          resolve(null);
          return;
        }
        const svg = body && typeof body === 'object' && typeof (body as { svg?: unknown }).svg === 'string'
          ? (body as { svg: string }).svg
          : null;
        resolve(svg == null ? null : { id: meta.id, name: meta.name, updatedAt: meta.updatedAt, svg });
      };
      metaReq.onsuccess = () => { meta = metaReq.result; finish(); };
      bodyReq.onsuccess = () => { body = bodyReq.result; finish(); };
      metaReq.onerror = fail;
      bodyReq.onerror = fail;
    });
  }

  putCurrent(doc: GalleryDoc): Promise<void> {
    const tx = this.db.transaction(['docs', 'bodies', 'meta'], 'readwrite');
    tx.objectStore('docs').put({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt });
    tx.objectStore('bodies').put({ id: doc.id, svg: doc.svg });
    tx.objectStore('meta').put(doc.id, CURRENT_KEY);
    return txDone(tx);
  }

  rename(id: string, name: string, updatedAt: number): Promise<boolean> {
    const tx = this.db.transaction('docs', 'readwrite');
    const store = tx.objectStore('docs');
    const req = store.get(id);
    let found = false;
    req.onsuccess = () => {
      if (!isMeta(req.result)) return;
      found = true;
      store.put({ id, name, updatedAt });
    };
    return txDone(tx).then(() => found);
  }

  remove(id: string): Promise<boolean> {
    const tx = this.db.transaction(['docs', 'bodies', 'meta'], 'readwrite');
    const docs = tx.objectStore('docs');
    const req = docs.get(id);
    let found = false;
    req.onsuccess = () => {
      if (!isMeta(req.result)) return;
      found = true;
      docs.delete(id);
      tx.objectStore('bodies').delete(id);
      const meta = tx.objectStore('meta');
      const current = meta.get(CURRENT_KEY);
      current.onsuccess = () => {
        if (current.result === id) meta.delete(CURRENT_KEY);
      };
    };
    return txDone(tx).then(() => found);
  }

  getCurrentId(): Promise<string | null> {
    const tx = this.db.transaction(['meta', 'docs'], 'readonly');
    const metaReq = tx.objectStore('meta').get(CURRENT_KEY);
    return new Promise((resolve, reject) => {
      metaReq.onsuccess = () => {
        const id = metaReq.result;
        if (typeof id !== 'string' || id.length === 0) {
          resolve(null);
          return;
        }
        const docReq = tx.objectStore('docs').get(id);
        docReq.onsuccess = () => resolve(isMeta(docReq.result) ? id : null);
        docReq.onerror = () => reject(docReq.error);
      };
      metaReq.onerror = () => reject(metaReq.error);
    });
  }

  setCurrentId(id: string | null): Promise<void> {
    const tx = this.db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    if (id) store.put(id, CURRENT_KEY);
    else store.delete(CURRENT_KEY);
    return txDone(tx);
  }
}

function openIndexedGallery(): Promise<GalleryDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('bodies')) db.createObjectStore('bodies', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(new IndexedGallery(req.result));
    req.onerror = () => reject(req.error);
  });
}

/** In-memory gallery. Tests use this. The browser uses it only when IndexedDB cannot open. */
export function memoryGallery(): GalleryDatabase {
  const docs = new Map<string, GalleryMeta>();
  const bodies = new Map<string, string>();
  let current: string | null = null;
  const liveCurrent = (): string | null => (current && docs.has(current) ? current : null);
  return {
    async listMeta() {
      return [...docs.values()];
    },
    async get(id) {
      const meta = docs.get(id);
      const svg = bodies.get(id);
      if (!meta || svg == null) return null;
      return { ...meta, svg };
    },
    async putCurrent(doc) {
      docs.set(doc.id, { id: doc.id, name: doc.name, updatedAt: doc.updatedAt });
      bodies.set(doc.id, doc.svg);
      current = doc.id;
    },
    async rename(id, name, updatedAt) {
      const meta = docs.get(id);
      if (!meta) return false;
      docs.set(id, { ...meta, name, updatedAt });
      return true;
    },
    async remove(id) {
      if (!docs.has(id)) return false;
      docs.delete(id);
      bodies.delete(id);
      if (current === id) current = null;
      return true;
    },
    async getCurrentId() {
      return liveCurrent();
    },
    async setCurrentId(id) {
      current = id;
    },
  };
}

let browserDbPromise: Promise<GalleryDatabase> | null = null;

/** The browser document database. One connection for the page. */
export function browserGallery(): Promise<GalleryDatabase> {
  if (!browserDbPromise) {
    browserDbPromise = typeof indexedDB === 'undefined'
      ? Promise.resolve(memoryGallery())
      : openIndexedGallery().catch(() => memoryGallery());
  }
  return browserDbPromise;
}

/** Number already used by an Untitled name. Bare "Untitled" is 0.
 * "Untitled 3" is 3. Other names are not in the sequence. */
export function untitledSequenceNumber(name: string): number | null {
  const match = /^Untitled(?: (\d+))?$/.exec(name.trim());
  if (!match) return null;
  if (match[1] == null) return 0;
  if (!Number.isInteger(Number(match[1])) || Number(match[1]) < 1) return null;
  return Number(match[1]);
}

/** Next gallery name in the Untitled sequence: one past the highest
 * number already used. Bare "Untitled" does not count as a number, so
 * a gallery that only has that name still offers "Untitled 1". */
export function nextUntitledFrom(docs: readonly GalleryMeta[]): string {
  let last = 0;
  for (const doc of docs) {
    const n = untitledSequenceNumber(doc.name);
    if (n != null && n > last) last = n;
  }
  return `Untitled ${last + 1}`;
}

/** Name for a document that does not exist yet. A blank or a bare
 * "Untitled" takes the next number. A numbered Untitled that is already
 * in the gallery does too. Any other name is kept. */
export function newDocumentNameFrom(docs: readonly GalleryMeta[], requested: string): string {
  const trimmed = requested.trim();
  const next = nextUntitledFrom(docs);
  if (!trimmed || trimmed === 'Untitled') return next;
  const number = untitledSequenceNumber(trimmed);
  if (number == null) return trimmed;
  const taken = docs.some((doc) => doc.name === trimmed);
  return taken ? next : trimmed;
}

export async function nextUntitledName(db: GalleryDatabase): Promise<string> {
  return nextUntitledFrom(await db.listMeta());
}

export async function newDocumentName(db: GalleryDatabase, requested: string): Promise<string> {
  return newDocumentNameFrom(await db.listMeta(), requested);
}

function planSave(
  docs: readonly GalleryMeta[],
  current: string | null,
  name: string,
  svg: string,
  now: number,
): GalleryDoc {
  if (current) {
    const existing = docs.find((doc) => doc.id === current);
    if (existing) {
      return {
        id: existing.id,
        name: name.trim() || existing.name,
        svg,
        updatedAt: now,
      };
    }
  }
  return {
    id: makeId(),
    name: newDocumentNameFrom(docs, name),
    svg,
    updatedAt: now,
  };
}

function byNewest(docs: GalleryMeta[]): GalleryMeta[] {
  return docs.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** All saved documents, newest first. Names only; scene bodies stay in the store. */
export async function listDocuments(db: GalleryDatabase): Promise<GalleryMeta[]> {
  return byNewest(await db.listMeta());
}

/** The named gallery document, or null when the id is unknown. */
export async function getDocument(db: GalleryDatabase, id: string): Promise<GalleryDoc | null> {
  return db.get(id);
}

/** Id of the currently open gallery document, if it still exists. */
export async function currentId(db: GalleryDatabase): Promise<string | null> {
  return db.getCurrentId();
}

export async function currentName(db: GalleryDatabase): Promise<string | null> {
  const id = await db.getCurrentId();
  if (!id) return null;
  const docs = await db.listMeta();
  return docs.find((doc) => doc.id === id)?.name ?? null;
}

export async function setCurrent(db: GalleryDatabase, id: string | null): Promise<void> {
  await db.setCurrentId(id);
}

/** Create or overwrite a document and make it current.
 * Pass null for id to force a new entry. Omit id to overwrite the open one. */
export async function saveDocument(
  db: GalleryDatabase,
  name: string,
  svg: string,
  id?: string | null,
): Promise<string> {
  const docs = await db.listMeta();
  const current = id === undefined ? await db.getCurrentId() : id;
  const doc = planSave(docs, current, name, svg, Date.now());
  await db.putCurrent(doc);
  return doc.id;
}

/** Rename the named document. Returns false when the id is unknown or the name is blank. */
export async function renameDocument(db: GalleryDatabase, id: string, name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return db.rename(id, trimmed, Date.now());
}

/** Delete the named document. Clears the current id when it points at it. */
export async function deleteDocument(db: GalleryDatabase, id: string): Promise<boolean> {
  return db.remove(id);
}

/** The document to restore on startup: the current one when it still
 * exists and holds artwork. Null means start with a blank canvas. */
export async function restorableDocument(db: GalleryDatabase): Promise<GalleryDoc | null> {
  const id = await db.getCurrentId();
  if (!id) return null;
  const doc = await db.get(id);
  return doc && doc.svg.trim().length > 0 ? doc : null;
}

/** Name for the title bar and panel label: the open document, or Untitled. */
export async function docDisplayName(db: GalleryDatabase): Promise<string> {
  return (await currentName(db)) ?? 'Untitled';
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
 * nothing to save. A failed write leaves the scene dirty. */
export async function autosaveDocument(scene: AutosaveScene, db: GalleryDatabase): Promise<boolean> {
  if (!scene.isDocumentDirty()) return false;
  const payload = scene.exportScene();
  if (!payload || !payload.trim()) return false;
  const id = await db.getCurrentId();
  const name = (id && await currentName(db)) || await nextUntitledName(db);
  await saveDocument(db, name, payload, id);
  scene.markDocumentClean();
  return true;
}

const EMPTY_SNAPSHOT: GallerySnapshot = {
  docs: [],
  currentId: null,
  currentName: null,
  displayName: 'Untitled',
  ready: false,
};

/** Cached gallery the UI reads synchronously. Writes go to IndexedDB
 * and update the cache. One write runs at a time. When nothing is in
 * flight, autosave starts the IndexedDB transaction before it yields,
 * so a page hide still reaches the database. */
export class GallerySession {
  private docs: GalleryMeta[] = [];
  private currentId: string | null = null;
  private snapshot: GallerySnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private locked = false;
  private readonly queue: Array<() => void> = [];
  private readonly db: GalleryDatabase;

  private constructor(db: GalleryDatabase) {
    this.db = db;
  }

  static async open(db: GalleryDatabase): Promise<GallerySession> {
    const session = new GallerySession(db);
    await session.reload();
    return session;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): GallerySnapshot => this.snapshot;

  async get(id: string): Promise<GalleryDoc | null> {
    return this.db.get(id);
  }

  restorable(): Promise<GalleryDoc | null> {
    const id = this.currentId;
    if (!id) return Promise.resolve(null);
    return this.db.get(id).then((doc) => (doc && doc.svg.trim().length > 0 ? doc : null));
  }

  /** Sync name from the cache. Safe for a dialog that is already open. */
  nextUntitledName(): string {
    return nextUntitledFrom(this.docs);
  }

  save(name: string, svg: string, id?: string | null): Promise<string> {
    return this.kick(() => {
      const current = id === undefined ? this.currentId : id;
      const doc = planSave(this.docs, current, name, svg, Date.now());
      return this.db.putCurrent(doc).then(() => {
        this.remember(doc);
        return doc.id;
      });
    });
  }

  rename(id: string, name: string): Promise<boolean> {
    return this.kick(() => {
      const trimmed = name.trim();
      if (!trimmed) return Promise.resolve(false);
      const updatedAt = Date.now();
      return this.db.rename(id, trimmed, updatedAt).then((ok) => {
        if (!ok) return false;
        this.docs = this.docs.map((doc) => (doc.id === id ? { ...doc, name: trimmed, updatedAt } : doc));
        this.publish();
        return true;
      });
    });
  }

  remove(id: string): Promise<boolean> {
    return this.kick(() => this.db.remove(id).then((ok) => {
      if (!ok) return false;
      this.docs = this.docs.filter((doc) => doc.id !== id);
      if (this.currentId === id) this.currentId = null;
      this.publish();
      return true;
    }));
  }

  setCurrent(id: string | null): Promise<void> {
    return this.kick(() => this.db.setCurrentId(id).then(() => {
      this.currentId = id && this.docs.some((doc) => doc.id === id) ? id : null;
      this.publish();
    }));
  }

  autosave(scene: AutosaveScene): Promise<boolean> {
    return this.kick(() => {
      if (!scene.isDocumentDirty()) return Promise.resolve(false);
      const payload = scene.exportScene();
      if (!payload || !payload.trim()) return Promise.resolve(false);
      const name = this.nameOf(this.currentId) ?? nextUntitledFrom(this.docs);
      const doc = planSave(this.docs, this.currentId, name, payload, Date.now());
      return this.db.putCurrent(doc).then(() => {
        this.remember(doc);
        scene.markDocumentClean();
        return true;
      });
    });
  }

  private nameOf(id: string | null): string | null {
    if (!id) return null;
    return this.docs.find((doc) => doc.id === id)?.name ?? null;
  }

  private async reload(): Promise<void> {
    const [docs, current] = await Promise.all([listDocuments(this.db), this.db.getCurrentId()]);
    this.docs = docs;
    this.currentId = current;
    this.publish();
  }

  private remember(doc: GalleryDoc): void {
    const meta: GalleryMeta = { id: doc.id, name: doc.name, updatedAt: doc.updatedAt };
    this.docs = this.docs.filter((entry) => entry.id !== doc.id);
    this.docs.push(meta);
    this.currentId = doc.id;
    this.publish();
  }

  private publish(): void {
    this.docs = byNewest(this.docs);
    const currentName = this.nameOf(this.currentId);
    this.snapshot = {
      docs: this.docs,
      currentId: this.currentId,
      currentName,
      displayName: currentName ?? 'Untitled',
      ready: true,
    };
    for (const listener of this.listeners) listener();
  }

  /** Run one mutation. The function starts its database request before it
   * returns a promise, and the lock is held until that promise settles. */
  private kick<T>(run: () => Promise<T>): Promise<T> {
    if (this.locked) {
      return new Promise((resolve, reject) => {
        this.queue.push(() => {
          void this.kick(run).then(resolve, reject);
        });
      });
    }
    this.locked = true;
    try {
      const result = run();
      void result.finally(() => this.unlock());
      return result;
    } catch (error) {
      this.unlock();
      return Promise.reject(error);
    }
  }

  private unlock(): void {
    const next = this.queue.shift();
    if (!next) {
      this.locked = false;
      return;
    }
    this.locked = false;
    next();
  }
}

let sessionPromise: Promise<GallerySession> | null = null;

/** The page's gallery session. Opens IndexedDB once and keeps the name cache. */
export function browserGallerySession(): Promise<GallerySession> {
  if (!sessionPromise) {
    sessionPromise = browserGallery().then((db) => GallerySession.open(db));
  }
  return sessionPromise;
}
