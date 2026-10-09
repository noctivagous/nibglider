// Browser PDF.js importer for File > Import > PDF. Vector pages recover
// editable grouped artwork (see vectorArtwork.ts); image-only pages fall
// back to rasterized canvases that the engine places as Paper rasters.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pdfOperatorsToGroup, type PdfArtworkGroup } from './vectorArtwork';

GlobalWorkerOptions.workerSrc = workerUrl;

function openPdf(data: Uint8Array) {
  // pdf.js may detach the buffer it is given, so hand it a copy.
  return getDocument({ data: data.slice() });
}

/** Page count, or null when the file cannot be opened (including passwords). */
export async function pdfPageCount(data: Uint8Array): Promise<number | null> {
  const task = openPdf(data);
  try {
    const pdf = await task.promise;
    return pdf.numPages > 0 ? pdf.numPages : null;
  } catch {
    return null;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

export interface PdfPageArtwork {
  pageNumber: number;
  width: number;
  height: number;
  group: PdfArtworkGroup;
}

/** Vector artwork for 1-based page numbers, or null when unreadable.
 * Text and paths come from the pdf.js operator list in user space. */
export async function extractPdfArtwork(
  data: Uint8Array,
  pages: number[],
): Promise<PdfPageArtwork[] | null> {
  if (pages.length === 0) return null;
  try {
    const task = openPdf(data);
    try {
      const pdf = await task.promise;
      const out: PdfPageArtwork[] = [];
      for (const pageNumber of pages) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const operators = await page.getOperatorList();
        out.push({
          pageNumber,
          width: Math.max(1, viewport.width),
          height: Math.max(1, viewport.height),
          group: pdfOperatorsToGroup(operators.fnArray, operators.argsArray, viewport.height),
        });
      }
      return out;
    } finally {
      await task.destroy().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

/** Rasterize 1-based page numbers at the given PDF.js viewport scale. */
export async function renderPdfPages(
  data: Uint8Array,
  pages: number[],
  scale: number,
): Promise<HTMLCanvasElement[] | null> {
  if (pages.length === 0) return null;
  const safeScale = scale === 2 ? 2 : 1;
  try {
    const task = openPdf(data);
    try {
      const pdf = await task.promise;
      const canvases: HTMLCanvasElement[] = [];
      for (const pageNumber of pages) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: safeScale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        canvases.push(canvas);
      }
      return canvases;
    } finally {
      await task.destroy().catch(() => undefined);
    }
  } catch {
    return null;
  }
}
