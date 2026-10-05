// Shared paste/drop payload classification and rich-text normalization.
// Pure and dependency-free (imports only SceneIO predicates) so the same
// logic runs in the browser and the Node test suite. HTML, markdown, and
// RTF all degrade to plain text: NibGlider text items carry no runs.
// Tested from tests/clipboard-ingest.test.mjs.
import { isSceneJson, isSvgMarkup } from './SceneIO';

export type ClipboardTextKind = 'empty' | 'scene' | 'svg' | 'rtf' | 'html' | 'text';

/** MIME type used for the native payload on the system clipboard and drops. */
export const SCENE_MIME = 'application/x-nibglider-scene';

/** Classify pasted or dropped string content. Scene JSON and SVG win over
 * markup sniffing so our own round-trips stay exact. */
export function classifyClipboardText(text: string): ClipboardTextKind {
  if (!text || !text.trim()) return 'empty';
  if (isSceneJson(text)) return 'scene';
  if (isSvgMarkup(text)) return 'svg';
  if (isRtfMarkup(text)) return 'rtf';
  if (isHtmlMarkup(text)) return 'html';
  return 'text';
}

export function isRtfMarkup(text: string): boolean {
  return /^\s*{\\rtf\d/i.test(text);
}

export function isHtmlMarkup(text: string): boolean {
  const head = text.slice(0, 4096);
  return /<\s*(p|div|span|a|h[1-6]|ul|ol|li|br|b|i|em|strong|table|tr|td|font)\b/i.test(head) ||
    /<\s*html\b/i.test(head);
}

/** Dispatch to the right plain-text converter. Scene/SVG payloads are not
 * text and come back unchanged (the caller routes them elsewhere). */
export function richTextToPlainText(text: string): string {
  const kind = classifyClipboardText(text);
  if (kind === 'rtf') return decodeRtf(text);
  if (kind === 'html') return htmlToPlainText(text);
  if (kind === 'text') return stripMarkdown(text);
  return text;
}

/** Single-line pastes become Display Text; anything with a line break
 * becomes multiline Body Text. */
export function isMultilineText(text: string): boolean {
  return /[\r\n]/.test(text);
}

/** Normalize pasted body copy: CRLF/CR folds, surrounding blank lines drop,
 * runs cap so a pasted novel cannot freeze the canvas. */
export function splitBodyLines(text: string, maxLines = 200): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return [' '];
  return lines.slice(0, Math.max(1, maxLines));
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code)) return match;
      try { return String.fromCodePoint(code); } catch { return match; }
    }
    return HTML_ENTITIES[body] ?? match;
  });
}

export function htmlToPlainText(html: string): string {
  let out = html.replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '');
  out = out.replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|blockquote)\s*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '')
    .replace(/<li\b[^>]*>/gi, '\n• ');
  out = out.replace(/<[^<>]*>/g, '');
  out = decodeHtmlEntities(out);
  out = out.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trimEnd()).join('\n');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/** Strip markdown decoration, keeping the readable content. Fenced blocks
 * keep their inner text; links and images keep their label text. */
