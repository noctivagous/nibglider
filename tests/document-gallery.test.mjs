import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GallerySession,
  autosaveDocument,
  currentId,
  currentName,
  deleteDocument,
  docDisplayName,
  getDocument,
  listDocuments,
  memoryGallery,
  newDocumentName,
  nextUntitledName,
  renameDocument,
  restorableDocument,
  saveDocument,
  setCurrent,
} from '../src/ui/DocumentGallery.ts';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

test('gallery saves new documents and tracks the current one', async () => {
  const db = memoryGallery();
  assert.deepEqual(await listDocuments(db), []);
  assert.equal(await currentId(db), null);
  assert.equal(await currentName(db), null);
  const id = await saveDocument(db, 'First', SVG);
  assert.equal(typeof id, 'string');
  assert.equal(await currentId(db), id);
  assert.equal(await currentName(db), 'First');
  assert.equal((await listDocuments(db)).length, 1);
  assert.equal((await getDocument(db, id))?.svg, SVG);
});

test('gallery save with the current id overwrites instead of duplicating', async () => {
  const db = memoryGallery();
  const id = await saveDocument(db, 'First', SVG);
  const again = await saveDocument(db, 'First v2', `${SVG}<!--2-->`);
  assert.equal(again, id);
  const docs = await listDocuments(db);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, 'First v2');
  assert.equal((await getDocument(db, id))?.svg.includes('<!--2-->'), true);
});

test('gallery rename keeps the scene body and rejects blanks', async () => {
  const db = memoryGallery();
  const id = await saveDocument(db, 'First', SVG);
  assert.equal(await renameDocument(db, id, '  '), false);
  assert.equal(await renameDocument(db, 'missing', 'Name'), false);
  assert.equal(await renameDocument(db, id, 'Renamed'), true);
  assert.equal(await currentName(db), 'Renamed');
  assert.equal((await getDocument(db, id))?.svg, SVG);
});

test('gallery delete clears the current id only when it points at the doc', async () => {
  const db = memoryGallery();
  const first = await saveDocument(db, 'First', SVG);
  await setCurrent(db, null);
  const second = await saveDocument(db, 'Second', SVG);
  assert.equal(await currentId(db), second);
  assert.equal(await deleteDocument(db, 'missing'), false);
  assert.equal(await deleteDocument(db, first), true);
  assert.equal(await currentId(db), second);
  assert.equal(await deleteDocument(db, second), true);
  assert.equal(await currentId(db), null);
  assert.deepEqual(await listDocuments(db), []);
});

test('gallery looks up documents by id', async () => {
  const db = memoryGallery();
  assert.equal(await getDocument(db, 'missing'), null);
  const id = await saveDocument(db, 'First', SVG);
  assert.equal((await getDocument(db, id))?.name, 'First');
  assert.equal(await getDocument(db, 'missing'), null);
});

test('reload restores the saved current document', async () => {
  const db = memoryGallery();
  assert.equal(await restorableDocument(db), null);
  const id = await saveDocument(db, 'Work', SVG);
  assert.equal((await restorableDocument(db))?.id, id);
});

test('reload starts blank when the current doc is gone or empty', async () => {
  const db = memoryGallery();
  const id = await saveDocument(db, 'Work', SVG);
  assert.ok(await restorableDocument(db));
  await deleteDocument(db, id);
  assert.equal(await restorableDocument(db), null);
  await saveDocument(db, 'Empty', '   ');
  assert.equal(await restorableDocument(db), null);
});

test('display name falls back to Untitled', async () => {
  const db = memoryGallery();
  assert.equal(await docDisplayName(db), 'Untitled');
  await saveDocument(db, 'Work', SVG);
  assert.equal(await docDisplayName(db), 'Work');
});

test('autosave creates the next Untitled document and clears dirty', async () => {
  const db = memoryGallery();
  let dirty = true;
  const scene = {
    isDocumentDirty: () => dirty,
    exportScene: () => SVG,
    markDocumentClean: () => { dirty = false; },
  };
  assert.equal(await autosaveDocument(scene, db), true);
  assert.equal(dirty, false);
  assert.equal(await docDisplayName(db), 'Untitled 1');
  assert.ok(await restorableDocument(db));
  assert.equal(await autosaveDocument(scene, db), false);
});

