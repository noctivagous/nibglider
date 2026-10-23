// Shared XML-window field controls: text/number inputs bound to engine
// settings, and commit-only password inputs for secrets. Used by
// SettingsWindow and DocumentSettingsWindow so both hosts render <field>
// and <table> the same way. Password bindings are commit-only on purpose:
// hosts never display the stored value back, and secrets must stay out of
// persisted engine settings (memory-only, like the Printify token).
import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import type { WindowControl } from '../ui/windowXML';
import {
  secretFor,
  settingFor,
  type FieldBinding,
} from './WindowFieldBindings';

type FieldProps = {
  control: Extract<WindowControl, { kind: 'field' }>;
  engine: NibGliderEngine;
  bindings: Record<string, FieldBinding>;
};

/** The bare input widget(s) for one field, without any row or label
 * chrome. Shared by the standalone row controls and the table cells. */
export function FieldInput({ control, engine, bindings }: FieldProps) {
  const secret = control.fieldType === 'password' ? secretFor(bindings, control.key) : undefined;
  const binding = control.fieldType === 'password' ? undefined : settingFor(bindings, control.key);
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (control.fieldType === 'password') {
    const commit = (): void => {
      if (!secret || draft === null || draft.length === 0) return;
      if (secret.commit(engine, draft)) {
        setDraft(null);
        setSaved(true);
      }
    };
    const value = draft ?? '';
    return (
      <>
        <input
          type="password"
          className="settings-text"
          value={value}
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
          disabled={!secret || value.length === 0}
          onClick={commit}
        >
          {saved ? 'Saved' : 'Save'}
        </button>
        {!secret && <span className="settings-unknown">Unknown setting: {control.key}</span>}
      </>
    );
  }
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
    <>
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
    </>
  );
}

export function TextFieldControl({ control, engine, bindings }: FieldProps) {
  return (
    <div className="settings-row">
      <span className="settings-label">{control.label}</span>
      <FieldInput control={control} engine={engine} bindings={bindings} />
    </div>
  );
}

export function PasswordFieldControl({ control, engine, bindings }: FieldProps) {
  return (
    <div className="settings-row">
      <span className="settings-label">{control.label}</span>
      <FieldInput control={control} engine={engine} bindings={bindings} />
    </div>
  );
}

export function FieldControl({ control, engine, bindings }: FieldProps) {
  return control.fieldType === 'password'
    ? <PasswordFieldControl control={control} engine={engine} bindings={bindings} />
    : <TextFieldControl control={control} engine={engine} bindings={bindings} />;
}

/** The bare toggle button for one toggle row, without any row or label
 * chrome. The table cell shows On/Off; the row label sits in the label
 * column. Standalone rows keep their labeled buttons in the hosts. */
export function ToggleInput({
  control, engine, bindings,
}: {
  control: Extract<WindowControl, { kind: 'toggle' }>;
  engine: NibGliderEngine;
  bindings: Record<string, FieldBinding>;
}) {
  const binding = settingFor(bindings, control.key);
  const pressed = binding ? binding.get(engine) === true : false;
  return (
    <>
      <button
        type="button"
        className={pressed ? 'settings-toggle active' : 'settings-toggle'}
        aria-pressed={pressed}
        aria-label={control.label}
        disabled={!binding}
        onClick={() => binding?.set(engine, !pressed)}
      >
        {pressed ? 'On' : 'Off'}
      </button>
      {!binding && <span className="settings-unknown">Unknown setting: {control.key}</span>}
    </>
  );
}

/** A two-column parameter table: field labels in the left column, inputs
 * in the right column. The align attribute justifies the label column. */
export function TableControl({
  control, engine, bindings,
}: {
  control: Extract<WindowControl, { kind: 'table' }>;
  engine: NibGliderEngine;
  bindings: Record<string, FieldBinding>;
}) {
  return (
    <div className={`settings-table settings-table-labels-${control.align}`}>
      {control.rows.map((row) => (
        <div key={row.key} className="settings-table-row">
          <span className="settings-table-label">{row.label}</span>
          <span className="settings-table-cell">
            {row.kind === 'field'
              ? <FieldInput control={row} engine={engine} bindings={bindings} />
              : <ToggleInput control={row} engine={engine} bindings={bindings} />}
          </span>
        </div>
      ))}
    </div>
  );
}
