// XUL-style window definitions loaded from XML files.
// Owns nothing else: parses a window XML string into a validated WindowSpec
// the renderers can mount. Dependency-free on purpose (no DOMParser), so the
// same parser runs in the browser and in the Node test suite. Malformed
// input yields a typed error, never a throw, so a broken file degrades to
// an error box instead of a crash. Tested from tests/window-xml.test.mjs.
//
// Supported elements (attributes in parentheses):
//   <window (id, title)> <section (id, title)> ... | <tab (id, title)> ...
//     <switch (key, label)> <option (value, label)> ... </switch>
//     <toggle (key, label) />
//     <custom (id) /> — host-rendered control (e.g. the size editor)
//   A <tab> groups sections (and bare controls, wrapped in an anonymous
//   section) into a tab-strip page. Titles and option labels fall back to
//   the id/key/value when omitted. Inter-element whitespace is ignored;
//   any other text content is an error.

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

export interface WindowCustomControl {
  kind: 'custom';
  id: string;
}

export type WindowControl = WindowSwitchControl | WindowToggleControl | WindowCustomControl;

export interface WindowSection {
  id: string;
  title: string;
  controls: WindowControl[];
}

export interface WindowTab {
  id: string;
  title: string;
  /** Ids into the spec's flattened sections, in tab order. */
  sectionIds: string[];
}

export interface WindowSpec {
  id: string;
  title: string;
  /** Every section, including tabbed ones, in document order. */
  sections: WindowSection[];
  /** Tab strip pages; empty for windows without <tab> children. */
  tabs: WindowTab[];
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

function parseCustom(node: XmlNode): WindowCustomControl | string {
  const customId = node.attrs['id'];
  if (!customId) return '<custom> is missing its id attribute';
  if (node.children.length > 0) return `<custom id="${customId}"> takes no children`;
  return { kind: 'custom', id: customId };
}

function parseControl(node: XmlNode): WindowControl | string {
  if (node.tag === 'switch') return parseSwitch(node);
  if (node.tag === 'toggle') return parseToggle(node);
  if (node.tag === 'custom') return parseCustom(node);
  return `<section> only accepts <switch>, <toggle>, and <custom> children, found <${node.tag}>`;
}

function parseSection(node: XmlNode): WindowSection | string {
  const sectionId = node.attrs['id'];
  if (!sectionId) return '<section> is missing its id attribute';
  const controls: WindowControl[] = [];
  for (const control of node.children) {
    const parsed = parseControl(control);
    if (typeof parsed === 'string') return parsed;
    controls.push(parsed);
  }
  return { id: sectionId, title: node.attrs['title'] ?? sectionId, controls };
}

export function parseWindowXML(xmlText: string): WindowParseResult {
  const root = parseXmlDocument(xmlText);
  if (typeof root === 'string') return { error: root };
  if (root.tag !== 'window') return { error: `<${root.tag}> is not a window definition` };
  const id = root.attrs['id'];
  if (!id) return { error: '<window> is missing its id attribute' };
  const sections: WindowSection[] = [];
  const tabs: WindowTab[] = [];
  const seenSectionIds = new Set<string>();
  const takeSection = (section: WindowSection): string | null => {
    if (seenSectionIds.has(section.id)) return `<section> id "${section.id}" is used more than once`;
    seenSectionIds.add(section.id);
    sections.push(section);
    return null;
  };
  for (const child of root.children) {
    if (child.tag === 'section') {
      const parsed = parseSection(child);
      if (typeof parsed === 'string') return { error: parsed };
      const duplicate = takeSection(parsed);
      if (duplicate) return { error: duplicate };
      continue;
    }
    if (child.tag !== 'tab') {
      return { error: `<window> only accepts <section> and <tab> children, found <${child.tag}>` };
    }
    const tabId = child.attrs['id'];
    if (!tabId) return { error: '<tab> is missing its id attribute' };
    if (tabs.some((tab) => tab.id === tabId)) return { error: `<tab> id "${tabId}" is used more than once` };
    if (child.children.length === 0) return { error: `<tab id="${tabId}"> needs at least one <section> or control child` };
    const sectionIds: string[] = [];
    let pending: WindowControl[] = [];
    const flushPending = (): string | null => {
      if (pending.length === 0) return null;
      const anonymous = { id: `${tabId}-content`, title: '', controls: pending };
      pending = [];
      const duplicate = takeSection(anonymous);
      if (duplicate) return duplicate;
      sectionIds.push(anonymous.id);
      return null;
    };
    for (const entry of child.children) {
      if (entry.tag === 'section') {
        const flushed = flushPending();
        if (flushed) return { error: flushed };
        const parsed = parseSection(entry);
        if (typeof parsed === 'string') return { error: parsed };
        const duplicate = takeSection(parsed);
        if (duplicate) return { error: duplicate };
        sectionIds.push(parsed.id);
      } else {
        const parsed = parseControl(entry);
        if (typeof parsed === 'string') return parsed.startsWith('<section>')
          ? { error: parsed.replace('<section>', `<tab id="${tabId}">`) }
          : { error: parsed };
        pending.push(parsed);
      }
    }
    const flushed = flushPending();
    if (flushed) return { error: flushed };
    tabs.push({ id: tabId, title: child.attrs['title'] ?? tabId, sectionIds });
  }
  return { spec: { id, title: root.attrs['title'] ?? id, sections, tabs } };
}
