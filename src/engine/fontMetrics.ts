import * as opentype from 'opentype.js';

type Font = opentype.Font;

// Advance-width measurement with a fallback chain: parsed font bytes
// (exact, kerned, works headless and before webfonts load) → canvas
// measureText (any loaded family, including system fonts whose binaries
// are unobtainable) → em estimate. Only families with a vendored
// TTF/OTF/WOFF file below get the parsed-font tier; opentype.js cannot
// read WOFF2, so these must stay TrueType/OpenType files.
const MEASUREMENT_FILES: Record<string, { normal: string; bold: string | null }> = {
  'Barlow Condensed': {
    normal: 'fonts/BarlowCondensed-Regular.ttf',
    bold: 'fonts/BarlowCondensed-Bold.ttf',
  },
  'Chakra Petch': {
    normal: 'fonts/ChakraPetch-Regular.ttf',
    bold: 'fonts/ChakraPetch-Bold.ttf',
  },
  'Exo 2': { normal: 'fonts/Exo2-wght.ttf', bold: null },
  'JetBrains Mono': { normal: 'fonts/JetBrainsMono-wght.ttf', bold: null },
  Orbitron: { normal: 'fonts/Orbitron-wght.ttf', bold: null },
};

export function measurementFileFor(
  family: string,
  weight: string,
): string | null {
  const entry = MEASUREMENT_FILES[family];
  if (!entry) return null;
  if (weightBucket(weight) === 'bold' && entry.bold) return entry.bold;
  return entry.normal;
}

/** Numeric CSS weight a fontWeight string names ('normal' 400,
 * 'bold' 700, numeric strings pass through). */
export function numericWeight(weight: string): number {
  if (weight === 'bold') return 700;
  if (weight === 'normal') return 400;
  const parsed = Number.parseInt(weight, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(1000, parsed)) : 400;
}

/** Measurement has two parsed instances per family at most (the
 * vendored Regular and Bold files), so weights bucket at 600. */
export function weightBucket(weight: string): 'normal' | 'bold' {
  return numericWeight(weight) >= 600 ? 'bold' : 'normal';
}

export interface WeightOption { value: string; label: string; numeric: number }

const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black',
};

function weightOption(numeric: number): WeightOption {
  return {
    value: String(numeric),
    label: WEIGHT_LABELS[numeric] ?? `Weight ${numeric}`,
    numeric,
  };
}

/** Families vendored as variable fonts: the full 100–900 range. */
const VARIABLE_FAMILIES = new Set(['Exo 2', 'JetBrains Mono', 'Orbitron']);
/** Families vendored as static Regular + Bold files. */
const STATIC_VENDORED = new Set(['Barlow Condensed', 'Chakra Petch']);

/**
 * The weights a family actually ships, for the Text panel's weight
 * menu. Variable fonts expose their fvar wght range when parsed;
 * before load (and for the vendored set) the known ranges apply.
 * Unknown/system families get Regular + Bold, which the browser can
 * always render or synthesize.
 */
export function weightsForFamily(
  family: string,
  parsed?: Font | null,
): WeightOption[] {
  const fvar = (parsed?.tables as { fvar?: { axes?: Array<{ tag: string; minValue: number; maxValue: number }> } } | undefined)?.fvar;
  const wght = fvar?.axes?.find((axis) => axis.tag === 'wght');
  if (wght) {
    return [100, 200, 300, 400, 500, 600, 700, 800, 900]
      .filter((step) => step >= wght.minValue && step <= wght.maxValue)
      .map(weightOption);
  }
  if (parsed || STATIC_VENDORED.has(family)) return [weightOption(400), weightOption(700)];
  if (VARIABLE_FAMILIES.has(family)) {
    return [100, 200, 300, 400, 500, 600, 700, 800, 900].map(weightOption);
  }
  return [weightOption(400), weightOption(700)];
}

export interface UserFontRecord {
  family: string;
  source: 'file' | 'url';
  url?: string;
  /** False for file-loaded fonts remembered from settings after a
   * reload: the family is listed but its bytes are session-only. */
  loaded: boolean;
}

export class FontMetrics {
  private fonts = new Map<string, Font>();
  private ctx: CanvasRenderingContext2D | null | undefined;
  private userFonts = new Map<string, UserFontRecord>();

