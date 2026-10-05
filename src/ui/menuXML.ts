// XUL-style application-menu definitions loaded from XML files.
// Owns nothing else: parses a menus XML string into MenuDef[] the menu bar
// can render. Dependency-free on purpose (no DOMParser), so the same parser
// runs in the browser and in the Node test suite. Malformed input yields a
// typed error, never a throw. Tested from tests/menu-xml.test.mjs.
//
// Supported elements (attributes in parentheses):
//   <menus> <menu (id, title)> ...
//     <item (command, label?, shortcut?, icon?) />
//     <group (label)> <item/> ... </group>
// An <item> may carry <option (command, label?) /> children instead, which
// renders the row as an expandable submenu parent.
// A group emits a header row (commandId hdr-<menu>-<n>, counting groups in
// the menu from 1) followed by its items; bare items and groups may mix in
// document order. Menu titles and item labels fall back to the id/command
// when omitted; a group without a label is an error.
// shortcut="Primary+G" and "Primary+Shift+G" resolve through primaryShortcut
// for the platform; any other value is used literally (e.g. "Backspace").

import { parseXmlDocument, type XmlNode } from './xmlParser';
import { primaryShortcut } from '../engine/input/keymap';
import type { MenuDef, MenuItemDef } from './PanelsManager';

export type MenuParseResult = { menus: MenuDef[] } | { error: string };

function resolveShortcut(raw: string): string | null {
  if (!raw.startsWith('Primary+')) return raw;
  const match = /^(Shift\+)?([A-Za-z0-9])$/.exec(raw.slice('Primary+'.length));
  if (!match) return null;
  return primaryShortcut(match[2], match[1] !== undefined);
}

function parseItem(node: XmlNode, menuId: string): MenuItemDef | string {
  const command = node.attrs['command'];
  if (!command) return `<${node.tag}> in menu "${menuId}" is missing its command attribute`;
  const item: MenuItemDef = { commandId: command };
  if (node.attrs['label'] !== undefined) item.label = node.attrs['label'];
  if (node.attrs['icon'] !== undefined) item.icon = node.attrs['icon'];
  if (node.attrs['shortcut'] !== undefined) {
    const resolved = resolveShortcut(node.attrs['shortcut']);
    if (resolved == null) {
      return `<${node.tag} command="${command}"> has a malformed shortcut (use Primary+G, Primary+Shift+G, or a literal like Backspace)`;
    }
    item.shortcut = resolved;
  }
  const options = node.children;
  if (options.length > 0) {
    if (node.tag !== 'item') return `<${node.tag} command="${command}"> takes no children`;
    const children: MenuItemDef[] = [];
    for (const sub of options) {
      if (sub.tag !== 'option') {
        return `<item command="${command}"> only accepts <option> children, found <${sub.tag}>`;
      }
      const parsed = parseItem(sub, menuId);
      if (typeof parsed === 'string') return parsed;
      if (parsed.children) return `<option command="${parsed.commandId}"> takes no children`;
      children.push(parsed);
    }
    item.children = children;
  }
  return item;
}

export function parseMenuXML(xmlText: string): MenuParseResult {
  const root = parseXmlDocument(xmlText);
  if (typeof root === 'string') return { error: root };
  if (root.tag !== 'menus') return { error: `<${root.tag}> is not a menus definition` };
  const menus: MenuDef[] = [];
  for (const child of root.children) {
    if (child.tag !== 'menu') return { error: `<menus> only accepts <menu> children, found <${child.tag}>` };
    const id = child.attrs['id'];
    if (!id) return { error: '<menu> is missing its id attribute' };
    const items: MenuItemDef[] = [];
    let groups = 0;
    for (const entry of child.children) {
      if (entry.tag === 'item') {
        const parsed = parseItem(entry, id);
        if (typeof parsed === 'string') return { error: parsed };
        items.push(parsed);
      } else if (entry.tag === 'group') {
        const label = entry.attrs['label'];
        if (!label) return { error: `<group> in menu "${id}" is missing its label attribute` };
        groups += 1;
        items.push({ commandId: `hdr-${id}-${groups}`, label, header: true });
        for (const sub of entry.children) {
          if (sub.tag !== 'item') {
            return { error: `<group> in menu "${id}" only accepts <item> children, found <${sub.tag}>` };
          }
          const parsed = parseItem(sub, id);
          if (typeof parsed === 'string') return { error: parsed };
          items.push(parsed);
        }
      } else {
        return { error: `<menu> only accepts <item> and <group> children, found <${entry.tag}>` };
      }
    }
    menus.push({ id, title: child.attrs['title'] ?? id, items });
  }
  return { menus };
}
