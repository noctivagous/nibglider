import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';

// Image > Raster > Trace to Vector (Tier Two, Slice 8): threshold +
// smoothing for the in-repo marching-squares tracer. The traced
// paths are deposited next to (over) the source image, which stays.
export default function ImageTraceDialog({
  engine,
  onClose,
}: {
  engine: NibGliderEngine;
  onClose: () => void;
}) {
  const [threshold, setThreshold] = useState(128);
  const [smoothing, setSmoothing] = useState(1.5);
  const [invert, setInvert] = useState(false);
  const [note, setNote] = useState('');

  const run = () => {
    const ok = engine.traceSelectedImage({ threshold, smoothing, invert });
    if (ok) onClose();
    else setNote('Nothing traced — the image may still be loading, or try a different threshold.');
  };

  return (
    <div className="units-dialog" role="dialog" aria-label="Trace to vector">
      <div className="units-dialog-head">
        <span>Trace to Vector</span>
        <button type="button" className="window-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="units-dialog-body">
        <label className="units-row">
          <span>Threshold</span>
          <input
            type="range" min={0} max={255} step={1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <span>{threshold}</span>
        </label>
        <label className="units-row">
          <span>Smoothing</span>
          <input
            type="range" min={0} max={6} step={0.25}
            value={smoothing}
            onChange={(e) => setSmoothing(Number(e.target.value))}
          />
          <span>{smoothing} px</span>
        </label>
        <label className="units-row">
          <span>Invert (light on dark)</span>
          <input
            type="checkbox"
            checked={invert}
            onChange={(e) => setInvert(e.target.checked)}
          />
        </label>
        {note ? <p className="units-note">{note}</p> : null}
        <div className="units-actions">
          <button type="button" onClick={run}>Trace</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
