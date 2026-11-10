// Swatches panel section (Slice 4): document palette (user-kept),
// the default palette, and recent colours. Click a swatch to apply
// it as fill (to the selection when there is one, else the current
// fill colour); Shift+click applies it as stroke. Alt+click a
// document swatch removes it. The eyedropper samples fill/stroke
// from the next canvas click. Palette state lives in ui/swatches.ts
// (localStorage-persisted); this component mirrors it in state.
import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import {
  DEFAULT_PALETTE,
  addDocumentSwatch,
  loadDocumentPalette,
  loadRecentColors,
  pushRecentColor,
  removeDocumentSwatch,
} from '../ui/swatches';

export default function SwatchesPanel({ engine }: { engine: NibGliderEngine }) {
  const [documentPalette, setDocumentPalette] = useState<string[]>(() => loadDocumentPalette());
  const [recents, setRecents] = useState<string[]>(() => loadRecentColors());

  const apply = (color: string, event: { shiftKey: boolean; altKey: boolean }, inDocument: boolean): void => {
    if (event.altKey && inDocument) {
      setDocumentPalette((prev) => removeDocumentSwatch(prev, color));
      return;
    }
    if (event.shiftKey) engine.setStrokeColor(color);
    else engine.setFillColor(color);
    setRecents((prev) => pushRecentColor(prev, color));
  };

  const grid = (colors: readonly string[], inDocument: boolean, emptyNote: string) => (
    colors.length === 0
      ? <div className="swatches-empty">{emptyNote}</div>
      : (
        <div className="swatch-grid">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className="swatch"
              style={{ backgroundColor: color }}
              title={`${color} — click: fill · Shift+click: stroke${inDocument ? ' · Alt+click: remove' : ''}`}
              aria-label={`Swatch ${color}`}
              onClick={(e) => apply(color, e, inDocument)}
            />
          ))}
        </div>
      )
  );

  const addCurrent = (): void => {
    const paint = engine.selectionPaint();
    const color = paint?.fillColor ?? engine.globalFillColor;
    if (color) setDocumentPalette((prev) => addDocumentSwatch(prev, color));
  };

  return (
    <div className="swatches-panel">
      <div className="swatches-row">
        <button
          type="button"
          className={engine.eyedropperActive ? 'swatches-tool active' : 'swatches-tool'}
          title="Sample fill/stroke from an object on the canvas"
          onClick={() => engine.setEyedropperActive(!engine.eyedropperActive)}
        >
          Eyedropper
        </button>
        <button
          type="button"
          className="swatches-tool"
          title="Keep the current fill colour in the document palette"
          onClick={addCurrent}
        >
          + Keep fill
        </button>
      </div>
      <div className="swatches-label">Document palette</div>
      {grid(documentPalette, true, 'No kept colours yet — “+ Keep fill” adds the current fill.')}
      <div className="swatches-label">Recent</div>
      {grid(recents, false, 'Colours you apply land here.')}
      <div className="swatches-label">Default palette</div>
      {grid(DEFAULT_PALETTE, false, '')}
    </div>
  );
}
