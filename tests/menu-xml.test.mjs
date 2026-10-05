import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMenuXML } from '../src/ui/menuXML.ts';
import { primaryShortcut } from '../src/engine/input/keymap.ts';

const MENUS_URL = new URL('../src/ui/menus/menus.xml', import.meta.url);

// Commands with a handler in App.tsx handleMenuCommand. Everything else in
// the XML renders disabled until it is wired. Keep both lists explicit so a
// typo, a missing handler, or a dead handler fails here instead of silently.
const WIRED_COMMANDS = ['settings', 'tutorial', 'reset-settings'];
const PLACEHOLDER_COMMANDS = [
  'open-gallery', 'new-document', 'save-gallery', 'rename-document',
  'export', 'import', 'page-size', 'length-unit', 'reset-zoom',
  'toggle-panel', 'toggle-keyboard', 'toggle-status', 'group',
  'delete-selection', 'scale-dialog', 'rotate-dialog', 'select',
  'bring-to-front', 'send-to-back', 'duplicate-selection',
];

function loadMenus() {
  const result = parseMenuXML(readFileSync(MENUS_URL, 'utf8'));
  assert.ok(!('error' in result), 'error' in result ? result.error : 'parse failed');
  return result.menus;
}

test('menus XML parses to the five application menus in order', () => {
  const menus = loadMenus();
  assert.deepEqual(menus.map((menu) => menu.id), ['file', 'document', 'operations', 'layers', 'debug']);
  assert.deepEqual(menus.map((menu) => menu.title), [
    'File', 'Document and Settings', 'Operations and Modes', 'Layers and Objects', 'Debug',
  ]);
});

test('every menu command is either wired or an explicit placeholder', () => {
  const commands = loadMenus()
    .flatMap((menu) => menu.items)
    .filter((item) => !item.header)
    .map((item) => item.commandId);
  const known = new Set([...WIRED_COMMANDS, ...PLACEHOLDER_COMMANDS]);
  for (const command of commands) {
    assert.ok(known.has(command), `${command} is neither wired nor an explicit placeholder`);
  }
  for (const command of WIRED_COMMANDS) {
    assert.ok(commands.includes(command), `wired handler ${command} has no menu entry`);
  }
});

test('groups emit ordered headers and Primary shortcuts resolve per platform', () => {
  const menus = loadMenus();
  const ops = menus.find((menu) => menu.id === 'operations').items;
  assert.deepEqual(ops.map((item) => item.commandId).slice(0, 3), ['hdr-operations-1', 'group', 'delete-selection']);
  assert.deepEqual(ops.map((item) => item.commandId).slice(-3), ['hdr-operations-2', 'scale-dialog', 'rotate-dialog']);
  const headers = ops.filter((item) => item.header);
  assert.deepEqual(headers.map((item) => item.label), ['Immediate', 'With dialog']);
  // Primary resolves through the keymap for the host platform (⌘ on macOS).
  const byId = Object.fromEntries(ops.map((item) => [item.commandId, item]));
  assert.equal(byId.group.shortcut, primaryShortcut('G'));
  assert.equal(byId['delete-selection'].shortcut, 'Backspace');
});

test('items fall back to the command id and menus to the menu id', () => {
  const result = parseMenuXML(
    '<menus><menu id="m"><item command="do-thing"/><group label="G"><item command="other"/></group></menu></menus>',
  );
  assert.ok(!('error' in result));
  assert.deepEqual(result.menus, [{
    id: 'm',
    title: 'm',
    items: [
      { commandId: 'do-thing' },
      { commandId: 'hdr-m-1', label: 'G', header: true },
      { commandId: 'other' },
    ],
  }]);
});

test('menu XML rejects malformed definitions', () => {
  for (const xml of [
    '<menu id="m"><item command="c"/></menu>',
    '<menus><menu><item command="c"/></menu></menus>',
    '<menus><menu id="m"><item/></menu></menus>',
    '<menus><menu id="m"><item command="c">text</item></menu></menus>',
    '<menus><menu id="m"><group><item command="c"/></group></menu></menus>',
    '<menus><menu id="m"><group label="G"><toggle/></group></menu></menus>',
    '<menus><menu id="m"><item command="c" shortcut="Primary+"/></menu></menus>',
    '<menus><menu id="m"><item command="c" shortcut="Primary+G+H"/></menu></menus>',
    '<menus><menu id="m"><bogus/></menu></menus>',
    'not xml at all',
    '',
  ]) {
    const result = parseMenuXML(xml);
    assert.ok('error' in result, `expected an error for ${xml}`);
    assert.ok(result.error.length > 0);
  }
});
