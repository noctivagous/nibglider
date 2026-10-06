import { useState, useSyncExternalStore } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import {
  parseInCanvasXML,
  type InCanvasControl,
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

// In-canvas GUI for the selected weave: mounted while exactly one interlace
// group or one baked weave is selected, withdrawn on deselect. Controls are
// driven by src/ui/inCanvas/interlace.xml; phase and padding retune a live
// group, Ungroup releases the members like Layers > Ungroup, and the
// crossing list flips one crossing's over side in either variant.
export default function InterlacePopover({ engine }: { engine: NibGliderEngine }) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const weave = engine.selectedInterlaceWeave();
  if (!weave) return null;
  const spec = interlaceSpec();
  if ('error' in spec) {
    return (
      <div id="interlaceCard" role="dialog" aria-label="Interlace">
        <div className="ef-error">Interlace controls unavailable: {spec.error}</div>
      </div>
    );
  }
  const isGroup = weave.kind === 'group';
  const renderControl = (control: InCanvasControl): React.ReactNode => {
    switch (control.kind) {
      case 'toggle':
        if (!isGroup || control.key !== 'alternate') return null;
        return (
          <label className="ef-row" key={control.key}>
            <span className="ef-label">{control.label}</span>
            <input
              type="checkbox"
              className="ef-toggle"
              checked={weave.phase === 1}
              onChange={() => engine.setInterlaceParams({ phase: weave.phase === 1 ? 0 : 1 })}
            />
          </label>
        );
      case 'field':
        if (!isGroup || control.key !== 'padding' || weave.padding === undefined) return null;
        return (
          <NumberControl
            key={control.key}
            label={control.label}
            value={weave.padding}
            min={control.min}
            step={control.step}
            onCommit={(v) => engine.setInterlaceParams({ padding: v })}
          />
        );
      case 'crossings':
        if (control.key !== 'crossings' || weave.crossings.length === 0) return null;
        return (
          <div className="ef-row" key={control.key}>
            <span className="ef-label">{control.label}</span>
            {weave.crossings.map((cross) => (
              <button
                key={cross.key}
                type="button"
                className="ef-export"
                title={`Flip crossing ${cross.number} (now Member ${cross.over + 1} over)`}
                onClick={() => engine.flipInterlaceCrossing(cross.key)}
              >
                {cross.number}: Member {cross.over + 1} over
              </button>
            ))}
          </div>
        );
      case 'export':
        if (!isGroup) return null;
        return (
          <button
            key="ungroup"
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
  return (
    <div id="interlaceCard" role="dialog" aria-label={spec.title}>
      <div className="ef-head">
        <span className="ef-title">{spec.title}</span>
        <span className="ef-meta">
          {weave.members} member{weave.members === 1 ? '' : 's'} · {isGroup ? `phase ${weave.phase === 0 ? 'A' : 'B'}` : 'baked'}
        </span>
        <button
          type="button"
          className="ef-close"
          title="Deselect weave"
          aria-label="Deselect weave"
          onClick={() => engine.clearOutSelection()}
        >
          ×
        </button>
      </div>
      <div className="ef-controls">{spec.controls.map((control) => renderControl(control))}</div>
    </div>
  );
}
