// Body text, boundary glyphs, and shape+text grouping.
// Owns no text settings. Reads TextLayoutConfig and FontMetrics supplied by
// the caller. Mutates only the Paper items it creates (and opacity on fade/reset).
// Spline preview refresh removes and replaces the caller's preview item.
// Parenting (shadow and active layer) stays with the callbacks passed in.
// Font measurement stays in FontMetrics.
// Tested from tests/text-layout.test.mjs and tests/display-text-layout.test.mjs.
import type { FontMetrics } from '../fontMetrics';
import { SMALL_CAPS_SCALE } from '../text/textOutline';
import type {
  DisplayFlow,
  GlyphOrientation,
  SplineTextPlacement,
  TextMode,
  TextSpec,
} from '../types';

type Item = any;

export interface TextLayoutConfig {
  spec: TextSpec;
  textModeEnabled: boolean;
  textMode: TextMode;
  displayFlow: DisplayFlow;
  glyphOrientation: GlyphOrientation;
  splineTextPlacement: SplineTextPlacement;
  displayOffset: number;
  circumferenceGap: number;
  circumferenceAngleOffset: number;
  fillEnabled: boolean;
  fillColor: string;
  strokeColor: string;
}

interface StraightBoundaryEdge {
  start: number;
  length: number;
}

/** One character after the spec's case treatment: the string to
 * render and the size scale to render it at (small-caps lowercase
 * becomes a capital at SMALL_CAPS_SCALE; 'upper' is applied to
 * whole strings before this is consulted). */
export function displayCharOf(spec: TextSpec, ch: string): { text: string; scale: number } {
  if (spec.caseTransform === 'smallCaps' && ch.toLowerCase() === ch && ch.toUpperCase() !== ch) {
    return { text: ch.toUpperCase(), scale: SMALL_CAPS_SCALE };
  }
  return { text: ch, scale: 1 };
}

/** Whole-string case treatment for whole-line contexts: 'upper'
 * uppercases; 'smallCaps' falls back to 'upper' there (per-glyph
 * layout is what renders true small caps). */
export function caseTransformString(spec: TextSpec, s: string): string {
  return spec.caseTransform === 'upper' || spec.caseTransform === 'smallCaps'
    ? s.toUpperCase()
    : s;
}

export class TextLayout {
  private readonly scope: paper.PaperScope;
  private readonly config: () => TextLayoutConfig;
  private readonly metrics: FontMetrics;
  constructor(scope: paper.PaperScope, config: () => TextLayoutConfig, metrics: FontMetrics) {
    this.scope = scope;
    this.config = config;
    this.metrics = metrics;
  }

  shapePartOf(item: Item): Item {
    if (item && item.data && item.data.shapeTextGroup && Array.isArray(item.children)) {
      const geo = item.children.find((c: Item) => !(c.data && c.data.isShapeText));
      if (geo) return geo;
    }
    return item;
  }

  withShapeText(path: Item, isPreview: boolean, textRotation = 0, center: Item = null): Item {
    const cfg = this.config();
    if (!path || !cfg.textModeEnabled) return path;
    const text = cfg.textMode === 'body' ? this.createBodyTextFor(path) : this.createBoundaryText(path);
    if (!text) return path;
    if (Number.isFinite(textRotation) && textRotation !== 0 && center && text.children) {
      text.rotate(textRotation, center);
    }
    const group: Item = new this.scope.Group();
    group.addChild(path);
    group.addChild(text);
    group.data.shapeTextGroup = true;
    if (isPreview) this.fadeShapeText(text);
    return group;
  }

  /** Text derived from a boundary the caller will discard, such as a bare rect frame. */
  textForBoundary(boundary: Item, isPreview: boolean): Item | null {
    if (!this.config().textModeEnabled) return null;
    const text = this.config().textMode === 'body'
      ? this.createBodyTextFor(boundary)
      : this.createBoundaryText(boundary);
    if (text && isPreview) this.fadeShapeText(text);
    return text;
  }

  fadeShapeText(item: Item): void {
    if (!item) return;
    if (item.className === 'PointText') {
      item.opacity = 0.7;
      return;
    }
    if (Array.isArray(item.children)) item.children.forEach((c: Item) => this.fadeShapeText(c));
  }

  resetStampedText(item: Item): void {
    if (!item) return;
    item.opacity = 1;
    if (Array.isArray(item.children)) item.children.forEach((c: Item) => this.resetStampedText(c));
  }

