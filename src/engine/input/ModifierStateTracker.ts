// Owns immutable physical modifier snapshots; no drawing state or commands.
// InputManager supplies key events and reset boundaries. Subscribers consume
// snapshots without owning listeners. Latched modifiers are intentionally
// separate and deferred until a touch command surface is implemented.
export interface ModifierChord {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly control: boolean;
  readonly meta: boolean;
}

export interface ModifierSnapshot extends ModifierChord {
  readonly capsLock: boolean;
}

export const BASE_MODIFIERS: ModifierSnapshot = Object.freeze({
  shift: false, alt: false, control: false, meta: false, capsLock: false,
});

export function modifiersOf(event: KeyboardEvent): ModifierSnapshot {
  return Object.freeze({
    shift: event.shiftKey, alt: event.altKey,
    control: event.ctrlKey, meta: event.metaKey,
    capsLock: event.getModifierState?.('CapsLock') ?? false,
  });
}

export class ModifierStateTracker {
  private snapshot = BASE_MODIFIERS;
  private listeners = new Set<() => void>();

  getSnapshot = (): ModifierSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  update(event: KeyboardEvent): void {
    this.publish(modifiersOf(event));
  }

  reset(): void {
    this.publish(BASE_MODIFIERS);
  }

  private publish(next: ModifierSnapshot): void {
    if ((Object.keys(next) as (keyof ModifierSnapshot)[])
      .every((key) => next[key] === this.snapshot[key])) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
