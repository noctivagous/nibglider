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

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

class XmlParser {
  private pos = 0;
  private readonly text: string;
  constructor(text: string) {
    this.text = text;
  }

  parse(): XmlNode | string {
    this.skipProlog();
    this.skipWhitespace();
    const node = this.parseElement();
    if (typeof node === 'string') return node;
    this.skipWhitespace();
    if (this.pos < this.text.length) return 'unexpected content after the root element';
    return node;
  }

  private skipProlog(): void {
    this.skipWhitespace();
    if (this.text.startsWith('<!--', this.pos)) this.skipComment();
    else if (this.text.startsWith('<?', this.pos)) {
      const end = this.text.indexOf('?>', this.pos);
      this.pos = end < 0 ? this.text.length : end + 2;
    }
  }

  private skipComment(): void {
    const end = this.text.indexOf('-->', this.pos);
    this.pos = end < 0 ? this.text.length : end + 3;
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length) {
      if (this.text.startsWith('<!--', this.pos)) this.skipComment();
      else if (/\s/.test(this.text[this.pos])) this.pos++;
      else break;
    }
  }

  private parseElement(): XmlNode | string {
    if (this.text[this.pos] !== '<') return `expected < at offset ${this.pos}`;
    const open = this.parseTag();
    if (typeof open === 'string') return open;
    if (open.selfClosing) return { tag: open.tag, attrs: open.attrs, children: [] };
    const children: XmlNode[] = [];
    for (;;) {
      this.skipWhitespace();
      if (this.pos >= this.text.length) return `<${open.tag}> was never closed`;
      if (this.text.startsWith(`</`, this.pos)) {
        const close = this.parseTag();
        if (typeof close === 'string') return close;
        if (close.selfClosing || close.tag !== open.tag) return `mismatched </${close.tag}> inside <${open.tag}>`;
        return { tag: open.tag, attrs: open.attrs, children };
      }
      if (this.text[this.pos] === '<') {
        const child = this.parseElement();
        if (typeof child === 'string') return child;
        children.push(child);
      } else {
        return `<${open.tag}> contains text content, only elements are allowed`;
      }
    }
  }

  private parseTag(): { tag: string; attrs: Record<string, string>; selfClosing: boolean } | string {
    const text = this.text;
    const closing = text.startsWith('</', this.pos);
    this.pos += closing ? 2 : 1;
    const name = this.parseName();
    if (!name) return 'expected an element name';
    const attrs: Record<string, string> = {};
    for (;;) {
      while (this.pos < text.length && /\s/.test(text[this.pos])) this.pos++;
      if (this.pos >= text.length) return 'unterminated tag';
      if (text.startsWith('/>', this.pos)) {
        if (closing) return 'unexpected /> in a closing tag';
        this.pos += 2;
        return { tag: name, attrs, selfClosing: true };
      }
      if (text[this.pos] === '>') {
        this.pos++;
        return { tag: name, attrs, selfClosing: false };
      }
      if (closing) return 'unexpected attribute in a closing tag';
      const attrName = this.parseName();
      if (!attrName) return 'expected an attribute name';
      while (this.pos < text.length && /\s/.test(text[this.pos])) this.pos++;
      if (text[this.pos] !== '=') return `attribute ${attrName} is missing =`;
      this.pos++;
      while (this.pos < text.length && /\s/.test(text[this.pos])) this.pos++;
      const value = this.parseAttrValue();
      if (value == null) return `attribute ${attrName} needs a quoted value`;
      attrs[attrName] = value;
    }
  }

  private parseName(): string {
    const match = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(this.text.slice(this.pos));
    if (!match) return '';
    this.pos += match[0].length;
    return match[0];
  }

  private parseAttrValue(): string | null {
    const text = this.text;
    const quote = text[this.pos];
    if (quote !== '"' && quote !== "'") return null;
    this.pos++;
    let out = '';
    for (;;) {
      if (this.pos >= text.length) return null;
      const ch = text[this.pos];
      if (ch === quote) {
        this.pos++;
        return out;
      }
      if (ch === '&') {
        const semi = text.indexOf(';', this.pos);
        const entity = semi < 0 ? '' : text.slice(this.pos + 1, semi);
        const decoded = ENTITIES[entity];
        if (decoded == null) return null;
        out += decoded;
        this.pos = semi + 1;
      } else if (ch === '<') {
        return null;
      } else {
        out += ch;
        this.pos++;
      }
    }
  }
}

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
  const root = new XmlParser(xmlText).parse();
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
