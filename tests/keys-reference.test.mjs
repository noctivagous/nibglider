import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEY_COMMANDS } from '../src/engine/input/keymap.ts';

const doc = readFileSync(new URL('../docs/keys-reference.md', import.meta.url), 'utf8');

test('keys reference documents every keymap command', () => {
  for (const cmd of KEY_COMMANDS) {
    assert.ok(doc.includes(`\`${cmd.id}\``), `keys-reference.md is missing command ${cmd.id}`);
  }
});

test('getting started doc exists and teaches the key-click idea', () => {
  const gs = readFileSync(new URL('../docs/getting-started.md', import.meta.url), 'utf8');
  assert.ok(gs.includes('key'));
  assert.ok(gs.length > 2000);
});
