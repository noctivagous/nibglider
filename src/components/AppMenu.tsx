// Application menu bar. Renders menu definitions (PanelsManager
// APPLICATION_MENUS) as dropdown menus; items dispatch through onCommand and
// items without a wired handler render disabled. Owns its open-menu,
// row-focus, and submenu state: mouse hover and arrow keys share one
// `focused` highlight (accent-soft, like the rail's CustomSelect), Enter
// activates, Escape closes, Left/Right move between menus. Rows whose
// command is in checkedCommands carry a check glyph (toggle and option
// state); rows with children expand into a flyout submenu. Tested indirectly
// through App wiring; menu defs from tests/ui-state.test.mjs, stepping rules
// from tests/menu-navigation.test.mjs.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MenuDef, MenuItemDef } from '../ui/PanelsManager';
import { stepFocus } from '../ui/menuNavigation';

function commandLabel(commandId: string): string {
  return commandId
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// File-menu glyphs, mirroring the vertical rail's card icons (ControlPanel)
// so the horizontal menu carries the same artwork to the left of each label.
function FileMenuGlyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 5.5 L4 8 L8.5 2.5" />
    </svg>
  );
}

const MENU_ICONS: Record<string, ReactNode> = {
  open: (
    <FileMenuGlyph>
      <path d="M3 7 h6 l2 2 h10 v9 H3 Z" />
      <path d="M3 7 v10" />
    </FileMenuGlyph>
  ),
  new: (
    <FileMenuGlyph>
      <path d="M7 3 h7 l4 4 v14 H7 Z" />
      <path d="M12 11 v6 M9 14 h6" />
    </FileMenuGlyph>
  ),
  save: (
    <FileMenuGlyph>
      <path d="M5 4 h11 l3 3 v13 H5 Z" />
      <path d="M8 4 v5 h7 V4" />
      <path d="M8 20 v-6 h8 v6" />
    </FileMenuGlyph>
  ),
  rename: (
    <FileMenuGlyph>
      <path d="M4 20 l1 -4 L16 5 l3 3 L8 19 Z" />
      <path d="M14 7 l3 3" />
    </FileMenuGlyph>
  ),
  export: (
    <FileMenuGlyph>
      <path d="M4 14 v6 h16 v-6" />
      <path d="M12 3 v10 M8 7 l4 -4 4 4" />
    </FileMenuGlyph>
  ),
  import: (
    <FileMenuGlyph>
      <path d="M4 14 v6 h16 v-6" />
      <path d="M12 4 v10 M8 10 l4 4 4 -4" />
    </FileMenuGlyph>
  ),
};

/** No checked rows; default so callers without live state pass nothing. */
const NO_CHECKS: Set<string> = new Set();

function rowId(menuId: string, commandId: string): string {
  return `appmenu-${menuId}-${commandId}`;
}

interface MenuRow {
  item: MenuItemDef;
  parent: MenuItemDef | null;
}