export function stripMarkdown(text: string): string {
  let out = text.replace(/```[^\n]*\n([\s\S]*?)```/g, '$1');
  out = out.replace(/`([^`\n]*)`/g, '$1');
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/^#{1,6}\s+/gm, '');
  out = out.replace(/^(\s*)>\s?/gm, '$1');
  out = out.replace(/^(\s*)([-*+]|\d+[.)])\s+/gm, '$1');
  out = out.replace(/^(\s*)\|/gm, '$1').replace(/\|/g, ' ');
  out = out.replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, '');
  out = out.replace(/^([=_-])\1+[ \t]*$/gm, '');
  out = out.replace(/(\*\*|__)([^*_]+)\1/g, '$2');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2');
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2');
  out = out.replace(/~~([^~\n]+)~~/g, '$1');
  out = out.replace(/<[^<>]*>/g, '');
  out = decodeHtmlEntities(out);
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/** RTF groups whose content is metadata, not document text. Field results
 * keep their text, so fldrslt is not skipped. */
const RTF_SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'headerf', 'footer',
  'footerf', 'footnote', 'pict', 'object', 'fname', 'fontname', 'listtable',
  'listoverridetable', 'revtbl', 'rsidtbl',
]);

/** Minimal RTF reader: paragraphs, tabs, \'xx and \uN escapes, common
 * symbols; formatting control words drop. Unknown input degrades to the
 * raw text with control words stripped, never a throw. */
export function decodeRtf(rtf: string): string {
  let out = '';
  const skipStack: boolean[] = [];
  let skipping = false;
  // \ucN sets how many fallback chars follow each \uN escape (default 1).
  let ucSkip = 1;
  const n = rtf.length;
  let i = 0;
  const effectiveSkip = (): boolean => skipping || skipStack.includes(true);
  while (i < n) {
    const ch = rtf[i];
    if (ch === '{') {
      // Look ahead for a {\destination word to skip metadata groups.
      const rest = rtf.slice(i + 1, i + 24);
      const dest = /^\\[*]?\\?([a-z]+)/i.exec(rest);
      const name = dest?.[1]?.toLowerCase() ?? '';
      const skip = name !== '' && RTF_SKIP_DESTINATIONS.has(name);
      skipStack.push(skip);
      if (skip) skipping = true;
      i += 1;
      continue;
    }
    if (ch === '}') {
      skipStack.pop();
      skipping = skipStack.includes(true);
      i += 1;
      continue;
    }
    if (ch !== '\\') {
      if (!effectiveSkip() && (ch !== '\r' || rtf[i + 1] !== '\n')) {
        // Raw newlines inside RTF source are insignificant; \par carries them.
        if (ch === '\n' || ch === '\r') { i += 1; continue; }
        out += ch;
      }
      i += 1;
      continue;
    }
    // Control symbol or control word.
    const next = rtf[i + 1] ?? '';
    if (next === '\\' || next === '{' || next === '}') {
      if (!effectiveSkip()) out += next;
      i += 2;
      continue;
    }
    if (next === "'") {
      const hex = rtf.slice(i + 2, i + 4);
      if (!effectiveSkip()) {
        const code = parseInt(hex, 16);
        out += Number.isFinite(code) ? String.fromCharCode(code) : '';
      }
      i += 4;
      continue;
    }
    if (next === '*') {
      // Skip the whole destination group: consume to its matching brace.
      let depth = skipStack.length;
      i += 2;
      while (i < n) {
        if (rtf[i] === '{') depth += 1;
        else if (rtf[i] === '}') {
          if (depth <= skipStack.length) break;
          depth -= 1;
        }
        i += 1;
      }
      continue;
    }
    if (next === '~') { if (!effectiveSkip()) out += '\u00a0'; i += 2; continue; }
    if (next === '_' || next === '-') { if (!effectiveSkip()) out += next === '_' ? '\u2011' : '\u00ad'; i += 2; continue; }
    const word = /^\\([a-z]+)(-?\d+)?[ ]?/i.exec(rtf.slice(i, i + 24));
    if (!word) { i += 1; continue; }
    const name = word[1].toLowerCase();
    const arg = word[2] !== undefined ? parseInt(word[2], 10) : null;
    i += word[0].length;
    if (name === 'u' && arg !== null) {
      if (!effectiveSkip()) {
        try { out += String.fromCodePoint(arg < 0 ? arg + 65536 : arg); } catch { /* Skip bad escapes. */ }
      }
      // Consume the ANSI fallback characters.
      for (let k = 0; k < ucSkip && i < n; k++) {
        if (rtf[i] === '\\' && rtf[i + 1] === "'") { i += 4; }
        else if (rtf[i] === '{' || rtf[i] === '}' || rtf[i] === '\\') break;
        else i += 1;
      }
      continue;
    }
    if (name === 'uc' && arg !== null) { ucSkip = Math.max(0, Math.min(8, arg)); continue; }
    if (effectiveSkip()) continue;
    if (name === 'par' || name === 'line') out += '\n';
    else if (name === 'tab') out += '\t';
    else if (name === 'emdash') out += '—';
    else if (name === 'endash') out += '–';
    else if (name === 'lquote' || name === 'rquote') out += "'";
    else if (name === 'ldblquote' || name === 'rdblquote') out += '"';
    else if (name === 'bullet') out += '•';
    // All other control words are formatting and drop.
  }
  out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}
