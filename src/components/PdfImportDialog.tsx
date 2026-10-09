// PDF import options. Vector pages land as grouped editable artwork;
// image-only pages fall back to grouped rasters.
import { useEffect, useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import {
  PDF_IMPORT_PAGE_CAP,
  pdfPagesForChoice,
  type PdfPageChoice,
} from '../engine/document/pdfPageRange';
import { extractPdfArtwork, pdfPageCount, renderPdfPages } from '../engine/document/pdfImport';
import { artworkNodeHasVectors, IMAGE_ONLY_IMPORT_NOTE } from '../engine/document/vectorArtwork';

export default function PdfImportDialog({
  engine, fileName, bytes, onClose,
}: {
  engine: NibGliderEngine;
  fileName: string;
  bytes: Uint8Array;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<PdfPageChoice>('first');
  const [range, setRange] = useState('1');
  const [scale, setScale] = useState<1 | 2>(1);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pdfPageCount(bytes).then((count) => {
      if (cancelled) return;
      if (count == null) {
        setLoadError('Could not open that PDF. Password-protected files are not imported.');
        return;
      }
      setPageCount(count);
    });
    return () => { cancelled = true; };
  }, [bytes]);

  const pages = pageCount == null ? null : pdfPagesForChoice(choice, range, pageCount);
  const overCap = pages != null && pages.length > PDF_IMPORT_PAGE_CAP;
  const canImport = pages != null && pages.length > 0 && !overCap && !importing && !loadError;

  const confirm = (): void => {
    if (!canImport || !pages) return;
    setImporting(true);
    setActionError(null);
    void (async (): Promise<void> => {
      try {
        // Vector first: every selected page with paths or text lands as
        // grouped artwork that Ungroup releases one level at a time.
        // Image-only (or unreadable-vector) selections fall back to raster.
        const artwork = await extractPdfArtwork(bytes, pages).catch(() => null);
        const vectorPages = (artwork ?? []).filter((page) => artworkNodeHasVectors(page.group));
        if (artwork && vectorPages.length === pages.length && vectorPages.length > 0) {
          if (engine.importPdfArtwork(`Import ${fileName}`, vectorPages)) {
            onClose();
            return;
          }
        }
        const canvases = await renderPdfPages(bytes, pages, scale);
        if (!canvases || canvases.length === 0) {
          setActionError('Could not render those pages.');
          return;
        }
        const note = artwork && vectorPages.length === 0 ? IMAGE_ONLY_IMPORT_NOTE : '';
        const placed = engine.importRasterCanvases(`Import ${fileName}`, canvases, note);
        if (!placed) {
          setActionError('Could not place those pages.');
          return;
        }
        onClose();
      } finally {
        setImporting(false);
      }
    })();
  };

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-label={`Import ${fileName}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          event.stopPropagation();
        }}
      >
        <div className="settings-header">
          <span className="settings-title">Import PDF</span>
          <button type="button" className="settings-close" aria-label="Close PDF import" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-row">
          <span className="settings-label">File</span>
          <span className="settings-value">{fileName}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Pages</span>
          <span className="settings-segment" role="group" aria-label="PDF pages">
            {(['first', 'all', 'range'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={'settings-option' + (choice === value ? ' active' : '')}
                aria-pressed={choice === value}
                onClick={() => setChoice(value)}
              >
                {value === 'first' ? 'First' : value === 'all' ? 'All' : 'Range'}
              </button>
            ))}
          </span>
        </div>
        {choice === 'range' ? (
          <div className="settings-row">
            <span className="settings-label">Range</span>
            <input
              type="text"
              className="settings-number"
              style={{ width: '8rem' }}
              value={range}
              aria-label="PDF page range"
              placeholder="1-3, 5"
              onChange={(event) => setRange(event.target.value)}
            />
          </div>
        ) : null}
        <div className="settings-row">
          <span className="settings-label">Scale</span>
          <span className="settings-segment" role="group" aria-label="PDF render scale">
            {([1, 2] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={'settings-option' + (scale === value ? ' active' : '')}
                aria-pressed={scale === value}
                onClick={() => setScale(value)}
              >
                {value}×
              </button>
            ))}
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Document</span>
          <span className="settings-value">
            {loadError ? 'Unreadable' : pageCount == null ? 'Reading…' : `${pageCount} page${pageCount === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="settings-note">
          Vector pages stay editable and grouped; image-only pages place as grouped images.
          {pageCount != null && pageCount > PDF_IMPORT_PAGE_CAP
            ? ` Choose at most ${PDF_IMPORT_PAGE_CAP} pages.`
            : ''}
          {overCap ? ` That selection is over ${PDF_IMPORT_PAGE_CAP} pages.` : ''}
        </div>
        {loadError ? <div className="settings-note">{loadError}</div> : null}
        {actionError ? <div className="settings-note">{actionError}</div> : null}
        <div className="settings-actions">
          <button type="button" className="settings-toggle" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="settings-apply" disabled={!canImport} onClick={confirm}>
            {importing ? 'Importing…' : 'Import PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
