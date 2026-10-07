import { useState, useSyncExternalStore } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import {
  parseInCanvasXML,
  resolveInCanvasPlacement,
  type InCanvasControl,
  type InCanvasEdgeSection,
  type InCanvasSpec,
} from '../ui/inCanvasGui';
import interlaceXml from '../ui/inCanvas/interlace.xml?raw';

let cached: InCanvasSpec | { error: string } | null = null;
function interlaceSpec(): InCanvasSpec | { error: string } {
  if (!cached) {
    const parsed = parseInCanvasXML(interlaceXml);
    cached = 'error' in parsed ? { error: parsed.error } : parsed.spec;
  }
  return cached;
}

function NumberControl({
  label,
  value,
  min,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
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

// In-canvas GUI for the selected interlace group: mounted while exactly one
// group is selected, withdrawn on deselect. Controls are driven by
// src/ui/inCanvas/interlace.xml; phase and padding retune the weave live,
// Ungroup releases the members like Layers > Ungroup.
export default function InterlacePopover({ engine }: { engine: NibGliderEngine }) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const group = engine.selectedInterlaceGroup();
  if (!group) return null;
  const spec = interlaceSpec();
  if ('error' in spec) {
    return (
      <div id="interlaceCard" role="dialog" aria-label="Interlace">
        <div className="ef-error">Interlace controls unavailable: {spec.error}</div>
      </div>
    );
  }
  const renderControl = (control: InCanvasControl, home: string): React.ReactNode => {
    const key = `${home}:${control.kind}:${'key' in control ? control.key : control.label}`;
    switch (control.kind) {
      case 'toggle':
        if (control.key !== 'alternate') return null;
        return (
          <label className="ef-row" key={key}>
            <span className="ef-label">{control.label}</span>
            <input
              type="checkbox"
              className="ef-toggle"
              checked={group.phase === 1}
              onChange={() => engine.setInterlaceParams({ phase: group.phase === 1 ? 0 : 1 })}
            />
          </label>
        );
      case 'field':
        if (control.key !== 'padding') return null;
        return (
          <NumberControl
            key={key}
            label={control.label}
            value={group.padding}
            min={control.min}
            step={control.step}
            onCommit={(v) => engine.setInterlaceParams({ padding: v })}
          />
        );
      case 'export':
        return (
          <button
            key={key}
            type="button"
            className="ef-export"
            onClick={() => engine.ungroupSelected()}
          >
            {control.label}
          </button>
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
      <div id="interlaceCard" role="dialog" aria-label={spec.title}>
        <div className="ef-head">
          <span className="ef-title">{spec.title}</span>
          <span className="ef-meta">
            {group.members} member{group.members === 1 ? '' : 's'} · phase {group.phase === 0 ? 'A' : 'B'}
          </span>
          <button
            type="button"
            className="ef-close"
            title="Deselect group"
            aria-label="Deselect group"
            onClick={() => engine.clearOutSelection()}
          >
            ×
          </button>
        </div>
        <div className="ef-controls">{placement.edge.map((section) => renderEdgeSection(section, 'edge'))}</div>
      </div>
      {placement.widget.length > 0 && (
        <div
          id="interlaceWidgetStrip"
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