  refreshSplinePreview(input: {
    isDrawingPath: boolean;
    path: Item | null;
    textModeEnabled: boolean;
    textMode: string;
    getPreview(): Item | null;
    setPreview(item: Item | null): void;
    addPreviewShadow(item: Item): void;
    addToActive(item: Item): void;
  }): void {
    const current = input.getPreview();
    if (current) current.remove();
    input.setPreview(null);
    if (!input.isDrawingPath || !input.path || !input.textModeEnabled) return;
    if (input.path.segments.length < 2) return;
    let text: Item = null;
    try {
      text = input.textMode === 'body'
        ? this.createBodyTextFor(input.path)
        : this.createBoundaryText(input.path);
    } catch {
      text = null;
    }
    if (!text) return;
    this.fadeShapeText(text);
    input.addPreviewShadow(text);
    input.setPreview(text);
    input.addToActive(text);
  }

  clearSplinePreview(input: {
    getPreview(): Item | null;
    setPreview(item: Item | null): void;
  }): void {
    const current = input.getPreview();
    if (current) current.remove();
    input.setPreview(null);
  }

  layoutBodyLines(spec: TextSpec, maxWidth: number, content?: string): string[] {
    return this.layoutBodyParagraphs(spec, maxWidth, content).flat();
  }

  /** Width of a body line under the spec: tracked advance, word
   * spacing after each space, and per-glyph small-caps advances.
   * The single measure shared by wrapping and line rendering so
   * justified lines stretch against the width they were wrapped to. */
  measureBodyText(spec: TextSpec, s: string, size: number): number {
    const tracking = spec.letterSpacing ?? 0;
    const wordSpacing = spec.wordSpacing ?? 0;
    const spaces = (s.match(/ /g) ?? []).length;
    if (spec.caseTransform === 'smallCaps') {
      let w = 0;
      for (const ch of s) {
        const dc = displayCharOf(spec, ch);
        w += this.metrics.advance(dc.text, spec.fontFamily, size * dc.scale, spec.fontWeight);
      }
      return w + tracking * Math.max(0, s.length - 1) + wordSpacing * spaces;
    }
    return this.metrics.advance(caseTransformString(spec, s), spec.fontFamily, size, spec.fontWeight, tracking)
      + wordSpacing * spaces;
  }

