// Browser-only SVG to PDF. Uses the SVG string File > Export already
// builds, so the page is the export box in document points (PDF user
// space is the same 72-per-inch point). Do not import this from Node tests.
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

/** Convert an exported SVG string into a one-page PDF blob.
 * Returns null when the DOM is missing or the SVG will not parse. */
export async function svgToPdfBlob(
  svg: string,
  size: { width: number; height: number },
): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined') return null;
  const width = size.width;
  const height = size.height;
  if (!(width > 0) || !(height > 0)) return null;
  let element: Element | null = null;
  try {
    element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  } catch {
    return null;
  }
  if (!element || element.nodeName.toLowerCase() !== 'svg') return null;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  const live = document.importNode(element, true);
  host.appendChild(live);
  document.body.appendChild(host);
  try {
    // jsPDF sorts a custom format and lets orientation pick the axes.
    // Portrait always becomes the taller page, so a wide export box has
    // to ask for landscape or the page comes out turned.
    const pdf = new jsPDF({
      unit: 'pt',
      format: [width, height],
      orientation: width >= height ? 'landscape' : 'portrait',
      compress: true,
    });
    await svg2pdf(live, pdf, { x: 0, y: 0, width, height });
    return pdf.output('blob');
  } catch {
    return null;
  } finally {
    host.remove();
  }
}
