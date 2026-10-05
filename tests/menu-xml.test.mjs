import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMenuXML } from '../src/ui/menuXML.ts';
import { primaryShortcut } from '../src/engine/input/keymap.ts';

const MENUS_URL = new URL('../src/ui/menus/menus.xml', import.meta.url);

// Commands with a handler in App.tsx handleMenuCommand. Everything else in
// the XML renders disabled until it is wired. Keep both lists explicit so a
// typo, a missing handler, or a dead handler fails here instead of silently.
const WIRED_COMMANDS = [
  'settings', 'tutorial', 'reset-settings',
  'undo', 'redo',
  'toggle-panel', 'toggle-keyboard', 'toggle-status',
  'length-unit-pt', 'length-unit-inch', 'length-unit-cm',
  'bring-to-front', 'send-to-back', 'duplicate-selection',
  'group', 'ungroup-selection', 'delete-selection',
  'combinatorics-none', 'combinatorics-union', 'combinatorics-subtract', 'combinatorics-intersect',
  'rect-shape-rectangle', 'rect-shape-circle', 'rect-shape-polygon', 'rect-shape-supershape',
  'rect-shape-trapezoid', 'rect-shape-parallelogram', 'rect-shape-rightTriangle',
  'rect-shape-rhombus', 'rect-shape-kite',
  'circle-shape-circle', 'circle-shape-semicircle', 'circle-shape-sector', 'circle-shape-segment',
  'circle-shape-polygon', 'circle-shape-supershape', 'circle-shape-trapezoid',
  'circle-shape-parallelogram', 'circle-shape-rightTriangle', 'circle-shape-rhombus',
  'circle-shape-kite',
  'snap-grid', 'snap-path', 'snap-points', 'snap-angle', 'snap-length', 'snap-aspect',
  'text-mode-display', 'text-mode-body',
];
const PLACEHOLDER_COMMANDS = [
  'open-gallery', 'new-document', 'save-gallery', 'rename-document',
  'export', 'import', 'page-size', 'length-unit', 'reset-zoom', 'select',
  'rect-shape', 'circle-shape', 'combinatorics', 'snapping', 'text-mode',
  'repeat-grid', 'repeat-circle', 'scale-dialog', 'rotate-dialog',
  'cut', 'copy', 'paste', 'select-all',
];

function loadMenus() {
  const result = parseMenuXML(readFileSync(MENUS_URL, 'utf8'));
  assert.ok(!('error' in result), 'error' in result ? result.error : 'parse failed');
  return result.menus;
}

test('menus XML parses to the five application menus in order', () => {
  const menus = loadMenus();
  assert.deepEqual(menus.map((menu) => menu.id), ['file', 'edit', 'document', 'operations', 'layers', 'debug']);
  assert.deepEqual(menus.map((menu) => menu.title), [
    'File', 'Edit', 'Document and Settings', 'Operations and Modes', 'Layers and Objects', 'Debug',
  ]);
});

test('every menu command is either wired or an explicit placeholder', () => {
  const commands = loadMenus()
    .flatMap((menu) => menu.items)
    .flatMap((item) => [item, ...(item.children ?? [])])
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
  const byMenu = Object.fromEntries(menus.map((menu) => [menu.id, menu]));
  const layers = byMenu.layers.items;
  assert.deepEqual(layers.map((item) => item.commandId).slice(0, 4), [
    'select', 'hdr-layers-1', 'bring-to-front', 'send-to-back',
  ]);
  // Primary resolves through the keymap for the host platform (⌘ on macOS).
  const layerById = Object.fromEntries(layers.map((item) => [item.commandId, item]));
  assert.equal(layerById.group.shortcut, primaryShortcut('G'));
  assert.equal(layerById['ungroup-selection'].shortcut, primaryShortcut('G', true));
  assert.equal(layerById['delete-selection'].shortcut, 'Backspace');
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

test('operations holds modes, repeat, and dialogs; layers holds object control', () => {
  const menus = loadMenus();
  const byId = Object.fromEntries(menus.map((menu) => [menu.id, menu]));
  assert.deepEqual(byId.operations.items.map((item) => item.commandId), [
    'hdr-operations-1', 'rect-shape', 'circle-shape', 'combinatorics', 'snapping', 'text-mode',
    'hdr-operations-2', 'repeat-grid', 'repeat-circle',
    'hdr-operations-3', 'scale-dialog', 'rotate-dialog',
  ]);
  assert.deepEqual(
    byId.operations.items.filter((item) => item.header).map((item) => item.label),
    ['Modes', 'Repeat', 'With dialog'],
  );
  const opsText = JSON.stringify(byId.operations);
  assert.equal(opsText.includes('stroke'), false);
  assert.equal(opsText.includes('fill'), false);
  assert.deepEqual(byId.layers.items.map((item) => item.commandId), [
    'select',
    'hdr-layers-1', 'bring-to-front', 'send-to-back',
    'hdr-layers-2', 'group', 'ungroup-selection', 'duplicate-selection', 'delete-selection',
  ]);
});

test('edit holds undo/redo, clipboard, and selection entries', () => {
  const menus = loadMenus();
  const edit = menus.find((menu) => menu.id === 'edit');
  assert.deepEqual(edit.items.map((item) => item.commandId), [
    'undo', 'redo',
    'hdr-edit-1', 'cut', 'copy', 'paste',
    'hdr-edit-2', 'duplicate-selection', 'delete-selection', 'select-all',
  ]);
  assert.deepEqual(
    edit.items.filter((item) => item.header).map((item) => item.label),
    ['Clipboard', 'Selection'],
  );
  const byId = Object.fromEntries(edit.items.map((item) => [item.commandId, item]));
  assert.equal(byId.undo.shortcut, primaryShortcut('Z'));
  assert.equal(byId.redo.shortcut, primaryShortcut('Z', true));
  assert.equal(byId.cut.shortcut, primaryShortcut('X'));
  assert.equal(byId.copy.shortcut, primaryShortcut('C'));
  assert.equal(byId.paste.shortcut, primaryShortcut('V'));
  assert.equal(byId['select-all'].shortcut, primaryShortcut('A'));
  assert.equal(byId['delete-selection'].shortcut, 'Backspace');
  for (const id of ['undo', 'redo', 'cut', 'copy', 'paste', 'select-all']) {
    assert.equal(typeof byId[id].icon, 'string', `${id} carries an icon`);
  }
});

test('length-unit carries the three unit options as a submenu', () => {
  const menus = loadMenus();
  const doc = menus.find((menu) => menu.id === 'document');
  const unit = doc.items.find((item) => item.commandId === 'length-unit');
  assert.deepEqual(unit.children.map((child) => child.commandId), [
    'length-unit-pt', 'length-unit-inch', 'length-unit-cm',
  ]);
  assert.deepEqual(unit.children.map((child) => child.label), [
    'Points (pt)', 'Inches', 'Centimeters (cm)',
  ]);
});

test('menu XML rejects malformed definitions', () => {
  for (const xml of [
    '<menu id="m"><item command="c"/></menu>',
    '<menus><menu><item command="c"/></menu></menus>',
    '<menus><menu id="m"><item/></menu></menus>',
    '<menus><menu id="m"><item command="c">text</item></menu></menus>',
    '<menus><menu id="m"><item command="c"><item command="d"/></item></menu></menus>',
    '<menus><menu id="m"><item command="c"><option/></item></menu></menus>',
    '<menus><menu id="m"><item command="c"><option command="d"><option command="e"/></option></item></menu></menus>',
    '<menus><menu id="m"><option command="d"/></menu></menus>',
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
