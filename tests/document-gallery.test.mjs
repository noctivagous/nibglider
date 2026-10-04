import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autosaveDocument,
  currentId,
  currentName,
  deleteDocument,
  docDisplayName,
  getDocument,
  listDocuments,
  renameDocument,
  restorableDocument,
  saveDocument,
  setCurrent,
} from '../src/ui/DocumentGallery.ts';

function store() {
  const mem = new Map();
  return { getItem: (key) => (mem.has(key) ? mem.get(key) : null), setItem: (key, value) => { mem.set(key, value); } };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

test('gallery saves new documents and tracks the current one', () => {
  const mem = store();
  assert.deepEqual(listDocuments(mem), []);
  assert.equal(currentId(mem), null);
  assert.equal(currentName(mem), null);
  const id = saveDocument(mem, 'First', SVG);
  assert.equal(typeof id, 'string');
  assert.equal(currentId(mem), id);
  assert.equal(currentName(mem), 'First');
  assert.equal(listDocuments(mem).length, 1);
});

test('gallery save with the current id overwrites instead of duplicating', () => {
  const mem = store();
  const id = saveDocument(mem, 'First', SVG);
  const again = saveDocument(mem, 'First v2', `${SVG}<!--2-->`);
  assert.equal(again, id);
  const docs = listDocuments(mem);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, 'First v2');
  assert.ok(docs[0].svg.includes('<!--2-->'));
});

test('gallery rename rejects blanks and unknown ids', () => {
  const mem = store();
  const id = saveDocument(mem, 'First', SVG);
  assert.equal(renameDocument(mem, id, '  '), false);
  assert.equal(renameDocument(mem, 'missing', 'Name'), false);
  assert.equal(renameDocument(mem, id, 'Renamed'), true);
  assert.equal(currentName(mem), 'Renamed');
});

test('gallery delete clears the current id only when it points at the doc', () => {
  const mem = store();
  const first = saveDocument(mem, 'First', SVG);
  setCurrent(mem, null);
  const second = saveDocument(mem, 'Second', SVG);
  assert.equal(currentId(mem), second);
  assert.equal(deleteDocument(mem, 'missing'), false);
  assert.equal(deleteDocument(mem, first), true);
  assert.equal(currentId(mem), second);
  assert.equal(deleteDocument(mem, second), true);
  assert.equal(currentId(mem), null);
  assert.deepEqual(listDocuments(mem), []);
});

test('gallery looks up documents by id', () => {
  const mem = store();
  assert.equal(getDocument(mem, 'missing'), null);
  const id = saveDocument(mem, 'First', SVG);
  assert.equal(getDocument(mem, id)?.name, 'First');
  assert.equal(getDocument(mem, 'missing'), null);
});

test('reload restores the saved current document', () => {
  const mem = store();
  assert.equal(restorableDocument(mem), null);
  const id = saveDocument(mem, 'Work', SVG);
  assert.equal(restorableDocument(mem)?.id, id);
});

test('reload starts blank when the current doc is gone or empty', () => {
  const mem = store();
  const id = saveDocument(mem, 'Work', SVG);
  assert.ok(restorableDocument(mem));
  deleteDocument(mem, id);
  assert.equal(restorableDocument(mem), null);
  saveDocument(mem, 'Empty', '   ');
  assert.equal(restorableDocument(mem), null);
});

test('display name falls back to Untitled', () => {
  const mem = store();
  assert.equal(docDisplayName(mem), 'Untitled');
  saveDocument(mem, 'Work', SVG);
  assert.equal(docDisplayName(mem), 'Work');
});

test('autosave creates the Untitled document and clears dirty', () => {
  const mem = store();
  let dirty = true;
  const scene = {
    isDocumentDirty: () => dirty,
    exportSceneSVG: () => SVG,
    markDocumentClean: () => { dirty = false; },
  };
  assert.equal(autosaveDocument(scene, mem), true);
  assert.equal(dirty, false);
  assert.equal(docDisplayName(mem), 'Untitled');
  assert.ok(restorableDocument(mem));
  // A clean scene saves nothing.
  assert.equal(autosaveDocument(scene, mem), false);
});

test('autosave keeps the existing name and skips empty exports', () => {
  const mem = store();
  saveDocument(mem, 'Work', SVG);
  let svg = '   ';
  let cleaned = 0;
  const scene = {
    isDocumentDirty: () => true,
    exportSceneSVG: () => svg,
    markDocumentClean: () => { cleaned += 1; },
  };
  assert.equal(autosaveDocument(scene, mem), false);
  assert.equal(cleaned, 0);
  svg = `${SVG}<!--2-->`;
  assert.equal(autosaveDocument(scene, mem), true);
  assert.equal(docDisplayName(mem), 'Work');
  assert.equal(listDocuments(mem).length, 1);
  assert.equal(cleaned, 1);
});

test('gallery tolerates corrupt store contents', () => {
  const mem = store();
  mem.setItem('nibglider.gallery.documents', 'not-json');
  mem.setItem('nibglider.gallery.currentId', 'stale-id');
  assert.deepEqual(listDocuments(mem), []);
  assert.equal(currentId(mem), null);
  setCurrent(mem, null);
  const id = saveDocument(mem, '  ', SVG);
  assert.equal(currentName(mem), 'Untitled');
  assert.ok(typeof id === 'string' && id.length > 0);
});
