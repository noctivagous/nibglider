// Pure adapter shared by physical dispatch and React keyboard/status views.
// Reads only the keymap, immutable modifiers, platform, and a KeyState snapshot.
// It never mutates engine state or registers browser listeners.
import {
  KEYBOARD_LAYOUTS, KEY_VARIANTS, capsForLayout, isReservedLayoutKey, layoutIdForState,
  physicalKey, variantTableKey, variantsForLayout,
  type KeyCap, type KeyCommandVariant, type KeyState, type KeyboardPlatform,
} from './keymap';
import type { ModifierSnapshot } from './ModifierStateTracker';

function matchInTable(
  table: Map<string, KeyCommandVariant[]>,
  key: string,
  state: KeyState,
): KeyCommandVariant[] {
  const variants: KeyCommandVariant[] = [];
  for (const variant of table.get(key) ?? []) {
    if (!variant.when(state)) continue;
    variants.push(variant);
    if (variant.command.exclusive) break;
  }
  return variants;
}

export function resolveKeyVariants(
  code: string,
  modifiers: ModifierSnapshot,
  state: KeyState,
): KeyCommandVariant[] {
  // Type At Cursor owns the keyboard: physical dispatch never reaches here
  // while typing (the controller branches first), so no command resolves —
  // keeping the on-screen caps and chord rows honest.
  if (state.isTypingText) return [];
  // Layouts overlay: the active layout wins on its caps. Partial layouts
  // fall back to base for unmatched caps (End/Cancel/Undo keep working
  // mid-draw); full layouts ("empty and assign") blank them, except the
  // layout-wide reserved codes, which always resolve from base.
  const layout = layoutIdForState(state);
  const key = variantTableKey(code, modifiers);
  const own = matchInTable(variantsForLayout(layout), key, state);
  if (own.length > 0 || layout === 'base') return own;
  if (KEYBOARD_LAYOUTS[layout].overlay === 'full' && !isReservedLayoutKey(key)) return [];
  return matchInTable(variantsForLayout('base'), key, state);
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
  return capsForLayout(layoutIdForState(state)).map((cap) => resolveKeyCap(cap, modifiers, platform, state));
}


export function eventCode(event: KeyboardEvent): string {
  if (event.code) return event.code;
  return KEY_VARIANTS.find((variant) => physicalKey(variant.code) === event.key.toLowerCase())?.code ?? '';
}
