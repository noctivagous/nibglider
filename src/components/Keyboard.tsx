import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { KEY_CAPS, commandById, type KeyCap, type KeyState } from '../engine/input/keymap';
import { schemaById } from '../engine/input/KeySettingsRegistry';
import type { NibGliderEngine } from '../engine/engine';
import KeySettingsPopover from './KeySettingsPopover';

// On-screen keyboard renders KEY_CAPS. Highlight follows physical key
// activity. A configurable key opens its settings when the whole cap is
// clicked, and that click does not run the command. Key L toggles status.
// Every other cap falls through so drawing still tracks the cursor.

// Corner badges echoing the panel section icons (TitleIcon in
// ControlPanel): same 16x14 viewBox, stroke styling, and geometry —
// circle outline for Circle Keys, rect outline for Rect Keys.
// A gear badge in the lower right marks keys with a settings popover.
const BADGE_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const BADGE_CIRCLE = `<svg ${BADGE_ATTRS}><circle cx="8" cy="7" r="5"/></svg>`;
const BADGE_RECT = `<svg ${BADGE_ATTRS}><path d="M3 2 H13 V12 H3 Z"/></svg>`;
const GEAR_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/></svg>';

// Ghost construction glyphs behind the legend: 24x24, currentColor.
const BG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const bg = (inner: string): string => `<svg ${BG_ATTRS}>${inner}</svg>`;
const dot = (x: number, y: number, r = 1.45) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

