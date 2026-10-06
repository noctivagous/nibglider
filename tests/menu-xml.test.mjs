import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMenuXML } from '../src/ui/menuXML.ts';
import { keyboardPlatform, optShortcut, primaryShortcut } from '../src/engine/input/keymap.ts';

const MENUS_URL = new URL('../src/ui/menus/menus.xml', import.meta.url);

// Commands with a handler in App.tsx handleMenuCommand. Everything else in
// the XML renders disabled until it is wired. Keep both lists explicit so a
// typo, a missing handler, or a dead handler fails here instead of silently.
const WIRED_COMMANDS = [
  'open-gallery', 'new-document', 'save-gallery', 'rename-document',
  'export', 'import',
  'scale-dialog', 'rotate-dialog',
  'settings', 'document-settings', 'tutorial', 'reset-settings', 'empty-canvas',
  'undo', 'redo',
  'toggle-panel', 'toggle-keyboard', 'toggle-status',
  'length-unit-pt', 'length-unit-inch', 'length-unit-cm',
  'bring-to-front', 'send-to-back', 'duplicate-selection',
  'group', 'ungroup-selection', 'delete-selection', 'transform-mode',
  'combinatorics-none', 'combinatorics-union', 'combinatorics-subtract', 'combinatorics-intersect', 'combinatorics-crop',
  'interlace',
  'rect-shape-rectangle', 'rect-shape-circle', 'rect-shape-polygon', 'rect-shape-supershape',
  'rect-shape-trapezoid', 'rect-shape-parallelogram', 'rect-shape-rightTriangle',
  'rect-shape-rhombus', 'rect-shape-kite', 'rect-shape-exportFrame',
  'circle-shape-circle', 'circle-shape-semicircle', 'circle-shape-sector', 'circle-shape-segment',
  'circle-shape-polygon', 'circle-shape-supershape', 'circle-shape-trapezoid',
  'circle-shape-parallelogram', 'circle-shape-rightTriangle', 'circle-shape-rhombus',
  'circle-shape-kite',
  'snap-grid', 'snap-path', 'snap-points', 'snap-angle', 'snap-length', 'snap-aspect',
  'text-mode-display', 'text-mode-body',
];
const PLACEHOLDER_COMMANDS = [
  'page-size', 'length-unit', 'reset-zoom', 'select',
  'rect-shape', 'circle-shape', 'combinatorics', 'snapping', 'text-mode',
  'repeat-grid', 'repeat-circle',
  'cut', 'copy', 'paste', 'select-all',
];

function loadMenus() {
  const result = parseMenuXML(readFileSync(MENUS_URL, 'utf8'));
  assert.ok(!('error' in result), 'error' in result ? result.error : 'parse failed');
  return result.menus;
}

test('menus XML parses to the application menus in order', () => {
  const menus = loadMenus();
  assert.deepEqual(menus.map((menu) => menu.id), ['file', 'edit', 'document', 'operations', 'modes', 'layers', 'context-object', 'help', 'debug']);
  assert.deepEqual(menus.map((menu) => menu.title), [
    'File', 'Edit', 'Document and Settings', 'Operations', 'Modes', 'Layers and Objects', 'Object', 'Help', 'Debug',
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

test('right-click menu offers transform controls with the Opt shortcut', () => {
  const menus = loadMenus();
  const context = menus.find((menu) => menu.id === 'context-object');
  assert.ok(context);
  const item = context.items.find((entry) => entry.commandId === 'transform-mode');
  assert.ok(item);
  assert.equal(item.label, 'Transform controls');
  // ⌥T on macOS/iOS, Alt+T elsewhere.
  assert.equal(item.shortcut, keyboardPlatform() === 'mac' ? '⌥T' : 'Alt+T');
  assert.equal(item.shortcut, optShortcut('T'));
  assert.equal(optShortcut('T', 'mac'), '⌥T');
  assert.equal(optShortcut('T', 'other'), 'Alt+T');
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

test('operations holds repeat and dialogs, modes holds the mode parents; layers holds object control', () => {
  const menus = loadMenus();
  const byId = Object.fromEntries(menus.map((menu) => [menu.id, menu]));
  assert.deepEqual(byId.operations.items.map((item) => item.commandId), [
    'hdr-operations-1', 'repeat-grid', 'repeat-circle',
    'hdr-operations-2', 'scale-dialog', 'rotate-dialog',
  ]);
  assert.deepEqual(
    byId.operations.items.filter((item) => item.header).map((item) => item.label),
    ['Repeat', 'With dialog'],
  );
  assert.deepEqual(byId.modes.items.map((item) => item.commandId), [
    'rect-shape', 'circle-shape', 'combinatorics', 'snapping', 'text-mode',
  ]);
  assert.equal(byId.modes.items.some((item) => item.header), false);
  const opsText = JSON.stringify(byId.operations);
  assert.equal(opsText.includes('stroke'), false);
  assert.equal(opsText.includes('fill'), false);
  assert.deepEqual(byId.layers.items.map((item) => item.commandId), [
    'select',
    'hdr-layers-1', 'bring-to-front', 'send-to-back',
    'hdr-layers-2', 'group', 'ungroup-selection', 'duplicate-selection', 'delete-selection',
  ]);
});

test('every submenu option carries its panel icon, and every icon key has an AppMenu glyph', () => {
  const menus = loadMenus();
  const options = menus
    .flatMap((menu) => menu.items)
    .flatMap((item) => item.children ?? []);
  assert.ok(options.length > 0);
  for (const option of options) {
    // Length units are text-only in the panel too, so they keep no icon.
    if (option.commandId.startsWith('length-unit-')) continue;
    assert.equal(typeof option.icon, 'string', `${option.commandId} carries an icon`);
  }
  const referenced = new Set();
  for (const item of menus.flatMap((menu) => menu.items)) {
    if (item.icon) referenced.add(item.icon);
    for (const child of item.children ?? []) {
      if (child.icon) referenced.add(child.icon);
    }
  }
  const appMenu = readFileSync(new URL('../src/components/AppMenu.tsx', import.meta.url), 'utf8');
  const defined = new Set(
    [...appMenu.matchAll(/^  ('([\w-]+)'|([\w-]+)): \($/gm)].map((m) => m[2] ?? m[3]),
  );
  for (const key of referenced) {
    assert.ok(defined.has(key), `icon "${key}" has a glyph in AppMenu.tsx`);
  }
});

test('help holds the tutorial, and shape parents use the short Keys labels', () => {
  const menus = loadMenus();
  const byId = Object.fromEntries(menus.map((menu) => [menu.id, menu]));
  assert.deepEqual(byId.help.items.map((item) => item.commandId), ['tutorial']);
  assert.ok(!byId.file.items.some((item) => item.commandId === 'tutorial'));
  const modesById = Object.fromEntries(byId.modes.items.map((item) => [item.commandId, item]));
  assert.equal(modesById['rect-shape'].label, 'Rect Keys');
  assert.equal(modesById['circle-shape'].label, 'Circle Keys');
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
    '<menus><menu id="m"><item command="c" shortcut="Opt+"/></menu></menus>',
    '<menus><menu id="m"><item command="c" shortcut="Opt+TH"/></menu></menus>',
    '<menus><menu id="m"><bogus/></menu></menus>',
    'not xml at all',
    '',
  ]) {
    const result = parseMenuXML(xml);
    assert.ok('error' in result, `expected an error for ${xml}`);
    assert.ok(result.error.length > 0);
  }
});
