// JPG export dialog: intermediate window shown when File > Export Raster
// fires while the JPG segment is active. JPEG is lossy and has no alpha
// channel, so quality, output scale, and the opaque background fill are
// confirmed here before anything is encoded. Settings-window chrome.
import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import { exportPngSize } from '../engine/model/NGExportFrame';
import { exportFileName, type ExportScopeId } from '../ui/fileCommands';

const SCOPE_TITLES: Record<ExportScopeId, string> = {
  canvas: 'Document Canvas Frame',
  viewport: 'Current Viewport Frame',
  selection: 'Selected Objects',
};

function clampInt(raw: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function clampScale(raw: number, fallback: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(4, Math.max(0.25, raw));
}

export default function JpgExportDialog({
  engine, scope, fileStem, onClose,
}: {
  engine: NibGliderEngine;
  scope: ExportScopeId;
  fileStem: string;
  onClose: () => void;
}) {
  const [quality, setQuality] = useState(92);
  const [scale, setScale] = useState(1);
  const [background, setBackground] = useState('#ffffff');
  const [exporting, setExporting] = useState(false);
  const box = engine.scopeExportBox(scope);
  const pixels = box ? exportPngSize(box, scale) : null;

  const confirm = (): void => {
    if (exporting) return;
    setExporting(true);
    void (async (): Promise<void> => {
      try {
        const output = await engine.exportScopeJPG(scope, { quality, scale, background });
        if (!output) return;
        const url = URL.createObjectURL(output.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = exportFileName(fileStem, scope, 'jpg');
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        onClose();
      } finally {
        setExporting(false);
      }
    })();
  };

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-label={`Export ${SCOPE_TITLES[scope]} as JPG`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          event.stopPropagation();
        }}
      >
        <div className="settings-header">
          <span className="settings-title">Export {SCOPE_TITLES[scope]} as JPG</span>
          <button type="button" className="settings-close" aria-label="Close JPG export" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-row">
          <span className="settings-label">Quality</span>
          <span className="jpg-quality">
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={quality}
              aria-label="JPG quality"
              onChange={(event) => setQuality(clampInt(Number(event.target.value), 92, 1, 100))}
            />
            <input
              type="number"
              className="settings-number jpg-quality-number"
              min={1}
              max={100}
              step={1}
              value={quality}
              aria-label="JPG quality value"
              onChange={(event) => setQuality(clampInt(Number(event.target.value), quality, 1, 100))}
            />
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Scale</span>
          <input
            type="number"
            className="settings-number"
            min={0.25}
            max={4}
            step={0.25}
            value={scale}
            aria-label="JPG export scale"
            onChange={(event) => setScale(clampScale(Number(event.target.value), scale))}
          />
        </div>
        <div className="settings-row">
          <span className="settings-label">Background</span>
          <input
            type="color"
            className="jpg-swatch"
            value={background}
            aria-label="JPG background color"
            onChange={(event) => setBackground(event.target.value)}
          />
        </div>
        <div className="settings-row">
          <span className="settings-label">Output</span>
          <span className="settings-value">
            {pixels ? `${pixels.width} × ${pixels.height} px` : 'Nothing to export'}
          </span>
        </div>
        <div className="settings-note">JPG has no transparency; the background fills it.</div>
        <div className="settings-actions">
          <button type="button" className="settings-toggle" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="settings-apply"
            disabled={exporting || !pixels}
            onClick={confirm}
          >
            {exporting ? 'Exporting…' : 'Export JPG'}
          </button>
        </div>
      </div>
    </div>
  );
}
