// XUL-style In-Canvas Element definitions. Each In-Canvas Element mounts
// this schema's controls into the canvas when selected and withdraws them
// on deselect. Controls render inline around the frame; a <popoverButton>
// keeps control-heavy frames uncluttered by moving extra controls into a
// popover window. Dependency-free (no DOMParser) so the same parser runs in
// the browser and in the Node test suite. Malformed input yields a typed
// error, never a throw.
//
// Supported elements (attributes in parentheses):
//   <inCanvas (id, title)> <field (key, label, type, min, max, step) />
//     <select (key, label)> <option (value, label)> ... </select>
//     <toggle (key, label) />
//     <exportButton (label) />
//     <crossings (key, label) />
//     <popoverButton (label)> ...controls... </popoverButton>
// Field types: text | number. Number fields accept min/max/step.
// Labels fall back to the key when omitted.
import { parseXmlDocument, type XmlNode } from './xmlParser';

export interface InCanvasFieldControl {
  kind: 'field';
  key: string;
  label: string;
  fieldType: 'text' | 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface InCanvasSelectControl {
  kind: 'select';
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface InCanvasToggleControl {
  kind: 'toggle';
  key: string;
  label: string;
}

export interface InCanvasExportControl {
  kind: 'export';
  label: string;
}

export interface InCanvasCrossingsControl {
  kind: 'crossings';
  key: string;
  label: string;
}

export interface InCanvasPopoverControl {
  kind: 'popover';
  label: string;
  controls: InCanvasControl[];
}

export type InCanvasControl =
  | InCanvasFieldControl
  | InCanvasSelectControl
  | InCanvasToggleControl
  | InCanvasExportControl
  | InCanvasCrossingsControl
  | InCanvasPopoverControl;

export interface InCanvasSpec {
  id: string;
  title: string;
  controls: InCanvasControl[];
}

export type InCanvasParseResult = { spec: InCanvasSpec } | { error: string };

function parseNumberAttr(node: XmlNode, name: string): number | undefined | string {
  const raw = node.attrs[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return `<${node.tag}> attribute ${name}="${raw}" is not a number`;
  return value;
}

function parseField(node: XmlNode): InCanvasFieldControl | string {
  const key = node.attrs['key'];
  if (!key) return '<field> is missing its key attribute';
  if (node.children.length > 0) return `<field key="${key}"> takes no children`;
  const fieldType = node.attrs['type'] ?? 'text';
  if (fieldType !== 'text' && fieldType !== 'number') {
    return `<field key="${key}"> type must be text or number`;
  }
  const control: InCanvasFieldControl = { kind: 'field', key, label: node.attrs['label'] ?? key, fieldType };
  if (fieldType === 'number') {
    for (const name of ['min', 'max', 'step'] as const) {
      const parsed = parseNumberAttr(node, name);
      if (typeof parsed === 'string') return parsed;
      if (parsed !== undefined) control[name] = parsed;
    }
  }
  return control;
}

function parseSelect(node: XmlNode): InCanvasSelectControl | string {
  const key = node.attrs['key'];
  if (!key) return '<select> is missing its key attribute';
  const options: { value: string; label: string }[] = [];
  for (const child of node.children) {
    if (child.tag !== 'option') return `<select key="${key}"> only accepts <option> children`;
    const value = child.attrs['value'];
    if (!value) return `<select key="${key}"> has an <option> without a value`;
    if (child.children.length > 0) return `<select key="${key}"> <option> takes no children`;
    options.push({ value, label: child.attrs['label'] ?? value });
  }
  if (options.length < 1) return `<select key="${key}"> needs at least one <option> child`;
  return { kind: 'select', key, label: node.attrs['label'] ?? key, options };
}

function parseControl(node: XmlNode, inPopover: boolean): InCanvasControl | string {
  switch (node.tag) {
    case 'field': return parseField(node);
    case 'select': return parseSelect(node);
    case 'toggle': {
      const key = node.attrs['key'];
      if (!key) return '<toggle> is missing its key attribute';
      if (node.children.length > 0) return `<toggle key="${key}"> takes no children`;
      return { kind: 'toggle', key, label: node.attrs['label'] ?? key };
    }
    case 'exportButton': {
      if (node.children.length > 0) return '<exportButton> takes no children';
      return { kind: 'export', label: node.attrs['label'] ?? 'Export' };
    }
    case 'crossings': {
      const key = node.attrs['key'];
      if (!key) return '<crossings> is missing its key attribute';
      if (node.children.length > 0) return `<crossings key="${key}"> takes no children`;
      return { kind: 'crossings', key, label: node.attrs['label'] ?? key };
    }
    case 'popoverButton': {
      if (inPopover) return '<popoverButton> cannot nest inside another <popoverButton>';
      const label = node.attrs['label'];
      if (!label) return '<popoverButton> is missing its label attribute';
      const controls: InCanvasControl[] = [];
      for (const child of node.children) {
        const parsed = parseControl(child, true);
        if (typeof parsed === 'string') return parsed;
        controls.push(parsed);
      }
      if (controls.length === 0) return `<popoverButton label="${label}"> needs at least one control`;
      return { kind: 'popover', label, controls };
    }
    default: return `unsupported control <${node.tag}>`;
  }
}

export function parseInCanvasXML(xmlText: string): InCanvasParseResult {
  const root = parseXmlDocument(xmlText);
  if (typeof root === 'string') return { error: root };
  if (root.tag !== 'inCanvas') return { error: `<${root.tag}> is not an In-Canvas Element definition` };
  const id = root.attrs['id'];
  if (!id) return { error: '<inCanvas> is missing its id attribute' };
  const controls: InCanvasControl[] = [];
  for (const child of root.children) {
    const parsed = parseControl(child, false);
    if (typeof parsed === 'string') return { error: parsed };
    controls.push(parsed);
  }
  if (controls.length === 0) return { error: '<inCanvas> needs at least one control' };
  return { spec: { id, title: root.attrs['title'] ?? id, controls } };
}
