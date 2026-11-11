// Find & Replace in text (Tier Four, Slice 19): plain substring
// search over the standalone text objects on the current page, with
// a case-sensitivity toggle. Replace All is one undo entry (the
// engine records it); the dialog says so and states its page scope
// up front. Rendered into a portal like the other dialogs.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NibGliderEngine } from '../engine/engine';

export default function FindReplaceDialog({
  engine,
  onClose,
}: {
  engine: NibGliderEngine;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findRef.current?.focus();
    findRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const matches = query ? engine.countTextMatches(query, caseSensitive) : 0;

  const replaceFirst = () => {
    const done = engine.replaceFirstTextMatch(query, replacement, caseSensitive);
    setNote(done ? 'Replaced one match.' : 'No match found on this page.');
  };

  const replaceAll = () => {
    const count = engine.replaceAllText(query, replacement, caseSensitive);
    setNote(count > 0
      ? `Replaced ${count} match${count === 1 ? '' : 'es'} (one undo step).`
      : 'No match found on this page.');
  };

  return createPortal(
    <div
      className="newdoc-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="newdoc-dialog" role="dialog" aria-modal="true" aria-label="Find and replace in text">
        <div className="gallery-head">
          <span className="gallery-title">Find &amp; Replace</span>
          <button type="button" className="gallery-x" aria-label="Close find and replace" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="newdoc-note">
          Searches the text objects on this page only. Shape-attached text is not included.
        </p>
        <label className="newdoc-field">
          <span className="newdoc-field-label">Find</span>
          <input
            ref={findRef}
            type="text"
            className="newdoc-input"
            aria-label="Find text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setNote(null); }}
          />
        </label>
        <label className="newdoc-field">
          <span className="newdoc-field-label">Replace with</span>
          <input
            type="text"
            className="newdoc-input"
            aria-label="Replacement text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Match case
        </label>
        <div className="newdoc-foot">
          <span className="newdoc-preview" role="status">
            {query
              ? `${matches} match${matches === 1 ? '' : 'es'} on this page`
              : 'Type text to find.'}
            {note ? <span className="newdoc-note">{note}</span> : null}
          </span>
          <button type="button" disabled={!query || matches === 0} onClick={replaceFirst}>
            Replace
          </button>
          <button type="button" className="gallery-primary" disabled={!query || matches === 0} onClick={replaceAll}>
            Replace All
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
