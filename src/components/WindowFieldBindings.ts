// Binding contracts for XML-window <field> controls. Kept separate from
// WindowFieldControls so that file only exports components (fast refresh).
// Password bindings are commit-only on purpose: hosts never display the
// stored value back, and secrets must stay out of persisted engine settings
// (memory-only, like the Printify token).
import type { NibGliderEngine } from '../engine/engine';

export interface SettingBinding {
  get(engine: NibGliderEngine): string | boolean | number;
  set(engine: NibGliderEngine, value: string | boolean | number): void;
}

/** Commit-only secret binding for password fields. get is absent on
 * purpose: hosts must never display the stored value back. */
export interface SecretBinding {
  secret: true;
  has(engine: NibGliderEngine): boolean;
  commit(engine: NibGliderEngine, value: string): boolean;
}

export type FieldBinding = SettingBinding | SecretBinding;

/** A non-secret binding for a control key, or undefined when the key is
 * unbound or bound to a secret (secrets never drive text/number inputs). */
export function settingFor(
  bindings: Record<string, FieldBinding>,
  key: string,
): SettingBinding | undefined {
  const raw = bindings[key];
  return raw && !('secret' in raw) ? raw : undefined;
}

/** The secret binding for a control key, or undefined otherwise. */
export function secretFor(
  bindings: Record<string, FieldBinding>,
  key: string,
): SecretBinding | undefined {
  const raw = bindings[key];
  return raw && 'secret' in raw ? raw : undefined;
}
