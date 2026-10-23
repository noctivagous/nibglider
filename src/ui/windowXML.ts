// XUL-style window definitions loaded from XML files.
// Owns nothing else: parses a window XML string into a validated WindowSpec
// the renderers can mount. Dependency-free on purpose (no DOMParser), so the
// same parser runs in the browser and in the Node test suite. Malformed
// input yields a typed error, never a throw, so a broken file degrades to
// an error box instead of a crash. Tested from tests/window-xml.test.mjs.
//
// Supported elements (attributes in parentheses):
//   <window (id, title)> <section (id, title)> ... | <tabview> ...
//     <tab (id, title)> <section> ... | bare controls </tab>
//     <switch (key, label)> <option (value, label)> ... </switch>
//     <toggle (key, label) />
//     <field (key, label, type, min, max, step, placeholder) />
//     <table (align)> <field> ... | <toggle> ... </table>
//     <custom (id) /> — host-rendered control (e.g. the size editor)
//   <field> takes no children. type is text (default), number, or password.
//   min/max/step are numbers and only valid for number fields; placeholder
//   is free text. Password fields are commit-only: hosts must never display
//   the stored value back, and password bindings must stay out of persisted
//   engine settings (memory-only, like the Printify token).
//   <table> lays its <field> and <toggle> children out as parameter
//   rows: the row label sits in the left column, the input or toggle in
//   the right column. align is left or right (default) and justifies the
//   label column.
//   The <tabview> container holds the window's tab-strip pages; each <tab>
//   groups sections (and bare controls, wrapped in an anonymous section).
//   At most one <tabview> per window. Titles and option labels fall back
//   to the id/key/value when omitted. Inter-element whitespace is ignored;
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

export type WindowFieldType = 'text' | 'number' | 'password';

