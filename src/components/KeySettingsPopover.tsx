import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import NumericStepper from './NumericStepper';
import type { KeySettingsSchema, SettingsTarget } from '../engine/input/KeySettingsRegistry';
import { settingsView } from '../engine/input/KeySettingsViewModel';

const MARGIN = 8;

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, input, select, textarea')].filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
  );
}

/**
 * Anchored settings dialog for one key schema.
 * Escape and a pointerdown outside the dialog or its anchor close it.
 * Escape is captured so it does not also cancel a drawing in progress.
 */
export default function KeySettingsPopover({
  schema,
  target,
  anchor,
  onClose,
}: {
  schema: KeySettingsSchema;
  target: SettingsTarget;
  anchor: HTMLElement;
  onClose: (reason: 'escape' | 'outside') => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const view = settingsView(schema, target);
  const titleId = `key-settings-title-${schema.id}`;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const width = dialog.offsetWidth;
      const height = dialog.offsetHeight;
      let top = a.top - height - MARGIN;
      if (top < MARGIN) top = a.bottom + MARGIN;
      top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN));
      let left = a.left + a.width / 2 - width / 2;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));
      dialog.style.top = `${top}px`;
      dialog.style.left = `${left}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, view.controls.length]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const first = focusableIn(dialog)[0];
    (first ?? dialog).focus();
  }, [schema.id]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose('escape');
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusableIn(dialog);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const node = event.target;
      if (!(node instanceof Node)) return;
      if (dialog.contains(node) || anchor.contains(node)) return;
      onClose('outside');
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={dialogRef}
      className="shape-params-flyout key-settings-popover"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <h2 id={titleId} className="key-settings-title">
        {view.title}
      </h2>
      <p className="key-settings-help">{view.help}</p>
      {view.controls.map((control) => {
        if (control.kind === 'number') {
          return (
            <label key={control.id} className="key-settings-row">
              <span>{control.label}</span>
              <NumericStepper
                value={control.value}
                min={control.min}
                max={control.max}
                step={control.step}
                decimals={control.decimals}
                unit={control.unit}
                size="medium"
                ariaLabel={control.label}
                title={control.help}
                onCommit={control.commit}
              />
            </label>
          );
        }
        if (control.kind === 'toggle') {
          return (
            <label key={control.id} className="key-settings-row key-settings-check">
              <input
                type="checkbox"
                checked={control.value}
                aria-label={control.label}
                onChange={(event) => control.commit(event.target.checked)}
              />
              <span>{control.label}</span>
            </label>
          );
        }
        if (control.kind === 'select') {
          return (
            <label key={control.id} className="key-settings-row">
              <span>{control.label}</span>
              <select
                aria-label={control.label}
                value={control.value}
                onChange={(event) => control.commit(event.target.value)}
              >
                {control.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={control.id} className="key-settings-row">
            <span>{control.label}</span>
            <input
              type="color"
              aria-label={control.label}
              value={control.value}
              onChange={(event) => control.commit(event.target.value)}
            />
          </label>
        );
      })}
    </div>,
    document.body,
  );
}
