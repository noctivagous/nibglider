// Swatch palettes (Slice 4): a default palette, a user-kept
// document palette, and recent colours — the latter two persisted
// in localStorage (TASKS.txt §COLOR PALETTE). Pure storage logic
// over an injectable key/value store so tests run headless.
// Tested from tests/swatches.test.mjs.

export const DOCUMENT_PALETTE_KEY = 'nibglider.swatches.document';
export const RECENT_COLORS_KEY = 'nibglider.swatches.recents';
export const MAX_RECENT_COLORS = 12;
export const MAX_DOCUMENT_SWATCHES = 48;

/** A considered default palette: neutrals, primaries, and a spread
 * of hues at two depths, plus skin/paper tones for poster work. */
export const DEFAULT_PALETTE: readonly string[] = [
  '#000000', '#3c3c3c', '#787878', '#b4b4b4', '#e1e1e1', '#ffffff',
  '#7b2d26', '#c0392b', '#e74c3c', '#e67e22', '#f39c12', '#f1c40f',
  '#7d6608', '#1e8449', '#27ae60', '#82e0aa', '#117a65', '#48c9b0',
  '#1a5276', '#2471a3', '#2e86c1', '#85c1e9', '#6c3483', '#af7ac5',
  '#f5cba7', '#edbb99', '#d98880', '#a93226', '#641e16', '#154360',
];

export interface SwatchStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStore(): SwatchStore | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Normalize a colour to lowercase #rrggbb, or null when unparsable. */
export function normalizeSwatchColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/.exec(text);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  return null;
}

function loadList(key: string, store: SwatchStore | null): string[] {
  if (!store) return [];
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const entry of parsed) {
      const color = normalizeSwatchColor(entry);
      if (color && !out.includes(color)) out.push(color);
    }
    return out;
  } catch {
    return [];
  }
}

function saveList(key: string, colors: string[], store: SwatchStore | null): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(colors));
  } catch { /* Storage full/blocked: palettes stay in memory. */ }
}

export function loadDocumentPalette(store: SwatchStore | null = browserStore()): string[] {
  return loadList(DOCUMENT_PALETTE_KEY, store);
}

export function saveDocumentPalette(colors: string[], store: SwatchStore | null = browserStore()): string[] {
  const next = [...new Set(colors.map(normalizeSwatchColor).filter((c): c is string => c !== null))]
    .slice(0, MAX_DOCUMENT_SWATCHES);
  saveList(DOCUMENT_PALETTE_KEY, next, store);
  return next;
}

export function addDocumentSwatch(
  colors: readonly string[],
  color: string,
  store: SwatchStore | null = browserStore(),
): string[] {
  const normalized = normalizeSwatchColor(color);
  if (!normalized || colors.includes(normalized)) return [...colors];
  return saveDocumentPalette([normalized, ...colors], store);
}

export function removeDocumentSwatch(
  colors: readonly string[],
  color: string,
  store: SwatchStore | null = browserStore(),
): string[] {
  const normalized = normalizeSwatchColor(color);
  if (!normalized) return [...colors];
  return saveDocumentPalette(colors.filter((c) => c !== normalized), store);
}

/** Palette the compact swatch well is showing: kept colours, then
 *  recents, then the built-in palette. */
export function swatchPreviewSource(documentPalette: readonly string[]): {
  label: string;
  title: string;
  colors: readonly string[];
} {
  if (documentPalette.length > 0) {
    return { label: 'Kept', title: 'Kept colours', colors: documentPalette };
  }
  const recents = loadRecentColors();
  if (recents.length > 0) {
    return { label: 'Recent', title: 'Recent colours', colors: recents };
  }
  return { label: 'Default', title: 'Default palette', colors: DEFAULT_PALETTE };
}

export function loadRecentColors(store: SwatchStore | null = browserStore()): string[] {
  return loadList(RECENT_COLORS_KEY, store).slice(0, MAX_RECENT_COLORS);
}

/** Record a colour as most-recent; returns the new recents list. */
export function pushRecentColor(
  recents: readonly string[],
  color: string,
  store: SwatchStore | null = browserStore(),
): string[] {
  const normalized = normalizeSwatchColor(color);
  if (!normalized) return [...recents];
  const next = [normalized, ...recents.filter((c) => c !== normalized)].slice(0, MAX_RECENT_COLORS);
  saveList(RECENT_COLORS_KEY, next, store);
  return next;
}
