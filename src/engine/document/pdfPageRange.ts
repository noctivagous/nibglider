// Pure page-range parsing for File > Import > PDF. 1-based, inclusive.
// The dialog caps how many pages actually render; this only validates.

export type PdfPageChoice = 'first' | 'all' | 'range';

/** Hard stop so "All pages" cannot rasterize an entire book in the browser. */
export const PDF_IMPORT_PAGE_CAP = 24;

/** Parse `1`, `1-3`, or `2, 4-5` against a known page count.
 * Returns sorted unique pages, or null when any token is invalid. */
export function parsePdfPageSpec(spec: string, numPages: number): number[] | null {
  if (!Number.isInteger(numPages) || numPages < 1) return null;
  const parts = spec.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  const pages: number[] = [];
  for (const part of parts) {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    const single = /^(\d+)$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < start || end > numPages) return null;
      for (let page = start; page <= end; page += 1) pages.push(page);
    } else if (single) {
      const page = Number(single[1]);
      if (page < 1 || page > numPages) return null;
      pages.push(page);
    } else {
      return null;
    }
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}

/** Pages for a dialog choice. Null when the range is empty or invalid. */
export function pdfPagesForChoice(
  choice: PdfPageChoice,
  spec: string,
  numPages: number,
): number[] | null {
  if (!Number.isInteger(numPages) || numPages < 1) return null;
  if (choice === 'first') return [1];
  if (choice === 'all') return Array.from({ length: numPages }, (_, index) => index + 1);
  return parsePdfPageSpec(spec, numPages);
}