const GLYPH = {
  select: bg(
    `<rect x="4.5" y="4.5" width="15" height="15" rx="1.2" stroke-dasharray="2.4 1.8"/>` +
      `<rect x="3.4" y="3.4" width="2.6" height="2.6" fill="currentColor" stroke="none"/>` +
      `<rect x="18" y="3.4" width="2.6" height="2.6" fill="currentColor" stroke="none"/>` +
      `<rect x="18" y="18" width="2.6" height="2.6" fill="currentColor" stroke="none"/>` +
      `<rect x="3.4" y="18" width="2.6" height="2.6" fill="currentColor" stroke="none"/>`
  ),
  cancel: bg(
    `<circle cx="12" cy="12" r="8"/>` +
      `<path d="M8.6 8.6 L15.4 15.4 M15.4 8.6 L8.6 15.4"/>`
  ),
  stamp: bg(
    `<rect x="3.2" y="7.4" width="11.2" height="11.2" rx="1.6" opacity="0.45"/>` +
      `<rect x="9.6" y="5.2" width="11.2" height="11.2" rx="1.6"/>`
  ),
  rectCenterline: bg(
    `<rect x="3" y="7.2" width="18" height="9.6" rx="1.2"/>` +
      `<path d="M2 12 H22" stroke-dasharray="2.2 1.6"/>` +
      dot(3, 12) +
      dot(21, 12)
  ),
  rectTwoEdges: bg(
    `<rect x="5" y="5" width="14.5" height="14.5" rx="1.2"/>` +
      `<path d="M5 5 H19.5" stroke-width="2.2"/>` +
      `<path d="M5 5 V19.5" stroke-width="2.2"/>` +
      `<path d="M19.5 5 L17.4 3.6 M19.5 5 L17.4 6.4"/>` +
      `<path d="M5 19.5 L3.6 17.4 M5 19.5 L6.4 17.4"/>` +
      dot(5, 5, 1.6)
  ),
  rectDiag: bg(
    `<rect x="4.4" y="5.2" width="15.2" height="13.6" rx="1.2"/>` +
      `<path d="M4.4 18.8 L19.6 5.2"/>` +
      dot(4.4, 18.8) +
      dot(19.6, 5.2)
  ),
  quad: bg(
    `<path d="M4.8 18.2 L8.2 5.2 L19.6 7.8 L14.8 19.6 Z"/>` +
      dot(4.8, 18.2) +
      dot(8.2, 5.2) +
      dot(19.6, 7.8) +
      dot(14.8, 19.6)
  ),
  scaleDown: bg(
    `<rect x="7.4" y="7.4" width="9.2" height="9.2" rx="1"/>` +
      `<path d="M4 4 L8.4 8.4 M20 4 L15.6 8.4 M20 20 L15.6 15.6 M4 20 L8.4 15.6"/>` +
      `<path d="M4 4 L7.2 4.8 M4 4 L4.8 7.2"/>` +
      `<path d="M20 4 L16.8 4.8 M20 4 L19.2 7.2"/>` +
      `<path d="M20 20 L16.8 19.2 M20 20 L19.2 16.8"/>` +
      `<path d="M4 20 L7.2 19.2 M4 20 L4.8 16.8"/>`
  ),
  scaleUp: bg(
    `<rect x="8.2" y="8.2" width="7.6" height="7.6" rx="1"/>` +
      `<path d="M9.2 4 H4 V9.2 M14.8 4 H20 V9.2 M20 14.8 V20 H14.8 M9.2 20 H4 V14.8"/>`
  ),
  end: bg(
    `<rect x="4.6" y="4.6" width="14.8" height="14.8" rx="2.2"/>` +
      `<path d="M8 12.4 L10.7 15.2 L16.4 8.8" stroke-width="2"/>`
  ),
  stroke: bg(
    `<path d="M4 16.5 C8 16.5 8 7.5 12 7.5 S16 16.5 20 16.5" stroke-width="2.1"/>`
  ),
  fill: bg(
    `<path d="M6 10 L12 4.4 L18 10 V18.6 H6 Z" fill="currentColor" stroke="currentColor"/>`
  ),
  sharp: bg(
    `<path d="M3.8 18.6 L10.2 12.4 L12 4.6 L13.8 12.4 L20.2 18.6"/>` +
      dot(12, 4.6, 1.55)
  ),
  spline: bg(
    `<path d="M3.8 18 C7.2 18 8.2 6.2 12 6.2 C15.8 6.2 16.8 16.4 20.2 16.4"/>` +
      `<path d="M8.2 6.2 H15.8" stroke-width="1.15"/>` +
      `<path d="M8.2 6.2 V9.4 M15.8 6.2 V9.4" stroke-width="1.15"/>` +
      dot(12, 6.2, 1.5) +
      dot(8.2, 6.2, 1.15) +
      dot(15.8, 6.2, 1.15)
  ),
  complete: bg(
    `<path d="M3.5 16.5 C6.5 16.5 7 8.5 10.5 8.5 S13 14.5 15 14.5"/>` +
      `<path d="M14.2 8.2 L16.3 10.4 L20.5 5.6" stroke-width="2"/>` +
      dot(10.5, 8.5, 1.5)
  ),
  grid: bg(
    `<rect x="4.4" y="4.4" width="15.2" height="15.2" rx="1"/>` +
      `<path d="M4.4 9.47 H19.6 M4.4 14.53 H19.6 M9.47 4.4 V19.6 M14.53 4.4 V19.6" stroke-width="1.2"/>` +
      dot(9.47, 9.47, 1.05) +
      dot(14.53, 9.47, 1.05) +
      dot(9.47, 14.53, 1.05) +
      dot(14.53, 14.53, 1.05)
  ),
  status: bg(`<path d="M4 7 H20 M4 12 H20 M4 17 H14" stroke-width="2"/>`),
  rotateCcw: bg(
    `<rect x="8.2" y="8.2" width="7.6" height="7.6" rx="1" opacity="0.55"/>` +
      `<path d="M18.7 13.4 A7 7 0 1 1 13.6 5.15"/>` +
      `<path d="M13.6 5.15 L16.9 3.55 M13.6 5.15 L16.6 7.55"/>`
  ),
  rotateCw: bg(
    `<rect x="8.2" y="8.2" width="7.6" height="7.6" rx="1" opacity="0.55"/>` +
      `<path d="M5.3 13.4 A7 7 0 1 0 10.4 5.15"/>` +
      `<path d="M10.4 5.15 L7.1 3.55 M10.4 5.15 L7.4 7.55"/>`
  ),
  strokeMinus: bg(
    `<path d="M4.5 8 H19.5" stroke-width="3.4"/>` +
      `<path d="M4.5 13 H19.5" stroke-width="2.1"/>` +
      `<path d="M4.5 17.4 H19.5" stroke-width="1.1"/>`
  ),
  strokePlus: bg(
    `<path d="M4.5 6.8 H19.5" stroke-width="1.1"/>` +
      `<path d="M4.5 11.2 H19.5" stroke-width="2.1"/>` +
      `<path d="M4.5 16.2 H19.5" stroke-width="3.4"/>`
  ),
  circleDiameter: bg(
    `<circle cx="12" cy="12" r="8"/>` +
      `<path d="M4 12 H20"/>` +
      dot(4, 12) +
      dot(20, 12)
  ),
  circleRadius: bg(
    `<circle cx="12" cy="12" r="8"/>` +
      `<path d="M12 12 L19.1 8.2"/>` +
      dot(12, 12, 1.65) +
      dot(19.1, 8.2)
  ),
  circleTangent: bg(
    `<circle cx="10.4" cy="12" r="7"/>` +
      `<path d="M17.4 4.5 V19.5"/>` +
      dot(17.4, 12)
  ),
  dragLock: bg(
    `<path d="M12 3.2 V7.4 M12 16.6 V20.8 M3.2 12 H7.4 M16.6 12 H20.8"/>` +
      `<path d="M12 3.2 L10.2 5.4 M12 3.2 L13.8 5.4"/>` +
      `<path d="M12 20.8 L10.2 18.6 M12 20.8 L13.8 18.6"/>` +
      `<path d="M3.2 12 L5.4 10.2 M3.2 12 L5.4 13.8"/>` +
      `<path d="M20.8 12 L18.6 10.2 M20.8 12 L18.6 13.8"/>` +
      `<rect x="9.1" y="10.2" width="5.8" height="4.6" rx="1"/>` +
      `<path d="M10.4 10.2 V8.9 a1.6 1.6 0 0 1 3.2 0 V10.2"/>`
  ),
};

