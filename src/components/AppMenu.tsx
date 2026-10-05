// Application menu bar. Renders menu definitions (PanelsManager
// APPLICATION_MENUS) as dropdown menus; items dispatch through onCommand and
// items without a wired handler render disabled. Owns its open-menu and
// row-focus state: mouse hover and arrow keys share one `focused` highlight
// (accent-soft, like the rail's CustomSelect), Enter activates, Escape
// closes, Left/Right move between menus. Tested indirectly through App
// wiring; menu defs from tests/ui-state.test.mjs, stepping rules from
// tests/menu-navigation.test.mjs.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MenuDef } from '../ui/PanelsManager';
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

function rowId(menuId: string, commandId: string): string {
  return `appmenu-${menuId}-${commandId}`;
}

export default function AppMenu({
  menus,
  enabledCommands,
  onCommand,
}: {
  menus: MenuDef[];
  /** Commands with a wired handler; everything else renders disabled. */
  enabledCommands: Set<string>;
  onCommand: (commandId: string) => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const barRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());

  const openMenuTo = (menuId: string | null): void => {
    setOpenMenu(menuId);
    setFocusIdx(-1);
  };

  const activateIdx = (menu: MenuDef, index: number): void => {
    const item = menu.items[index];
    if (!item || item.header || !enabledCommands.has(item.commandId)) return;
    openMenuTo(null);
    onCommand(item.commandId);
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
        const focusedId = isOpen && focusIdx >= 0 && !menu.items[focusIdx]?.header
          ? rowId(menu.id, menu.items[focusIdx].commandId)
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
                  setFocusIdx(stepFocus(menu.items, enabledCommands, -1, e.key === 'ArrowDown' ? 1 : -1));
                } else {
                  setFocusIdx(stepFocus(menu.items, enabledCommands, focusIdx, e.key === 'ArrowDown' ? 1 : -1));
                }
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (isOpen && focusIdx >= 0) activateIdx(menu, focusIdx);
                else openMenuTo(menu.id);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                openMenuTo(null);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const next = menus[(menuIndex + (e.key === 'ArrowRight' ? 1 : menus.length - 1)) % menus.length];
                if (next) {
                  openMenuTo(next.id);
                  triggerRefs.current.get(next.id)?.focus();
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
              onMouseLeave={() => setFocusIdx(-1)}
            >
              {menu.items.map((item, itemIndex) => {
                if (item.header) {
                  return (
                    <div key={item.commandId}>
                      {itemIndex > 0 && <div className="app-menu-sep" role="separator" />}
                      <div className="app-menu-group" role="presentation">
                        <span>{item.label ?? commandLabel(item.commandId)}</span>
                      </div>
                    </div>
                  );
                }
                const enabled = enabledCommands.has(item.commandId);
                return (
                  <button
                    key={item.commandId}
                    id={rowId(menu.id, item.commandId)}
                    type="button"
                    role="menuitem"
                    className={itemIndex === focusIdx ? 'app-menu-item focused' : 'app-menu-item'}
                    disabled={!enabled}
                    aria-disabled={!enabled}
                    tabIndex={-1}
                    onMouseEnter={() => setFocusIdx(itemIndex)}
                    onClick={() => activateIdx(menu, itemIndex)}
                  >
                    <span className="app-menu-icon" aria-hidden="true">
                      {(item.icon && MENU_ICONS[item.icon]) ?? null}
                    </span>
                    <span className="app-menu-label">{item.label ?? commandLabel(item.commandId)}</span>
                    {item.shortcut && (
                      <span className="app-menu-shortcut">
                        <kbd>{item.shortcut}</kbd>
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
  );
}