export default function AppMenu({
  menus,
  enabledCommands,
  checkedCommands = NO_CHECKS,
  onCommand,
}: {
  menus: MenuDef[];
  /** Commands with a wired handler; everything else renders disabled. */
  enabledCommands: Set<string>;
  /** Commands currently active; their rows carry a check glyph. */
  checkedCommands?: Set<string>;
  onCommand: (commandId: string) => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());

  const openMenuTo = (menuId: string | null): void => {
    setOpenMenu(menuId);
    setFocusIdx(-1);
    setOpenSub(null);
  };

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) openMenuTo(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') openMenuTo(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  return (
    <div ref={barRef} className="app-menu-bar" role="menubar" aria-label="Application">
      {menus.map((menu, menuIndex) => {
        const isOpen = openMenu === menu.id;
        // Visible rows: headers and items in order, with the open submenu's
        // options spliced after their parent. focusIdx addresses this list.
        const rows: MenuRow[] = [];
        for (const item of menu.items) {
          rows.push({ item, parent: null });
          if (item.children && openSub === item.commandId) {
            for (const child of item.children) rows.push({ item: child, parent: item });
          }
        }
        const rowItems = rows.map((row) => row.item);
        const step = (from: number, dir: 1 | -1): void => {
          setFocusIdx(stepFocus(rowItems, enabledCommands, from, dir));
        };
        const activateRow = (rowIdx: number): void => {
          const row = rows[rowIdx];
          if (!row || row.item.header) return;
          if (row.parent === null && row.item.children) {
            // Parent rows expand; their own command never dispatches.
            setOpenSub(row.item.commandId);
            const firstChild = rows.findIndex((r) => r.parent === row.item);
            if (firstChild >= 0) setFocusIdx(firstChild);
            return;
          }
          if (!enabledCommands.has(row.item.commandId)) return;
          openMenuTo(null);
          onCommand(row.item.commandId);
        };
        const collapseSub = (): void => {
          const parentIdx = rows.findIndex((row) => row.parent === null && row.item.commandId === openSub);
          setOpenSub(null);
          setFocusIdx(parentIdx);
        };
        const focusedId = isOpen && focusIdx >= 0 && rows[focusIdx] && !rows[focusIdx].item.header
          ? rowId(menu.id, rows[focusIdx].item.commandId)
          : undefined;
        return (
        <div key={menu.id} className="app-menu">
          <button
            ref={(el) => {
              if (el) triggerRefs.current.set(menu.id, el);
              else triggerRefs.current.delete(menu.id);
            }}
            type="button"
            className={isOpen ? 'app-menu-trigger open' : 'app-menu-trigger'}
            data-tutorial-id={`menu-${menu.id}`}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-activedescendant={focusedId}
            aria-controls={isOpen ? `appmenu-dropdown-${menu.id}` : undefined}
            onClick={() => openMenuTo(isOpen ? null : menu.id)}
            onMouseEnter={() => {
              if (openMenu && !isOpen) openMenuTo(menu.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!isOpen) {
                  setOpenMenu(menu.id);
                  setFocusIdx(stepFocus(rowItems, enabledCommands, -1, e.key === 'ArrowDown' ? 1 : -1));
                } else {
                  step(focusIdx, e.key === 'ArrowDown' ? 1 : -1);
                }
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (isOpen && focusIdx >= 0) activateRow(focusIdx);
                else openMenuTo(menu.id);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                if (openSub !== null) collapseSub();
                else openMenuTo(null);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const row = focusIdx >= 0 ? rows[focusIdx] : null;
                if (e.key === 'ArrowRight' && row && row.parent === null && row.item.children && openSub !== row.item.commandId) {
                  activateRow(focusIdx);
                } else if (e.key === 'ArrowLeft' && row && row.parent !== null) {
                  collapseSub();
                } else {
                  const next = menus[(menuIndex + (e.key === 'ArrowRight' ? 1 : menus.length - 1)) % menus.length];
                  if (next) {
                    openMenuTo(next.id);
                    triggerRefs.current.get(next.id)?.focus();
                  }
                }
              }
            }}
          >
            {menu.title}
          </button>
          {isOpen && (
            <div
              id={`appmenu-dropdown-${menu.id}`}
              className="app-menu-dropdown"
              role="menu"
              aria-label={menu.title}
              onMouseLeave={() => {
                setFocusIdx(-1);
                setOpenSub(null);
              }}
            >
              {rows.map((row, rowIdx) => {
                const { item } = row;
                if (item.header) {
                  return (
                    <div key={item.commandId}>
                      {rowIdx > 0 && <div className="app-menu-sep" role="separator" />}
                      <div className="app-menu-group" role="presentation">
                        <span>{item.label ?? commandLabel(item.commandId)}</span>
                      </div>
                    </div>
                  );
                }
                if (row.parent !== null) return null;
                const enabled = enabledCommands.has(item.commandId);
                const isParent = !!item.children;
                const expanded = openSub === item.commandId;
                const childIndexes = rows
                  .map((r, i) => ({ row: r, index: i }))
                  .filter(({ row: r }) => r.parent === item);
                return (
                  <div key={item.commandId} className="app-menu-parent">
                    <button
                      id={rowId(menu.id, item.commandId)}
                      type="button"
                      role="menuitem"
                      className={rowIdx === focusIdx ? 'app-menu-item focused' : 'app-menu-item'}
                      disabled={!enabled}
                      aria-disabled={!enabled}
                      aria-haspopup={isParent || undefined}
                      aria-expanded={isParent ? expanded : undefined}
                      tabIndex={-1}
                      onMouseEnter={() => {
                        setFocusIdx(rowIdx);
                        if (isParent) setOpenSub(item.commandId);
                      }}
                      onClick={() => activateRow(rowIdx)}
                    >
                      <span className="app-menu-icon" aria-hidden="true">
                        {checkedCommands.has(item.commandId)
                          ? <CheckGlyph />
                          : ((item.icon && MENU_ICONS[item.icon]) ?? null)}
                      </span>
                      <span className="app-menu-label">{item.label ?? commandLabel(item.commandId)}</span>
                      {item.shortcut && (
                        <span className="app-menu-shortcut">
                          <kbd>{item.shortcut}</kbd>
                        </span>
                      )}
                      {isParent && <span className="app-menu-caret" aria-hidden="true" />}
                    </button>
                    {expanded && (
                      <div className="app-menu-submenu" role="menu" aria-label={item.label ?? commandLabel(item.commandId)}>
                        {childIndexes.map(({ row: childRow, index: childIdx }) => {
                          const childEnabled = enabledCommands.has(childRow.item.commandId);
                          return (
                            <button
                              key={childRow.item.commandId}
                              id={rowId(menu.id, childRow.item.commandId)}
                              type="button"
                              role="menuitem"
                              className={childIdx === focusIdx ? 'app-menu-item focused' : 'app-menu-item'}
                              disabled={!childEnabled}
                              aria-disabled={!childEnabled}
                              tabIndex={-1}
                              onMouseEnter={() => setFocusIdx(childIdx)}
                              onClick={() => activateRow(childIdx)}
                            >
                              <span className="app-menu-icon" aria-hidden="true">
                                {checkedCommands.has(childRow.item.commandId) ? <CheckGlyph /> : null}
                              </span>
                              <span className="app-menu-label">
                                {childRow.item.label ?? commandLabel(childRow.item.commandId)}
                              </span>
                              {childRow.item.shortcut && (
                                <span className="app-menu-shortcut">
                                  <kbd>{childRow.item.shortcut}</kbd>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
