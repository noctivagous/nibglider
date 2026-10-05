// XUL-style window definitions loaded from XML files.
// Owns nothing else: parses a window XML string into a validated WindowSpec
// the renderers can mount. Dependency-free on purpose (no DOMParser), so the
// same parser runs in the browser and in the Node test suite. Malformed
// input yields a typed error, never a throw, so a broken file degrades to
// an error box instead of a crash. Tested from tests/window-xml.test.mjs.
//
// Supported elements (attributes in parentheses):
//   <window (id, title)> <section (id, title)> ...
//     <switch (key, label)> <option (value, label)> ... </switch>
//     <toggle (key, label) />
// Titles and option labels fall back to the id/key/value when omitted.
// Inter-element whitespace is ignored; any other text content is an error.

import { parseXmlDocument, type XmlNode } from './xmlParser';

export interface WindowSwitchOption {
  value: string;
  label: string;
}

export interface WindowSwitchControl {
  kind: 'switch';
  key: string;
  label: string;
  options: WindowSwitchOption[];
}

export interface WindowToggleControl {
  kind: 'toggle';
  key: string;
  label: string;
}

export type WindowControl = WindowSwitchControl | WindowToggleControl;

export interface WindowSection {
  id: string;
  title: string;
  controls: WindowControl[];
}

export interface WindowSpec {
  id: string;
  title: string;
  sections: WindowSection[];
}

export type WindowParseResult = { spec: WindowSpec } | { error: string };

function parseSwitch(node: XmlNode): WindowSwitchControl | string {
  const key = node.attrs['key'];
  if (!key) return '<switch> is missing its key attribute';
  const options: WindowSwitchOption[] = [];
  for (const child of node.children) {
    if (child.tag !== 'option') return `<switch key="${key}"> only accepts <option> children`;
    const value = child.attrs['value'];
    if (!value) return `<switch key="${key}"> has an <option> without a value`;
    options.push({ value, label: child.attrs['label'] ?? value });
  }
  if (options.length < 2) return `<switch key="${key}"> needs at least two <option> children`;
  return { kind: 'switch', key, label: node.attrs['label'] ?? key, options };
}

function parseToggle(node: XmlNode): WindowToggleControl | string {
  const key = node.attrs['key'];
  if (!key) return '<toggle> is missing its key attribute';
  if (node.children.length > 0) return `<toggle key="${key}"> takes no children`;
  return { kind: 'toggle', key, label: node.attrs['label'] ?? key };
}

export function parseWindowXML(xmlText: string): WindowParseResult {
  const root = parseXmlDocument(xmlText);
  if (typeof root === 'string') return { error: root };
  if (root.tag !== 'window') return { error: `<${root.tag}> is not a window definition` };
  const id = root.attrs['id'];
  if (!id) return { error: '<window> is missing its id attribute' };
  const sections: WindowSection[] = [];
  for (const child of root.children) {
    if (child.tag !== 'section') return { error: `<window> only accepts <section> children, found <${child.tag}>` };
    const sectionId = child.attrs['id'];
    if (!sectionId) return { error: '<section> is missing its id attribute' };
    const controls: WindowControl[] = [];
    for (const control of child.children) {
      if (control.tag === 'switch') {
        const parsed = parseSwitch(control);
        if (typeof parsed === 'string') return { error: parsed };
        controls.push(parsed);
      } else if (control.tag === 'toggle') {
        const parsed = parseToggle(control);
        if (typeof parsed === 'string') return { error: parsed };
        controls.push(parsed);
      } else {
        return { error: `<section> only accepts <switch> and <toggle> children, found <${control.tag}>` };
      }
    }
    sections.push({ id: sectionId, title: child.attrs['title'] ?? sectionId, controls });
  }
  return { spec: { id, title: root.attrs['title'] ?? id, sections } };
}