export interface WindowFieldControl {
  kind: 'field';
  key: string;
  label: string;
  fieldType: WindowFieldType;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface WindowCustomControl {
  kind: 'custom';
  id: string;
}

export type WindowTableAlign = 'left' | 'right';

export type WindowTableRow = WindowFieldControl | WindowToggleControl;

export interface WindowTableControl {
  kind: 'table';
  align: WindowTableAlign;
  rows: WindowTableRow[];
}

export type WindowControl = WindowSwitchControl | WindowToggleControl | WindowFieldControl | WindowTableControl | WindowCustomControl;

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

function parseField(node: XmlNode): WindowFieldControl | string {
  const key = node.attrs['key'];
  if (!key) return '<field> is missing its key attribute';
  if (node.children.length > 0) return `<field key="${key}"> takes no children`;
  const rawType = node.attrs['type'] ?? 'text';
  if (rawType !== 'text' && rawType !== 'number' && rawType !== 'password') {
    return `<field key="${key}"> type must be text, number, or password`;
  }
  const numeric: { min?: number; max?: number; step?: number } = {};
  for (const name of ['min', 'max', 'step'] as const) {
    const raw = node.attrs[name];
    if (raw === undefined) continue;
    if (rawType !== 'number') return `<field key="${key}"> ${name} is only valid for number fields`;
    const value = Number(raw);
    if (!Number.isFinite(value)) return `<field key="${key}"> ${name} must be a finite number`;
    numeric[name] = value;
  }
  if (numeric.step !== undefined && numeric.step <= 0) {
    return `<field key="${key}"> step must be positive`;
  }
  if (numeric.min !== undefined && numeric.max !== undefined && numeric.min > numeric.max) {
    return `<field key="${key}"> min must not exceed max`;
  }
  const control: WindowFieldControl = { kind: 'field', key, label: node.attrs['label'] ?? key, fieldType: rawType };
  if (numeric.min !== undefined) control.min = numeric.min;
  if (numeric.max !== undefined) control.max = numeric.max;
  if (numeric.step !== undefined) control.step = numeric.step;
  if (node.attrs['placeholder'] !== undefined) control.placeholder = node.attrs['placeholder'];
  return control;
}

function parseTable(node: XmlNode): WindowTableControl | string {
  const align = node.attrs['align'] ?? 'right';
  if (align !== 'left' && align !== 'right') return '<table> align must be left or right';
  if (node.children.length === 0) return '<table> needs at least one <field> or <toggle> child';
  const rows: WindowTableRow[] = [];
  for (const child of node.children) {
    if (child.tag !== 'field' && child.tag !== 'toggle') {
      return `<table> only accepts <field> and <toggle> children, found <${child.tag}>`;
    }
    const parsed = child.tag === 'field' ? parseField(child) : parseToggle(child);
    if (typeof parsed === 'string') return parsed;
    rows.push(parsed);
  }
  return { kind: 'table', align, rows };
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
  if (node.tag === 'field') return parseField(node);
  if (node.tag === 'table') return parseTable(node);
  if (node.tag === 'custom') return parseCustom(node);
  return `<section> only accepts <switch>, <toggle>, <field>, <table>, and <custom> children, found <${node.tag}>`;
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

interface TabParseContext {
  tabs: WindowTab[];
  takeSection: (section: WindowSection) => string | null;
}

function parseTab(node: XmlNode, context: TabParseContext): string | null {
  const tabId = node.attrs['id'];
  if (!tabId) return '<tab> is missing its id attribute';
  if (context.tabs.some((tab) => tab.id === tabId)) return `<tab> id "${tabId}" is used more than once`;
  if (node.children.length === 0) return `<tab id="${tabId}"> needs at least one <section> or control child`;
  const sectionIds: string[] = [];
  let pending: WindowControl[] = [];
  const flushPending = (): string | null => {
    if (pending.length === 0) return null;
    const anonymous = { id: `${tabId}-content`, title: '', controls: pending };
    pending = [];
    const duplicate = context.takeSection(anonymous);
    if (duplicate) return duplicate;
    sectionIds.push(anonymous.id);
    return null;
  };
  for (const entry of node.children) {
    if (entry.tag === 'section') {
      const flushed = flushPending();
      if (flushed) return flushed;
      const parsed = parseSection(entry);
      if (typeof parsed === 'string') return parsed;
      const duplicate = context.takeSection(parsed);
      if (duplicate) return duplicate;
      sectionIds.push(parsed.id);
    } else {
      const parsed = parseControl(entry);
      if (typeof parsed === 'string') return parsed.startsWith('<section>')
        ? parsed.replace('<section>', `<tab id="${tabId}">`)
        : parsed;
      pending.push(parsed);
    }
  }
  const flushed = flushPending();
  if (flushed) return flushed;
  context.tabs.push({ id: tabId, title: node.attrs['title'] ?? tabId, sectionIds });
  return null;
}

function parseTabview(node: XmlNode, context: TabParseContext): string | null {
  if (Object.keys(node.attrs).length > 0) return '<tabview> takes no attributes';
  if (node.children.length === 0) return '<tabview> needs at least one <tab> child';
  for (const entry of node.children) {
    if (entry.tag !== 'tab') return `<tabview> only accepts <tab> children, found <${entry.tag}>`;
    const failed = parseTab(entry, context);
    if (failed) return failed;
  }
  return null;
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
  const context: TabParseContext = {
    tabs,
    takeSection: (section) => {
      if (seenSectionIds.has(section.id)) return `<section> id "${section.id}" is used more than once`;
      seenSectionIds.add(section.id);
      sections.push(section);
      return null;
    },
  };
  let seenTabview = false;
  for (const child of root.children) {
    if (child.tag === 'section') {
      const parsed = parseSection(child);
      if (typeof parsed === 'string') return { error: parsed };
      const duplicate = context.takeSection(parsed);
      if (duplicate) return { error: duplicate };
      continue;
    }
    if (child.tag !== 'tabview') {
      return { error: `<window> only accepts <section> and <tabview> children, found <${child.tag}>` };
    }
    if (seenTabview) return { error: '<window> accepts at most one <tabview>' };
    seenTabview = true;
    const failed = parseTabview(child, context);
    if (failed) return { error: failed };
  }
  return { spec: { id, title: root.attrs['title'] ?? id, sections, tabs } };
}
