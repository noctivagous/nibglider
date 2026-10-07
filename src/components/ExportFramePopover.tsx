import { useState, useSyncExternalStore } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { LengthUnit } from '../engine/types';
import { pointsToUnit, unitToPoints } from '../engine/document/MeasurementUnits';
import type { ExportFrameFormat } from '../engine/model/NGExportFrame';
import {
  parseInCanvasXML,
  resolveInCanvasPlacement,
  type InCanvasControl,
  type InCanvasEdgeSection,
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

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
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
  const [unit, setUnit] = useState<LengthUnit>('pt');
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
    const stem = (frame.name.trim() || 'export-frame').replace(/[^\w-]+/g, '-');
    if (frame.format === 'png') {
      void (async (): Promise<void> => {
        const outputs = await engine.exportFramePNG(frame.id);
        if (!outputs) return;
        outputs.forEach((entry, i) => {
          downloadBlob(outputs.length === 1 ? `${stem}.png` : `${stem}-${i + 1}.png`, entry.blob);
        });
      })();
      return;
    }
    const outputs = engine.exportFrameSVG(frame.id);
    if (!outputs) return;
    outputs.forEach((entry, i) => {
      download(outputs.length === 1 ? `${stem}.svg` : `${stem}-${i + 1}.svg`, entry.svg);
    });
  };
  // home prefixes React keys so the same control can render on both the
  // exterior edge and the mirrored widget strip without key collisions.
  const renderControl = (control: InCanvasControl, home: string): React.ReactNode => {
    const key = `${home}:${control.kind}:${'key' in control ? control.key : control.label}`;
    switch (control.kind) {
      case 'field':
        if (control.key === 'name') {
          return (
            <label className="ef-row" key={key}>
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
              key={key}
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
              key={key}
              label={control.label}
              value={boxCount}
              min={control.min}
              max={control.max}
              step={control.step}
              onCommit={(v) => engine.setExportFrameBoxCount(frame.id, Math.round(v))}
            />
          );
        }
        if (control.key === 'width' || control.key === 'height') {
          const points = control.key === 'width' ? frame.rect.width : frame.rect.height;
          const shown = Math.round(pointsToUnit(points, unit) * 100) / 100;
          return (
            <NumberControl
              key={key}
              label={control.label}
              value={shown}
              min={control.min}
              step={control.step}
              onCommit={(v) => {
                const next = unitToPoints(v, unit);
                if (!(next > 0)) return;
                engine.setExportFrameSize(
                  frame.id,
                  control.key === 'width' ? next : frame.rect.width,
                  control.key === 'width' ? frame.rect.height : next,
                );
              }}
            />
          );
        }
        return null;
      case 'select':
        if (control.key === 'unit') {
          return (
            <label className="ef-row" key={key}>
              <span className="ef-label">{control.label}</span>
              <select
                className="ef-select"
                value={unit}
                onChange={(event) => setUnit(event.target.value as LengthUnit)}
              >
                {control.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label className="ef-row" key={key}>
            <span className="ef-label">{control.label}</span>
            <select
              className="ef-select"
              value={frame.format}
              disabled={control.options.length < 2}
              onChange={(event) => engine.updateExportFrame(frame.id, { format: event.target.value as ExportFrameFormat })}
            >
              {control.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        );
      case 'export':
        return (
          <button key={key} type="button" className="ef-export" onClick={doExport}>
            {control.label}
          </button>
        );
      case 'popover':
        return (
          <div key={key} className="ef-popover-wrap">
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
                {control.controls.map((child) => renderControl(child, home))}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };
  const placement = resolveInCanvasPlacement(spec);
  const renderEdgeSection = (section: InCanvasEdgeSection, home: string): React.ReactNode => (
    <div className="ef-edge" data-edge={section.side} key={`${home}:${section.side}:${section.label}`}>
      <div className="ef-edge-label">{section.label}</div>
      {section.controls.map((control) => renderControl(control, home))}
    </div>
  );
  return (
    <>
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
        <div className="ef-controls">{placement.edge.map((section) => renderEdgeSection(section, 'edge'))}</div>
        <button
          type="button"
          className="ef-delete"
          onClick={() => engine.deleteExportFrame(frame.id)}
        >
          Delete frame
        </button>
      </div>
      {placement.widget.length > 0 && (
        <div
          id="exportFrameWidgetStrip"
          className="ic-widget-strip"
          role="dialog"
          aria-label={`${spec.title} overflow controls`}
        >
          <div className="ef-controls">{placement.widget.map((section) => renderEdgeSection(section, 'widget'))}</div>
        </div>
      )}
    </>
  );
}
