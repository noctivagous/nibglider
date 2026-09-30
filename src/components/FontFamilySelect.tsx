import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface FontFamilyOption {
  /** Value stored on the engine text spec (fontFamily). */
  value: string;
  /** Display name shown in the trigger and the list. */
  label: string;
  /** CSS font-family used to preview this entry in its own typeface. */
  family: string;
  /** Optional preview weight (defaults to inherited). */
  weight?: string | number;
}

export interface FontFamilyGroup {
  label: string;
  fonts: FontFamilyOption[];
}

// Port of banner-studio's FontSelect dropdown (grouped list, each entry
// previewed in its own typeface, wrap-around keyboard navigation), adapted
// for nibglider: the menu portals to document.body with fixed positioning
// (the Text flyout scrolls, so an inline menu would clip) and key events
// stop propagation so canvas shortcuts never fire while picking a font.
export default function FontFamilySelect({
  id,
  ariaLabel,
  value,
  groups,
  onChange,
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  groups: FontFamilyGroup[];
  onChange: (value: string) => void;
}) {
  const live = groups.filter((g) => g.fonts.length > 0);
  const flat = live.flatMap((g) => g.fonts);
  const indexOf = new Map(flat.map((f, i) => [f.value, i]));
  const current = flat.find((f) => f.value === value) ?? flat[0];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0, minWidth: 180 });
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setMenuPos({
        left: Math.max(4, Math.min(r.left, window.innerWidth - 248)),
        top: r.bottom + 4,
        minWidth: Math.max(r.width, 180),
      });
    }
    setActive(indexOf.get(value) ?? 0);
    setOpen(true);
  };

  const closeMenu = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    setActive(indexOf.get(value) ?? 0);
    menuRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    // A scroll inside the menu itself (wheel, trackpad, or dragging its
    // scrollbar) must not close it — only a viewport shift behind it.
    const onViewportShift = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onViewportShift, true);
    window.addEventListener('resize', onViewportShift);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onViewportShift, true);
      window.removeEventListener('resize', onViewportShift);
    };
    // Re-sync the highlight when the value changes from outside while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // While the menu has focus, canvas/global shortcuts must not fire.
  // Tab keeps its default focus move.
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + flat.length) % flat.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(flat.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const f = flat[active];
      if (f) choose(f.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <span ref={rootRef} className="font-select" id={id}>
      <button
        ref={triggerRef}
        type="button"
        className="font-select-trigger"
        role="combobox"
        aria-expanded={open}
        aria-controls="font-family-listbox"
        aria-activedescendant={open ? `font-opt-${flat[active]?.value}` : undefined}
        aria-label={ariaLabel}
        onClick={() => {
          if (open) closeMenu(false);
          else openMenu();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            openMenu();
          }
        }}
        style={
          current
            ? { fontFamily: `"${current.family}", sans-serif` }
            : undefined
        }
      >
        <span className="fs-trigger-label">{current?.label ?? ''}</span>
        <span className={`cs-caret${open ? ' open' : ''}`} aria-hidden="true" />
      </button>
      {open &&
        current &&
        createPortal(
          <div
            ref={menuRef}
            id="font-family-listbox"
            className="font-select-menu"
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            style={{
              left: menuPos.left,
              top: menuPos.top,
              minWidth: menuPos.minWidth,
            }}
            onKeyDown={onMenuKeyDown}
          >
            {live.map((g) => (
              <div key={g.label} role="presentation" className="fs-group">
                <div aria-hidden="true" className="fs-group-header">
                  <span className="fs-group-label">{g.label}</span>
                  <span className="fs-group-rule" />
                </div>
                {g.fonts.map((f) => {
                  const i = indexOf.get(f.value) ?? 0;
                  const selected = f.value === value;
                  return (
                    <button
                      id={`font-opt-${f.value}`}
                      key={f.value}
                      type="button"
                      role="option"
                      data-index={i}
                      aria-selected={selected}
                      onClick={() => choose(f.value)}
                      onMouseEnter={() => setActive(i)}
                      className={
                        'fs-item' +
                        (i === active ? ' focused' : '') +
                        (selected ? ' selected' : '')
                      }
                    >
                      <span
                        className="fs-item-label"
                        style={{
                          fontFamily: `"${f.family}", sans-serif`,
                          fontWeight: f.weight ?? 'inherit',
                        }}
                      >
                        {f.label}
                      </span>
                      {selected && (
                        <span aria-hidden="true" className="fs-check">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
