// Document Settings window: renders an XML window spec
// (document-settings.xml) with controls bound to engine settings.
// Same renderer contract as SettingsWindow. Page presentation (fill,
// side ticks) and ruler placement live here.
// Mounted by App when the window registry names it.
import { useState, useSyncExternalStore } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { GUIManager } from '../ui/GUIManager';
import { parseWindowXML, type WindowControl, type WindowSection } from '../ui/windowXML';
import documentSettingsXML from '../ui/windows/document-settings.xml?raw';
import DocumentSizeEditor from './DocumentSizeEditor';

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
  pageFill: {
    get: (engine) => engine.pageFill,
    set: (engine, value) => engine.setPageFill(value === true || value === 'true'),
  },
  pageSideTicks: {
    get: (engine) => engine.pageSideTicks,
    set: (engine, value) => engine.setPageSideTicks(value === true || value === 'true'),
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

function CustomControl({
  control, engine,
}: {
  control: Extract<WindowControl, { kind: 'custom' }>;
  engine: NibGliderEngine;
}) {
  if (control.id === 'document-size') {
    // Applying inside Settings keeps the window open for further tweaks.
    return <DocumentSizeEditor engine={engine} />;
  }
  return (
    <div className="settings-row">
      <span className="settings-unknown">Unknown control: {control.id}</span>
    </div>
  );
}

function SettingsSection({
  section, engine,
}: {
  section: WindowSection;
  engine: NibGliderEngine;
}) {
  return (
    <div className="settings-section">
      {section.title !== '' && (
        <div className="settings-section-title">{section.title}</div>
      )}
      {section.controls.map((control) => (
        control.kind === 'switch'
          ? <SwitchControl key={control.key} control={control} engine={engine} />
          : control.kind === 'toggle'
            ? <ToggleControl key={control.key} control={control} engine={engine} />
            : <CustomControl key={control.id} control={control} engine={engine} />
      ))}
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
  const parsed = parseWindowXML(documentSettingsXML);
  const firstTab = 'spec' in parsed && parsed.spec.tabs.length > 0
    ? parsed.spec.tabs[0].id
    : null;
  const [activeTab, setActiveTab] = useState<string | null>(firstTab);
  if (windowId !== 'document-settings') return null;
  const tabs = 'spec' in parsed ? parsed.spec.tabs : [];
  const sectionsById = new Map(
    ('spec' in parsed ? parsed.spec.sections : []).map((section) => [section.id, section]),
  );
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0] ?? null;
  return (
    <div className="settings-backdrop" onClick={() => gui.closeWindow()}>
      <div
        className="settings-window docsettings-window"
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
        ) : tabs.length === 0 ? (
          parsed.spec.sections.map((section) => (
            <SettingsSection key={section.id} section={section} engine={engine} />
          ))
        ) : (
          <>
            <div className="settings-tabs" role="tablist" aria-label="Document settings sections">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={currentTab?.id === tab.id}
                  className={currentTab?.id === tab.id ? 'settings-tab active' : 'settings-tab'}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.title}
                </button>
              ))}
            </div>
            {currentTab?.sectionIds.map((sectionId) => {
              const section = sectionsById.get(sectionId);
              return section
                ? <SettingsSection key={section.id} section={section} engine={engine} />
                : null;
            })}
          </>
        )}
      </div>
    </div>
  );
}