/** Ghost glyphs keyed by command id so the board and the keymap stay aligned. */
const GLYPH_BY_COMMAND: Record<string, string> = {
  select: GLYPH.select,
  cancel: GLYPH.cancel,
  stamp: GLYPH.stamp,
  'finish-r': GLYPH.complete,
  'rect-centerline': GLYPH.rectCenterline,
  'rect-two-edges': GLYPH.rectTwoEdges,
  'rect-diagonal': GLYPH.rectDiag,
  quad: GLYPH.quad,
  'scale-down': GLYPH.scaleDown,
  'scale-up': GLYPH.scaleUp,
  'finish-a': GLYPH.end,
  'toggle-stroke': GLYPH.stroke,
  'toggle-fill': GLYPH.fill,
  'sharp-point': GLYPH.sharp,
  'spline-point': GLYPH.spline,
  'toggle-status': GLYPH.status,
  'rotate-ccw': GLYPH.rotateCcw,
  'rotate-cw': GLYPH.rotateCw,
  'stroke-thinner': GLYPH.strokeMinus,
  'stroke-thicker': GLYPH.strokePlus,
  'circle-diameter': GLYPH.circleDiameter,
  'circle-radius': GLYPH.circleRadius,
  'radial-stamp': GLYPH.circleTangent,
  'grid-toggle': GLYPH.grid,
  'drag-lock': GLYPH.dragLock,
};

const KEYBOARD_WIDTH_MIN = 480;
const KEYBOARD_WIDTH_MAX = 1600;
const KEYBOARD_WIDTH_DEFAULT = 920;

function ResizeHandle({
  width,
  onWidthChange,
}: {
  width: number;
  onWidthChange: (w: number) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; height: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const key = document.getElementById('Backslash');
    const container = document.getElementById('keyboardContainer');
    const place = () => {
      if (!key || !container) return;
      const kr = key.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      setPos({
        top: kr.top - cr.top,
        left: kr.right - cr.left + 6,
        height: kr.height,
      });
    };
    place();
    const ro = new ResizeObserver(place);
    if (key) ro.observe(key);
    if (container) ro.observe(container);
    return () => ro.disconnect();
  }, [width]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width;
    const canvas = document.getElementById('canvasContainer');
    const maxW = Math.min(
      KEYBOARD_WIDTH_MAX,
      Math.max(KEYBOARD_WIDTH_MIN, (canvas?.clientWidth ?? 1600) - 48),
    );
    const onMove = (ev: PointerEvent) => {
      const next = Math.round(
        Math.min(maxW, Math.max(KEYBOARD_WIDTH_MIN, startW + ev.clientX - startX)),
      );
      onWidthChange(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onDoubleClick = () => onWidthChange(KEYBOARD_WIDTH_DEFAULT);

  return (
    <button
      type="button"
      className="keyboard-resize"
      aria-label="Resize keyboard"
      title="Drag to resize keyboard"
      style={
        pos
          ? { top: pos.top, left: pos.left, height: pos.height, visibility: 'visible' }
          : { visibility: 'hidden' }
      }
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <svg viewBox="0 0 12 24" aria-hidden="true">
        <path d="M3 16 L9 10 M3 20 L11 12" />
        <path d="M9 10 L6.2 10.4 M9 10 L8.6 12.8" />
        <path d="M3 20 L5.8 19.6 M3 20 L3.4 17.2" />
      </svg>
    </button>
  );
}

function keyStateOf(engine: NibGliderEngine): KeyState {
  return {
    isDrawingPath: engine.isDrawingPath,
    isDrawingShape: engine.isDrawingShape,
    isDrawingQuad: engine.isDrawingQuad,
    isLiveDrawing: engine.isLiveDrawing,
    shapeType: engine.shapeType,
    selectedCount: engine.selectedItems.length,
    liveAdjustApplies: engine.isDrawingPath || engine.isDrawingQuad,
  };
}

function KeyButton({
  def,
  active,
  onClick,
  settingsLabel,
  settingsOpen,
  onToggleSettings,
}: {
  def: KeyCap;
  active: boolean;
  onClick?: () => void;
  settingsLabel?: string;
  settingsOpen?: boolean;
  onToggleSettings?: (anchor: HTMLButtonElement) => void;
}) {
  const bg = def.commandId ? GLYPH_BY_COMMAND[def.commandId] : undefined;
  const opensSettings = Boolean(settingsLabel && onToggleSettings);
  return (
    <button
      type="button"
      tabIndex={-1}
      data-key={def.dataKey}
      id={def.id}
      className={
        def.className +
        (active ? ' active' : '') +
        (opensSettings ? ' key-has-settings' : '')
      }
      style={def.transform ? { transform: def.transform } : undefined}
      aria-label={opensSettings ? settingsLabel : undefined}
      aria-haspopup={opensSettings ? 'dialog' : undefined}
      aria-expanded={opensSettings ? settingsOpen === true : undefined}
      onClick={
        opensSettings
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSettings?.(event.currentTarget);
            }
          : onClick
      }
    >
      {bg && (
        <span
          className="key-bg"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: bg }}
        />
      )}
      {def.badge && (
        <span
          className={`key-badge badge-${def.badge}`}
          aria-hidden="true"
          dangerouslySetInnerHTML={{
            __html: def.badge === 'circle' ? BADGE_CIRCLE : BADGE_RECT,
          }}
        />
      )}
      {opensSettings && (
        <span
          className="key-gear"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: GEAR_ICON }}
        />
      )}
      <span
        className="key-label"
        dangerouslySetInnerHTML={{ __html: def.legend }}
      />
    </button>
  );
}

