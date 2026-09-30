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
  if (weight === 'bold' && entry.bold) return entry.bold;
  return entry.normal;
}

export class FontMetrics {
  private fonts = new Map<string, Font>();
  private ctx: CanvasRenderingContext2D | null | undefined;

  private key(family: string, weight: string): string {
    return `${family}::${weight === 'bold' ? 'bold' : 'normal'}`;
  }

  register(family: string, weight: string, font: Font): void {
    this.fonts.set(this.key(family, weight), font);
  }

  has(family: string, weight: string): boolean {
    return this.fonts.has(this.key(family, weight));
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

  /** Advance width of text in points. Italic is ignored (sub-pixel). */
  advance(
    text: string,
    family: string,
    size: number,
    weight: string,
  ): number {
    const s = text || ' ';
    const px = Math.max(4, size);
    const font = this.fonts.get(this.key(family, weight));
    if (font) {
      try {
        const w = font.getAdvanceWidth(s, px, { kerning: true });
        if (w > 0) return w;
      } catch {
        // Fall through to canvas.
      }
    }
    const ctx = this.canvas();
    if (ctx) {
      try {
        ctx.font = `${weight === 'bold' ? 'bold' : 'normal'} ${px}px "${family}"`;
        const w = ctx.measureText(s).width;
        if (w > 0) return w;
      } catch {
        // Fall through to the estimate.
      }
    }
    return s.length * px * 0.55;
  }
}
