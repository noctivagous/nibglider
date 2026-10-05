// Application menu bar. Renders menu definitions (PanelsManager
// APPLICATION_MENUS) as dropdown menus; items dispatch through onCommand and
// items without a wired handler render disabled. Owns only its open-menu
// state. Tested indirectly through App wiring; menu defs from
// tests/ui-state.test.mjs.
import { useEffect, useRef, useState } from 'react';
import type { MenuDef } from '../ui/PanelsManager';

function commandLabel(commandId: string): string {
  return commandId
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
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
                    {commandLabel(item.commandId)}
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
