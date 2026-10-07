// Document Size window: dedicated canvas-size editor opened from the top
// row of the Document and Settings menu. Hosts the shared
// DocumentSizeEditor in the Settings modal chrome; applying closes the
// window. Mounted by App when the window registry names it.
import { useSyncExternalStore } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { GUIManager } from '../ui/GUIManager';
import DocumentSizeEditor from './DocumentSizeEditor';

export default function DocumentSizeWindow({
  engine, gui, windowId,
}: {
  engine: NibGliderEngine;
  gui: GUIManager;
  windowId: string;
}) {
  // Rerender on page changes so a reopened window starts from live dims.
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  if (windowId !== 'document-size') return null;
  return (
    <div className="settings-backdrop" onClick={() => gui.closeWindow()}>
      <div
        className="settings-window docsize-window"
        role="dialog"
        aria-modal="true"
        aria-label="Document Size"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <span className="settings-title">Document Size</span>
          <button type="button" className="settings-close" aria-label="Close document size" onClick={() => gui.closeWindow()}>
            ×
          </button>
        </div>
        <DocumentSizeEditor engine={engine} onApplied={() => gui.closeWindow()} />
      </div>
    </div>
  );
}
