// Document Info window: opened by clicking the document name in the
// config summary box. Shows the document name (editable), canvas size,
// units, object count, and layer count. Follows the SettingsWindow modal
// pattern and reuses its backdrop/dialog classes. Mounted by App when the
// window registry names it.
import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { GUIManager } from '../ui/GUIManager';
import { browserGallerySession } from '../ui/DocumentGallery';
import { useGallerySnapshot } from '../ui/useGallerySnapshot';
import { formatInUnit } from '../engine/document/MeasurementUnits';

function InfoRow({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="settings-row docinfo-row">
      <span className="settings-label">{label}</span>
      <span className="docinfo-value" title={title ?? value}>{value}</span>
    </div>
  );
}

export default function DocumentInfoWindow({
  engine, gui, windowId,
}: {
  engine: NibGliderEngine;
  gui: GUIManager;
  windowId: string;
}) {
  const gallery = useGallerySnapshot();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (windowId !== 'document-info') return null;
  const savedName = gallery.displayName;
  const value = draft ?? (gallery.ready ? (gallery.currentName ?? 'Untitled') : savedName);

  const page = engine.getPageSettings();
  const sizeValue =
    page.widthPt != null && page.heightPt != null
      ? `${formatInUnit(page.widthPt, page.unit)} × ${formatInUnit(page.heightPt, page.unit)}`
      : 'Unbounded canvas (no page size set)';
  const unitsValue = `Display ${engine.lengthUnit} · page ${page.unit}`;
  const stats = engine.documentStats();

  const commitRename = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Name cannot be empty.');
      return;
    }
    void (async () => {
      const session = await browserGallerySession();
      const id = session.getSnapshot().currentId;
      if (id) {
        if (!await session.rename(id, trimmed)) {
          setError('Could not rename this document.');
          return;
        }
      } else {
        // Untitled work with no gallery entry yet: naming it saves it.
        const payload = engine.exportScene();
        if (!payload) {
          setError('There is nothing to save yet.');
          return;
        }
        await session.save(trimmed, payload);
        engine.markDocumentClean();
      }
      setDraft(null);
      setError(null);
    })();
  };

  return (
    <div className="settings-backdrop" onClick={() => gui.closeWindow()}>
      <div
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-label="Document Info"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <span className="settings-title">Document Info</span>
          <button type="button" className="settings-close" aria-label="Close Document Info" onClick={() => gui.closeWindow()}>
            ×
          </button>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">Name</div>
          <div className="settings-row docinfo-row">
            <input
              type="text"
              className="docinfo-input"
              aria-label="Document name"
              value={value}
              placeholder={savedName}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                else if (e.key === 'Escape') gui.closeWindow();
              }}
            />
            <button
              type="button"
              className="settings-option active"
              onClick={commitRename}
              disabled={(draft ?? savedName).trim() === savedName}
              title={gallery.currentId ? 'Rename this document' : 'Name and save this document to the gallery'}
            >
              Rename
            </button>
          </div>
          {error ? <div className="settings-error" role="alert">{error}</div> : null}
        </div>
        <div className="settings-section">
          <div className="settings-section-title">Summary</div>
          <InfoRow label="Size" value={sizeValue} />
          <InfoRow label="Units" value={unitsValue} />
          <InfoRow label="Objects" value={String(stats.objectCount)} title="Top-level artwork objects; groups count as one" />
          <InfoRow label="Layers" value={String(stats.layerCount)} title="Artwork layers; guide and grid layers excluded" />
        </div>
      </div>
    </div>
  );
}
