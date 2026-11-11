// Help window: shows the bundled docs (getting started, keys
// reference) inside the app. Follows the SettingsWindow modal
// pattern (backdrop + dialog classes). Content is the docs/*.md
// source imported with ?raw, rendered as preformatted text so the
// in-app copy can never drift from the repository docs.
import gettingStartedRaw from '../../docs/getting-started.md?raw';
import keysReferenceRaw from '../../docs/keys-reference.md?raw';

export type HelpDocId = 'getting-started' | 'keys-reference';

const HELP_DOCS: Record<HelpDocId, { title: string; text: string }> = {
  'getting-started': { title: 'Getting Started', text: gettingStartedRaw },
  'keys-reference': { title: 'Keys Reference', text: keysReferenceRaw },
};

export default function HelpWindow({
  doc, onClose,
}: {
  doc: HelpDocId;
  onClose: () => void;
}) {
  const entry = HELP_DOCS[doc];
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-window help-window"
        role="dialog"
        aria-modal="true"
        aria-label={entry.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="help-window-head">
          <span>{entry.title}</span>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <pre className="help-window-body">{entry.text}</pre>
      </div>
    </div>
  );
}