export default function Keyboard({
  engine,
  activeCode,
  showSpacebar,
  width,
  onWidthChange,
  onCommand,
}: {
  engine: NibGliderEngine;
  activeCode: string | null;
  showSpacebar: boolean;
  width: number;
  onWidthChange: (w: number) => void;
  /** Invoked only for keycaps marked clickable, with that cap's command id. */
  onCommand?: (commandId: string) => void;
}) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const [open, setOpen] = useState<{ id: string; anchor: HTMLButtonElement } | null>(null);
  const closeSettings = useCallback((reason: 'escape' | 'outside') => {
    setOpen((current) => {
      if (reason === 'escape' && current) {
        const anchor = current.anchor;
        queueMicrotask(() => anchor.focus());
      }
      return null;
    });
  }, []);
  const clickFor = (def: KeyCap) =>
    def.clickable && def.commandId && onCommand
      ? () => onCommand(def.commandId as string)
      : undefined;
  const settingsFor = (def: KeyCap) => {
    if (!def.commandId) return null;
    const cmd = commandById(def.commandId);
    if (!cmd?.settingsId || !cmd.settingsSummary) return null;
    if (cmd.settingsAvailability && !cmd.settingsAvailability(keyStateOf(engine))) return null;
    if (!schemaById(cmd.settingsId)) return null;
    return { id: cmd.settingsId, summary: cmd.settingsSummary };
  };
  const toggleSettings = (def: KeyCap, anchor: HTMLButtonElement) => {
    setOpen((current) => (current?.id === def.id ? null : { id: def.id, anchor }));
  };
  const openCap = open ? KEY_CAPS.find((cap) => cap.id === open.id) : undefined;
  const openSettings = openCap ? settingsFor(openCap) : null;
  const openSchema = openSettings ? schemaById(openSettings.id) : null;
  const row = (name: KeyCap['row']) => KEY_CAPS.filter((cap) => cap.row === name);
  const renderCap = (def: KeyCap) => {
    const settings = settingsFor(def);
    return (
      <KeyButton
        key={def.id}
        def={def}
        active={activeCode === def.id}
        onClick={clickFor(def)}
        settingsLabel={settings ? `Settings: ${settings.summary}` : undefined}
        settingsOpen={open?.id === def.id}
        onToggleSettings={
          settings ? (anchor) => toggleSettings(def, anchor) : undefined
        }
      />
    );
  };
  return (
    <>
    <div id="keyboardKeysContainer">
      {row('q').map(renderCap)}
      {row('a').map(renderCap)}
      {row('z').map(renderCap)}
      {showSpacebar && row('space').map(renderCap)}
    </div>
    <ResizeHandle width={width} onWidthChange={onWidthChange} />
    {open && openSchema ? (
      <KeySettingsPopover
        schema={openSchema}
        target={engine}
        anchor={open.anchor}
        onClose={closeSettings}
      />
    ) : null}
    </>
  );
}
