// Page Setup dialog (Tier Two, Slice 5): the PRINTER's paper —
// size, orientation, margins — plus crop marks and the on-canvas
// preview toggle. Deliberately separate from Document Size: the
// document page is what you draw on; this is what you print onto.
// Values live in engine print setup and persist in the file.
import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import {
  PAPER_PRESETS,
  printSetupForPaper,
  printSetupWithOrientation,
  type PrintSetup,
} from '../engine/document/printSetup';

export default function PageSetupDialog({
  engine, onClose,
}: {
  engine: NibGliderEngine;
  onClose: () => void;
}) {
  const [setup, setSetup] = useState<PrintSetup>(() => engine.getPrintSetup());
  const [presetId, setPresetId] = useState<string>(() => {
    const current = engine.getPrintSetup();
    const match = PAPER_PRESETS.find(
      (preset) => Math.abs(preset.widthPt - current.paperWidthPt) < 1
        && Math.abs(preset.heightPt - current.paperHeightPt) < 1,
    );
    return match?.id ?? 'custom';
  });

  const apply = (): void => {
    engine.setPrintSetup(setup);
    onClose();
  };

  const marginField = (key: 'top' | 'right' | 'bottom' | 'left', label: string) => (
    <label>
      {label}
      <input
        type="number"
        min={0}
        value={setup.margins[key]}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (!Number.isFinite(value) || value < 0) return;
          setSetup((prev) => ({ ...prev, margins: { ...prev.margins, [key]: value } }));
        }}
      />
    </label>
  );

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-label="Page Setup"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          event.stopPropagation();
        }}
      >
        <div className="settings-header">
          <h2>Page Setup</h2>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="settings-body">
          <label>
            Paper
            <select
              value={presetId}
              onChange={(e) => {
                setPresetId(e.target.value);
                const preset = PAPER_PRESETS.find((p) => p.id === e.target.value);
                if (preset) setSetup((prev) => printSetupForPaper(prev, preset));
              }}
            >
              {PAPER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Paper width (pt)
            <input
              type="number"
              min={1}
              value={Math.round(setup.paperWidthPt)}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value > 0) {
                  setPresetId('custom');
                  setSetup((prev) => ({ ...prev, paperWidthPt: value }));
                }
              }}
            />
          </label>
          <label>
            Paper height (pt)
            <input
              type="number"
              min={1}
              value={Math.round(setup.paperHeightPt)}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value > 0) {
                  setPresetId('custom');
                  setSetup((prev) => ({ ...prev, paperHeightPt: value }));
                }
              }}
            />
          </label>
          <label>
            Orientation
            <select
              value={setup.orientation}
              onChange={(e) => setSetup((prev) => printSetupWithOrientation(prev, e.target.value as 'portrait' | 'landscape'))}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <fieldset>
            <legend>Margins (pt)</legend>
            {marginField('top', 'Top')}
            {marginField('right', 'Right')}
            {marginField('bottom', 'Bottom')}
            {marginField('left', 'Left')}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={setup.cropMarks}
              onChange={(e) => setSetup((prev) => ({ ...prev, cropMarks: e.target.checked }))}
            />
            Crop marks when printing
          </label>
          <label>
            <input
              type="checkbox"
              checked={setup.preview}
              onChange={(e) => setSetup((prev) => ({ ...prev, preview: e.target.checked }))}
            />
            Preview printable area + crop marks on canvas
          </label>
        </div>
        <div className="settings-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={apply}>Apply</button>
        </div>
      </div>
    </div>
  );
}
