// On-screen keycap presentation.
// Owns nothing. Reads resolved caps from the shared keymap.
// Does not run commands or open popovers. Settings caps stay settings;
// only a clickable cap without settings reports a command click.
// Public: keycapClick, keycapViews.
// Tested from tests/ui-state.test.mjs.

import { schemaById } from '../engine/input/KeySettingsRegistry';
import type { ResolvedKeyCap } from '../engine/input/KeyboardLayoutResolver';

export type KeycapClick = 'settings' | 'command' | 'none';

export interface KeycapView {
  id: string;
  commandId: string | null;
  click: KeycapClick;
  settingsId: string | null;
}

export function keycapClick(def: ResolvedKeyCap): KeycapClick {
  if (def.settingsId && def.settingsSummary && schemaById(def.settingsId)) return 'settings';
  if (def.clickable && def.commandId) return 'command';
  return 'none';
}

export function keycapViews(caps: ResolvedKeyCap[]): KeycapView[] {
  return caps.map((def) => ({
    id: def.id,
    commandId: def.commandId ?? null,
    click: keycapClick(def),
    settingsId: keycapClick(def) === 'settings' ? def.settingsId ?? null : null,
  }));
}