test('new documents take the next Untitled number and skip a bare Untitled', async () => {
  const db = memoryGallery();
  assert.equal(await nextUntitledName(db), 'Untitled 1');
  assert.equal(await saveDocument(db, 'Untitled', SVG) && await currentName(db), 'Untitled 1');
  await db.putCurrent({ id: 'bare', name: 'Untitled', svg: SVG, updatedAt: 1 });
  await db.putCurrent({ id: 'n4', name: 'Untitled 4', svg: SVG, updatedAt: 2 });
  await db.putCurrent({ id: 'notes', name: 'Notes', svg: SVG, updatedAt: 3 });
  await db.setCurrentId(null);
  assert.equal(await nextUntitledName(db), 'Untitled 5');
  assert.equal(await newDocumentName(db, ''), 'Untitled 5');
  assert.equal(await newDocumentName(db, 'Untitled'), 'Untitled 5');
  assert.equal(await newDocumentName(db, 'Untitled 4'), 'Untitled 5');
  assert.equal(await newDocumentName(db, 'Untitled 2'), 'Untitled 2');
  assert.equal(await newDocumentName(db, 'Poster'), 'Poster');
  const created = await saveDocument(db, 'Untitled', SVG, null);
  assert.equal((await getDocument(db, created))?.name, 'Untitled 5');
  assert.equal((await listDocuments(db)).filter((doc) => doc.name === 'Untitled').length, 1);
});

test('autosave keeps the existing name and skips empty exports', async () => {
  const db = memoryGallery();
  await saveDocument(db, 'Work', SVG);
  let svg = '   ';
  let cleaned = 0;
  const scene = {
    isDocumentDirty: () => true,
    exportScene: () => svg,
    markDocumentClean: () => { cleaned += 1; },
  };
  assert.equal(await autosaveDocument(scene, db), false);
  assert.equal(cleaned, 0);
  svg = `${SVG}<!--2-->`;
  assert.equal(await autosaveDocument(scene, db), true);
  assert.equal(await docDisplayName(db), 'Work');
  assert.equal((await listDocuments(db)).length, 1);
  assert.equal(cleaned, 1);
});

test('a stale current id is ignored', async () => {
  const db = memoryGallery();
  await db.setCurrentId('stale-id');
  assert.equal(await currentId(db), null);
  const id = await saveDocument(db, '  ', SVG);
  assert.equal(await currentName(db), 'Untitled 1');
  assert.ok(typeof id === 'string' && id.length > 0);
});

test('a failed write leaves the scene dirty', async () => {
  const db = memoryGallery();
  const failing = {
    ...db,
    putCurrent: async () => { throw new Error('full'); },
  };
  let dirty = true;
  const scene = {
    isDocumentDirty: () => dirty,
    exportScene: () => SVG,
    markDocumentClean: () => { dirty = false; },
  };
  await assert.rejects(() => autosaveDocument(scene, failing));
  assert.equal(dirty, true);
  assert.equal((await listDocuments(db)).length, 0);
});

test('session autosave publishes the new document', async () => {
  const session = await GallerySession.open(memoryGallery());
  let dirty = true;
  const scene = {
    isDocumentDirty: () => dirty,
    exportScene: () => SVG,
    markDocumentClean: () => { dirty = false; },
  };
  assert.equal(session.getSnapshot().displayName, 'Untitled');
  assert.equal(await session.autosave(scene), true);
  assert.equal(dirty, false);
  const snap = session.getSnapshot();
  assert.equal(snap.displayName, 'Untitled 1');
  assert.equal(snap.ready, true);
  assert.equal((await session.restorable())?.svg, SVG);
  assert.equal(await session.autosave(scene), false);
});

test('session serializes overlapping saves', async () => {
  const session = await GallerySession.open(memoryGallery());
  const first = session.save('One', SVG, null);
  const second = session.save('Two', `${SVG}<!--2-->`, null);
  const ids = await Promise.all([first, second]);
  assert.equal(ids[0] === ids[1], false);
  assert.equal(session.getSnapshot().docs.length, 2);
  assert.equal(session.getSnapshot().currentId, ids[1]);
});
