import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface CustomSelectOption {
  value: string;
  label: string;
  /** Thumbnail/icon rendered in the trigger and the list item. */
  image?: ReactNode;
  /** Presence of children makes the row an expandable tree parent. */
  children?: CustomSelectOption[];
}

interface FlatRow {
  option: CustomSelectOption;
  depth: number;
  isParent: boolean;
}

function findPath(
  options: CustomSelectOption[],
  value: string,
  trail: CustomSelectOption[] = [],
): CustomSelectOption[] | null {
  for (const o of options) {
    if (!o.children && o.value === value) return [...trail, o];
    if (o.children) {
      const hit = findPath(o.children, value, [...trail, o]);
      if (hit) return hit;
    }
  }
  return null;
}

export default function CustomSelect({
  id,
  ariaLabel,
  value,
  options,
  onChange,
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const path = findPath(options, value);
    return new Set((path ?? []).slice(0, -1).map((o) => o.value));
  });
  const [focusIdx, setFocusIdx] = useState(0);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0, minWidth: 180 });
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Ancestors of the current value are always revealed, so an
  // outside value change can never hide inside a collapsed branch.
  const valueAncestors = useMemo(() => {
    const path = findPath(options, value);
    return new Set((path ?? []).slice(0, -1).map((o) => o.value));
  }, [options, value]);
  const effectiveExpanded = useMemo(
    () => new Set([...expanded, ...valueAncestors]),
    [expanded, valueAncestors],
  );

  const rows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    const walk = (opts: CustomSelectOption[], depth: number) => {
      for (const o of opts) {
        const isParent = !!o.children?.length;
        out.push({ option: o, depth, isParent });
        if (isParent && effectiveExpanded.has(o.value))
          walk(o.children!, depth + 1);
      }
    };
    walk(options, 0);
    return out;
  }, [options, effectiveExpanded]);

  const selectedLeaf = useMemo(
    () => findPath(options, value)?.at(-1) ?? null,
    [options, value],
  );



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
    const selIdx = rows.findIndex((r) => !r.isParent && r.option.value === value);
    setFocusIdx(selIdx >= 0 ? selIdx : 0);
    setOpen(true);
  };

  const closeMenu = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    const onViewportShift = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onViewportShift, true);
    window.addEventListener('resize', onViewportShift);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onViewportShift, true);
      window.removeEventListener('resize', onViewportShift);
    };
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector(`[data-idx="${focusIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, focusIdx]);

  const toggleParent = (v: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const activateRow = (idx: number) => {
    const row = rows[idx];
    if (!row) return;
    if (row.isParent) toggleParent(row.option.value);
    else choose(row.option.value);
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIdx(rows.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateRow(focusIdx);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <span ref={rootRef} className="custom-select" id={id}>
      <button
        ref={triggerRef}
        type="button"
        className="custom-select-trigger"
        aria-haspopup="tree"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (open) closeMenu(false);
          else openMenu();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openMenu();
          }
        }}
      >
        {selectedLeaf?.image && (
          <span className="cs-image" aria-hidden="true">
            {selectedLeaf.image}
          </span>
        )}
        <span className="cs-trigger-label">{selectedLeaf?.label ?? ''}</span>
        <span className={`cs-caret${open ? ' open' : ''}`} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="custom-select-menu"
            role="tree"
            aria-label={ariaLabel}
            tabIndex={-1}
            style={{
              left: menuPos.left,
              top: menuPos.top,
              minWidth: menuPos.minWidth,
            }}
            onKeyDown={onMenuKeyDown}
          >
            {rows.map((row, i) => (
              <div
                key={row.option.value}
                role="treeitem"
                data-idx={i}
                aria-selected={!row.isParent && row.option.value === value}
                aria-expanded={
                  row.isParent ? expanded.has(row.option.value) : undefined
                }
                className={
                  'cs-item' +
                  (row.isParent ? ' cs-parent' : '') +
                  (!row.isParent && row.option.value === value
                    ? ' selected'
                    : '') +
                  (i === focusIdx ? ' focused' : '')
                }
                style={{ paddingLeft: 8 + row.depth * 16 }}
                onMouseEnter={() => setFocusIdx(i)}
                onClick={() => activateRow(i)}
              >
                {row.isParent && (
                  <span
                    className={
                      'cs-caret' +
                      (expanded.has(row.option.value) ? ' open' : '')
                    }
                    aria-hidden="true"
                  />
                )}
                {row.option.image && (
                  <span className="cs-image" aria-hidden="true">
                    {row.option.image}
                  </span>
                )}
                <span className="cs-label">{row.option.label}</span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
