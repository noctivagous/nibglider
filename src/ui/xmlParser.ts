// Shared dependency-free XML parser for XUL-style UI definitions.
// Owns nothing else: parses an XML string into a plain node tree or returns
// the failure reason as a string, never a throw. No DOMParser on purpose, so
// the same parser runs in the browser and in the Node test suite.
// Inter-element whitespace is ignored; any other text content is an error.

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

export class XmlParser {
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

/** Parse a full XML document; returns the root node or the failure reason. */
export function parseXmlDocument(xmlText: string): XmlNode | string {
  return new XmlParser(xmlText).parse();
}