  private key(family: string, weight: string): string {
    return `${family}::${weightBucket(weight)}`;
  }

  register(family: string, weight: string, font: Font): void {
    this.fonts.set(this.key(family, weight), font);
  }

  has(family: string, weight: string): boolean {
    return this.fonts.has(this.key(family, weight));
  }

  /** The parsed font for a family/weight, or null when measurement
   * would fall back to canvas/estimate. Outline conversion needs the
   * real glyphs, so it consumes this directly. */
  fontFor(family: string, weight: string): Font | null {
    return this.fonts.get(this.key(family, weight)) ?? null;
  }

  /** Register a user-loaded font (FontFace registration for canvas
   * rendering is the caller's job; this is the metrics/outline side). */
  registerUserFont(family: string, font: Font, source: 'file' | 'url', url?: string): void {
    this.register(family, 'normal', font);
    this.userFonts.set(family, { family, source, url, loaded: true });
  }

  /** Remember a user font's family without its bytes (a file font
   * restored from settings in a later session). */
  registerKnownUserFont(family: string, source: 'file' | 'url', url?: string): void {
    if (!this.userFonts.has(family)) {
      this.userFonts.set(family, { family, source, url, loaded: false });
    }
  }

  userFontList(): UserFontRecord[] {
    return [...this.userFonts.values()].map((record) => ({ ...record }));
  }

  /** Fetch + parse every vendored measurement font. Never throws. */
  async preload(): Promise<void> {
    const jobs: Array<Promise<void>> = [];
    for (const family of Object.keys(MEASUREMENT_FILES)) {
      for (const weight of ['normal', 'bold']) {
        const url = measurementFileFor(family, weight);
        if (!url || this.has(family, weight)) continue;
        jobs.push(this.loadOne(family, weight, url));
      }
    }
    await Promise.all(jobs);
  }

  // opentype.js v2 leaves fetching to user code: fetch bytes, then parse.
  private async loadOne(
    family: string,
    weight: string,
    url: string,
  ): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      this.register(family, weight, opentype.parse(await res.arrayBuffer()));
    } catch {
      // Measurement falls back to canvas/estimate.
    }
  }

  private canvas(): CanvasRenderingContext2D | null {
    if (this.ctx !== undefined) return this.ctx;
    this.ctx = null;
    try {
      if (typeof document !== 'undefined') {
        this.ctx =
          document.createElement('canvas').getContext('2d');
      }
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Ascent/descent in points as positive magnitudes for placement math. */
  vertical(
    family: string,
    size: number,
    weight: string,
  ): { asc: number; desc: number } {
    const px = Math.max(4, size);
    const font = this.fonts.get(this.key(family, weight));
    if (font) {
      try {
        const upm = font.unitsPerEm;
        if (upm > 0) {
          const asc = (font.ascender / upm) * px;
          const desc = Math.abs(font.descender / upm) * px;
          if (asc > 0 && desc >= 0) return { asc, desc };
        }
      } catch {
        // Fall through to the estimate.
      }
    }
    return { asc: px * 0.8, desc: px * 0.2 };
  }

  /** Advance width of text in points. Italic is ignored (sub-pixel).
   * Tracking adds `letterSpacing` points between glyphs (not after
   * the last), matching the per-glyph layout in TextLayout. */
  advance(
    text: string,
    family: string,
    size: number,
    weight: string,
    letterSpacing = 0,
  ): number {
    const s = text || ' ';
    const px = Math.max(4, size);
    const tracking = Number.isFinite(letterSpacing) ? letterSpacing : 0;
    const tracked = (w: number): number => w + tracking * Math.max(0, s.length - 1);
    const font = this.fonts.get(this.key(family, weight));
    if (font) {
      try {
        const w = font.getAdvanceWidth(s, px, { kerning: true });
        if (w > 0) return tracked(w);
      } catch {
        // Fall through to canvas.
      }
    }
    const ctx = this.canvas();
    if (ctx) {
      try {
        ctx.font = `${weightBucket(weight) === 'bold' ? 'bold' : 'normal'} ${px}px "${family}"`;
        const w = ctx.measureText(s).width;
        if (w > 0) return tracked(w);
      } catch {
        // Fall through to the estimate.
      }
    }
    return tracked(s.length * px * 0.55);
  }
}
