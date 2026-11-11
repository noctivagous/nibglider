import { useSyncExternalStore } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { GUIManager } from '../ui/GUIManager';
import NumericStepper from './NumericStepper';

// Floating selection panel opened from the Image menu. Non-modal: the card
// sits in the overlay stack beside the canvas so tweaks stay visible while
// the artwork underneath remains interactive. The card runs raster pixel
// ops on selected images. (Slice 20 removed the old Color tab — the
// Fill/Stroke panel sections own colour. The filter parameters live
// on the engine, settings-backed, so they survive the card closing.)
export default function FiltersPanel({
  engine,
  gui,
}: {
  engine: NibGliderEngine;
  gui: GUIManager;
}) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const blurRadius = engine.filterBlurRadius;
  const sharpenRadius = engine.filterSharpenRadius;
  const sharpenAmount = engine.filterSharpenAmount;
  const brightness = engine.filterBrightness;
  const contrastPct = engine.filterContrastPct;

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
            onCommit={(v) => engine.setFilterBlurRadius(v)}
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
            onCommit={(v) => engine.setFilterSharpenRadius(v)}
          />
          <NumericStepper
            value={sharpenAmount}
            min={0.1}
            max={3}
            step={0.1}
            decimals={1}
            disabled={!hasRaster}
            ariaLabel="Sharpen strength"
            onCommit={(v) => engine.setFilterSharpenAmount(v)}
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
            onCommit={(v) => engine.setFilterBrightness(v)}
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
            onCommit={(v) => engine.setFilterContrastPct(v)}
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
    </div>
  );
}
