// Document Settings window: renders an XML window spec
// (document-settings.xml) with controls bound to engine settings.
// Same renderer contract as SettingsWindow; today it owns ruler
// placement, later page appearance and other document chrome.
// Mounted by App when the window registry names it.
import { useSyncExternalStore } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { GUIManager } from '../ui/GUIManager';
import { parseWindowXML, type WindowControl } from '../ui/windowXML';
import documentSettingsXML from '../ui/windows/document-settings.xml?raw';

interface SettingBinding {
  get(engine: NibGliderEngine): string | boolean;
  set(engine: NibGliderEngine, value: string | boolean): void;
}

const BINDINGS: Record<string, SettingBinding> = {
  rulerPlacement: {
    get: (engine) => engine.rulerPlacement,
    set: (engine, value) => {
      if (value === 'viewer' || value === 'page') engine.setRulerPlacement(value);
    },
  },
  rulerGuides: {
    get: (engine) => engine.rulerGuides,
    set: (engine, value) => engine.setRulerGuides(value === true || value === 'true'),
  },
};

function SwitchControl({
  control, engine,
}: {
  control: Extract<WindowControl, { kind: 'switch' }>;
  engine: NibGliderEngine;
}) {
  const binding = BINDINGS[control.key];
  const current = binding ? String(binding.get(engine)) : null;
  return (
    <div className="settings-row">
      <span className="settings-label">{control.label}</span>
      <div className="settings-segment" role="group" aria-label={control.label}>
        {control.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={current === option.value ? 'settings-option active' : 'settings-option'}
            aria-pressed={current === option.value}
            disabled={!binding}
            onClick={() => binding?.set(engine, option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {!binding && <span className="settings-unknown">Unknown setting: {control.key}</span>}
    </div>
  );
}

function ToggleControl({
  control, engine,
}: {
  control: Extract<WindowControl, { kind: 'toggle' }>;
  engine: NibGliderEngine;
}) {
  const binding = BINDINGS[control.key];
  const pressed = binding ? binding.get(engine) === true : false;
  return (
    <div className="settings-row">
      <button
        type="button"
        className={pressed ? 'settings-toggle active' : 'settings-toggle'}
        aria-pressed={pressed}
        disabled={!binding}
        onClick={() => binding?.set(engine, !pressed)}
      >
        {control.label}
      </button>
      {!binding && <span className="settings-unknown">Unknown setting: {control.key}</span>}
    </div>
  );
}

export default function DocumentSettingsWindow({
  engine, gui, windowId,
}: {
  engine: NibGliderEngine;
  gui: GUIManager;
  windowId: string;
}) {
  // Rerender when a control commits (engine notifies on every setter).
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  if (windowId !== 'document-settings') return null;
  const parsed = parseWindowXML(documentSettingsXML);
  return (
    <div className="settings-backdrop" onClick={() => gui.closeWindow()}>
      <div
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-label={'spec' in parsed ? parsed.spec.title : 'Document Settings'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <span className="settings-title">{'spec' in parsed ? parsed.spec.title : 'Document Settings'}</span>
          <button type="button" className="settings-close" aria-label="Close document settings" onClick={() => gui.closeWindow()}>
            ×
          </button>
        </div>
        {'error' in parsed ? (
          <div className="settings-error" role="alert">{parsed.error}</div>
        ) : (
          parsed.spec.sections.map((section) => (
            <div key={section.id} className="settings-section">
              <div className="settings-section-title">{section.title}</div>
              {section.controls.map((control) => (
                control.kind === 'switch'
                  ? <SwitchControl key={control.key} control={control} engine={engine} />
                  : <ToggleControl key={control.key} control={control} engine={engine} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