  /** Wrap content paragraph by paragraph. Paragraphs split on line
   * breaks; each wraps independently with tracked advance widths, so
   * paragraph spacing in createBodyTextFor lands between real
   * paragraphs instead of flattening them away. */
  layoutBodyParagraphs(spec: TextSpec, maxWidth: number, content?: string): string[][] {
    const size = Math.max(4, spec.fontSize);
    const widthOf = (s: string): number => this.measureBodyText(spec, s, size);
    const paragraphs = (content ?? spec.content).split(/\n+/);
    const wrapped: string[][] = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const trial = cur ? `${cur} ${w}` : w;
        if (cur && widthOf(trial) > maxWidth) {
          lines.push(cur);
          cur = w;
        } else {
          cur = trial;
        }
      }
      if (cur) lines.push(cur);
      if (lines.length === 0) lines.push(' ');
      wrapped.push(lines);
    }
    if (wrapped.length === 0) wrapped.push([' ']);
    return wrapped;
  }

  createBodyTextFor(boundary: Item, content?: string): Item | null {
    const scope = this.scope;
    const spec = this.config().spec;
    const bounds = boundary.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const size = Math.max(4, spec.fontSize);
    const wrapWidth = Math.max(8, bounds.width * 0.75);
    const paragraphs = this.layoutBodyParagraphs(spec, wrapWidth, content);
    const leading = Math.max(0.8, spec.leading || 1.2) * size;
    const paragraphSpacing = Math.max(0, spec.paragraphSpacing ?? 0);
    const shift = spec.baselineShift ?? 0;
    const lineCount = paragraphs.reduce((sum, p) => sum + p.length, 0);
    const totalHeight = (lineCount - 1) * leading + (paragraphs.length - 1) * paragraphSpacing;
    const group: Item = new scope.Group();
    let y = bounds.center.y - totalHeight / 2;
    paragraphs.forEach((lines, pi) => {
      lines.forEach((line, li) => {
        const lastOfParagraph = li === lines.length - 1;
        const perGlyph = (spec.letterSpacing ?? 0) !== 0
          || (spec.wordSpacing ?? 0) !== 0
          || spec.caseTransform === 'smallCaps'
          || (spec.justification === 'justify' && !lastOfParagraph);
        if (perGlyph) {
          this.addPerGlyphBodyLine(group, line, bounds.center.x, y, spec, size, wrapWidth, lastOfParagraph);
        } else {
          const justify = spec.justification === 'justify';
          const pt: Item = new scope.PointText(new scope.Point(
            justify ? bounds.center.x - wrapWidth / 2 : bounds.center.x,
            y - shift,
          ));
          pt.content = caseTransformString(spec, line);
          this.styleTextItem(pt, spec);
          if (justify) pt.justification = 'left';
          pt.data.textKind = 'body';
          group.addChild(pt);
          const w = this.metrics.advance(caseTransformString(spec, line), spec.fontFamily, size, spec.fontWeight);
          const x0 = justify || spec.justification === 'left'
            ? pt.point.x
            : spec.justification === 'right' ? bounds.center.x - w : bounds.center.x - w / 2;
          this.addBodyDecorations(group, x0, x0 + w, y - shift, spec, size);
        }
        y += leading;
      });
      if (pi < paragraphs.length - 1) y += paragraphSpacing;
    });
    if (boundary.closed !== false) {
      const mask: Item = boundary.clone();
      mask.clipMask = true;
      group.addChild(mask);
    }
    group.data.isShapeText = true;
    group.data.textKind = 'body';
    return group;
  }

  /** One body line as per-glyph PointText items: Paper has no
   * letter-spacing, so tracked lines place each glyph at its tracked
   * advance. The same path renders word spacing, small caps, and
   * justification: a justified line (never a paragraph's last line)
   * starts at the wrap box's left edge and distributes the slack
   * evenly across its word spaces so it spans the full measure.
   * The anchor mirrors the whole-line path — the line's Paper point
   * is bounds-center x, aligned per justification. */
  private addPerGlyphBodyLine(
    group: Item, line: string, anchorX: number, y: number, spec: TextSpec, size: number,
    wrapWidth: number, lastOfParagraph: boolean,
  ): void {
    const scope = this.scope;
    const tracking = spec.letterSpacing ?? 0;
    const wordSpacing = spec.wordSpacing ?? 0;
    const shift = spec.baselineShift ?? 0;
    const natural = this.measureBodyText(spec, line, size);
    const justify = spec.justification === 'justify';
    const gaps = (line.match(/ /g) ?? []).length;
    const stretch = justify && !lastOfParagraph && gaps > 0
      ? Math.max(0, wrapWidth - natural) / gaps
      : 0;
    let x = justify
      ? anchorX - wrapWidth / 2
      : spec.justification === 'center'
        ? anchorX - natural / 2
        : spec.justification === 'right' ? anchorX - natural : anchorX;
    const startX = x;
    for (const ch of line) {
      const dc = displayCharOf(spec, ch);
      const w = this.metrics.advance(dc.text, spec.fontFamily, size * dc.scale, spec.fontWeight);
      if (ch !== ' ') {
        const pt: Item = new scope.PointText(new scope.Point(x, y - shift));
        pt.content = dc.text;
        this.styleTextItem(pt, spec);
        pt.fontSize = Math.max(4, size * dc.scale);
        pt.justification = 'left';
        pt.data.textKind = 'body';
        group.addChild(pt);
      }
      x += w + tracking + (ch === ' ' ? wordSpacing + stretch : 0);
    }
    const endX = stretch > 0 ? startX + wrapWidth : startX + natural;
    this.addBodyDecorations(group, startX, endX, y - shift, spec, size);
  }

  /** Underline / strikethrough for one body line: plain segments in
   * the text group, spanning the line's laid-out width at the
   * shifted baseline. Paper has no text decoration, so the strokes
   * are drawn geometry (data-tagged so tests and filters find them). */
  private addBodyDecorations(
    group: Item, x0: number, x1: number, baselineY: number, spec: TextSpec, size: number,
  ): void {
    if (!(x1 > x0)) return;
    if (spec.underline) {
      this.addDecorationSegment(group, x0, baselineY + size * 0.22, x1, baselineY + size * 0.22, size, 'body', 'underline');
    }
    if (spec.strikethrough) {
      this.addDecorationSegment(group, x0, baselineY - size * 0.3, x1, baselineY - size * 0.3, size, 'body', 'strikethrough');
    }
  }

  private addDecorationSegment(
    group: Item, x0: number, y0: number, x1: number, y1: number,
    size: number, kind: 'body' | 'display',
    decoration: 'underline' | 'strikethrough',
  ): void {
    const cfg = this.config();
    const seg: Item = new this.scope.Path({
      segments: [new this.scope.Point(x0, y0), new this.scope.Point(x1, y1)],
      insert: false,
    });
    seg.strokeColor = cfg.fillEnabled ? cfg.fillColor : cfg.strokeColor;
    seg.fillColor = null;
    seg.strokeWidth = Math.max(0.75, size * 0.055);
    seg.data.isShapeText = true;
    seg.data.textKind = kind;
    seg.data.textDecoration = decoration;
    group.addChild(seg);
  }

  /** Per-glyph display decorations: a segment under (or through)
   * one glyph, following its rotation. `at` is the glyph's final
   * anchor, `angleDeg` its rotation, `w` its advance. */
  private addGlyphDecoration(
    group: Item, at: Item, angleDeg: number, w: number, size: number,
    decoration: 'underline' | 'strikethrough',
  ): void {
    const rad = (angleDeg * Math.PI) / 180;
    const read = new this.scope.Point(Math.cos(rad), Math.sin(rad));
    const down = new this.scope.Point(-Math.sin(rad), Math.cos(rad));
    const lift = decoration === 'underline' ? size * 0.22 : -size * 0.3;
    const center = at.add(down.multiply(lift));
    this.addDecorationSegment(
      group,
      center.x - (read.x * w) / 2, center.y - (read.y * w) / 2,
      center.x + (read.x * w) / 2, center.y + (read.y * w) / 2,
      size, 'display', decoration,
    );
  }

  createBoundaryText(boundary: Item, content?: string, line2?: string): Item | null {
    const scope = this.scope;
    const cfg = this.config();
    const spec = cfg.spec;
    const size = Math.max(4, spec.fontSize);
    const length = boundary.length;
    if (!(length > 0)) return null;
    const rawLines = [content ?? spec.content, line2 ?? spec.line2].filter((s) => s && s.length > 0);
    // 'upper' transforms the laid-out string; 'smallCaps' is handled
    // per glyph below (displayCharOf). Display justification keeps
    // its existing semantics: 'justify' behaves as left on edges and
    // rings (alignOffset falls through to 0, ring start unchanged).
    const lines = spec.caseTransform === 'upper' ? rawLines.map((s) => s.toUpperCase()) : rawLines;
    if (lines.length === 0) return null;
    const offset = Math.max(0, cfg.displayOffset);
    const start = ((((-cfg.circumferenceAngleOffset % 360) + 360) % 360) / 360) * length;
    let interiorSign = 0;
    if (boundary.closed !== false) {
      const p0 = boundary.getPointAt(0);
      let n0 = boundary.getNormalAt(0);
      if (p0 && n0 && n0.length > 0) {
        n0 = n0.normalize();
        const probeLen = Math.max(1, offset);
        const plusIn = containsPoint(boundary, p0.add(n0.multiply(probeLen)));
        const minusIn = containsPoint(boundary, p0.subtract(n0.multiply(probeLen)));
        if (plusIn !== minusIn) interiorSign = plusIn ? 1 : -1;
        else {
          const b = boundary.bounds;
          const toC = b ? b.center.subtract(p0) : null;
          interiorSign = toC && toC.dot(n0) >= 0 ? 1 : -1;
        }
      }
    }
    const straightEdges = this.straightBoundaryEdges(boundary);
    if (straightEdges.length > 0) {
      const text = this.createEdgeDisplayText(boundary, lines, straightEdges, start, interiorSign, offset, spec);
      if (text) return text;
    }
    const group: Item = new scope.Group();
    lines.forEach((text, li) => {
      const side = cfg.displayFlow === 'interior' ? interiorSign : -interiorSign;
      const ring = offset * (li + 1);
      let d = start;
      let lastTan: number | null = null;
      for (const ch of text) {
        const dc = displayCharOf(spec, ch);
        const w = ch === ' ' ? size * 0.4 : this.metrics.advance(dc.text, spec.fontFamily, size * dc.scale, spec.fontWeight);
        const step = w + cfg.circumferenceGap + (spec.letterSpacing ?? 0) + (ch === ' ' ? (spec.wordSpacing ?? 0) : 0);
        if (d + step > start + length) break;
        if (ch === ' ') { d += step; continue; }
        const mid = d + w / 2;
        const pos = boundary.getPointAt(mid);
        if (!pos) break;
        const tan = boundary.getTangentAt(mid);
        if (tan && tan.length > 0) lastTan = tan.angle;
        if (lastTan === null) { d += step; continue; }
        let nor = boundary.getNormalAt(mid);
        if (!nor || nor.length === 0) {
          const ra = ((lastTan + 90) * Math.PI) / 180;
          nor = new scope.Point(Math.cos(ra), Math.sin(ra));
        } else nor = nor.normalize();
        const pt: Item = new scope.PointText(new scope.Point(0, 0));
        pt.content = dc.text;
        this.styleTextItem(pt, spec);
        pt.fontSize = Math.max(4, size * dc.scale);
        pt.justification = 'center';
        const facing = cfg.glyphOrientation === 'outward' ? -interiorSign : interiorSign;
        const angle = facing !== 0 ? nor.multiply(facing).angle + 90 : lastTan;
        // Baseline shift moves the glyph along its own down axis.
        const rad = (angle * Math.PI) / 180;
        const down = new scope.Point(-Math.sin(rad), Math.cos(rad));
        const at = pos.add(nor.multiply(side * ring)).add(down.multiply(-(spec.baselineShift ?? 0)));
        pt.position = at;
        pt.rotate(angle, at);
        if (boundary.closed === false) this.anchorSplineGlyph(pt, at, spec, size);
        pt.data.textKind = 'display';
        group.addChild(pt);
        if (spec.underline) this.addGlyphDecoration(group, pt.position, angle, w, size, 'underline');
        if (spec.strikethrough) this.addGlyphDecoration(group, pt.position, angle, w, size, 'strikethrough');
        d += step;
      }
    });
    if (group.children.length === 0) {
      group.remove();
      return null;
    }
    group.data.isShapeText = true;
    group.data.textKind = 'display';
    return group;
  }

  private styleTextItem(item: Item, spec: TextSpec): void {
    if (!item) return;
    const cfg = this.config();
    item.fontFamily = spec.fontFamily;
    item.fontSize = Math.max(4, spec.fontSize);
    item.fontWeight = spec.fontWeight;
    item.fillColor = cfg.fillEnabled ? cfg.fillColor : cfg.strokeColor;
    item.strokeColor = null;
    // 'justify' is a layout-level value (TextLayout distributes the
    // slack); Paper items themselves never carry it.
    item.justification = spec.justification === 'justify' ? 'left' : spec.justification;
    item.leading = Math.max(0.8, spec.leading || 1.2) * Math.max(4, spec.fontSize);
    item.data.isShapeText = true;
  }

  private straightBoundaryEdges(boundary: Item): StraightBoundaryEdge[] {
    if (boundary.closed === false || !Array.isArray(boundary.segments)) return [];
    const segments = boundary.segments;
    const curves = boundary.curves;
    if (segments.length < 3 || !Array.isArray(curves) || curves.length !== segments.length) return [];
    if (segments.some((segment: Item) =>
      (segment.handleIn?.length ?? 0) > 1e-6 || (segment.handleOut?.length ?? 0) > 1e-6,
    )) return [];
    let start = 0;
    const edges: StraightBoundaryEdge[] = [];
    for (const curve of curves) {
      const length = curve.length;
      if (!(length > 1e-6)) return [];
      edges.push({ start, length });
      start += length;
    }
    return edges;
  }

  private createEdgeDisplayText(
    boundary: Item,
    lines: string[],
    edges: StraightBoundaryEdge[],
    start: number,
    interiorSign: number,
    offset: number,
    spec: TextSpec,
  ): Item {
    const size = Math.max(4, spec.fontSize);
    const length = boundary.length;
    const startAt = ((start % length) + length) % length;
    let firstEdge = edges.findIndex((edge) => startAt >= edge.start && startAt < edge.start + edge.length);
    if (firstEdge < 0) firstEdge = 0;
    const group: Item = new this.scope.Group();
    const cfg = this.config();
    for (let li = 0; li < lines.length; li++) {
      const words = lines[li].trim().split(/\s+/).filter(Boolean);
      let wordIndex = 0;
      const side = cfg.displayFlow === 'interior' ? interiorSign : -interiorSign;
      const ring = offset * (li + 1);
      for (let edgeOffset = 0; edgeOffset < edges.length && wordIndex < words.length; edgeOffset++) {
        const edge = edges[(firstEdge + edgeOffset) % edges.length];
        let text = '';
        while (wordIndex < words.length) {
          const candidate = text ? `${text} ${words[wordIndex]}` : words[wordIndex];
          if (this.displayTextAdvance(candidate, spec, size) > edge.length) break;
          text = candidate;
          wordIndex++;
        }
        if (!text) continue;
        const advance = this.displayTextAdvance(text, spec, size);
        const alignOffset = spec.justification === 'right'
          ? edge.length - advance
          : spec.justification === 'center' ? (edge.length - advance) / 2 : 0;
        this.addDisplayGlyphs(group, boundary, text, edge.start + alignOffset, side, ring, interiorSign, spec, size);
      }
    }
    group.data.isShapeText = true;
    group.data.textKind = 'display';
    return group;
  }

  private displayTextAdvance(text: string, spec: TextSpec, size: number): number {
    let advance = 0;
    for (const ch of text) advance += this.displayGlyphStep(ch, spec, size);
    return advance;
  }

  private displayGlyphStep(ch: string, spec: TextSpec, size: number): number {
    const dc = displayCharOf(spec, ch);
    const width = ch === ' ' ? size * 0.4 : this.metrics.advance(dc.text, spec.fontFamily, size * dc.scale, spec.fontWeight);
    return width + this.config().circumferenceGap + (spec.letterSpacing ?? 0)
      + (ch === ' ' ? (spec.wordSpacing ?? 0) : 0);
  }

  private addDisplayGlyphs(
    group: Item, boundary: Item, text: string, start: number, side: number, ring: number,
    interiorSign: number, spec: TextSpec, size: number,
  ): void {
    const scope = this.scope;
    let d = start;
    let lastTan: number | null = null;
    for (const ch of text) {
      const step = this.displayGlyphStep(ch, spec, size);
      if (ch === ' ') { d += step; continue; }
      const dc = displayCharOf(spec, ch);
      const glyphWidth = this.metrics.advance(dc.text, spec.fontFamily, size * dc.scale, spec.fontWeight);
      const mid = d + (step - this.config().circumferenceGap) / 2;
      const pos = boundary.getPointAt(mid);
      if (!pos) break;
      const tan = boundary.getTangentAt(mid);
      if (tan && tan.length > 0) lastTan = tan.angle;
      if (lastTan === null) { d += step; continue; }
      let nor = boundary.getNormalAt(mid);
      if (!nor || nor.length === 0) {
        const ra = ((lastTan + 90) * Math.PI) / 180;
        nor = new scope.Point(Math.cos(ra), Math.sin(ra));
      } else nor = nor.normalize();
      const pt: Item = new scope.PointText(new scope.Point(0, 0));
      pt.content = dc.text;
      this.styleTextItem(pt, spec);
      pt.fontSize = Math.max(4, size * dc.scale);
      pt.justification = 'center';
      const facing = this.config().glyphOrientation === 'outward' ? -interiorSign : interiorSign;
      const angle = facing !== 0 ? nor.multiply(facing).angle + 90 : lastTan;
      const rad = (angle * Math.PI) / 180;
      const down = new scope.Point(-Math.sin(rad), Math.cos(rad));
      const at = pos.add(nor.multiply(side * ring)).add(down.multiply(-(spec.baselineShift ?? 0)));
      pt.position = at;
      pt.rotate(angle, at);
      pt.data.textKind = 'display';
      group.addChild(pt);
      if (spec.underline) this.addGlyphDecoration(group, pt.position, angle, glyphWidth, size, 'underline');
      if (spec.strikethrough) this.addGlyphDecoration(group, pt.position, angle, glyphWidth, size, 'strikethrough');
      d += step;
    }
  }

  private anchorSplineGlyph(pt: Item, at: Item, spec: TextSpec, size: number): void {
    try {
      const center = pt.bounds ? pt.bounds.center : null;
      const anchor = pt.point;
      if (!center || !anchor) return;
      const up = center.subtract(anchor);
      const dcb = up.length;
      if (!(dcb > 0)) return;
      const dir = up.normalize();
      const m = this.metrics.vertical(spec.fontFamily, size, spec.fontWeight);
      const placement = this.config().splineTextPlacement;
      const extra = placement === 'above' ? m.desc : placement === 'below' ? -m.asc : 0;
      pt.position = at.add(dir.multiply(dcb + extra));
    } catch {
      // Keep the centered glyph when bounds are unavailable.
    }
  }
}

function containsPoint(boundary: Item, pt: Item): boolean {
  try { return !!boundary.contains(pt); } catch { return false; }
}
