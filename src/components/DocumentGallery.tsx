import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryDoc } from '../ui/DocumentGallery';

export type GalleryMode = 'open' | 'save' | 'rename';

function formatDate(updatedAt: number): string {
  try {
    return new Date(updatedAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// Document gallery dialog: open a saved document, save the current scene
// under a name, or rename the open document. Rendered into a portal so it
// floats above the canvas and the panel.
export default function DocumentGallery({
  mode,
  docs,
  openId,
  initialName,
  saveLabel,
  onOpen,
  onSave,
  onRename,
  onDelete,
  onClose,
}: {
  mode: GalleryMode;
  docs: GalleryDoc[];
  openId: string | null;
  initialName: string;
  saveLabel: string;
  onOpen: (doc: GalleryDoc) => void;
  onSave: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'open') dialogRef.current?.focus();
    else inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [mode, onClose]);

  const title = mode === 'open' ? 'Document gallery' : mode === 'save' ? 'Save document' : 'Rename document';
  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === 'rename') onRename(trimmed);
    else onSave(trimmed);
  };

  return createPortal(
    <div
      className="gallery-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="gallery-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="gallery-head">
          <span className="gallery-title">{title}</span>
          <button type="button" className="gallery-x" aria-label="Close gallery" onClick={onClose}>
            ×
          </button>
        </div>
        {mode !== 'open' && (
          <div className="gallery-row">
            <input
              ref={inputRef}
              type="text"
              className="gallery-name"
              aria-label="Document name"
              placeholder="Untitled"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitName();
              }}
            />
            <button
              type="button"
              className="gallery-primary"
              disabled={!name.trim()}
              onClick={commitName}
            >
              {mode === 'rename' ? 'Rename' : saveLabel}
            </button>
          </div>
        )}
        <div className="gallery-list" role="list" aria-label="Saved documents">
          {docs.length === 0 && (
            <div className="gallery-empty">No saved documents yet.</div>
          )}
          {docs.map((doc) => (
            <div
              key={doc.id}
              className={'gallery-item' + (doc.id === openId ? ' open' : '')}
              role="listitem"
            >
              <span className="gallery-item-name" title={doc.name}>
                {doc.name}
                {doc.id === openId && <span className="gallery-open-tag">open</span>}
              </span>
              <span className="gallery-item-date">{formatDate(doc.updatedAt)}</span>
              {mode === 'open' && (
                <button type="button" className="gallery-open" onClick={() => onOpen(doc)}>
                  Open
                </button>
              )}
              {confirmDelete === doc.id ? (
                <span className="gallery-confirm">
                  <button type="button" className="gallery-danger" onClick={() => { onDelete(doc.id); setConfirmDelete(null); }}>
                    Delete
                  </button>
                  <button type="button" className="gallery-quiet" onClick={() => setConfirmDelete(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="gallery-quiet"
                  aria-label={`Delete ${doc.name}`}
                  title={`Delete ${doc.name}`}
                  onClick={() => setConfirmDelete(doc.id)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
