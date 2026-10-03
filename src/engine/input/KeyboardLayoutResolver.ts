// Pure adapter shared by physical dispatch and React keyboard/status views.
// Reads only the keymap, immutable modifiers, platform, and a KeyState snapshot.
// It never mutates engine state or registers browser listeners.
import {
  KEY_CAPS, KEY_VARIANTS, physicalKey, type KeyCap, type KeyCommandVariant,
  type KeyState, type KeyboardPlatform,
} from './keymap';
import type { ModifierSnapshot } from './ModifierStateTracker';

export function resolveKeyVariants(
  code: string,
  modifiers: ModifierSnapshot,
  state: KeyState,
): KeyCommandVariant[] {
  const variants: KeyCommandVariant[] = [];
  for (const variant of KEY_VARIANTS) {
    if (variant.code !== code) continue;
    if (variant.chord.shift !== modifiers.shift || variant.chord.alt !== modifiers.alt ||
      variant.chord.control !== modifiers.control || variant.chord.meta !== modifiers.meta) continue;
    if (!variant.when(state)) continue;
    variants.push(variant);
    if (variant.command.exclusive) break;
  }
  return variants;
}

export interface ResolvedKeyCap extends KeyCap {
  description: string;
  available: boolean;
  settingsId?: string;
  settingsSummary?: string;
  variant?: KeyCommandVariant;
}

export function resolveKeyCap(
  cap: KeyCap,
  modifiers: ModifierSnapshot,
  platform: KeyboardPlatform,
  state: KeyState,
): ResolvedKeyCap {
  const modifierLabel: Record<string, string> = {
    ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', CapsLock: 'CAPS LOCK',
    AltLeft: platform === 'mac' ? 'OPTION' : 'ALT',
    ControlLeft: 'CONTROL', MetaLeft: platform === 'mac' ? 'COMMAND' : 'META',
  };
  if (modifierLabel[cap.id]) {
    return { ...cap, legend: modifierLabel[cap.id], description: modifierLabel[cap.id], available: true };
  }
  const variant = resolveKeyVariants(cap.id, modifiers, state)[0];
  if (!variant) return {
    ...cap, commandId: undefined, legend: '', description: 'No command for this chord',
    badge: undefined, clickable: false, available: false,
  };
  const command = variant.command;
  const presentation = variant.present(state, modifiers, platform);
  const settingsAvailable = !command.settingsAvailability || command.settingsAvailability(state);
  return {
    ...cap, commandId: variant.commandId, ...presentation,
    available: true, variant,
    settingsId: settingsAvailable ? command.settingsId : undefined,
    settingsSummary: settingsAvailable ? command.settingsSummary : undefined,
    // Preserve the status cap's established clickable behavior only for its command.
    clickable: cap.clickable && variant.commandId === cap.commandId,
    badge: variant.commandId === cap.commandId ? cap.badge : undefined,
  };
}

export function resolveKeyboardLayout(
  modifiers: ModifierSnapshot, platform: KeyboardPlatform, state: KeyState,
): ResolvedKeyCap[] {
  return KEY_CAPS.map((cap) => resolveKeyCap(cap, modifiers, platform, state));
}

export function eventCode(event: KeyboardEvent): string {
  if (event.code) return event.code;
  return KEY_VARIANTS.find((variant) => physicalKey(variant.code) === event.key.toLowerCase())?.code ?? '';
}
