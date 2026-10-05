// Canvas right-click menu. Renders one XML-defined menu (CONTEXT_MENU_ID
// in src/ui/menus/menus.xml) as a floating popup at the click point,
// reusing the application menu's row markup and styling (app-menu-*
// classes) so it looks like the rest of the app. Like AppMenu, rows whose
// command has no wired handler render disabled; the browser's own menu is
// suppressed by the host's onContextMenu handler, not here.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MenuDef } from '../ui/PanelsManager';
import { stepFocus } from '../ui/menuNavigation';

// Title-cased fallback, mirroring AppMenu's commandLabel.
function labelFor(commandId: string): string {
  return commandId
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// Order glyphs duplicated from AppMenu's MENU_ICONS (the single source of
// truth for menu artwork) so this popup stays dependency-free and both files
// keep exporting only components for fast refresh.
function OrderGlyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={15}
      height={15}
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

const ORDER_ICONS: Record<string, ReactNode> = {
  'bring-to-front': (
    <OrderGlyph>
      <path d="M4 14 l8 -6 8 6 M4 19 l8 -6 8 6" />
    </OrderGlyph>
  ),
  'send-to-back': (
    <OrderGlyph>
      <path d="M4 5 l8 6 8 -6 M4 10 l8 6 8 -6" />
    </OrderGlyph>
  ),
};

export default function ContextMenu({
  menu,
  position,
  enabledCommands,
  onCommand,
  onClose,
}: {
  menu: MenuDef;
  /** Viewport coordinates of the click; clamped inside the window. */
  position: { x: number; y: number };
  /** Commands with a wired handler; everything else renders disabled. */
  enabledCommands: Set<string>;
  onCommand: (commandId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [adjusted, setAdjusted] = useState(position);
  const [focusIdx, setFocusIdx] = useState(-1);
  const items = menu.items;

  // Keep the popup fully on screen; measure after mount since the size
  // depends on the menu content.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAdjusted({
      x: Math.max(0, Math.min(position.x, window.innerWidth - rect.width)),
      y: Math.max(0, Math.min(position.y, window.innerHeight - rect.height)),
    });
  }, [position]);

  // Dismiss on outside press or Escape; focus the popup so arrow keys work.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const activate = (rowIdx: number): void => {
    const item = items[rowIdx];
    if (!item || item.header) return;
    if (!enabledCommands.has(item.commandId)) return;
    onCommand(item.commandId);
  };

  return (
    <div
      ref={ref}
      className="app-menu-dropdown context-menu"
      role="menu"
      aria-label={menu.title}
      tabIndex={-1}
      style={{ left: adjusted.x, top: adjusted.y }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusIdx(stepFocus(items, enabledCommands, focusIdx, e.key === 'ArrowDown' ? 1 : -1));
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (focusIdx >= 0) activate(focusIdx);
        }
      }}
    >
      {items.map((item, rowIdx) => {
        if (item.header) {
          return (
            <div key={item.commandId}>
              {rowIdx > 0 && <div className="app-menu-sep" role="separator" />}
              <div className="app-menu-group" role="presentation">
                <span>{item.label ?? labelFor(item.commandId)}</span>
              </div>
            </div>
          );
        }
        const enabled = enabledCommands.has(item.commandId);
        return (
          <button
            key={item.commandId}
            type="button"
            role="menuitem"
            className={rowIdx === focusIdx ? 'app-menu-item focused' : 'app-menu-item'}
            disabled={!enabled}
            aria-disabled={!enabled}
            tabIndex={-1}
            onMouseEnter={() => setFocusIdx(rowIdx)}
            onClick={() => activate(rowIdx)}
          >
            <span className="app-menu-icon" aria-hidden="true">
              {(item.icon && ORDER_ICONS[item.icon]) ?? null}
            </span>
            <span className="app-menu-label">{item.label ?? labelFor(item.commandId)}</span>
            {item.shortcut && (
              <span className="app-menu-shortcut">
                <kbd>{item.shortcut}</kbd>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
