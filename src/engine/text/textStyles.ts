// Text styles (Tier Four, Slice 19): named presets capturing a full
// TextSpec. Styles are app-level state — they live in engine
// settings, not in documents, because a style is a tool the user
// carries between documents, like their added fonts. A style stores
// the whole spec it was saved from, but applying one restyles text:
// content and line2 are never applied (they are the document's
// words, not the style's).
import type { TextSpec } from '../types';

export interface TextStyleEntry {
  name: string;
  spec: TextSpec;
}

const BASE: TextSpec = {
  content: '',
  line2: '',
  fontFamily: 'Helvetica',
  fontSize: 16,
  fontWeight: 'normal',
  italic: false,
  underline: false,
  strikethrough: false,
  caseTransform: 'none',
  baselineShift: 0,
  wordSpacing: 0,
  justification: 'left',
  leading: 1.2,
  letterSpacing: 0,
  paragraphSpacing: 0,
};

/** Shipped defaults; always present, never deletable. */
export const BUILT_IN_TEXT_STYLES: TextStyleEntry[] = [
  { name: 'Headline', spec: { ...BASE, fontSize: 48, fontWeight: 'bold', justification: 'center', leading: 1.1 } },
  { name: 'Body', spec: { ...BASE, fontSize: 16, justification: 'left', paragraphSpacing: 8 } },
  { name: 'Caption', spec: { ...BASE, fontSize: 11, italic: true, justification: 'center' } },
];

/** The formatting fields a style applies (everything but the words). */
export function stylePatch(spec: TextSpec): Partial<TextSpec> {
  const { content: _content, line2: _line2, ...rest } = spec;
  return rest;
}

function num(value: unknown, fallback: number, lo: number, hi: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(hi, Math.max(lo, value))
    : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Defensively rebuild a spec from stored JSON over a live base, so
 * a settings blob from another version can never poison the spec. */
export function sanitizeTextSpec(raw: unknown, base: TextSpec): TextSpec {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    content: typeof r['content'] === 'string' ? r['content'] : base.content,
    line2: typeof r['line2'] === 'string' ? r['line2'] : base.line2,
    fontFamily: str(r['fontFamily'], base.fontFamily),
    fontSize: num(r['fontSize'], base.fontSize, 4, 400),
    fontWeight: str(r['fontWeight'], base.fontWeight),
    italic: typeof r['italic'] === 'boolean' ? r['italic'] : base.italic,
    underline: typeof r['underline'] === 'boolean' ? r['underline'] : base.underline,
    strikethrough: typeof r['strikethrough'] === 'boolean' ? r['strikethrough'] : base.strikethrough,
    caseTransform: r['caseTransform'] === 'upper' || r['caseTransform'] === 'smallCaps' || r['caseTransform'] === 'none'
      ? r['caseTransform']
      : base.caseTransform,
    baselineShift: num(r['baselineShift'], base.baselineShift, -20, 40),
    wordSpacing: num(r['wordSpacing'], base.wordSpacing, 0, 20),
    justification: r['justification'] === 'left' || r['justification'] === 'center'
      || r['justification'] === 'right' || r['justification'] === 'justify'
      ? r['justification']
      : base.justification,
    leading: num(r['leading'], base.leading, 0.8, 3),
    letterSpacing: num(r['letterSpacing'], base.letterSpacing, -20, 100),
    paragraphSpacing: num(r['paragraphSpacing'], base.paragraphSpacing, 0, 500),
  };
}

export function sanitizeTextStyle(raw: unknown, base: TextSpec): TextStyleEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? r['name'].trim() : '';
  if (!name) return null;
  return { name, spec: sanitizeTextSpec(r['spec'], base) };
}
