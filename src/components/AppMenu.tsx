// Application menu bar. Renders menu definitions (PanelsManager
// APPLICATION_MENUS) as dropdown menus; items dispatch through onCommand and
// items without a wired handler render disabled. Owns only its open-menu
// state. Tested indirectly through App wiring; menu defs from
// tests/ui-state.test.mjs.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MenuDef } from '../ui/PanelsManager';

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
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenu(null);
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
      {menus.map((menu) => (
        <div key={menu.id} className="app-menu">
          <button
            type="button"
            className={openMenu === menu.id ? 'app-menu-trigger open' : 'app-menu-trigger'}
            data-tutorial-id={`menu-${menu.id}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === menu.id}
            onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
            onMouseEnter={() => {
              if (openMenu && openMenu !== menu.id) setOpenMenu(menu.id);
            }}
          >
            {menu.title}
          </button>
          {openMenu === menu.id && (
            <div className="app-menu-dropdown" role="menu" aria-label={menu.title}>
              {menu.items.map((item) => {
                if (item.header) {
                  return (
                    <div key={item.commandId} className="app-menu-group" role="presentation">
                      <span>{item.label ?? commandLabel(item.commandId)}</span>
                    </div>
                  );
                }
                const enabled = enabledCommands.has(item.commandId);
                return (
                  <button
                    key={item.commandId}
                    type="button"
                    role="menuitem"
                    className="app-menu-item"
                    disabled={!enabled}
                    aria-disabled={!enabled}
                    onClick={() => {
                      setOpenMenu(null);
                      onCommand(item.commandId);
                    }}
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
      ))}
    </div>
  );
}
