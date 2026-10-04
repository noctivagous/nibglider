import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  SELECT_MENU_OPEN_EVENT,
  selectMenuDismissed,
  selectMenuOpened,
  selectMenuTriggerClicked,
  shouldDismissOnCursorExit,
  type SelectMenuOpenTrigger,
} from './selectMenuPolicy';

export interface CustomSelectOption {
  value: string;
  label: string;
  /** Thumbnail/icon rendered in the trigger and the list item. */
  image?: ReactNode;
  /** Presence of children makes the row an expandable tree parent. */
  children?: CustomSelectOption[];
  /** Non-interactive group header separating grouped areas of a menu. */
  header?: boolean;
  /** Right-aligned keyboard shortcut chip shown next to the label. */
  shortcut?: string;
  /** Disabled rows render dimmed and cannot be chosen. */
  disabled?: boolean;
  /** Native tooltip for the row (e.g. why a future item is disabled). */
  title?: string;
  /** Card rows render as beveled grid buttons under the preceding header. */
  card?: boolean;
  /** On a header: column count for the card grid that follows it. */
  columns?: number;
}

interface FlatRow {
  option: CustomSelectOption;
  depth: number;
  isParent: boolean;
  isHeader: boolean;
}

function findPath(
  options: CustomSelectOption[],
  value: string,
  trail: CustomSelectOption[] = [],
): CustomSelectOption[] | null {
  for (const o of options) {
    if (o.header) continue;
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
  openOnHover = false,
  onHoverOpen,
  forceCloseKey,
  stickyOnClick = false,
  placeholder,
}: {
  id?: string;
  ariaLabel: string;
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  /** Opt-in hover-open (panel selects only): mirrors preview-flyout hover rules. */
  openOnHover?: boolean;
  /** Fired when hover opens the menu so the parent can close other popups. */
  onHoverOpen?: () => void;
  /** Changing value forces the menu closed (single-open invariant). */
  forceCloseKey?: number;
  /**
   * Label shown on the trigger button. Application menus use this for the
   * button name (File, Document, …) so the name itself is not repeated as a
   * row in the menu list. Otherwise the selected option's label is shown.
   */
  placeholder?: string;
  /**
   * Application menus only: a click pins the menu so cursor exit no longer
   * dismisses it. Hover-opened menus still hide on cursor exit.
   */
  stickyOnClick?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const fallbackId = useId();
  const menuId = id ?? fallbackId;
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const path = findPath(options, value);
    return new Set((path ?? []).slice(0, -1).map((o) => o.value));
  });
  const [focusIdx, setFocusIdx] = useState(0);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0, minWidth: 180 });
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Remembers how the menu was opened so DOM focus only follows an explicit
  // keyboard open. Hover/click opens must not steal focus: the menu's
  // mouse-leave guard treats focus-inside as keyboard navigation holding the
  // menu open, and focusing on every open would suppress cursor-exit
  // dismissal for mouse users entirely.
  const openTriggerRef = useRef<SelectMenuOpenTrigger>('hover');
  // Hover-open timer: same 180ms delayed-close idiom as the panel
  // preview flyouts, so the pointer can travel trigger -> menu.
  const hoverCloseTimer = useRef<number | null>(null);
  const cancelHoverClose = () => {
    if (hoverCloseTimer.current !== null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  };
  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverCloseTimer.current = window.setTimeout(() => {
      hoverCloseTimer.current = null;
      setOpen(false);
    }, 180);
  };
  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current !== null) {
        window.clearTimeout(hoverCloseTimer.current);
        hoverCloseTimer.current = null;
      }
    };
  }, []);
  // Parent bumps this to enforce a single open popup.
  useEffect(() => {
    if (forceCloseKey === undefined) return;
    cancelHoverClose();
    const next = selectMenuDismissed();
    setOpen(next.open);
    setPinned(next.pinned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceCloseKey]);
  // A pinned (clicked) application menu yields when a sibling menu opens,
  // keeping the single-open invariant that the hover-close timer otherwise
  // provides. Non-sticky menus keep their existing timer behavior.
  useEffect(() => {
    if (!stickyOnClick) return;
    const onSiblingOpen = (e: Event) => {
      if ((e as CustomEvent<{ id: string }>).detail?.id === menuId) return;
      if (hoverCloseTimer.current !== null) {
        window.clearTimeout(hoverCloseTimer.current);
        hoverCloseTimer.current = null;
      }
      const next = selectMenuDismissed();
      setOpen(next.open);
      setPinned(next.pinned);
    };
    window.addEventListener(SELECT_MENU_OPEN_EVENT, onSiblingOpen);
    return () => window.removeEventListener(SELECT_MENU_OPEN_EVENT, onSiblingOpen);
  }, [stickyOnClick, menuId]);

  // Ancestors of the current value join the expanded set (instead of
  // overriding it at render time), so an outside value change still
  // reveals its branch — while a manual toggle always wins and the caret
  // always matches what is actually visible. Single source of truth.
  useEffect(() => {
    const path = findPath(options, value);
    if (!path) return;
    const ancestors = path.slice(0, -1).map((o) => o.value);
    if (ancestors.length === 0) return;
    setExpanded((prev) => {
      if (ancestors.every((a) => prev.has(a))) return prev;
      return new Set([...prev, ...ancestors]);
    });
  }, [options, value]);

  const rows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    const walk = (opts: CustomSelectOption[], depth: number) => {
      for (const o of opts) {
        const isHeader = !!o.header;
        const isParent = !isHeader && !!o.children?.length;
        out.push({ option: o, depth, isParent, isHeader });
        if (isParent && expanded.has(o.value)) walk(o.children!, depth + 1);
      }
    };
    walk(options, 0);
    return out;
  }, [options, expanded]);

  // Group headers are never focus targets: Arrow/Home/End skip them.
  const stepFocus = (from: number, dir: -1 | 1): number => {
    let i = from + dir;
    while (i >= 0 && i < rows.length && rows[i].isHeader) i += dir;
    if (i < 0 || i >= rows.length) return from;
    return i;
  };
  const edgeFocus = (dir: -1 | 1): number => {
    const i = dir < 0 ? 0 : rows.length - 1;
    if (rows.length === 0) return 0;
    if (!rows[i].isHeader) return i;
    return stepFocus(i, dir < 0 ? 1 : -1);
  };

  const selectedLeaf = useMemo(
    () => findPath(options, value)?.at(-1) ?? null,
    [options, value],
  );



  const openMenu = (trigger: SelectMenuOpenTrigger = 'hover') => {
    window.dispatchEvent(
      new CustomEvent(SELECT_MENU_OPEN_EVENT, { detail: { id: menuId } }),
    );
    openTriggerRef.current = trigger;
    setPinned(selectMenuOpened(stickyOnClick, trigger).pinned);
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setMenuPos({
        left: Math.max(4, Math.min(r.left, window.innerWidth - 248)),
        top: r.bottom + 4,
        minWidth: Math.max(r.width, 180),
      });
    }
    const selIdx = rows.findIndex(
      (r) => !r.isParent && !r.isHeader && !r.option.disabled && r.option.value === value,
    );
    if (selIdx >= 0) {
      setFocusIdx(selIdx);
    } else {
      const first = rows.findIndex((r) => !r.isParent && !r.isHeader && !r.option.disabled);
      setFocusIdx(first >= 0 ? first : edgeFocus(1));
    }
    setOpen(true);
  };

  const closeMenu = (refocus: boolean) => {
    const next = selectMenuDismissed();
    setOpen(next.open);
    setPinned(next.pinned);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Keyboard opens move focus into the menu for arrow/Enter navigation
    // (and the focus-inside guard then holds it open past mouse slips).
    // Hover/click opens leave focus alone so cursor exit can dismiss.
    if (openTriggerRef.current === 'keyboard') menuRef.current?.focus();
    const dismiss = () => {
      const next = selectMenuDismissed();
      setOpen(next.open);
      setPinned(next.pinned);
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        dismiss();
      }
    };
    // A scroll inside the menu itself (wheel, trackpad, or dragging its
    // scrollbar) must not close it — only a viewport shift behind it.
    const onViewportShift = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      dismiss();
    };
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
    const target = rows.find((r) => !r.isHeader && !r.isParent && r.option.value === v);
    if (!target || target.option.disabled) return;
    onChange(v);
    const next = selectMenuDismissed();
    setOpen(next.open);
    setPinned(next.pinned);
    triggerRef.current?.focus();
  };

  const activateRow = (idx: number) => {
    const row = rows[idx];
    if (!row || row.isHeader || row.option.disabled) return;
    if (row.isParent) toggleParent(row.option.value);
    else choose(row.option.value);
  };

  // While the menu has focus, canvas/global shortcuts must not fire
  // (e.g. Space toggling drag-lock, Escape cancelling a drawing, or a
  // letter starting a new shape). Tab keeps its default focus move.
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => stepFocus(i, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => stepFocus(i, -1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIdx(edgeFocus(-1));
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIdx(edgeFocus(1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateRow(focusIdx);
    } else if (e.key === 'Tab') {
      const next = selectMenuDismissed();
      setOpen(next.open);
      setPinned(next.pinned);
    }
  };

  const hoverWantsMouse = () => {
    if (!openOnHover) return false;
    if (window.matchMedia?.('(hover: none)').matches) return false;
    return true;
  };
  const handleTriggerMouseEnter = () => {
    if (!hoverWantsMouse()) return;
    cancelHoverClose();
    // Re-hovering an open menu must not re-run openMenu: a hover open would
    // clear a click pin and drop the stuck menu on the next cursor exit.
    if (!open) openMenu();
    onHoverOpen?.();
  };
  const handleTriggerMouseLeave = () => {
    // A clicked (pinned) application menu sticks past cursor exit.
    if (
      !shouldDismissOnCursorExit({
        openOnHover,
        stickyOnClick,
        snapshot: { open, pinned },
        focusWithinMenu: false,
      })
    ) {
      return;
    }
    scheduleHoverClose();
  };

  return (
    <span ref={rootRef} className="custom-select" id={id}>
      <button
        ref={triggerRef}
        type="button"
        className={'custom-select-trigger' + (open ? ' open' : '')}
        aria-haspopup="tree"
        aria-expanded={open}
        aria-label={ariaLabel}
        onMouseEnter={handleTriggerMouseEnter}
        onMouseLeave={handleTriggerMouseLeave}
        onClick={() => {
          // Plain menus toggle. A sticky application menu pins on click:
          // clicking a hover-opened menu sticks it, clicking again unpins.
          const next = selectMenuTriggerClicked({ open, pinned }, stickyOnClick);
          if (next.open && !open) {
            openMenu('click');
            return;
          }
          if (next.pinned) cancelHoverClose();
          setOpen(next.open);
          setPinned(next.pinned);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            openMenu('keyboard');
          }
        }}
      >
        {selectedLeaf?.image && (
          <span className="cs-image" aria-hidden="true">
            {selectedLeaf.image}
          </span>
        )}
        <span className="cs-trigger-label">{placeholder ?? selectedLeaf?.label ?? ''}</span>
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
            onMouseEnter={() => {
              if (openOnHover) cancelHoverClose();
            }}
            onMouseLeave={() => {
              // Keyboard focus inside the menu pins it open past a mouse
              // slip; a clicked (pinned) application menu sticks as well.
              if (
                !shouldDismissOnCursorExit({
                  openOnHover,
                  stickyOnClick,
                  snapshot: { open, pinned },
                  focusWithinMenu:
                    menuRef.current?.contains(document.activeElement) ?? false,
                })
              ) {
                return;
              }
              scheduleHoverClose();
            }}
          >
            {(() => {
              const renderItem = (row: FlatRow, i: number) => (
                <div
                  key={row.option.value}
                  role="treeitem"
                  data-idx={i}
                  aria-selected={!row.isParent && row.option.value === value}
                  aria-disabled={row.option.disabled || undefined}
                  aria-expanded={
                    row.isParent ? expanded.has(row.option.value) : undefined
                  }
                  title={row.option.title}
                  className={
                    'cs-item' +
                    (row.isParent ? ' cs-parent' : '') +
                    (row.option.card ? ' cs-card' : '') +
                    (!row.isParent && row.option.value === value
                      ? ' selected'
                      : '') +
                    (i === focusIdx ? ' focused' : '') +
                    (row.option.disabled ? ' disabled' : '')
                  }
                  style={row.option.card ? undefined : { paddingLeft: 8 + row.depth * 16 }}
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
                  {row.option.shortcut && (
                    <span className="cs-shortcut">
                      <kbd>{row.option.shortcut}</kbd>
                    </span>
                  )}
                </div>
              );
              // Consecutive card leaves share one grid whose column count
              // comes from the nearest preceding header (default 2).
              const nodes: ReactNode[] = [];
              let cards: Array<{ row: FlatRow; i: number }> = [];
              let gridCols = 2;
              const flushCards = () => {
                if (cards.length === 0) return;
                nodes.push(
                  <div
                    key={`cards-${cards[0].i}`}
                    className="cs-card-grid"
                    role="group"
                    style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
                  >
                    {cards.map(({ row, i }) => renderItem(row, i))}
                  </div>,
                );
                cards = [];
              };
              rows.forEach((row, i) => {
                if (row.isHeader) {
                  flushCards();
                  if (typeof row.option.columns === 'number' && row.option.columns > 0) {
                    gridCols = Math.min(4, Math.floor(row.option.columns));
                  }
                  nodes.push(
                    <div
                      key={row.option.value}
                      role="presentation"
                      className="cs-group"
                      style={{ paddingLeft: 8 + row.depth * 16 }}
                    >
                      <span className="cs-group-label">{row.option.label}</span>
                    </div>,
                  );
                  return;
                }
                if (row.option.card && !row.isParent) {
                  cards.push({ row, i });
                  return;
                }
                flushCards();
                nodes.push(renderItem(row, i));
              });
              flushCards();
              return nodes;
            })()}
          </div>,
          document.body,
        )}
    </span>
  );
}
