// Swatches panel section (Slice 4): document palette (user-kept),
// the default palette, and recent colours. Click a swatch to apply
// it as fill (to the selection when there is one, else the current
// fill colour); Shift+click applies it as stroke. Alt+click a
// document swatch removes it. The eyedropper samples fill/stroke
// from the next canvas click.
//
// Slice 20: the document palette is document state — it lives on
// the engine and travels in the .nibglider file (native v6).
// Opening a document that carries no palette imports the legacy
// localStorage palette (ui/swatches.ts) once, via the engine's
// seed. Recent colours stay global (localStorage).
import { useEffect, useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import {
  DEFAULT_PALETTE,
  addDocumentSwatch,
  loadDocumentPalette,
  loadRecentColors,
  normalizeSwatchColor,
  pushRecentColor,
  removeDocumentSwatch,
} from '../ui/swatches';

export default function SwatchesPanel({ engine }: { engine: NibGliderEngine }) {
  const [recents, setRecents] = useState<string[]>(() => loadRecentColors());
  const [hexDraft, setHexDraft] = useState('');
  const [hexError, setHexError] = useState(false);
  const documentPalette = engine.documentPalette;

  // Once per opened document: a document without its own palette
  // inherits the legacy localStorage palette.
  const fileKey = engine.currentFileName;
  useEffect(() => {
    engine.seedDocumentPaletteFromLegacy(loadDocumentPalette());
  }, [engine, fileKey]);

  const apply = (color: string, event: { shiftKey: boolean; altKey: boolean }, inDocument: boolean): void => {
    if (event.altKey && inDocument) {
      engine.setDocumentPalette(removeDocumentSwatch(documentPalette, color));
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

  const keepFill = (): void => {
    const paint = engine.selectionPaint();
    const color = paint?.fillColor ?? engine.globalFillColor;
    if (color) engine.setDocumentPalette(addDocumentSwatch(documentPalette, color));
  };

  const keepStroke = (): void => {
    const paint = engine.selectionPaint();
    const color = paint?.strokeColor ?? engine.globalStrokeColor;
    if (color) engine.setDocumentPalette(addDocumentSwatch(documentPalette, color));
  };

  const keepHex = (): void => {
    const color = normalizeSwatchColor(hexDraft);
    if (!color) {
      setHexError(true);
      return;
    }
    setHexError(false);
    engine.setDocumentPalette(addDocumentSwatch(documentPalette, color));
    setHexDraft('');
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
          onClick={keepFill}
        >
          + Keep fill
        </button>
        <button
          type="button"
          className="swatches-tool"
          title="Keep the current stroke colour in the document palette"
          onClick={keepStroke}
        >
          + Keep stroke
        </button>
      </div>
      <div className="swatches-row">
        <input
          type="text"
          className="swatches-hex"
          value={hexDraft}
          placeholder="#rrggbb"
          aria-label="Hex colour to keep"
          title={hexError ? 'Enter a hex colour like #3a7bd5' : 'Type a hex colour and press Add'}
          onChange={(e) => { setHexDraft(e.target.value); setHexError(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') keepHex(); }}
        />
        <button type="button" className="swatches-tool" onClick={keepHex}>
          Add
        </button>
        {hexError ? <span className="swatches-hex-error">Not a hex colour</span> : null}
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
