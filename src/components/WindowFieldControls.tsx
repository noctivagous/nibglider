// Shared XML-window field controls: text/number inputs bound to engine
// settings, and commit-only password inputs for secrets. Used by
// SettingsWindow and DocumentSettingsWindow so both hosts render <field>
// the same way. Password bindings are commit-only on purpose: hosts never
// display the stored value back, and secrets must stay out of persisted
// engine settings (memory-only, like the Printify token).
import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { WindowControl } from '../ui/windowXML';
import {
  secretFor,
  settingFor,
  type FieldBinding,
} from './WindowFieldBindings';

export function TextFieldControl({
  control, engine, bindings,
}: {
  control: Extract<WindowControl, { kind: 'field' }>;
  engine: NibGliderEngine;
  bindings: Record<string, FieldBinding>;
}) {
  const binding = settingFor(bindings, control.key);
  const [draft, setDraft] = useState<string | null>(null);
  const committed = binding ? String(binding.get(engine)) : '';
  const value = draft ?? committed;
  const commit = (text: string): void => {
    setDraft(null);
    if (!binding) return;
    if (control.fieldType === 'number') {
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) return;
      const lo = control.min ?? -Infinity;
      const hi = control.max ?? Infinity;
      binding.set(engine, Math.min(hi, Math.max(lo, parsed)));
      return;
    }
    binding.set(engine, text);
  };
  return (
    <div className="settings-row">
      <span className="settings-label">{control.label}</span>
      <input
        type={control.fieldType === 'number' ? 'number' : 'text'}
        className="settings-text"
        value={value}
        placeholder={control.placeholder}
        min={control.min}
        max={control.max}
        step={control.step}
        aria-label={control.label}
        disabled={!binding}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => { if (draft !== null) commit(event.target.value); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit((event.target as HTMLInputElement).value);
            (event.target as HTMLInputElement).blur();
          }
          event.stopPropagation();
        }}
      />
      {!binding && <span className="settings-unknown">Unknown setting: {control.key}</span>}
    </div>
  );
}

export function PasswordFieldControl({
  control, engine, bindings,
}: {
  control: Extract<WindowControl, { kind: 'field' }>;
  engine: NibGliderEngine;
  bindings: Record<string, FieldBinding>;
}) {
  const secret = secretFor(bindings, control.key);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const commit = (): void => {
    if (!secret || draft.length === 0) return;
    if (secret.commit(engine, draft)) {
      setDraft('');
      setSaved(true);
    }
  };
  return (
    <div className="settings-row">
      <span className="settings-label">{control.label}</span>
      <input
        type="password"
        className="settings-text"
        value={draft}
        placeholder={secret && secret.has(engine) ? '•••••••• (saved)' : (control.placeholder ?? '')}
        aria-label={control.label}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={!secret}
        onChange={(event) => { setDraft(event.target.value); setSaved(false); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          event.stopPropagation();
        }}
      />
      <button
        type="button"
        className="settings-toggle"
        disabled={!secret || draft.length === 0}
        onClick={commit}
      >
        {saved ? 'Saved' : 'Save'}
      </button>
      {!secret && <span className="settings-unknown">Unknown setting: {control.key}</span>}
    </div>
  );
}

export function FieldControl({
  control, engine, bindings,
}: {
  control: Extract<WindowControl, { kind: 'field' }>;
  engine: NibGliderEngine;
  bindings: Record<string, FieldBinding>;
}) {
  return control.fieldType === 'password'
    ? <PasswordFieldControl control={control} engine={engine} bindings={bindings} />
    : <TextFieldControl control={control} engine={engine} bindings={bindings} />;
}
