import { useState, useSyncExternalStore } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { GUIManager } from '../ui/GUIManager';
import NumericStepper from './NumericStepper';

type FiltersTab = 'color' | 'filters';

const TABS: Array<{ id: FiltersTab; label: string }> = [
  { id: 'color', label: 'Color' },
  { id: 'filters', label: 'Filters' },
];

// Floating selection panel opened from the Image menu. Non-modal: the card
// sits in the overlay stack beside the canvas so tweaks stay visible while
// the artwork underneath remains interactive. The Color tab drives the same
// fill/stroke setters as the main panel (selection when one exists, globals
// otherwise); the Filters tab runs raster pixel ops on selected images.
export default function FiltersPanel({
  engine,
  gui,
}: {
  engine: NibGliderEngine;
  gui: GUIManager;
}) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const [tab, setTab] = useState<FiltersTab>('color');
  const [blurRadius, setBlurRadius] = useState(1);
  const [sharpenRadius, setSharpenRadius] = useState(1);
  const [sharpenAmount, setSharpenAmount] = useState(1);
  const [brightness, setBrightness] = useState(0);
  const [contrastPct, setContrastPct] = useState(100);

  const sel = engine.selectionPaint();
  const fillOn = sel ? sel.fillOn : engine.fillEnabled;
  const fillColor = sel ? sel.fillColor : engine.globalFillColor;
  const strokeOn = sel ? sel.strokeOn : engine.strokeEnabled;
  const strokeColor = sel ? sel.strokeColor : engine.globalStrokeColor;
  const strokeWidth = sel ? sel.strokeWidth : engine.globalStrokeWidth;
  const selectedCount = engine.selectedItems.length;
  const hasRaster = engine.hasSelectedRaster();

  return (
    <div id="filtersCard" role="dialog" aria-label="Filters">
      <div className="fp-head">
        <span className="fp-title">Filters</span>
        <span className="fp-meta">
          {selectedCount === 0 ? 'nothing selected' : `${selectedCount} selected`}
        </span>
        <button
          type="button"
          className="fp-close"
          title="Close filters panel"
          aria-label="Close filters panel"
          onClick={() => gui.setFiltersVisible(false)}
        >
          ×
        </button>
      </div>
      <div className="settings-tabs" role="tablist" aria-label="Filters panel sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'settings-tab active' : 'settings-tab'}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {tab === 'color' && (
        <div className="fp-controls">
          {selectedCount === 0 && (
            <div className="fp-hint">No selection — editing global defaults.</div>
          )}
          <label className="fp-row">
            <input
              type="checkbox"
              checked={fillOn}
              onChange={(event) => engine.setFillEnabled(event.target.checked)}
            />
            <span className="fp-label">Fill</span>
            <input
              type="color"
              className="fp-color"
              value={fillColor}
              disabled={!fillOn}
              onChange={(event) => engine.setFillColor(event.target.value)}
            />
          </label>
          <label className="fp-row">
            <input
              type="checkbox"
              checked={strokeOn}
              onChange={(event) => engine.setStrokeEnabled(event.target.checked)}
            />
            <span className="fp-label">Stroke</span>
            <input
              type="color"
              className="fp-color"
              value={strokeColor}
              disabled={!strokeOn}
              onChange={(event) => engine.setStrokeColor(event.target.value)}
            />
          </label>
          <div className="fp-row">
            <span className="fp-label">Width</span>
            <NumericStepper
              value={Math.round(strokeWidth * 100) / 100}
              min={0.5}
              max={200}
              step={0.5}
              disabled={!strokeOn}
              ariaLabel="Stroke width in points"
              unit="pt"
              onCommit={(v) => engine.setStrokeWidth(v)}
            />
          </div>
        </div>
      )}
      {tab === 'filters' && (
        <div className="fp-controls">
          {!hasRaster && (
            <div className="fp-hint">Select a placed image to apply filters.</div>
          )}
          <div className="fp-row">
            <button
              type="button"
              className="fp-btn"
              disabled={!hasRaster}
              onClick={() => engine.grayscaleSelectedRasters()}
            >
              Grayscale
            </button>
            <button
              type="button"
              className="fp-btn"
              disabled={!hasRaster}
              onClick={() => engine.invertSelectedRasters()}
            >
              Invert
            </button>
          </div>
          <div className="fp-row">
            <span className="fp-label">Blur</span>
            <NumericStepper
              value={blurRadius}
              min={1}
              max={10}
              step={1}
              disabled={!hasRaster}
              ariaLabel="Blur radius in pixels"
              unit="px"
              onCommit={setBlurRadius}
            />
            <button
              type="button"
              className="fp-btn fp-apply"
              disabled={!hasRaster}
              onClick={() => engine.blurSelectedRasters(blurRadius)}
            >
              Apply
            </button>
          </div>
          <div className="fp-row">
            <span className="fp-label">Sharpen</span>
            <NumericStepper
              value={sharpenRadius}
              min={1}
              max={10}
              step={1}
              disabled={!hasRaster}
              ariaLabel="Sharpen radius in pixels"
              unit="px"
              onCommit={setSharpenRadius}
            />
            <NumericStepper
              value={sharpenAmount}
              min={0.1}
              max={3}
              step={0.1}
              decimals={1}
              disabled={!hasRaster}
              ariaLabel="Sharpen strength"
              onCommit={setSharpenAmount}
            />
            <button
              type="button"
              className="fp-btn fp-apply"
              disabled={!hasRaster}
              onClick={() => engine.sharpenSelectedRasters(sharpenRadius, sharpenAmount)}
            >
              Apply
            </button>
          </div>
          <div className="fp-row">
            <span className="fp-label">Brightn.</span>
            <NumericStepper
              value={brightness}
              min={-255}
              max={255}
              step={5}
              disabled={!hasRaster}
              ariaLabel="Brightness shift"
              onCommit={setBrightness}
            />
            <button
              type="button"
              className="fp-btn fp-apply"
              disabled={!hasRaster || brightness === 0}
              onClick={() => engine.adjustSelectedRasterBrightness(brightness)}
            >
              Apply
            </button>
          </div>
          <div className="fp-row">
            <span className="fp-label">Contrast</span>
            <NumericStepper
              value={contrastPct}
              min={10}
              max={400}
              step={5}
              disabled={!hasRaster}
              ariaLabel="Contrast percent"
              unit="%"
              onCommit={setContrastPct}
            />
            <button
              type="button"
              className="fp-btn fp-apply"
              disabled={!hasRaster || contrastPct === 100}
              onClick={() => engine.adjustSelectedRasterContrast(contrastPct / 100)}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
