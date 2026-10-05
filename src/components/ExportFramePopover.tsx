import { useState, useSyncExternalStore } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import {
  parseInCanvasXML,
  type InCanvasControl,
  type InCanvasSpec,
} from '../ui/inCanvasGui';
import exportFrameXml from '../ui/inCanvas/exportFrame.xml?raw';

let cached: InCanvasSpec | { error: string } | null = null;
function frameSpec(): InCanvasSpec | { error: string } {
  if (!cached) {
    const parsed = parseInCanvasXML(exportFrameXml);
    cached = 'error' in parsed ? { error: parsed.error } : parsed.spec;
  }
  return cached;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    if (min !== undefined && parsed < min) return;
    if (max !== undefined && parsed > max) return;
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <label className="ef-row">
      <span className="ef-label">{label}</span>
      <input
        type="number"
        className="ef-number"
        value={draft ?? String(value)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          event.stopPropagation();
        }}
      />
    </label>
  );
}

// In-canvas GUI for the selected Export Frame: mounted while exactly one
// frame is selected, withdrawn on deselect. Controls are driven by
// src/ui/inCanvas/exportFrame.xml; the popover button keeps box editing
// out of the canvas until requested.
export default function ExportFramePopover({ engine }: { engine: NibGliderEngine }) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const frame = engine.selectedExportFrame();
  if (!frame) return null;
  const spec = frameSpec();
  if ('error' in spec) {
    return (
      <div id="exportFrameCard" role="dialog" aria-label="Export frame">
        <div className="ef-error">Frame controls unavailable: {spec.error}</div>
      </div>
    );
  }
  const boxCount = frame.boxes.length === 0 ? 1 : frame.boxes.length;
  const artCount = engine.exportFrameArtworkCount(frame.id);
  const commitName = (): void => {
    if (nameDraft === null) return;
    const name = nameDraft.trim();
    setNameDraft(null);
    if (name.length > 0 && name !== frame.name) engine.updateExportFrame(frame.id, { name });
  };
  const doExport = (): void => {
    const outputs = engine.exportFrameSVG(frame.id);
    if (!outputs) return;
    const stem = (frame.name.trim() || 'export-frame').replace(/[^\w-]+/g, '-');
    outputs.forEach((entry, i) => {
      download(outputs.length === 1 ? `${stem}.svg` : `${stem}-${i + 1}.svg`, entry.svg);
    });
  };
  const renderControl = (control: InCanvasControl): React.ReactNode => {
    switch (control.kind) {
      case 'field':
        if (control.key === 'name') {
          return (
            <label className="ef-row" key={control.key}>
              <span className="ef-label">{control.label}</span>
              <input
                type="text"
                className="ef-text"
                value={nameDraft ?? frame.name}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                  event.stopPropagation();
                }}
              />
            </label>
          );
        }
        if (control.key === 'scale') {
          return (
            <NumberControl
              key={control.key}
              label={control.label}
              value={frame.scale}
              min={control.min}
              max={control.max}
              step={control.step}
              onCommit={(v) => engine.updateExportFrame(frame.id, { scale: v })}
            />
          );
        }
        if (control.key === 'boxCount') {
          return (
            <NumberControl
              key={control.key}
              label={control.label}
              value={boxCount}
              min={control.min}
              max={control.max}
              step={control.step}
              onCommit={(v) => engine.setExportFrameBoxCount(frame.id, Math.round(v))}
            />
          );
        }
        return null;
      case 'select':
        return (
          <label className="ef-row" key={control.key}>
            <span className="ef-label">{control.label}</span>
            <select
              className="ef-select"
              value={frame.format}
              disabled={control.options.length < 2}
              onChange={(event) => engine.updateExportFrame(frame.id, { format: event.target.value as 'svg' })}
            >
              {control.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        );
      case 'export':
        return (
          <button key="export" type="button" className="ef-export" onClick={doExport}>
            {control.label}
          </button>
        );
      case 'popover':
        return (
          <div key={control.label} className="ef-popover-wrap">
            <button
              type="button"
              className={'ef-popover-btn' + (popoverOpen ? ' open' : '')}
              aria-expanded={popoverOpen}
              onClick={() => setPopoverOpen((open) => !open)}
            >
              {control.label}
            </button>
            {popoverOpen && (
              <div className="ef-popover" role="dialog" aria-label={control.label}>
                {control.controls.map((child) => renderControl(child))}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };
  return (
    <div id="exportFrameCard" role="dialog" aria-label={spec.title}>
      <div className="ef-head">
        <span className="ef-title">{spec.title}</span>
        <span className="ef-meta">
          {artCount} object{artCount === 1 ? '' : 's'} in frame
          {boxCount > 1 ? ` · ${boxCount} boxes` : ''}
        </span>
        <button
          type="button"
          className="ef-close"
          title="Deselect frame"
          aria-label="Deselect frame"
          onClick={() => engine.clearOutSelection()}
        >
          ×
        </button>
      </div>
      <div className="ef-controls">{spec.controls.map((control) => renderControl(control))}</div>
      <button
        type="button"
        className="ef-delete"
        onClick={() => engine.deleteExportFrame(frame.id)}
      >
        Delete frame
      </button>
    </div>
  );
}
