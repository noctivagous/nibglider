import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMenuXML } from '../src/ui/menuXML.ts';
import {
  FILE_COMMANDS,
  renameTarget,
  saveTarget,
} from '../src/ui/fileCommands.ts';
import { saveDocument } from '../src/ui/DocumentGallery.ts';

const MENUS_URL = new URL('../src/ui/menus/menus.xml', import.meta.url);

function store() {
  const mem = new Map();
  return { getItem: (key) => (mem.has(key) ? mem.get(key) : null), setItem: (key, value) => { mem.set(key, value); } };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

test('file commands cover every top File menu entry', () => {
  const result = parseMenuXML(readFileSync(MENUS_URL, 'utf8'));
  assert.ok(!('error' in result));
  const file = result.menus.find((menu) => menu.id === 'file');
  assert.ok(file);
  const ids = file.items.map((item) => item.commandId);
  // Settings and Tutorial already have App handlers; everything else in the
  // File menu must route through the shared file-command layer so no entry
  // renders disabled.
  const covered = new Set([...FILE_COMMANDS, 'settings', 'tutorial']);
  for (const id of ids) {
    assert.ok(covered.has(id), `File menu entry ${id} has no command handler`);
  }
  for (const command of FILE_COMMANDS) {
    assert.ok(ids.includes(command), `file command ${command} has no File menu entry`);
  }
});

test('save targets the open document, or the gallery when untitled', () => {
  const mem = store();
  assert.deepEqual(saveTarget(mem), { kind: 'gallery' });
  saveDocument(mem, 'Work', SVG);
  assert.deepEqual(saveTarget(mem), { kind: 'direct', name: 'Work' });
});

test('rename targets the open document, or falls back to save', () => {
  const mem = store();
  assert.equal(renameTarget(mem), 'save');
  saveDocument(mem, 'Work', SVG);
  assert.equal(renameTarget(mem), 'rename');
});
