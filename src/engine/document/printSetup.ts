// Page Setup: the printer-side description of the document,
// deliberately separate from Document Size (the canvas sheet).
// Page Setup says what paper the printer holds, how the document
// page sits on it (margins), and whether crop marks print. The
// "Preview Printer Page Setup" toggle shows margins and crop marks
// on canvas without printing. Pure model — no Paper, no browser.
// Tested from tests/pages-guides-print.test.mjs.

export interface PrintMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PrintSetup {
  /** Printer paper size in points. */
  paperWidthPt: number;
  paperHeightPt: number;
  orientation: 'portrait' | 'landscape';
  margins: PrintMargins;
  /** Draw crop marks at the document page corners when printing. */
  cropMarks: boolean;
  /** On-canvas preview of margins + crop marks (not printed itself). */
  preview: boolean;
}

export interface PaperPreset {
  id: string;
  label: string;
  /** Portrait dimensions in points. */
  widthPt: number;
  heightPt: number;
}

export const PAPER_PRESETS: PaperPreset[] = [
  { id: 'letter', label: 'US Letter', widthPt: 612, heightPt: 792 },
  { id: 'legal', label: 'US Legal', widthPt: 612, heightPt: 1008 },
  { id: 'tabloid', label: 'Tabloid', widthPt: 792, heightPt: 1224 },
  { id: 'a4', label: 'A4', widthPt: 595.28, heightPt: 841.89 },
  { id: 'a3', label: 'A3', widthPt: 841.89, heightPt: 1190.55 },
  { id: 'a5', label: 'A5', widthPt: 419.53, heightPt: 595.28 },
];

export function defaultPrintSetup(): PrintSetup {
  return {
    paperWidthPt: 612,
    paperHeightPt: 792,
    orientation: 'portrait',
    margins: { top: 36, right: 36, bottom: 36, left: 36 },
    cropMarks: false,
    preview: false,
  };
}

/** Apply a paper preset, keeping the current orientation. Landscape
 * swaps the preset's portrait dimensions. */
export function printSetupForPaper(setup: PrintSetup, preset: PaperPreset): PrintSetup {
  const swap = setup.orientation === 'landscape';
  return {
    ...setup,
    paperWidthPt: swap ? preset.heightPt : preset.widthPt,
    paperHeightPt: swap ? preset.widthPt : preset.heightPt,
  };
}

export function printSetupWithOrientation(setup: PrintSetup, orientation: 'portrait' | 'landscape'): PrintSetup {
  if (setup.orientation === orientation) return { ...setup };
  return {
    ...setup,
    orientation,
    paperWidthPt: setup.paperHeightPt,
    paperHeightPt: setup.paperWidthPt,
  };
}

/** The paper rect, centered on the project origin like the board. */
export function paperRect(setup: PrintSetup): { x: number; y: number; width: number; height: number } {
  return {
    x: -setup.paperWidthPt / 2,
    y: -setup.paperHeightPt / 2,
    width: setup.paperWidthPt,
    height: setup.paperHeightPt,
  };
}

/** Paper rect shrunk by the margins: where content should sit. */
export function printableRect(setup: PrintSetup): { x: number; y: number; width: number; height: number } {
  const paper = paperRect(setup);
  const { top, right, bottom, left } = setup.margins;
  return {
    x: paper.x + left,
    y: paper.y + top,
    width: Math.max(0, paper.width - left - right),
    height: Math.max(0, paper.height - top - bottom),
  };
}

export interface CropMarkSegment { from: { x: number; y: number }; to: { x: number; y: number } }

/** Crop marks for a page rect of the given size centered on the
 * origin: eight short segments just outside the corners, offset by
 * `gap` and `length` long, aligned to the page edges. */
export function cropMarkSegments(
  pageWidthPt: number,
  pageHeightPt: number,
  gap = 9,
  length = 18,
): CropMarkSegment[] {
  const x0 = -pageWidthPt / 2;
  const y0 = -pageHeightPt / 2;
  const x1 = pageWidthPt / 2;
  const y1 = pageHeightPt / 2;
  const seg = (fx: number, fy: number, tx: number, ty: number): CropMarkSegment => ({
    from: { x: fx, y: fy }, to: { x: tx, y: ty },
  });
  return [
    seg(x0 - gap - length, y0, x0 - gap, y0), seg(x0, y0 - gap - length, x0, y0 - gap),
    seg(x1 + gap, y0, x1 + gap + length, y0), seg(x1, y0 - gap - length, x1, y0 - gap),
    seg(x1 + gap, y1, x1 + gap + length, y1), seg(x1, y1 + gap, x1, y1 + gap + length),
    seg(x0 - gap - length, y1, x0 - gap, y1), seg(x0, y1 + gap, x0, y1 + gap + length),
  ];
}

export type PrintScope = 'page' | 'selection';

/** Which top-level items print. Page scope prints the whole active
 * page; selection scope prints only the selected items (falling back
 * to the whole page when nothing is selected, so Print Selection
 * with an empty selection is never a blank surprise). Pure so the
 * engine's hide/show dance is testable headlessly. */
export function resolvePrintItemIds(
  allIds: readonly string[],
  selectedIds: readonly string[],
  scope: PrintScope,
): string[] {
  if (scope === 'page') return [...allIds];
  const selected = new Set(selectedIds);
  const keep = allIds.filter((id) => selected.has(id));
  return keep.length > 0 ? keep : [...allIds];
}

/** Defensively read a PrintSetup from untrusted JSON. Returns null
 * when the value is not recognizably a print setup. */
export function readPrintSetup(value: unknown): PrintSetup | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<PrintSetup> & { margins?: Partial<PrintMargins> };
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  if (typeof s.paperWidthPt !== 'number' || typeof s.paperHeightPt !== 'number') return null;
  if (!(s.paperWidthPt > 0) || !(s.paperHeightPt > 0)) return null;
  const d = defaultPrintSetup();
  return {
    paperWidthPt: s.paperWidthPt,
    paperHeightPt: s.paperHeightPt,
    orientation: s.orientation === 'landscape' ? 'landscape' : 'portrait',
    margins: {
      top: num(s.margins?.top, d.margins.top),
      right: num(s.margins?.right, d.margins.right),
      bottom: num(s.margins?.bottom, d.margins.bottom),
      left: num(s.margins?.left, d.margins.left),
    },
    cropMarks: s.cropMarks === true,
    preview: s.preview === true,
  };
}
