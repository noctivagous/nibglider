// About dialog (Help menu, Slice 21): the app's name and the
// version read from package.json — the single source of truth for
// the version string.
import packageJson from '../../package.json';

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-label="About NibGlider"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          event.stopPropagation();
        }}
      >
        <div className="settings-header">
          <span className="settings-title">About NibGlider</span>
          <button type="button" className="settings-close" aria-label="Close About" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-row">
          <span className="settings-label">NibGlider</span>
          <span className="settings-value">Version {packageJson.version}</span>
        </div>
        <div className="settings-note">
          A key-click vector editor: draw shapes with keys, arrange them in layers and pages, and export or print the result.
        </div>
      </div>
    </div>
  );
}
