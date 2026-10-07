// XUL-style In-Canvas Element definitions. Each In-Canvas Element mounts
// this schema's controls into the canvas when selected and withdraws them
// on deselect. Controls prefer the exterior edges of the element's frame,
// declared with <edge side> sections (usually top and right); controls that
// cannot fit on their preferred edge overflow into a GUI widget strip above
// the canvas, underneath the status box, which mirrors the same sections.
// A <popoverButton> keeps control-heavy frames uncluttered by moving extra
// controls into a popover window. Dependency-free (no DOMParser) so the
// same parser runs in the browser and in the Node test suite. Malformed
// input yields a typed error, never a throw.
//
// Supported elements (attributes in parentheses):
//   <inCanvas (id, title)><edge (side, label)> ...controls... </edge>
//     <field (key, label, type, min, max, step) />
//     <select (key, label)> <option (value, label)> ... </select>
//     <toggle (key, label) />
//     <exportButton (label) />
//     <crossings (key, label) />
//     <popoverButton (label)> ...controls... </popoverButton>
// Edge sides: top | right | bottom | left. Bare controls outside any <edge>
// form an implied top section, so legacy files keep parsing. Sections and
// the controls inside them stay in XML order; overflow keeps earlier
// controls on the edge and moves trailing ones to the widget strip.
// Field types: text | number. Number fields accept min/max/step.
// Labels fall back to the key when omitted; edge labels fall back to
// "<Side> edge" (e.g. "Top edge").
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

export type InCanvasEdgeSide = 'top' | 'right' | 'bottom' | 'left';

export const IN_CANVAS_EDGE_SIDES: readonly InCanvasEdgeSide[] = ['top', 'right', 'bottom', 'left'];

export interface InCanvasEdgeSection {
  side: InCanvasEdgeSide;
  label: string;
  controls: InCanvasControl[];
}

export interface InCanvasSpec {
  id: string;
  title: string;
  /** Edge sections in XML order. Bare root controls fold into an implied top section. */
  sections: InCanvasEdgeSection[];
  /** All section controls flattened in XML order (back-compat for existing renderers). */
  controls: InCanvasControl[];
}

/** Per-edge control budget before trailing controls overflow to the widget
 * strip. A coarse stand-in for measured strip room until renderers report
 * real edge lengths; exported so renderers and tests share one default. */
export const IN_CANVAS_EDGE_BUDGET: Record<InCanvasEdgeSide, number> = {
  top: 4,
  right: 3,
  bottom: 4,
  left: 3,
};

export interface InCanvasPlacement {
  /** Sections that fit on their preferred exterior edge, in XML order. */
  edge: InCanvasEdgeSection[];
  /** Mirrored sections for the widget strip under the status box, in XML order. Empty when everything fits. */
  widget: InCanvasEdgeSection[];
}

/** Split a spec's sections between exterior edges and the widget strip.
 * Earlier controls keep their edge; trailing controls past the per-edge
 * budget move to the mirrored widget section. Sections authored later (by
 * convention the popover button) therefore overflow first. */
export function resolveInCanvasPlacement(
  spec: InCanvasSpec,
  budget: Record<InCanvasEdgeSide, number> = IN_CANVAS_EDGE_BUDGET,
): InCanvasPlacement {
  const edge: InCanvasEdgeSection[] = [];
  const widget: InCanvasEdgeSection[] = [];
  const used: Record<InCanvasEdgeSide, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const section of spec.sections) {
    const room = Math.max(0, (budget[section.side] ?? 0) - used[section.side]);
    const keep = section.controls.slice(0, room);
    const spill = section.controls.slice(room);
    used[section.side] += keep.length;
    if (keep.length > 0) edge.push({ ...section, controls: keep });
    if (spill.length > 0) widget.push({ ...section, controls: spill });
  }
  return { edge, widget };
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

function edgeLabel(side: InCanvasEdgeSide, raw: string | undefined): string {
  if (raw !== undefined && raw.length > 0) return raw;
  return `${side[0].toUpperCase()}${side.slice(1)} edge`;
}

function parseControl(node: XmlNode, inPopover: boolean, inEdge: boolean): InCanvasControl | string {
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
        if (child.tag === 'edge') return `<popoverButton label="${label}"> cannot contain <edge> sections`;
        const parsed = parseControl(child, true, inEdge);
        if (typeof parsed === 'string') return parsed;
        controls.push(parsed);
      }
      if (controls.length === 0) return `<popoverButton label="${label}"> needs at least one control`;
      return { kind: 'popover', label, controls };
    }
    case 'edge': {
      if (inPopover) return '<edge> cannot live inside a <popoverButton>; declare it at the <inCanvas> root';
      if (inEdge) return '<edge> cannot nest inside another <edge>';
      return '<edge> is only a section wrapper at the <inCanvas> root';
    }
    default: return `unsupported control <${node.tag}>`;
  }
}

function parseEdge(node: XmlNode): InCanvasEdgeSection | string {
  const side = node.attrs['side'];
  if (!side) return '<edge> is missing its side attribute';
  if (!IN_CANVAS_EDGE_SIDES.includes(side as InCanvasEdgeSide)) {
    return `<edge side="${side}"> must be one of top, right, bottom, left`;
  }
  const controls: InCanvasControl[] = [];
  for (const child of node.children) {
    const parsed = parseControl(child, false, true);
    if (typeof parsed === 'string') return parsed;
    controls.push(parsed);
  }
  if (controls.length === 0) return `<edge side="${side}"> needs at least one control`;
  return { side: side as InCanvasEdgeSide, label: edgeLabel(side as InCanvasEdgeSide, node.attrs['label']), controls };
}

export function parseInCanvasXML(xmlText: string): InCanvasParseResult {
  const root = parseXmlDocument(xmlText);
  if (typeof root === 'string') return { error: root };
  if (root.tag !== 'inCanvas') return { error: `<${root.tag}> is not an In-Canvas Element definition` };
  const id = root.attrs['id'];
  if (!id) return { error: '<inCanvas> is missing its id attribute' };
  const sections: InCanvasEdgeSection[] = [];
  let bare: InCanvasControl[] = [];
  const flushBare = (): void => {
    if (bare.length > 0) {
      sections.push({ side: 'top', label: edgeLabel('top', undefined), controls: bare });
      bare = [];
    }
  };
  for (const child of root.children) {
    if (child.tag === 'edge') {
      flushBare();
      const parsed = parseEdge(child);
      if (typeof parsed === 'string') return { error: parsed };
      sections.push(parsed);
      continue;
    }
    const parsed = parseControl(child, false, false);
    if (typeof parsed === 'string') return { error: parsed };
    bare.push(parsed);
  }
  flushBare();
  if (sections.length === 0) return { error: '<inCanvas> needs at least one control' };
  const controls = sections.flatMap((section) => section.controls);
  return { spec: { id, title: root.attrs['title'] ?? id, sections, controls } };
}
