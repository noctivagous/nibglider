import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { primaryShortcut } from '../engine/input/keymap';
import { PanelsManager, sectionLabel, sectionOrder } from '../ui/PanelsManager';
import { browserStore } from '../ui/GUIManager';
import {
  currentId as galleryCurrentId,
  currentName as galleryCurrentName,
  deleteDocument as galleryDeleteDocument,
  docDisplayName as galleryDisplayName,
  listDocuments as galleryListDocuments,
  renameDocument as galleryRenameDocument,
  saveDocument as gallerySaveDocument,
  setCurrent as gallerySetCurrent,
  type GalleryDoc,
} from '../ui/DocumentGallery';
import { clearNibGliderSettings } from '../tutorial/tutorialProgress';
import CustomSelect, { type CustomSelectOption } from './CustomSelect';
import DocumentGallery, { type GalleryMode } from './DocumentGallery';
import KeymapWidget from './KeymapWidget';
import WidgetHandle from './WidgetHandle';
import FontFamilySelect, { type FontFamilyGroup } from './FontFamilySelect';
import NumericStepper from './NumericStepper';
import type {
  CircleInnerShape,
  CombineMode,
  FillSpec,
  FillType,
  GridType,
  InnerShapeParams,
  LengthUnit,
  NibGliderEngine,
  RectangleInnerShape,
  StrokeCap,
  StrokeJoin,
  StrokePosition,
  TextJustification,
  TextSpec,
} from '../engine/engine';

const ASPECT_RATIO_PRESETS = ['1:1', '3:4', '2:3', '16:9'];

// Tiny legend glyph for pane titles (Adobe CS-style: small, currentColor).
function TitleIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="pane-icon"
      viewBox="0 0 16 14"
      width="14"
      height="12"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// Tiny glyph marking each snapping mode in its toggle button.
function SnapToggle({
  id,
  label,
  pressed,
  onToggle,
  children,
}: {
  id?: string;
  label: string;
  pressed: boolean;
  onToggle: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={pressed ? 'snap-toggle active' : 'snap-toggle'}
      onClick={() => onToggle(!pressed)}
    >
      <CheckIcon>{children}</CheckIcon>
      <span>{label}</span>
    </button>
  );
}

// Plain numeric field (no steppers) for a snap increment. Typing tolerates
// intermediate text: the draft shows verbatim while every finite prefix
// still commits live; blur or Escape discards the draft.
function SnapNumInput({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled,
  onCommit,
}: {
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      id={id}
      className="snap-num"
      aria-label={label}
      title={label}
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onCommit(n);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function CheckIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// Glyph for a File menu card button: icon stacked above a short label.
function FileCardIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function OpenCardIcon() {
  return (
    <FileCardIcon>
      <path d="M3 7 h6 l2 2 h10 v9 H3 Z" />
      <path d="M3 7 v10" />
    </FileCardIcon>
  );
}

function NewCardIcon() {
  return (
    <FileCardIcon>
      <path d="M7 3 h7 l4 4 v14 H7 Z" />
      <path d="M12 11 v6 M9 14 h6" />
    </FileCardIcon>
  );
}

function SaveCardIcon() {
  return (
    <FileCardIcon>
      <path d="M5 4 h11 l3 3 v13 H5 Z" />
      <path d="M8 4 v5 h7 V4" />
      <path d="M8 20 v-6 h8 v6" />
    </FileCardIcon>
  );
}

function RenameCardIcon() {
  return (
    <FileCardIcon>
      <path d="M4 20 l1 -4 L16 5 l3 3 L8 19 Z" />
      <path d="M14 7 l3 3" />
    </FileCardIcon>
  );
}

function ExportCardIcon() {
  return (
    <FileCardIcon>
      <path d="M4 14 v6 h16 v-6" />
      <path d="M12 3 v10 M8 7 l4 -4 4 4" />
    </FileCardIcon>
  );
}

function ImportCardIcon() {
  return (
    <FileCardIcon>
      <path d="M4 14 v6 h16 v-6" />
      <path d="M12 4 v10 M8 10 l4 4 4 -4" />
    </FileCardIcon>
  );
}

function PanelSection({
  id,
  label,
  icon,
  collapsed,
  className,
  order,
  menuOpen,
  dragging,
  onIconMenu,
  onToggleCollapse,
  onRemoveRequest,
  onDragSessionStart,
  onDragSessionEnd,
  onDragHover,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  collapsed: boolean;
  className?: string;
  order?: number;
  menuOpen: boolean;
  dragging: boolean;
  onIconMenu: (id: string, anchor: HTMLElement) => void;
  onToggleCollapse: (id: string) => void;
  onRemoveRequest: (id: string, x: number, y: number) => void;
  onDragSessionStart: (id: string, size: { width: number; height: number }, rowStarts: string[]) => void;
  onDragSessionEnd: () => void;
  onDragHover: (id: string, after: boolean, x: number, y: number) => void;
  children: ReactNode;
}) {
  const didDrag = useRef(false);
  // Browser drag snapshots are inconsistent when the source is removed from
  // layout during drag. Keep a real, full-size copy alive for the entire
  // native drag so the cursor always carries the complete section.
  const dragImage = useRef<HTMLElement | null>(null);
  const clearDragImage = useCallback(() => {
    dragImage.current?.remove();
    dragImage.current = null;
  }, []);
  useEffect(() => {
    // A drop can finish outside the panel, so release the preview globally.
    window.addEventListener('drop', clearDragImage, true);
    window.addEventListener('dragend', clearDragImage);
    return () => {
      window.removeEventListener('drop', clearDragImage, true);
      window.removeEventListener('dragend', clearDragImage);
      clearDragImage();
    };
  }, [clearDragImage]);
  const node = (
    <section
      id={id}
      aria-label={label}
      data-tutorial-id={`section-${id}`}
      style={order !== undefined ? { order } : undefined}
      className={
        (className ?? 'panel-card') +
        (collapsed ? ' section-collapsed' : '') +
        (dragging ? ' section-dragging' : '')
      }
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemoveRequest(id, e.clientX, e.clientY);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types.includes('text/panel-section')) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const after = e.clientX > rect.left + rect.width / 2;
        onDragHover(id, after, e.clientX, e.clientY);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer?.types.includes('text/panel-section')) return;
        e.preventDefault();
        e.stopPropagation();
        onDragSessionEnd();
      }}
    >
      <span
        className="section-drag"
        role="button"
        tabIndex={0}
        title={`${label}: drag to reorder, click to ${collapsed ? 'expand' : 'collapse'}`}
        aria-label={`${label}: drag to reorder, click to ${collapsed ? 'expand' : 'collapse'}`}
        draggable
        onClick={() => {
          if (didDrag.current) {
            didDrag.current = false;
            return;
          }
          onToggleCollapse(id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse(id);
          }
        }}
        onDragStart={(e) => {
          didDrag.current = true;
          const section = e.currentTarget.closest('section');
          const rect = section?.getBoundingClientRect();
          const rowStarts: string[] = [];
          let previousTop: number | null = null;
          const siblings = section?.parentElement?.querySelectorAll(':scope > section') ?? [];
          const visualOrder = [...siblings]
            .map((item) => ({ id: item.id, rect: item.getBoundingClientRect() }))
            .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
          for (const item of visualOrder) {
            if (previousTop !== null && item.rect.top > previousTop + 3) rowStarts.push(item.id);
            previousTop = item.rect.top;
          }
          const dt = e.dataTransfer;
          if (dt) {
            dt.effectAllowed = 'move';
            dt.setData('text/panel-section', id);
            if (section && rect) {
              clearDragImage();
              const image = section.cloneNode(true) as HTMLElement;
              // Panel styles depend on both #controlPanel and section IDs.
              // Capture them before moving the snapshot outside that scope.
              const originals = [section, ...section.querySelectorAll('*')];
              const copies = [image, ...image.querySelectorAll('*')];
              originals.forEach((original, index) => {
                const copy = copies[index];
                if (copy instanceof HTMLElement || copy instanceof SVGElement) {
                  const computed = getComputedStyle(original);
                  for (const property of computed) {
                    copy.style.setProperty(property, computed.getPropertyValue(property));
                  }
                }
                copy.removeAttribute('id');
              });
              image.setAttribute('aria-hidden', 'true');
              image.inert = true;
              image.classList.remove('section-dragging');
              Object.assign(image.style, {
                position: 'fixed',
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                boxSizing: 'border-box',
                zIndex: '-1',
                margin: '0',
                pointerEvents: 'none',
              });
              document.body.appendChild(image);
              dragImage.current = image;
              dt.setDragImage(
                image,
                e.clientX - rect.left,
                e.clientY - rect.top,
              );
            }
          }
          onDragSessionStart(id, {
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
          }, rowStarts);
        }}
        onDragEnd={() => {
          clearDragImage();
          onDragSessionEnd();
        }}
      >
        <svg viewBox="0 0 8 16" width="8" height="16" aria-hidden="true">
          <circle cx="2.5" cy="3" r="1.1" fill="currentColor" />
          <circle cx="5.5" cy="3" r="1.1" fill="currentColor" />
          <circle cx="2.5" cy="8" r="1.1" fill="currentColor" />
          <circle cx="5.5" cy="8" r="1.1" fill="currentColor" />
          <circle cx="2.5" cy="13" r="1.1" fill="currentColor" />
          <circle cx="5.5" cy="13" r="1.1" fill="currentColor" />
        </svg>
      </span>
      {collapsed ? (
        <button
          type="button"
          className="section-collapsed-icon"
          title={`${label} (collapsed) — click for menu, right-click to remove`}
          aria-label={`${label} (collapsed)`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => onIconMenu(id, e.currentTarget)}
        >
          {icon}
        </button>
      ) : (
        children
      )}
    </section>
  );
  return node;
}

// --- Section icon menus ------------------------------------------------------
// Each panel section title icon opens this custom menu on click. Only
// Snapping and History have items for now; every other section gets the
// empty-state shell until its items are defined.
const SNAP_VISIBLE_KEY = 'nibglider.snapVisibility';
const HISTORY_SEGS_KEY = 'nibglider.historySegments';
const LENGTH_UNIT_KEY = 'nibglider.lengthUnit';

const SNAP_DEFAULTS: Record<string, boolean> = {
  grid: true,
  path: true,
  points: true,
  angle: true,
  length: true,
  // Aspect stays out of the panel until the user opts in via the menu.
  aspect: false,
};

const HISTORY_SEG_DEFAULTS: Record<string, boolean> = {
  undoRedo: true,
  grouping: true,
  history: false,
};

function loadBoolRecord(
  key: string,
  defaults: Record<string, boolean>,
): Record<string, boolean> {
  const out = { ...defaults };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (k in out && typeof v === 'boolean') out[k] = v;
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

const SNAP_MENU_ITEMS: Array<{
  key: string;
  label: string;
  isOn: (engine: NibGliderEngine) => boolean;
}> = [
  { key: 'grid', label: 'Grid', isOn: (e) => e.isGridSnappingEnabled },
  { key: 'path', label: 'Path', isOn: (e) => e.isPathSnappingEnabled },
  { key: 'points', label: 'Points', isOn: (e) => e.isPointSnappingEnabled },
  { key: 'angle', label: 'Angle', isOn: (e) => e.isAngleSnappingEnabled },
  { key: 'length', label: 'Length', isOn: (e) => e.isLengthSnappingEnabled },
  { key: 'aspect', label: 'Aspect', isOn: (e) => e.isAspectSnappingEnabled },
];

const LENGTH_UNIT_OPTIONS: Array<{ value: LengthUnit; label: string }> = [
  { value: 'pt', label: 'pt' },
  { value: 'inch', label: 'inches' },
  { value: 'cm', label: 'cm' },
];

function SectionIconMenu({
  anchor,
  label,
  collapsed,
  onToggleCollapse,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  label: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      let left = r.left;
      let top = r.bottom + 6;
      if (left + w > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - w - 8);
      }
      if (top + h > window.innerHeight - 8) {
        top = Math.max(8, r.top - h - 6);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.visibility = 'visible';
    };
    menu.style.visibility = 'hidden';
    place();
    const ro = new ResizeObserver(place);
    ro.observe(menu);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor]);

  useEffect(() => {
    menuRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // Anchor clicks fall through so the trigger toggle still works.
      if (anchor.contains(t) || menuRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="section-icon-menu"
      role="menu"
      aria-label={`${label} menu`}
      tabIndex={-1}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="im-title">{label}</div>
      {children}
      {children != null ? <div className="im-sep" role="separator" /> : null}
      <button
        type="button"
        role="menuitem"
        className="im-row"
        onClick={() => {
          onToggleCollapse();
          onClose();
        }}
      >
        <span className="im-label">
          {collapsed ? 'Expand section' : 'Collapse to icon'}
        </span>
      </button>
    </div>,
    document.body,
  );
}

// Background watermark label for a section title button. Single word per
// section (snapping abbreviates to snap); circle/rect keys split across the
// top and bottom edges.
function titleSegBgLines(title: string): string[] {
  const t = title.toLowerCase();
  if (t === 'snapping') return ['snap'];
  if (t === 'circle keys') return ['circle', 'keys'];
  if (t === 'rect keys') return ['rect', 'keys'];
  return [t];
}

// Clickable section title: opens the section's icon menu.
function SectionTitleButton({
  sectionId,
  title,
  menuOpen,
  onOpen,
  children,
}: {
  sectionId: string;
  title: string;
  menuOpen: boolean;
  onOpen: (id: string, anchor: HTMLElement) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="title-seg title-seg-btn"
      title={`${title} — open menu`}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label={`${title} menu`}
      onClick={(e) => onOpen(sectionId, e.currentTarget)}
    >
      <span
        className={
          'title-seg-bg' +
          (titleSegBgLines(title).length > 1 ? ' title-seg-bg-split' : '')
        }
        aria-hidden="true"
      >
        {titleSegBgLines(title).map((line) => (
          <span key={line} className="title-seg-bg-line">
            {line}
          </span>
        ))}
      </span>
      {children}
    </button>
  );
}

// Modal dialog for the Operations entries that need input (scale, rotate).
// The transform previews live on the page as the field changes; OK commits
// one undo entry for the net delta, Cancel inverts the applied preview.
function OperationDialog({
  kind,
  draft,
  onDraft,
  onCommit,
  onCancel,
}: {
  kind: 'scale' | 'rotate';
  draft: number;
  onDraft: (n: number) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const title = kind === 'scale' ? 'Scale Selection' : 'Rotate Selection';
  const unit = kind === 'scale' ? '%' : '°';
  return createPortal(
    <div
      className="op-modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="op-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          }
        }}
      >
        <div className="op-modal-title">{title}</div>
        <label className="op-modal-field">
          <span>{kind === 'scale' ? 'Scale' : 'Angle'}</span>
          <span className="op-modal-row">
            <input
              type="range"
              aria-label={kind === 'scale' ? 'Scale percent' : 'Angle degrees'}
              min={kind === 'scale' ? 10 : -180}
              max={kind === 'scale' ? 400 : 180}
              step={kind === 'scale' ? 1 : 1}
              value={draft}
              autoFocus
              onChange={(e) => onDraft(parseFloat(e.target.value))}
            />
            <span className="op-modal-num">
              <input
                type="number"
                aria-label={kind === 'scale' ? 'Scale percent' : 'Angle degrees'}
                value={draft}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n)) onDraft(n);
                }}
              />
              <span aria-hidden="true">{unit}</span>
            </span>
          </span>
        </label>
        <p className="op-modal-hint">Previewing live on the page.</p>
        <div className="op-modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={onCommit}>
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ParamSlider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  decimals,
  formatValue,
  parseValue,
  onChange,
}: {
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  decimals?: number;
  formatValue?: (v: number) => string;
  parseValue?: (s: string) => number;
  onChange: (n: number) => void;
}) {
  return (
    <span className="param-item">
      <label htmlFor={id}>{label}</label>
      <span className="param-slider-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <NumericStepper
          id={id}
          value={value}
          min={min}
          max={max}
          step={step}
          unit={unit}
          decimals={decimals}
          formatValue={formatValue}
          parseValue={parseValue}
          ariaLabel={label}
          onCommit={onChange}
        />
      </span>
    </span>
  );
}

function InnerShapePreviewSvg({
  id,
  pathId,
  d,
  frame,
  width,
  height,
}: {
  id?: string;
  pathId?: string;
  d: string;
  frame: 'circle' | 'rect';
  width?: number | string;
  height?: number | string;
}) {
  return (
    <svg
      id={id}
      viewBox="-1.2 -1.2 2.4 2.4"
      width={width}
      height={height}
      aria-hidden="true"
    >
      {frame === 'rect' ? (
        <rect
          x="-0.9"
          y="-0.9"
          width="1.8"
          height="1.8"
          fill="none"
          stroke="#888"
          strokeWidth="0.015"
          strokeDasharray="0.06 0.04"
        />
      ) : null}
      <path
        id={pathId}
        fill="#ddd"
        stroke="#444"
        strokeWidth="0.015"
        strokeLinejoin="round"
        strokeLinecap="round"
        d={d}
      />
    </svg>
  );
}

function OrientationSeg({
  value,
  onChange,
}: {
  value: number;
  onChange: (o: number) => void;
}) {
  return (
    <div className="seg-ctrl" role="group" aria-label="Orientation">
      {[0, 1, 2, 3].map((o) => (
        <button
          key={o}
          type="button"
          title={`Orientation ${o * 90}°`}
          aria-label={`Orientation ${o * 90} degrees`}
          className={value === o ? 'active' : undefined}
          onClick={() => onChange(o)}
        >
          <svg viewBox="0 0 16 14" width="16" height="14">
            <path
              d="M14 12 L2 12 L2 2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              transform={`rotate(${o * 90} 8 7)`}
            />
          </svg>
        </button>
      ))}
    </div>
  );
}

function CircleShapeParams({ engine }: { engine: NibGliderEngine }) {
  const type = engine.circleInnerShapeType;
  const params = engine.circleInnerShapeParams;
  if (type === 'sector' || type === 'segment') {
    const deg = Number.isFinite(params.sector) ? params.sector : 90;
    return (
      <span className="panelParameters">
        <ParamSlider
          label="Angle"
          value={deg}
          min={10}
          max={350}
          unit="°"
          formatValue={(v) => String(Math.round(v))}
          onChange={(n) => engine.setCircleSector(n)}
        />
      </span>
    );
  }
  if (type === 'trapezoid' || type === 'parallelogram') {
    const deg = Number.isFinite(params.angle) ? params.angle : 60;
    return (
      <span className="panelParameters">
        <ParamSlider
          label="Angle"
          value={deg}
          min={15}
          max={165}
          step={15}
          unit="°"
          formatValue={(v) => String(Math.round(v))}
          onChange={(n) => engine.setCircleAngle(n)}
        />
      </span>
    );
  }
  if (type === 'polygon') {
    const align = engine.polygonRadiusMode === 'circumradius' ? 'circumradius' : 'inradius';
    return (
      <span id="regularPolygonParametersForPanel" className="panelParameters">
        <ParamSlider
          id="circlePolySides"
          label="Sides"
          value={params.sides}
          min={3}
          max={12}
          formatValue={(v) => String(Math.round(v))}
          onChange={(n) => engine.setCircleSides(Math.round(n))}
        />
        <span className="param-item">
          <label>Align</label>
          <div className="seg-ctrl seg-text" role="group" aria-label="Polygon alignment">
            <button
              type="button"
              title="A vertex points toward the cursor"
              aria-label="Vertex toward cursor"
              className={align === 'circumradius' ? 'active' : undefined}
              onClick={() => engine.setPolygonRadiusMode('circumradius')}
            >
              Vertex
            </button>
            <button
              type="button"
              title="An edge midpoint faces the cursor"
              aria-label="Edge toward cursor"
              className={align === 'inradius' ? 'active' : undefined}
              onClick={() => engine.setPolygonRadiusMode('inradius')}
            >
              Edge
            </button>
          </div>
        </span>
      </span>
    );
  }
  if (type === 'supershape') {
    return (
      <span id="supershapeParametersForPanel" className="panelParameters">
        {SUPERSHAPE_SLIDERS.map((s) => (
          <ParamSlider
            key={s.key}
            label={s.label}
            value={params[s.key]}
            min={s.min}
            max={s.max}
            step={s.step}
            decimals={1}
            onChange={(n) => engine.setSupershapeParam(s.key, n)}
          />
        ))}
      </span>
    );
  }
  return <p className="param-empty">No extra parameters</p>;
}

function RectShapeParams({ engine }: { engine: NibGliderEngine }) {
  const type = engine.rectangleInnerShapeType;
  const params = engine.rectangleInnerShapeParams;
  const showOrient = type !== 'rectangle' && type !== 'circle';
  let sliders: ReactNode = null;
  if (type === 'trapezoid' || type === 'parallelogram') {
    const deg = Number.isFinite(params.angle) ? params.angle : 60;
    sliders = (
      <span className="panelParameters">
        <ParamSlider
          label="Angle"
          value={deg}
          min={15}
          max={165}
          step={15}
          unit="°"
          formatValue={(v) => String(Math.round(v))}
          onChange={(n) => engine.setRectangleAngle(n)}
        />
      </span>
    );
  } else if (type === 'polygon') {
    sliders = (
      <span id="rectRegularPolygonParametersForPanel" className="panelParameters">
        <ParamSlider
          id="rectPolySides"
          label="Sides"
          value={params.sides}
          min={3}
          max={12}
          formatValue={(v) => String(Math.round(v))}
          onChange={(n) => engine.setRectangleSides(Math.round(n))}
        />
      </span>
    );
  } else if (type === 'supershape') {
    sliders = (
      <span id="rectSupershapeParametersForPanel" className="panelParameters">
        {SUPERSHAPE_SLIDERS.map((s) => (
          <ParamSlider
            key={s.key}
            label={s.label}
            value={params[s.key]}
            min={s.min}
            max={s.max}
            step={s.step}
            decimals={1}
            onChange={(n) => engine.setRectangleSupershapeParam(s.key, n)}
          />
        ))}
      </span>
    );
  }
  if (!showOrient && !sliders) {
    return <p className="param-empty">No extra parameters</p>;
  }
  return (
    <>
      {showOrient ? (
        <span className="param-item flyout-orient">
          <label>Orientation</label>
          <OrientationSeg
            value={engine.rectangleOrientation}
            onChange={(o) => engine.setRectangleOrientation(o)}
          />
        </span>
      ) : null}
      {sliders}
    </>
  );
}

function ShapeParamsFlyout({
  open,
  triggerRef,
  tone,
  title,
  preview,
  onClose,
  onMenuMouseEnter,
  onMenuMouseLeave,
  children,
}: {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  tone: 'circle' | 'rect' | 'stroke' | 'fill' | 'text';
  title: string;
  preview: ReactNode;
  onClose: () => void;
  onMenuMouseEnter?: () => void;
  onMenuMouseLeave?: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const anchor = triggerRef.current;
    if (!menu || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      let left = r.left;
      let top = r.bottom + 6;
      if (left + w > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - w - 8);
      }
      if (top + h > window.innerHeight - 8) {
        top = Math.max(8, r.top - h - 6);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.visibility = 'visible';
    };
    menu.style.visibility = 'hidden';
    place();
    const ro = new ResizeObserver(place);
    ro.observe(menu);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) {
        return;
      }
      // A CustomSelect (or the typeface FontFamilySelect) opened from
      // inside the flyout portals its menu to document.body; picking an
      // option there must not close the flyout.
      if (
        t instanceof Element &&
        t.closest('.custom-select-menu, .font-select-menu')
      ) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, triggerRef, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      ref={menuRef}
      className={`shape-params-flyout tone-${tone}`}
      role="dialog"
      aria-label={`${title} parameters`}
      tabIndex={-1}
      onMouseEnter={onMenuMouseEnter}
      onMouseLeave={() => {
        // Keyboard focus inside the menu pins it open past a mouse slip.
        if (menuRef.current?.contains(document.activeElement)) return;
        onMenuMouseLeave?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flyout-title">{title}</div>
      <div className="flyout-preview">{preview}</div>
      {children}
    </div>,
    document.body,
  );
}

const SUPERSHAPE_SLIDERS: Array<{
  key: keyof InnerShapeParams;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'm', label: 'M', min: 1, max: 20, step: 1.0 },
  { key: 'n1', label: 'N1', min: 0.1, max: 4, step: 0.1 },
  { key: 'n2', label: 'N2', min: 0.1, max: 4, step: 0.1 },
  { key: 'n3', label: 'N3', min: 0.1, max: 4, step: 0.1 },
  { key: 'a1', label: 'A1', min: 0.1, max: 1.7, step: 0.1 },
  { key: 'a2', label: 'A2', min: 0.1, max: 1.7, step: 0.1 },
];

const CAP_OPTIONS: Array<{ value: StrokeCap; label: string; icon: string }> = [
  { value: 'butt', label: 'Butt', icon: 'M3 7 H13 M13 4 V10' },
  { value: 'round', label: 'Round', icon: 'M3 7 H10 A3.5 3.5 0 0 1 10 7' },
  { value: 'square', label: 'Square', icon: 'M3 7 H10 M10 4 H16 V10 H10' },
];

const JOIN_OPTIONS: Array<{ value: StrokeJoin; label: string; icon: string }> = [
  { value: 'miter', label: 'Miter', icon: 'M3 12 L8 4 L13 12' },
  { value: 'round', label: 'Round', icon: 'M3 12 L8 7 A3 3 0 0 1 11 12' },
  { value: 'bevel', label: 'Bevel', icon: 'M3 12 L6 6 L12 6 L13 12' },
];
const STROKE_POSITION_OPTIONS: Array<{ value: StrokePosition; label: string }> = [
  { value: 'center', label: 'Center' },
  { value: 'inside', label: 'Inside' },
  { value: 'outside', label: 'Outside' },
];
const STROKE_WIDTH_PRESETS = [1, 3, 5, 10, 20];

function StrokePositionIcon({ position }: { position: StrokePosition }) {
  // The stroke band (filled rect) stays fixed in position and width.
  // The path (dashed line) moves: left edge for outside, center for center, right edge for inside.
  const bandX = 6; // fixed position
  const bandWidth = 4; // fixed width
  const pathX = position === 'outside'
    ? bandX // left edge of band
    : position === 'center'
      ? bandX + bandWidth / 2 // center of band
      : bandX + bandWidth; // right edge of band

  const strokeBand = (
    <g>
      <rect x={bandX} y="2" width={bandWidth} height="8" fill="currentColor" opacity="0.9" rx="0.5" />
      <line x1={pathX} y1="2" x2={pathX} y2="10" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1.5 1" opacity="0.5" />
    </g>
  );

  return (
    <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true">
      {strokeBand}
    </svg>
  );
}

const DASH_PRESETS: Array<{ id: string; label: string; dash: number; gap: number }> = [
  { id: 'solid', label: 'Solid', dash: 0, gap: 0 },
  { id: 'dash', label: 'Dash', dash: 8, gap: 6 },
  { id: 'dot', label: 'Dot', dash: 1, gap: 4 },
  { id: 'long', label: 'Long', dash: 16, gap: 8 },
];

function svgDashArray(
  dash: number,
  gap: number,
  scale: number,
): string | undefined {
  if (dash <= 0 && gap <= 0) return undefined;
  const d = Math.max(0.25, dash * scale);
  const g = Math.max(0.25, gap * scale);
  return `${d} ${g}`;
}

function StrokePreviewSvg({
  className,
  color,
  width,
  cap,
  join,
  miter,
  dash,
  gap,
  strokeOn,
  wide,
}: {
  className?: string;
  color: string;
  width: number;
  cap: StrokeCap;
  join: StrokeJoin;
  miter: number;
  dash: number;
  gap: number;
  strokeOn: boolean;
  wide?: boolean;
}) {
  const sw = wide
    ? Math.max(2.5, Math.min(12, width * 0.7))
    : Math.max(2, Math.min(8, width * 0.45));
  const scale = width > 0 ? sw / width : 0.45;
  return (
    <svg
      className={className ?? 'stroke-preview'}
      viewBox={wide ? '0 0 120 36' : '0 0 48 24'}
      width={wide ? 240 : 56}
      height={wide ? 48 : 28}
      aria-hidden="true"
    >
      <path
        d={wide ? 'M10 28 L40 10 L70 26 L110 8' : 'M6 18 L22 6 L42 18'}
        fill="none"
        stroke={strokeOn ? color : '#555'}
        strokeWidth={sw}
        strokeLinecap={cap}
        strokeLinejoin={join}
        strokeMiterlimit={miter}
        strokeDasharray={svgDashArray(dash, gap, scale)}
      />
    </svg>
  );
}

function StrokeParams({
  engine,
  strokeWidth,
  dash,
  gap,
  strokeCap,
  strokeJoin,
  strokePosition,
  miterLimit,
}: {
  engine: NibGliderEngine;
  strokeWidth: number;
  dash: number;
  gap: number;
  strokeCap: StrokeCap;
  strokeJoin: StrokeJoin;
  strokePosition: StrokePosition;
  miterLimit: number;
}) {
  const presetId =
    DASH_PRESETS.find((p) => p.dash === dash && p.gap === gap)?.id ?? null;
  return (
    <div className="panelParameters">
      <span className="param-item">
        <label htmlFor="strokeWidthInput">Width</label>
        <span className="flyout-width-row">
          <input
            type="range"
            id="strokeWidthSlider"
            min="1"
            max="40"
            step="0.5"
            value={strokeWidth}
            title="Stroke width"
            aria-label="Stroke width"
            onChange={(e) => engine.setStrokeWidth(parseFloat(e.target.value))}
          />
          <NumericStepper
            id="strokeWidthInput"
            value={strokeWidth}
            min={1}
            max={200}
            step={1}
            unit="pt"
            ariaLabel="Stroke width in points"
            title="Stroke width"
            onCommit={(n) => engine.setStrokeWidth(n)}
          />
        </span>
      </span>
      <span className="param-item">
        <label>Align</label>
        <div className="seg-ctrl" role="group" aria-label="Stroke alignment">
          {STROKE_POSITION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={`${opt.label} stroke`}
              className={strokePosition === opt.value ? 'active' : undefined}
              onClick={() => engine.setStrokePosition(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </span>
      <div className="flyout-seg">
      <span className="param-item">
        <label>Dash</label>
        <div className="seg-ctrl dash-presets" role="group" aria-label="Dash pattern">
          {DASH_PRESETS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              title={opt.label}
              className={presetId === opt.id ? 'active' : undefined}
              onClick={() => engine.setStrokeDash(opt.dash, opt.gap)}
            >
              <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
                <path
                  d="M2 5 H26"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="butt"
                  strokeDasharray={
                    opt.dash <= 0 && opt.gap <= 0
                      ? undefined
                      : `${Math.max(0.8, opt.dash * 0.55)} ${Math.max(0.8, opt.gap * 0.55)}`
                  }
                />
              </svg>
            </button>
          ))}
        </div>
        <span className="flyout-dash-row">
          <span className="flyout-dash-cell">
            <label htmlFor="strokeDashInput">Dash</label>
            <NumericStepper
              id="strokeDashInput"
              value={dash}
              min={0}
              max={80}
              step={0.5}
              ariaLabel="Dash length"
              onCommit={(n) => engine.setStrokeDash(n, gap)}
            />
          </span>
          <span className="flyout-dash-cell">
            <label htmlFor="strokeGapInput">Gap</label>
            <NumericStepper
              id="strokeGapInput"
              value={gap}
              min={0}
              max={80}
              step={0.5}
              ariaLabel="Gap length"
              onCommit={(n) => engine.setStrokeDash(dash, n)}
            />
          </span>
        </span>
      </span>
      </div>
      <div className="flyout-seg">
      <div className="flyout-trio-row">
      <span className="param-item">
        <label>Cap</label>
        <div className="seg-ctrl" role="group" aria-label="Line cap">
          {CAP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              className={strokeCap === opt.value ? 'active' : undefined}
              onClick={() => engine.setStrokeCap(opt.value)}
            >
              <svg viewBox="0 0 18 14" width="18" height="14">
                <path
                  d={opt.icon}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap={opt.value}
                  strokeLinejoin="miter"
                />
              </svg>
            </button>
          ))}
        </div>
      </span>
      <span className="param-item">
        <label>Join</label>
        <div className="seg-ctrl" role="group" aria-label="Line join">
          {JOIN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              className={strokeJoin === opt.value ? 'active' : undefined}
              onClick={() => engine.setStrokeJoin(opt.value)}
            >
              <svg viewBox="0 0 16 14" width="16" height="14">
                <path
                  d={opt.icon}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="butt"
                  strokeLinejoin={opt.value}
                  strokeMiterlimit={4}
                />
              </svg>
            </button>
          ))}
        </div>
      </span>
      <span className="param-item">
        <label htmlFor="miterLimitInput">Miter</label>
        <NumericStepper
          id="miterLimitInput"
          value={miterLimit}
          min={1}
          max={40}
          step={0.5}
          ariaLabel="Miter"
          title="Miter"
          disabled={strokeJoin !== 'miter'}
          onCommit={(n) => engine.setMiterLimit(n)}
        />
      </span>
      </div>
      </div>
    </div>
  );
}

// Live swatch of the fill spec: solid color or two-stop gradient.
// Gradient def ids are per-instance (titlebar + flyout both mount).
function FillPreviewSvg({
  spec,
  on,
  wide,
}: {
  spec: FillSpec;
  on: boolean;
  wide?: boolean;
}) {
  const gid = `fillprev${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const vb = wide ? '0 0 120 36' : '0 0 48 24';
  const r = { x: wide ? 6 : 3, y: wide ? 5 : 3, w: wide ? 108 : 42, h: wide ? 26 : 18 };
  const fill =
    spec.type === 'linear'
      ? `url(#${gid}-lin)`
      : spec.type === 'radial'
        ? `url(#${gid}-rad)`
        : spec.color;
  return (
    <svg
      className="fill-preview"
      viewBox={vb}
      width={wide ? 240 : 56}
      height={wide ? 48 : 28}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${gid}-lin`}
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientTransform={`rotate(${spec.angle} 0.5 0.5)`}
        >
          <stop offset="0" stopColor={spec.color} />
          <stop offset="1" stopColor={spec.endColor} />
        </linearGradient>
        <radialGradient id={`${gid}-rad`}>
          <stop offset={spec.inner} stopColor={spec.color} />
          <stop offset="1" stopColor={spec.endColor} />
        </radialGradient>
      </defs>
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        rx="3"
        fill={on ? fill : 'none'}
        fillOpacity={on ? 1 : 0}
        stroke={on ? '#888' : '#666'}
        strokeWidth="1"
        strokeDasharray={on ? undefined : '3 2'}
        opacity={on ? 1 : 0.6}
      />
    </svg>
  );
}

const FILL_TYPE_OPTIONS: Array<{ value: FillType; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
];

function FillTypeThumb({ kind }: { kind: FillType }) {
  return (
    <svg viewBox="0 0 22 14" width="22" height="14" aria-hidden="true">
      {kind === 'solid' ? (
        <rect x="5" y="2" width="12" height="10" rx="1.5" fill="currentColor" />
      ) : kind === 'linear' ? (
        <>
          <rect x="3" y="2" width="4" height="10" fill="currentColor" opacity="0.35" />
          <rect x="9" y="2" width="4" height="10" fill="currentColor" opacity="0.65" />
          <rect x="15" y="2" width="4" height="10" fill="currentColor" />
        </>
      ) : (
        <>
          <circle cx="11" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="11" cy="7" r="2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function FillParams({
  engine,
  spec,
}: {
  engine: NibGliderEngine;
  spec: FillSpec;
}) {
  return (
    <div className="panelParameters">
      <div className="flyout-seg">
        <span className="param-item">
          <label>Type</label>
          <div className="seg-ctrl" role="group" aria-label="Fill type">
            {FILL_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                className={spec.type === opt.value ? 'active' : undefined}
                onClick={() => engine.setFillType(opt.value)}
              >
                <FillTypeThumb kind={opt.value} />
              </button>
            ))}
          </div>
        </span>
      </div>
      <div className="flyout-seg">
        <div className="flyout-trio-row">
          <span className="param-item">
            <label htmlFor={spec.type === 'solid' ? 'fillStartInput' : undefined}>
              {spec.type === 'solid' ? 'Color' : 'Start'}
            </label>
            <input
              type="color"
              id={spec.type === 'solid' ? 'fillStartInput' : undefined}
              className="titlebar-well"
              value={spec.color}
              title="Fill start color"
              aria-label="Fill start color"
              onChange={(e) => engine.setFillColor(e.target.value)}
            />
          </span>
          {spec.type !== 'solid' && (
            <span className="param-item">
              <label>End</label>
              <input
                type="color"
                className="titlebar-well"
                value={spec.endColor}
                title="Fill end color"
                aria-label="Fill end color"
                onChange={(e) => engine.setFillEndColor(e.target.value)}
              />
            </span>
          )}
          {spec.type === 'linear' && (
            <span className="param-item">
              <label htmlFor="fillAngleInput">Angle</label>
              <span className="flyout-angle-row">
                <input
                  type="range"
                  aria-label="Gradient angle"
                  min={0}
                  max={360}
                  step={5}
                  value={spec.angle}
                  onChange={(e) => engine.setFillAngle(parseFloat(e.target.value))}
                />
                <NumericStepper
                  id="fillAngleInput"
                  value={spec.angle}
                  min={0}
                  max={360}
                  step={5}
                  unit="°"
                  formatValue={(v) => String(Math.round(v))}
                  ariaLabel="Gradient angle"
                  onCommit={(n) => engine.setFillAngle(n)}
                />
              </span>
            </span>
          )}
          {spec.type === 'radial' && (
            <span className="param-item">
              <label htmlFor="fillInnerInput">Inner</label>
              <span className="flyout-angle-row">
                <input
                  type="range"
                  aria-label="Radial inner radius"
                  min={0}
                  max={0.95}
                  step={0.05}
                  value={spec.inner}
                  onChange={(e) => engine.setFillInner(parseFloat(e.target.value))}
                />
                <NumericStepper
                  id="fillInnerInput"
                  value={Math.round(spec.inner * 100)}
                  min={0}
                  max={95}
                  step={5}
                  unit="%"
                  ariaLabel="Radial inner radius percent"
                  onCommit={(n) => engine.setFillInner(n / 100)}
                />
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const TEXT_FONT_GROUPS: FontFamilyGroup[] = [
  {
    // Vendored under public/fonts with parsed-metric measurement.
    label: 'nibglider',
    fonts: [
      { value: 'Barlow Condensed', label: 'Barlow Condensed', family: 'Barlow Condensed', weight: 600 },
      { value: 'Chakra Petch', label: 'Chakra Petch', family: 'Chakra Petch', weight: 600 },
      { value: 'Exo 2', label: 'Exo 2', family: 'Exo 2', weight: 600 },
      { value: 'JetBrains Mono', label: 'JetBrains Mono', family: 'JetBrains Mono', weight: 600 },
      { value: 'Orbitron', label: 'Orbitron', family: 'Orbitron', weight: 700 },
    ],
  },
  {
    label: 'System',
    fonts: [
      'Helvetica',
      'Arial',
      'Georgia',
      'Times New Roman',
      'Courier New',
      'Verdana',
      'sans-serif',
      'serif',
      'monospace',
    ].map((f) => ({ value: f, label: f, family: f })),
  },
];

const TEXT_WEIGHT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'normal', label: 'Regular' },
  { value: 'bold', label: 'Bold' },
];

const TEXT_JUSTIFY_OPTIONS: Array<{ value: TextJustification; label: string; icon: string }> = [
  { value: 'left', label: 'Left', icon: 'M2 3 H14 M2 7 H10 M2 11 H14' },
  { value: 'center', label: 'Center', icon: 'M2 3 H14 M4 7 H12 M2 11 H14' },
  { value: 'right', label: 'Right', icon: 'M2 3 H14 M6 7 H14 M2 11 H14' },
];

function TextPreviewBox({ spec, large }: { spec: TextSpec; large?: boolean }) {
  // The flyout preview reflects the Size slider; clamped to the 96px
  // preview well so the sample stays legible instead of clipping away.
  const size = large
    ? Math.max(12, Math.min(72, spec.fontSize))
    : Math.max(10, Math.min(18, spec.fontSize * 0.55));
  return (
    <span
      className="text-preview"
      aria-hidden="true"
      style={{
        fontFamily: spec.fontFamily,
        fontSize: size,
        fontWeight: spec.fontWeight,
        fontStyle: spec.italic ? 'italic' : 'normal',
      }}
    >
      {(spec.content || 'Ag').slice(0, 10)}
    </span>
  );
}

function TextParams({
  engine,
  spec,
}: {
  engine: NibGliderEngine;
  spec: TextSpec;
}) {
  const textMode = engine.textMode;
  const displayFlow = engine.displayFlow;
  const glyphOrientation = engine.glyphOrientation;
  const splineTextPlacement = engine.splineTextPlacement;
  return (
    <div className="panelParameters">
      <span className="param-item">
        <label>Kind</label>
        <div className="seg-ctrl seg-text" role="group" aria-label="Text kind">
          {(
            [
              { value: 'display', label: 'Display Text' },
              { value: 'body', label: 'Body Text' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              className={textMode === opt.value ? 'active' : undefined}
              onClick={() => engine.setTextMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </span>
      {textMode === 'display' ? (
        <>
          <div className="flyout-trio-row">
            <span className="param-item">
              <label>Flow</label>
              <div
                className="seg-ctrl seg-text"
                role="group"
                aria-label="Display flow"
              >
                {(
                  [
                    { value: 'interior', label: 'Interior' },
                    { value: 'exterior', label: 'Exterior' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={`${opt.label} of the shape boundary`}
                    className={displayFlow === opt.value ? 'active' : undefined}
                    onClick={() => engine.setDisplayFlow(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </span>
            <span className="param-item">
              <label>Orientation</label>
              <div
                className="seg-ctrl seg-text"
                role="group"
                aria-label="Glyph orientation"
              >
                {(
                  [
                    { value: 'outward', label: 'Outward' },
                    { value: 'inward', label: 'Inward' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={
                      opt.value === 'outward'
                        ? 'Glyph tops point to the circumference'
                        : 'Glyph tops point to the origin'
                    }
                    className={
                      glyphOrientation === opt.value ? 'active' : undefined
                    }
                    onClick={() => engine.setGlyphOrientation(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </span>
            <span className="param-item">
              <label>On Edge</label>
              <div className="seg-ctrl" role="group" aria-label="Text position on edge">
                {TEXT_JUSTIFY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={`${opt.label} on each polygon edge`}
                    aria-label={opt.label}
                    className={spec.justification === opt.value ? 'active' : undefined}
                    onClick={() => engine.setTextJustification(opt.value)}
                  >
                    <svg viewBox="0 0 16 14" width="18" height="14" aria-hidden="true">
                      <path
                        d={opt.icon}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </span>
          </div>
          <span className="param-item">
            <label>Spline</label>
            <div
              className="seg-ctrl seg-text"
              role="group"
              aria-label="Spline text placement"
            >
              {(
                [
                  {
                    value: 'above',
                    label: 'Above',
                    title: 'Descender bottom rests on the spline',
                  },
                  {
                    value: 'baseline',
                    label: 'Baseline',
                    title: 'Spline is the text baseline',
                  },
                  {
                    value: 'below',
                    label: 'Below',
                    title: 'Spline is the ascender line',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.title}
                  className={
                    splineTextPlacement === opt.value ? 'active' : undefined
                  }
                  onClick={() => engine.setSplineTextPlacement(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </span>
          <ParamSlider
            id="displayOffsetSlider"
            label="Offset"
            value={engine.displayOffset}
            min={0}
            max={200}
            step={1}
            unit="pt"
            formatValue={(v) => String(Math.round(v))}
            onChange={(n) => engine.setDisplayOffset(n)}
          />
          <ParamSlider
            label="Gap"
            value={engine.circumferenceGap}
            min={0}
            max={60}
            step={0.5}
            unit="pt"
            onChange={(n) => engine.setCircumferenceGap(n)}
          />
          <ParamSlider
            label="Start"
            value={engine.circumferenceAngleOffset}
            min={-180}
            max={180}
            step={1}
            unit="°"
            formatValue={(v) => String(Math.round(v))}
            onChange={(n) => engine.setCircumferenceAngleOffset(n)}
          />
        </>
      ) : null}
      <span className="param-item">
        <label htmlFor="textContentInput">Text</label>
        <input
          type="text"
          id="textContentInput"
          className="flyout-text-input"
          value={spec.content}
          aria-label="Text content"
          onChange={(e) => engine.setTextContent(e.target.value)}
        />
      </span>
      <span className="param-item">
        <label htmlFor="textLine2Input">Line 2 (second ring)</label>
        <input
          type="text"
          id="textLine2Input"
          className="flyout-text-input"
          value={spec.line2}
          aria-label="Second line for a second display ring"
          onChange={(e) => engine.setTextLine2(e.target.value)}
        />
      </span>
      <div className="flyout-inline-row param-item">
        <label>Typeface</label>
        <FontFamilySelect
          id="textFontSelect"
          ariaLabel="Typeface"
          value={spec.fontFamily}
          groups={TEXT_FONT_GROUPS}
          onChange={(v) => engine.setTextFontFamily(v)}
        />
      </div>
      <ParamSlider
        id="textSizeSlider"
        label="Size"
        value={spec.fontSize}
        min={4}
        max={200}
        step={1}
        unit="pt"
        formatValue={(v) => String(Math.round(v))}
        onChange={(n) => engine.setTextFontSize(n)}
      />
      <div className="flyout-trio-row">
        <span className="param-item">
          <label>Weight</label>
          <div className="seg-ctrl seg-text" role="group" aria-label="Font weight">
            {TEXT_WEIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                className={spec.fontWeight === opt.value ? 'active' : undefined}
                onClick={() => engine.setTextFontWeight(opt.value)}
              >
                <span style={{ fontWeight: opt.value === 'bold' ? 700 : 400 }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </span>
        <span className="param-item">
          <label>Style</label>
          <div className="seg-ctrl seg-text" role="group" aria-label="Font style">
            <button
              type="button"
              title="Italic"
              className={spec.italic ? 'active' : undefined}
              onClick={() => engine.setTextItalic(!spec.italic)}
            >
              <span style={{ fontStyle: 'italic' }}>Italic</span>
            </button>
          </div>
        </span>
      </div>
      {textMode === 'body' ? (
        <span className="param-item">
          <label>Align</label>
          <div className="seg-ctrl" role="group" aria-label="Text alignment">
            {TEXT_JUSTIFY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                className={spec.justification === opt.value ? 'active' : undefined}
                onClick={() => engine.setTextJustification(opt.value)}
              >
                <svg viewBox="0 0 16 14" width="18" height="14" aria-hidden="true">
                  <path
                    d={opt.icon}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ))}
          </div>
        </span>
      ) : null}
      <ParamSlider
        id="textLeadingSlider"
        label="Leading"
        value={spec.leading}
        min={0.8}
        max={3}
        step={0.05}
        decimals={2}
        formatValue={(v) => v.toFixed(2)}
        onChange={(n) => engine.setTextLeading(n)}
      />
    </div>
  );
}

const COMBINE_OPTIONS: Array<{
  value: CombineMode;
  label: string;
  tip: string;
  icon: ReactNode;
}> = [
  {
    value: 'union',
    label: 'Union',
    tip: 'Union: merge base + tool (selection order)',
    icon: (
      <>
        <circle cx="6" cy="7" r="3.6" />
        <circle cx="10" cy="7" r="3.6" />
      </>
    ),
  },
  {
    value: 'subtract',
    label: 'Subtract',
    tip: 'Subtract: cut tool out of base (selection order: base first)',
    icon: (
      <>
        <circle cx="6" cy="7" r="3.6" />
        <circle cx="10" cy="7" r="3.6" strokeDasharray="2 1.4" opacity="0.55" />
      </>
    ),
  },
  {
    value: 'intersect',
    label: 'Intersect',
    tip: 'Intersect: keep the overlap of base + tool',
    icon: <path d="M6 3.4 A3.6 3.6 0 0 1 6 10.6 A3.6 3.6 0 0 1 6 3.4 Z M10 3.4 A3.6 3.6 0 0 0 10 10.6 A3.6 3.6 0 0 0 10 3.4 Z" />,
  },
];

function HistoryButtons({
  engine,
  showUndoRedo = true,
  showGrouping = true,
  showHistory = true,
}: {
  engine: NibGliderEngine;
  showUndoRedo?: boolean;
  showGrouping?: boolean;
  showHistory?: boolean;
}) {
  const undoTitle = engine.canUndo()
    ? `Undo ${engine.undoLabel() ?? ''} (${primaryShortcut('Z')})`
    : 'Nothing to undo';
  const redoTitle = engine.canRedo()
    ? `Redo ${engine.redoLabel() ?? ''} (${primaryShortcut('Z', true)})`
    : 'Nothing to redo';
  const groupTitle = engine.canGroupSelection()
    ? `Group selection (${primaryShortcut('G')})`
    : 'Select 2+ shapes to group';
  const ungroupTitle = engine.canUngroupSelection()
    ? `Ungroup selection (${primaryShortcut('G', true)})`
    : 'Select a group to ungroup';
  const historyReadout = showHistory ? (
    <span className="history-readout" role="status" title="Latest undo and redo entries">
      {engine.canUndo()
        ? `Undo ${engine.undoLabel() ?? ''}`.trim()
        : 'Nothing to undo'}
      {engine.canRedo()
        ? ` · Redo ${engine.redoLabel() ?? ''}`.trim()
        : ''}
    </span>
  ) : null;
  return (
    <>
      {showUndoRedo ? (
      <div className="seg-ctrl" role="group" aria-label="Undo and redo">
        <button
          type="button"
          title={undoTitle}
          aria-label="Undo"
          disabled={!engine.canUndo()}
          onClick={() => engine.undo()}
        >
          <svg
            viewBox="0 0 16 14"
            width="18"
            height="16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6.5 3.5 H3 A4 4 0 0 0 3 10.7 H9" />
            <path d="M5.3 1.6 L3 3.5 L5.3 5.4" />
          </svg>
        </button>
        <button
          type="button"
          title={redoTitle}
          aria-label="Redo"
          disabled={!engine.canRedo()}
          onClick={() => engine.redo()}
        >
          <svg
            viewBox="0 0 16 14"
            width="18"
            height="16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 3.5 H13 A4 4 0 0 1 13 10.7 H7" />
            <path d="M10.7 1.6 L13 3.5 L10.7 5.4" />
          </svg>
        </button>
      </div>
      ) : null}
      {showGrouping ? (
      <div className="seg-ctrl" role="group" aria-label="Group and ungroup">
        <button
          type="button"
          title={groupTitle}
          aria-label="Group selection"
          disabled={!engine.canGroupSelection()}
          onClick={() => engine.groupSelection()}
        >
          <svg
            viewBox="0 0 16 14"
            width="18"
            height="16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4.5" width="6" height="6" />
            <rect x="8" y="3.5" width="6" height="6" />
          </svg>
        </button>
        <button
          type="button"
          title={ungroupTitle}
          aria-label="Ungroup selection"
          disabled={!engine.canUngroupSelection()}
          onClick={() => engine.ungroupSelected()}
        >
          <svg
            viewBox="0 0 16 14"
            width="18"
            height="16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="1.5" y="4.5" width="5" height="6" />
            <rect x="9.5" y="4.5" width="5" height="6" />
          </svg>
        </button>
      </div>
      ) : null}
      {historyReadout}
    </>
  );
}

function CombinatoricsButtons({ engine }: { engine: NibGliderEngine }) {
  const mode = engine.combineMode;
  // One control, two jobs: arming a button sets the deposit mode, and
  // with 2+ shapes already selected the same click combines the
  // selection on the spot (the old dedicated buttons' behavior).
  const arm = (value: CombineMode | 'none'): void => {
    engine.setCombineMode(value);
    if (value !== 'none' && engine.canCombineSelection()) {
      engine.combineSelection(value);
    }
  };
  return (
    <span className="param-item">
      <div className="seg-ctrl" role="group" aria-label="Combine mode">
        <button
          key="none"
          type="button"
          title="None: deposit shapes plainly"
          aria-label="No combining"
          className={mode === 'none' ? 'active' : undefined}
          onClick={() => arm('none')}
        >
          <svg
            viewBox="0 0 16 14"
            width="18"
            height="16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="7" r="3.6" />
            <path d="M5.5 9.5 L10.5 4.5" />
          </svg>
        </button>
        {COMBINE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={`${opt.tip} — arms future deposits; combines the selection now when 2+ shapes are selected`}
            aria-label={opt.label}
            className={mode === opt.value ? 'active' : undefined}
            onClick={() => arm(opt.value)}
          >
            <svg
              viewBox="0 0 16 14"
              width="18"
              height="16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {opt.icon}
            </svg>
          </button>
        ))}
      </div>
      {engine.lastCombineNote ? (
        <span className="combine-note" role="status">
          {engine.lastCombineNote}
        </span>
      ) : null}
    </span>
  );
}

const CIRCLE_SHAPE_LABELS: Record<CircleInnerShape, string> = {
  circle: 'Circle',
  semicircle: 'Semicircle',
  sector: 'Sector',
  segment: 'Segment',
  polygon: 'Regular Polygon',
  supershape: 'Supershape',
  trapezoid: 'Trapezoid',
  parallelogram: 'Parallelogram',
  rightTriangle: 'Right Triangle',
  rhombus: 'Rhombus',
  kite: 'Kite',
};

const RECT_SHAPE_LABELS: Record<RectangleInnerShape, string> = {
  rectangle: 'Rectangle',
  circle: 'Circle',
  polygon: 'Regular Polygon',
  supershape: 'Supershape',
  trapezoid: 'Trapezoid',
  parallelogram: 'Parallelogram',
  rightTriangle: 'Right Triangle',
  rhombus: 'Rhombus',
  kite: 'Kite',
};

// Mini silhouette per shape, drawn in the option list and the closed
// trigger (16x14 viewBox, currentColor — same idiom as TitleIcon).
const SHAPE_THUMB_PATHS: Record<string, ReactNode> = {
  circle: <circle cx="8" cy="7" r="5" />,
  semicircle: <path d="M3 9.5 A5 5 0 0 1 13 9.5 Z" />,
  sector: <path d="M8 7 L11.8 3.2 A5.4 5.4 0 0 1 11.8 10.8 Z" />,
  segment: (
    <>
      <circle cx="8" cy="7" r="5" />
      <path d="M3.6 9.6 H12.4" />
    </>
  ),
  polygon: <path d="M8 1.8 L12.4 4.4 V9.6 L8 12.2 L3.6 9.6 V4.4 Z" />,
  supershape: (
    <path d="M8 1.2 C8.8 4.8 10 6 13.8 7 C10 8 8.8 9.2 8 12.8 C7.2 9.2 6 8 2.2 7 C6 6 7.2 4.8 8 1.2 Z" />
  ),
  trapezoid: <path d="M4.2 11.5 L6 2.8 H10 L11.8 11.5 Z" />,
  parallelogram: <path d="M6.8 2.8 H13 L9.2 11.2 H3 Z" />,
  rightTriangle: <path d="M4.5 2.8 V11.2 H11.5 Z" />,
  rhombus: <path d="M8 1.8 L12.8 7 L8 12.2 L3.2 7 Z" />,
  kite: <path d="M8 1.5 L11 6.5 L8 12.5 L5 6.5 Z" />,
  rectangle: <path d="M2.8 3.2 H13.2 V10.8 H2.8 Z" />,
};

function ShapeThumb({ kind }: { kind: string }) {
  return (
    <svg
      viewBox="0 0 16 14"
      width="18"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {SHAPE_THUMB_PATHS[kind]}
    </svg>
  );
}

function GridThumb({ kind }: { kind: 'square' | 'diamond' }) {
  return (
    <svg
      viewBox="0 0 16 14"
      width="18"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'square' ? (
        <path d="M2 2.5 H14 V11.5 H2 Z M2 7 H14 M8 2.5 V11.5" />
      ) : (
        <>
          <path d="M8 1.5 L13.5 7 L8 12.5 L2.5 7 Z" />
          <circle cx="8" cy="7" r="0.9" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

function AspectThumb({ a, b }: { a: number; b: number }) {
  const w = a >= b ? 12 : (12 * a) / b;
  const h = a >= b ? (12 * b) / a : 12;
  return (
    <svg
      viewBox="0 0 16 14"
      width="18"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <rect x={8 - w / 2} y={7 - h / 2} width={w} height={h} />
    </svg>
  );
}

function shapeLeaf(
  value: CircleInnerShape | RectangleInnerShape,
  labels: Record<string, string>,
): CustomSelectOption {
  return {
    value,
    label: labels[value],
    image: <ShapeThumb kind={value} />,
  };
}

const CIRCLE_OPTION_TREE: CustomSelectOption[] = [
  {
    value: 'grp-round',
    label: 'Round',
    children: (['circle', 'semicircle', 'sector', 'segment'] as const).map(
      (v) => shapeLeaf(v, CIRCLE_SHAPE_LABELS),
    ),
  },
  {
    value: 'grp-angled',
    label: 'Angled',
    children: (
      [
        'polygon',
        'trapezoid',
        'parallelogram',
        'rightTriangle',
        'rhombus',
        'kite',
      ] as const
    ).map((v) => shapeLeaf(v, CIRCLE_SHAPE_LABELS)),
  },
  shapeLeaf('supershape', CIRCLE_SHAPE_LABELS),
];

const GRID_TYPE_OPTIONS: CustomSelectOption[] = [
  { value: 'square', label: 'Square', image: <GridThumb kind="square" /> },
  { value: 'diamond', label: 'Diamond', image: <GridThumb kind="diamond" /> },
];

const ASPECT_RATIO_OPTIONS: CustomSelectOption[] =
  ASPECT_RATIO_PRESETS.map((key) => {
    const [a, b] = key.split(':').map(Number);
    return {
      value: key,
      label: key,
      image: <AspectThumb a={a} b={b} />,
    };
  });

const RECT_OPTION_TREE: CustomSelectOption[] = [
  {
    value: 'grp-frames',
    label: 'Frames',
    children: (['rectangle', 'circle'] as const).map((v) =>
      shapeLeaf(v, RECT_SHAPE_LABELS),
    ),
  },
  {
    value: 'grp-poly',
    label: 'Polygons',
    children: (
      [
        'polygon',
        'trapezoid',
        'parallelogram',
        'rightTriangle',
        'rhombus',
        'kite',
      ] as const
    ).map((v) => shapeLeaf(v, RECT_SHAPE_LABELS)),
  },
  shapeLeaf('supershape', RECT_SHAPE_LABELS),
];

export default function ControlPanel({
  engine,
  onTutorialRequest,
  panels: panelsProp,
}: {
  engine: NibGliderEngine;
  onTutorialRequest?: () => void;
  /** Shared layout manager. When omitted the panel owns one internally.
   * App passes its own instance so live demonstrations can expand the
   * sections their scripts point at. */
  panels?: PanelsManager;
}) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const [paramsFlyout, setParamsFlyout] = useState<
    'circle' | 'rect' | 'stroke' | 'fill' | 'text' | null
  >(null);
  const textPreviewRef = useRef<HTMLButtonElement>(null);
  const fillPreviewRef = useRef<HTMLButtonElement>(null);
  const circlePreviewRef = useRef<HTMLButtonElement>(null);
  const rectPreviewRef = useRef<HTMLButtonElement>(null);
  const strokePreviewRef = useRef<HTMLButtonElement>(null);
  // Stable so the flyout's focus effect only runs when it opens — an
  // inline identity would refocus the flyout shell on every keystroke.
  const closeFlyout = useCallback(() => setParamsFlyout(null), []);
  // Hover preview: the flyouts open on preview mouseenter (fine pointers
  // only, so touch tap-to-toggle is unaffected) and close shortly after
  // the mouse leaves both the trigger and the menu.
  const hoverCloseTimer = useRef<number | null>(null);
  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimer.current !== null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }, []);
  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();
    hoverCloseTimer.current = window.setTimeout(() => {
      hoverCloseTimer.current = null;
      setParamsFlyout(null);
    }, 180);
  }, [cancelHoverClose]);
  // Snapping-type visibility checklist + History segment toggles.
  const [snapVisible, setSnapVisible] = useState<Record<string, boolean>>(() =>
    loadBoolRecord(SNAP_VISIBLE_KEY, SNAP_DEFAULTS),
  );
  const [historySegs, setHistorySegs] = useState<Record<string, boolean>>(() =>
    loadBoolRecord(HISTORY_SEGS_KEY, HISTORY_SEG_DEFAULTS),
  );
  useEffect(() => {
    try {
      localStorage.setItem(SNAP_VISIBLE_KEY, JSON.stringify(snapVisible));
    } catch {
      /* ignore */
    }
  }, [snapVisible]);
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_SEGS_KEY, JSON.stringify(historySegs));
    } catch {
      /* ignore */
    }
  }, [historySegs]);
  // Length unit lives on the engine (conversions there); the panel only
  // syncs it to localStorage since the engine itself never persists.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LENGTH_UNIT_KEY);
      if (raw === 'pt' || raw === 'inch' || raw === 'cm') {
        engine.setLengthUnit(raw);
      }
    } catch {
      /* ignore */
    }
    // Load once: later unit changes flow through engine notifications.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LENGTH_UNIT_KEY, engine.lengthUnit);
    } catch {
      /* ignore */
    }
  }, [engine.lengthUnit]);
  // Hover-open select menus (panel CustomSelects only) share the same
  // single-open invariant: opening one closes the params flyout, and
  // opening a flyout dismisses any hover-open select menu.
  const [selectCloseKey, setSelectCloseKey] = useState(0);
  const dismissSelects = useCallback(() => setSelectCloseKey((k) => k + 1), []);
  // Section icon menu: which section's title menu is open and its anchor.
  const [iconMenu, setIconMenu] = useState<{
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const closeIconMenu = useCallback(() => setIconMenu(null), []);
  const toggleIconMenu = useCallback(
    (id: string, anchor: HTMLElement) => {
      dismissSelects();
      setParamsFlyout(null);
      setIconMenu((prev) => (prev?.id === id ? null : { id, anchor }));
    },
    [dismissSelects],
  );
  const handleSelectHoverOpen = useCallback(() => {
    setParamsFlyout(null);
    setIconMenu(null);
  }, []);
  const openFlyoutAndDismissSelects = useCallback(
    (name: 'circle' | 'rect' | 'stroke' | 'fill' | 'text') => {
      setParamsFlyout(name);
      dismissSelects();
      setIconMenu(null);
    },
    [dismissSelects],
  );
  const hoverOpenFlyout = useCallback(
    (name: 'circle' | 'rect' | 'stroke' | 'fill' | 'text') => {
      if (window.matchMedia?.('(hover: none)').matches) return;
      cancelHoverClose();
      openFlyoutAndDismissSelects(name);
    },
    [cancelHoverClose, openFlyoutAndDismissSelects],
  );
  const toggleFlyout = useCallback(
    (name: 'circle' | 'rect' | 'stroke' | 'fill' | 'text') => {
      if (paramsFlyout === name) setParamsFlyout(null);
      else {
        setParamsFlyout(name);
        dismissSelects();
        setIconMenu(null);
      }
    },
    [paramsFlyout, dismissSelects],
  );
  // Panel section chrome: collapse, remove/restore, and drag-reorder.
  // PanelsManager persists the layout.
  const fallbackPanels = useRef<PanelsManager | null>(null);
  if (fallbackPanels.current === null) fallbackPanels.current = new PanelsManager();
  const panels = panelsProp ?? fallbackPanels.current;
  useSyncExternalStore(panels.subscribe, panels.getVersion);
  const collapsedMap = panels.collapsed;
  const removedList = panels.removed;
  const orderMap = panels.order;
  const [ctxMenu, setCtxMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [ctxMenu]);
  const toggleCollapse = useCallback((id: string) => {
    panels.toggleCollapse(id);
    // The title button and the collapsed icon swap, so a menu anchored
    // to either one would point at a detached node.
    setIconMenu((prev) => (prev?.id === id ? null : prev));
  }, [panels]);
  const removeSection = useCallback((id: string) => {
    panels.removeSection(id);
    setCtxMenu(null);
  }, [panels]);
  const restoreSection = useCallback((id: string) => {
    panels.restoreSection(id);
  }, [panels]);
  const dragRef = useRef<{
    id: string;
    gapTarget: { x: number; y: number } | null;
  } | null>(null);
  const dragStartFrame = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPlaceholder, setDragPlaceholder] = useState<{
    id: string;
    width: number;
    height: number;
  } | null>(null);
  const beginDrag = useCallback((id: string, size: { width: number; height: number }, rowStarts: string[]) => {
    dragRef.current = { id, gapTarget: null };
    // Hiding the draggable during dragstart aborts native dragging in some
    // browsers. Wait until the browser has captured its drag image.
    dragStartFrame.current = requestAnimationFrame(() => {
      dragStartFrame.current = null;
      if (dragRef.current?.id !== id) return;
      panels.setRowStarts(rowStarts);
      setDraggingId(id);
      setDragPlaceholder({ id, ...size });
    });
  }, [panels]);
  const endDrag = useCallback(() => {
    if (dragStartFrame.current !== null) {
      cancelAnimationFrame(dragStartFrame.current);
      dragStartFrame.current = null;
    }
    dragRef.current = null;
    setDraggingId(null);
    setDragPlaceholder(null);
  }, []);
  useEffect(() => {
    window.addEventListener('drop', endDrag, true);
    window.addEventListener('dragend', endDrag);
    return () => {
      window.removeEventListener('drop', endDrag, true);
      window.removeEventListener('dragend', endDrag);
      if (dragStartFrame.current !== null) cancelAnimationFrame(dragStartFrame.current);
    };
  }, [endDrag]);
  const hoverDrag = useCallback(
    (overId: string, after: boolean, x: number, y: number) => {
      const drag = dragRef.current;
      if (!drag || drag.id === overId) return;
      // The row-start target moves when the placeholder enters its row.
      // Keep it stable until the pointer has actually moved away.
      if (drag.gapTarget) {
        if (Math.hypot(x - drag.gapTarget.x, y - drag.gapTarget.y) < 16) return;
        drag.gapTarget = null;
      }
      panels.moveSection(drag.id, overId, after);
    },
    [panels],
  );
  const isRemoved = useCallback((id: string) => removedList.includes(id), [removedList]);
  // Operations rail box: immediate entries act on the selection at once;
  // scale/rotate open the modal dialog with a live on-page preview.
  const [fileValue, setFileValue] = useState('file-none');
  const [docValue, setDocValue] = useState('doc-none');
  const [opValue, setOpValue] = useState('ops-none');
  const [layersValue, setLayersValue] = useState('layers-none');
  const [sectionsValue, setSectionsValue] = useState('sections-none');
  const [debugValue, setDebugValue] = useState('debug-none');
  const [opDialog, setOpDialog] = useState<
    | { kind: 'scale'; draft: number; applied: number }
    | { kind: 'rotate'; draft: number; applied: number }
    | null
  >(null);

  const openOpDialog = useCallback(
    (kind: 'scale' | 'rotate') => {
      if (!engine.canTransformSelection()) return;
      dismissSelects();
      setOpDialog(
        kind === 'scale'
          ? { kind, draft: 100, applied: 1 }
          : { kind, draft: 0, applied: 0 },
      );
    },
    [engine, dismissSelects],
  );
  const handleOperation = useCallback(
    (v: string) => {
      if (v === 'ops-none') return;
      dismissSelects();
      switch (v) {
        case 'op-delete':
          engine.removeAllSelectedItemsAndReset();
          break;
        case 'op-duplicate':
          engine.duplicateSelection();
          break;
        case 'op-group':
          engine.groupSelection();
          break;
        case 'op-ungroup':
          engine.ungroupSelected();
          break;
        case 'op-front':
          engine.bringSelectionToFront();
          break;
        case 'op-back':
          engine.sendSelectionToBack();
          break;
        case 'op-scale':
          openOpDialog('scale');
          break;
        case 'op-rotate':
          openOpDialog('rotate');
          break;
        default:
          break;
      }
      // Reset to the placeholder label after acting.
      setOpValue('ops-none');
    },
    [engine, dismissSelects, openOpDialog],
  );
  const handleOpDraft = useCallback(
    (n: number) => {
      if (!opDialog || !Number.isFinite(n)) return;
      if (opDialog.kind === 'scale') {
        const clamped = Math.min(1000, Math.max(1, n));
        const target = clamped / 100;
        const delta = target / opDialog.applied;
        if (delta !== 1) engine.scaleSelectionPreview(delta);
        setOpDialog({ ...opDialog, draft: clamped, applied: target });
        return;
      }
      const clamped = Math.min(360, Math.max(-360, n));
      const delta = clamped - opDialog.applied;
      if (delta !== 0) engine.rotateSelectionPreview(delta);
      setOpDialog({ ...opDialog, draft: clamped, applied: clamped });
    },
    [engine, opDialog],
  );
  const cancelOpDialog = useCallback(() => {
    if (!opDialog) return;
    if (opDialog.kind === 'scale') {
      if (opDialog.applied !== 1)
        engine.scaleSelectionPreview(1 / opDialog.applied);
    } else if (opDialog.applied !== 0) {
      engine.rotateSelectionPreview(-opDialog.applied);
    }
    setOpDialog(null);
  }, [engine, opDialog]);
  const commitOpDialog = useCallback(() => {
    if (!opDialog) return;
    if (opDialog.kind === 'scale') {
      const net = opDialog.applied;
      if (net !== 1) {
        engine.pushUndoCommand(
          `Scale ${Math.round(net * 100)}%`,
          () => engine.scaleSelectionPreview(1 / net),
          () => engine.scaleSelectionPreview(net),
        );
      }
    } else {
      const net = opDialog.applied;
      if (net !== 0) {
        engine.pushUndoCommand(
          `Rotate ${Math.round(net)}°`,
          () => engine.rotateSelectionPreview(-net),
          () => engine.rotateSelectionPreview(net),
        );
      }
    }
    setOpDialog(null);
  }, [engine, opDialog]);
  // File menu: Document cards (Open, New, Save, Rename) and Transfer
  // cards (Export, Import) render as beveled grid buttons; Learn stays a
  // plain row. All cards are backed by the gallery store and the engine's
  // document-session API.
  const FILE_OPTIONS: CustomSelectOption[] = [
    { value: 'hdr-file-doc', label: 'Document', header: true, columns: 2 },
    { value: 'file-open', label: 'Open', card: true, image: <OpenCardIcon />, title: 'Open a document from the gallery' },
    { value: 'file-new', label: 'New', card: true, image: <NewCardIcon />, title: 'Start a new document' },
    { value: 'file-save', label: 'Save', card: true, image: <SaveCardIcon />, title: 'Save to the gallery' },
    { value: 'file-rename', label: 'Rename', card: true, image: <RenameCardIcon />, title: 'Rename the open document' },
    { value: 'hdr-file-transfer', label: 'Transfer', header: true, columns: 2 },
    { value: 'file-export', label: 'Export', card: true, image: <ExportCardIcon />, title: 'Download the scene as SVG' },
    { value: 'file-import', label: 'Import', card: true, image: <ImportCardIcon />, title: 'Import an SVG file into the scene' },
    { value: 'hdr-file-learn', label: 'Learn', header: true },
    { value: 'file-tutorial', label: 'Tutorial', title: 'Start the guided tutorial' },
  ];
  // Open document name for the page title and the rail label. The panel
  // re-renders on every engine change, and every gallery mutation ends in
  // a state update, so both stay fresh without a store subscription.
  const docName = galleryDisplayName(browserStore());
  const docDirty = engine.isDocumentDirty();
  useEffect(() => {
    document.title = `${docName}${docDirty ? ' •' : ''} — NibGlider`;
  }, [docName, docDirty]);
  // Document gallery dialog state. Docs are re-read from the store on open
  // and after every mutation while the dialog is showing.
  const [galleryMode, setGalleryMode] = useState<GalleryMode | null>(null);
  const [galleryDocs, setGalleryDocs] = useState<GalleryDoc[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
  const refreshGallery = useCallback(() => {
    setGalleryDocs(galleryListDocuments(browserStore()));
  }, []);
  const openGallery = useCallback(
    (mode: GalleryMode) => {
      dismissSelects();
      refreshGallery();
      setGalleryMode(mode);
    },
    [dismissSelects, refreshGallery],
  );
  const saveSceneToGallery = useCallback(
    (name: string): boolean => {
      const svg = engine.exportSceneSVG();
      if (!svg) return false;
      gallerySaveDocument(browserStore(), name, svg);
      engine.markDocumentClean();
      return true;
    },
    [engine],
  );
  const handleGalleryOpen = useCallback(
    (doc: GalleryDoc) => {
      if (
        engine.isDocumentDirty() &&
        !window.confirm(`Open "${doc.name}"? Unsaved changes will be lost.`)
      ) {
        return;
      }
      if (engine.replaceSceneWithSVG(`Open ${doc.name}`, doc.svg)) {
        gallerySetCurrent(browserStore(), doc.id);
        engine.markDocumentClean();
      }
      setGalleryMode(null);
      refreshGallery();
    },
    [engine, refreshGallery],
  );
  const handleGallerySave = useCallback(
    (name: string) => {
      saveSceneToGallery(name);
      setGalleryMode(null);
      refreshGallery();
    },
    [saveSceneToGallery, refreshGallery],
  );
  const handleGalleryRename = useCallback(
    (name: string) => {
      const id = galleryCurrentId(browserStore());
      if (id) galleryRenameDocument(browserStore(), id, name);
      setGalleryMode(null);
      refreshGallery();
    },
    [refreshGallery],
  );
  const handleGalleryDelete = useCallback(
    (id: string) => {
      galleryDeleteDocument(browserStore(), id);
      refreshGallery();
    },
    [refreshGallery],
  );
  const handleImportFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => { /* A failed read imports nothing. */ };
      reader.onload = () => {
        const text = reader.result;
        if (typeof text !== 'string' || !/<svg[\s>]/i.test(text.slice(0, 4096))) return;
        engine.importSceneSVG(text, `Import ${file.name}`);
      };
      reader.readAsText(file);
    },
    [engine],
  );
  const handleFile = useCallback(
    (v: string) => {
      if (v === 'file-none') return;
      dismissSelects();
      switch (v) {
        case 'file-tutorial':
          onTutorialRequest?.();
          break;
        case 'file-open':
          openGallery('open');
          break;
        case 'file-new':
          if (
            engine.isDocumentDirty() &&
            !window.confirm('Start a new document? Unsaved changes will be lost.')
          ) {
            break;
          }
          engine.newDocument();
          gallerySetCurrent(browserStore(), null);
          engine.markDocumentClean();
          break;
        case 'file-save': {
          const id = galleryCurrentId(browserStore());
          if (id) saveSceneToGallery(galleryCurrentName(browserStore()) ?? 'Untitled');
          else openGallery('save');
          break;
        }
        case 'file-rename':
          if (galleryCurrentId(browserStore())) openGallery('rename');
          else openGallery('save');
          break;
        case 'file-export': {
          const svg = engine.exportSceneSVG();
          if (!svg) break;
          const name = galleryCurrentName(browserStore()) ?? 'untitled';
          const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `${name}.svg`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          break;
        }
        case 'file-import':
          importInputRef.current?.click();
          break;
        default:
          break;
      }
      // Reset to the placeholder label after acting.
      setFileValue('file-none');
    },
    [dismissSelects, engine, onTutorialRequest, openGallery, saveSceneToGallery],
  );
  // Document and Settings menu: document controls only. Section restore
  // and settings reset live in the Sections and Debug menus below.
  const DOCUMENT_OPTIONS: CustomSelectOption[] = [
    { value: 'doc-canvas', label: 'Canvas size…', disabled: true, title: 'Canvas size settings are not available yet' },
    {
      value: 'grp-doc-unit',
      label: 'Length unit',
      children: [
        { value: 'doc-unit-pt', label: 'Points (pt)' },
        { value: 'doc-unit-inch', label: 'Inches' },
        { value: 'doc-unit-cm', label: 'Centimeters (cm)' },
      ],
    },
  ];
  const handleDocument = useCallback(
    (value: string) => {
      dismissSelects();
      if (value === 'doc-unit-pt') engine.setLengthUnit('pt');
      else if (value === 'doc-unit-inch') engine.setLengthUnit('inch');
      else if (value === 'doc-unit-cm') engine.setLengthUnit('cm');
      setDocValue('doc-none');
    },
    [engine, dismissSelects],
  );
  // Sections menu: restore removed panel sections.
  const removedOptions: CustomSelectOption[] = [
    ...(removedList.length > 0
      ? [
          {
            value: 'grp-removed',
            label: 'Restore',
            children: removedList.map((id) => ({
              value: `restore:${id}`,
              label: sectionLabel(id),
            })),
          },
        ]
      : []),
  ];
  const DEBUG_OPTIONS: CustomSelectOption[] = [
    { value: 'debug-reset-settings', label: 'Reset all settings' },
  ];
  const handleDebug = useCallback((value: string) => {
    setDebugValue('debug-none');
    if (value !== 'debug-reset-settings') return;
    try {
      clearNibGliderSettings(localStorage);
    } catch { /* Storage can be unavailable in private browsing. */ }
    window.location.reload();
  }, []);
  // Operations menu: flat grouped areas (headers, not collapsible parents)
  // so every entry is one hover away. Shortcuts shown where a binding exists.
  const OPERATIONS_OPTIONS: CustomSelectOption[] = [
    { value: 'hdr-ops-immediate', label: 'Immediate', header: true },
    { value: 'op-delete', label: 'Delete selection', shortcut: 'Backspace' },
    { value: 'op-duplicate', label: 'Duplicate selection' },
    { value: 'op-group', label: 'Group selection', shortcut: primaryShortcut('G') },
    { value: 'op-ungroup', label: 'Ungroup selection', shortcut: primaryShortcut('G', true) },
    { value: 'op-front', label: 'Bring to front' },
    { value: 'op-back', label: 'Send to back' },
    { value: 'hdr-ops-dialog', label: 'With dialog', header: true },
    { value: 'op-scale', label: 'Scale…' },
    { value: 'op-rotate', label: 'Rotate…' },
  ];
  // Layers and Objects menu: ordering and selection operations.
  const LAYERS_OPTIONS: CustomSelectOption[] = [
    { value: 'hdr-layers-order', label: 'Order', header: true },
    { value: 'layer-front', label: 'Bring to front' },
    { value: 'layer-back', label: 'Send to back' },
    { value: 'hdr-layers-selection', label: 'Selection', header: true },
    { value: 'layer-group', label: 'Group selection', shortcut: primaryShortcut('G') },
    { value: 'layer-ungroup', label: 'Ungroup selection', shortcut: primaryShortcut('G', true) },
    { value: 'layer-duplicate', label: 'Duplicate selection' },
    { value: 'layer-delete', label: 'Delete selection', shortcut: 'Backspace' },
  ];
  const handleLayers = useCallback(
    (v: string) => {
      if (v === 'layers-none') return;
      dismissSelects();
      switch (v) {
        case 'layer-delete':
          engine.removeAllSelectedItemsAndReset();
          break;
        case 'layer-duplicate':
          engine.duplicateSelection();
          break;
        case 'layer-group':
          engine.groupSelection();
          break;
        case 'layer-ungroup':
          engine.ungroupSelected();
          break;
        case 'layer-front':
          engine.bringSelectionToFront();
          break;
        case 'layer-back':
          engine.sendSelectionToBack();
          break;
        default:
          break;
      }
      // Reset to the placeholder label after acting.
      setLayersValue('layers-none');
    },
    [engine, dismissSelects],
  );
  // Selection state: when items are selected the Stroke/Fill panels
  // reflect the selection (first selected item) instead of the globals.
  const sel = engine.selectionPaint();
  const strokeOn = sel ? sel.strokeOn : engine.strokeEnabled;
  const strokeColor = sel ? sel.strokeColor : engine.globalStrokeColor;
  const strokeWidth = sel ? sel.strokeWidth : engine.globalStrokeWidth;
  const strokeCap = sel ? sel.strokeCap : engine.globalStrokeCap;
  const strokeJoin = sel ? sel.strokeJoin : engine.globalStrokeJoin;
  const strokePosition = sel ? sel.strokePosition : engine.globalStrokePosition;
  const miterLimit = sel ? sel.miterLimit : engine.globalMiterLimit;
  const dashLength = sel ? sel.dashLength : engine.globalDashLength;
  const gapLength = sel ? sel.gapLength : engine.globalGapLength;
  const fillOn = sel ? sel.fillOn : engine.fillEnabled;
  const fillColor = sel ? sel.fillColor : engine.globalFillColor;
  const fillSpec = sel ? sel.fillSpec : engine.fillSpec();

  // Length snap field in the current display unit.
  const lengthField =
    engine.lengthUnit === 'inch'
      ? { min: 0.05, max: 10, step: 0.125, unit: 'inches' }
      : engine.lengthUnit === 'cm'
        ? { min: 0.5, max: 200, step: 0.5, unit: 'cm' }
        : { min: 1, max: 500, step: 1, unit: 'pt' };
  const lengthStepDisplay =
    Math.round(engine.lengthSnapStepInUnit() * 1000) / 1000;
  const toggleSnapVisible = useCallback((key: string) => {
    setSnapVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const toggleHistorySeg = useCallback((key: string) => {
    setHistorySegs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const iconMenuBody = (id: string): ReactNode => {
    if (id === 'snappingControls') {
      return (
        <>
          {SNAP_MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={!!snapVisible[item.key]}
              className="im-row"
              onClick={() => toggleSnapVisible(item.key)}
            >
              <span className="im-check" aria-hidden="true">
                {snapVisible[item.key] ? (
                  <svg viewBox="0 0 10 10" width="10" height="10">
                    <path
                      d="M1.5 5.5 L4 8 L8.5 2.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </span>
              <span className="im-label">{item.label}</span>
              <span className="im-state">
                {item.isOn(engine) ? 'On' : 'Off'}
              </span>
            </button>
          ))}
          <div className="im-sep" role="separator" />
          <div className="im-units" role="group" aria-label="Length unit">
            {LENGTH_UNIT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={engine.lengthUnit === opt.value}
                className={
                  engine.lengthUnit === opt.value
                    ? 'im-unit active'
                    : 'im-unit'
                }
                onClick={() => engine.setLengthUnit(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      );
    }
    if (id === 'historyControls') {
      return (
        <>
          {(
            [
              { key: 'undoRedo', label: 'Undo/Redo' },
              { key: 'grouping', label: 'Grouping' },
              { key: 'history', label: 'History' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={!!historySegs[item.key]}
              className="im-row"
              onClick={() => toggleHistorySeg(item.key)}
            >
              <span className="im-check" aria-hidden="true">
                {historySegs[item.key] ? (
                  <svg viewBox="0 0 10 10" width="10" height="10">
                    <path
                      d="M1.5 5.5 L4 8 L8.5 2.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </span>
              <span className="im-label">{item.label}</span>
            </button>
          ))}
        </>
      );
    }
    return null;
  };

  const orderedSections = sectionOrder(orderMap);
  const sectionProps = (id: string) => {
    return {
      order: orderedSections.indexOf(id) * 2,
      menuOpen: iconMenu?.id === id,
      dragging: draggingId === id,
      onIconMenu: toggleIconMenu,
      onToggleCollapse: toggleCollapse,
      onRemoveRequest: (rid: string, x: number, y: number) =>
        setCtxMenu({ id: rid, x, y }),
      onDragSessionStart: beginDrag,
      onDragSessionEnd: endDrag,
      onDragHover: hoverDrag,
    };
  };
  const dragPlaceholderNode = dragPlaceholder && dragPlaceholder.width && dragPlaceholder.height
    ? <div
        className="section-drag-placeholder"
        aria-hidden="true"
        style={{
          order: orderedSections.indexOf(dragPlaceholder.id) * 2,
          width: dragPlaceholder.width,
          height: dragPlaceholder.height,
        }}
      />
    : null;
  const rowBreakNodes = panels.rowStarts
    .filter((id) => !isRemoved(id) && orderedSections.indexOf(id) > 0)
    .map((id) => <span
      key={id}
      className="panel-row-break"
      aria-hidden="true"
      style={{ order: orderedSections.indexOf(id) * 2 - 1 }}
    />);

  return (
    <div className="panel-shell">
      <div className="panel-side">
        <div className="panel-rail" role="group" aria-label="Panel tools">
          <WidgetHandle widget="menus" label="Application menus" />
          <div
            className="doc-label"
            title={docDirty ? `${docName} (unsaved changes)` : docName}
            aria-live="polite"
          >
            {docName}
            {docDirty ? ' •' : null}
          </div>
          <div className="rail-box" title="File: documents, import, export" data-tutorial-id="menu-file">
            <CustomSelect
              id="panelFileSelect"
              ariaLabel="File"
              placeholder="File"
              value={fileValue}
              options={FILE_OPTIONS}
              onChange={handleFile}
              openOnHover
              stickyOnClick
              onHoverOpen={handleSelectHoverOpen}
              forceCloseKey={selectCloseKey}
            />
          </div>
          <div className="rail-box" title="Document and Settings" data-tutorial-id="menu-document">
            <CustomSelect
              id="panelDocumentSelect"
              ariaLabel="Document and Settings"
              placeholder="Document"
              value={docValue}
              options={DOCUMENT_OPTIONS}
              onChange={handleDocument}
              openOnHover
              stickyOnClick
              onHoverOpen={handleSelectHoverOpen}
              forceCloseKey={selectCloseKey}
            />
          </div>
          <div className="rail-box" title="Operations on the selection" data-tutorial-id="menu-operations">
            <CustomSelect
              id="panelOperationsSelect"
              ariaLabel="Operations on the selection"
              placeholder="Operations"
              value={opValue}
              options={OPERATIONS_OPTIONS}
              onChange={handleOperation}
              openOnHover
              stickyOnClick
              onHoverOpen={handleSelectHoverOpen}
              forceCloseKey={selectCloseKey}
            />
          </div>
          <div className="rail-box" title="Layers and Objects" data-tutorial-id="menu-layers">
            <CustomSelect
              id="panelLayersSelect"
              ariaLabel="Layers and Objects"
              placeholder="Layers"
              value={layersValue}
              options={LAYERS_OPTIONS}
              onChange={handleLayers}
              openOnHover
              stickyOnClick
              onHoverOpen={handleSelectHoverOpen}
              forceCloseKey={selectCloseKey}
            />
          </div>
          <div className="rail-box" title="Panel sections" data-tutorial-id="menu-sections">
            <CustomSelect
              id="panelSectionsSelect"
              ariaLabel="Panel sections"
              placeholder="Sections"
              value={sectionsValue}
              options={removedOptions}
              onChange={(v) => {
                if (v.startsWith('restore:')) restoreSection(v.slice(8));
                setSectionsValue('sections-none');
              }}
              openOnHover
              stickyOnClick
              onHoverOpen={handleSelectHoverOpen}
              forceCloseKey={selectCloseKey}
            />
          </div>
          <div className="rail-box" title="Debug settings" data-tutorial-id="menu-debug">
            <CustomSelect
              id="panelDebugSelect"
              ariaLabel="Debug settings"
              placeholder="Debug"
              value={debugValue}
              options={DEBUG_OPTIONS}
              onChange={handleDebug}
              openOnHover
              stickyOnClick
              onHoverOpen={handleSelectHoverOpen}
              forceCloseKey={selectCloseKey}
            />
          </div>
        </div>
        <KeymapWidget engine={engine} />
        </div>
      <div
        className="panel-sections"
        role="group"
        aria-label="Panel sections"
        onDragOver={(e) => {
          if (!e.dataTransfer?.types.includes('text/panel-section')) return;
          e.preventDefault();
          if (e.target !== e.currentTarget) return;
          const drag = dragRef.current;
          if (!drag) return;
          if (drag.gapTarget) {
            if (Math.hypot(e.clientX - drag.gapTarget.x,
              e.clientY - drag.gapTarget.y) < 16) return;
            drag.gapTarget = null;
          }
          const visible = [...e.currentTarget.querySelectorAll(':scope > section:not(.section-dragging)')]
            .map((section) => ({ id: section.id, rect: section.getBoundingClientRect() }))
            .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
          const rows: Array<{ first: typeof visible[number]; bottom: number }> = [];
          for (const section of visible) {
            const last = rows[rows.length - 1];
            if (last && Math.abs(last.first.rect.top - section.rect.top) < 3) {
              last.bottom = Math.max(last.bottom, section.rect.bottom);
            } else {
              rows.push({ first: section, bottom: section.rect.bottom });
            }
          }
          for (let index = 1; index < rows.length; index += 1) {
            const previous = rows[index - 1];
            const row = rows[index];
            const first = row.first;
            // Include the inter-row gap and the empty space just left of the
            // first card. Both should mean "insert before this row".
            if (e.clientY < previous.bottom || e.clientY > row.bottom ||
                e.clientX > first.rect.left + Math.min(60, first.rect.width / 2)) continue;
            drag.gapTarget = { x: e.clientX, y: e.clientY };
            panels.moveSection(drag.id, first.id);
            break;
          }
        }}
        onDrop={(e) => {
          if (!e.dataTransfer?.types.includes('text/panel-section')) return;
          e.preventDefault();
          endDrag();
        }}
      >
      <WidgetHandle widget="sections" label="Panel sections" />
      {rowBreakNodes}
      {dragPlaceholderNode}
      {isRemoved('strokeControls') ? null : (
      <PanelSection
        id="strokeControls"
        label="Stroke"
        icon={
          <TitleIcon>
            <path d="M10.8 2.2 L13.8 5.2 L7 12 L3.5 13 L4.5 9.5 Z" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['strokeControls']}
        className={sel ? 'panel-card reflecting-selection' : 'panel-card'}
        {...sectionProps('strokeControls')}
      >
        <header className="pane-titlebar titlebar-single">
          
          <SectionTitleButton sectionId="strokeControls" title="Stroke" menuOpen={iconMenu?.id === 'strokeControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <path d="M10.8 2.2 L13.8 5.2 L7 12 L3.5 13 L4.5 9.5 Z" />
            </TitleIcon>
            <span className="pane-title-text">Stroke</span></span>
          </SectionTitleButton>
          <span className="key-switch-group">
            <label className="toggle-switch square-knob">
              <input
                type="checkbox"
                id="strokeEnabledCheckbox"
                checked={strokeOn}
                onChange={(e) => engine.setStrokeEnabled(e.target.checked)}
              />
              <span className="slider" />
            </label>
            <kbd className="title-seg-kbd">S</kbd>
          </span>
          <input
            type="color"
            id="strokeColorWell"
            className="titlebar-well"
            value={strokeColor}
            title="Stroke Color"
            onChange={(e) => engine.setStrokeColor(e.target.value)}
          />
          <span className="stroke-width-stack">
            <NumericStepper
              id="strokeWidthDisplay"
              size="compact"
              value={strokeWidth}
              min={1}
              max={200}
              step={1}
              unit="pt"
              ariaLabel="Stroke width in points"
              title="Stroke width"
              onCommit={(n) => engine.setStrokeWidth(n)}
            />
            <div
              className="seg-ctrl seg-text stroke-presets"
              role="group"
              aria-label="Stroke width presets"
            >
              {STROKE_WIDTH_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  title={`Stroke width ${preset} pt`}
                  aria-label={`Stroke width ${preset} points`}
                  aria-pressed={strokeWidth === preset}
                  className={strokeWidth === preset ? 'active' : undefined}
                  onClick={() => engine.setStrokeWidth(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </span>
          <div
            className="stroke-position-control"
            role="group"
            aria-label="Stroke alignment"
          >
            {STROKE_POSITION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={`${opt.label} stroke`}
                aria-label={`${opt.label} stroke`}
                aria-pressed={strokePosition === opt.value}
                className={strokePosition === opt.value ? 'active' : undefined}
                onClick={() => engine.setStrokePosition(opt.value)}
              >
                <StrokePositionIcon position={opt.value} />
              </button>
            ))}
          </div>
          <button
            type="button"
            ref={strokePreviewRef}
            id="strokePreviewContainer"
            className={
              'stroke-preview-trigger' +
              (paramsFlyout === 'stroke' ? ' open' : '')
            }
            aria-haspopup="dialog"
            aria-expanded={paramsFlyout === 'stroke'}
            aria-label="Stroke parameters"
            title="Stroke parameters"
            onMouseEnter={() => hoverOpenFlyout('stroke')}
            onMouseLeave={scheduleHoverClose}
            onClick={() => toggleFlyout('stroke')}
          >
            <StrokePreviewSvg
              color={strokeColor}
              width={strokeWidth}
              cap={strokeCap}
              join={strokeJoin}
              miter={miterLimit}
              dash={dashLength}
              gap={gapLength}
              strokeOn={strokeOn}
            />
          </button>
          <ShapeParamsFlyout
            open={paramsFlyout === 'stroke'}
            triggerRef={strokePreviewRef}
            tone="stroke"
            title="Stroke"
            preview={
              <StrokePreviewSvg
                color={strokeColor}
                width={strokeWidth}
                cap={strokeCap}
                join={strokeJoin}
                miter={miterLimit}
                dash={dashLength}
                gap={gapLength}
                strokeOn={strokeOn}
                wide
              />
            }
            onClose={closeFlyout}
            onMenuMouseEnter={cancelHoverClose}
            onMenuMouseLeave={scheduleHoverClose}
          >
            <StrokeParams
              engine={engine}
              strokeWidth={strokeWidth}
              dash={dashLength}
              gap={gapLength}
              strokeCap={strokeCap}
              strokeJoin={strokeJoin}
              strokePosition={strokePosition}
              miterLimit={miterLimit}
            />
          </ShapeParamsFlyout>
        </header>
      </PanelSection>
      )}

      {isRemoved('fillControls') ? null : (
      <PanelSection
        id="fillControls"
        label="Fill"
        icon={
          <TitleIcon>
            <path
              d="M8 1.5 C8 1.5 3.5 7.5 3.5 10 A4.5 4.5 0 0 0 12.5 10 C12.5 7.5 8 1.5 8 1.5 Z"
              fill="currentColor"
              stroke="none"
            />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['fillControls']}
        className={sel ? 'panel-card reflecting-selection' : 'panel-card'}
        {...sectionProps('fillControls')}
      >
        <header className="pane-titlebar titlebar-single">
          
          <SectionTitleButton sectionId="fillControls" title="Fill" menuOpen={iconMenu?.id === 'fillControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <path
                d="M8 1.5 C8 1.5 3.5 7.5 3.5 10 A4.5 4.5 0 0 0 12.5 10 C12.5 7.5 8 1.5 8 1.5 Z"
                fill="currentColor"
                stroke="none"
              />
            </TitleIcon>
            <span className="pane-title-text">Fill</span></span>
          </SectionTitleButton>
          <span className="key-switch-group">
            <label className="toggle-switch square-knob">
              <input
                type="checkbox"
                id="fillEnabledCheckbox"
                checked={fillOn}
                onChange={(e) => engine.setFillEnabled(e.target.checked)}
              />
              <span className="slider" />
            </label>
            <kbd className="title-seg-kbd">D</kbd>
          </span>
          <input
            type="color"
            id="fillColorWell"
            className="titlebar-well"
            value={fillColor}
            title="Fill Color"
            onChange={(e) => engine.setFillColor(e.target.value)}
          />
          <button
            type="button"
            ref={fillPreviewRef}
            id="fillPreviewContainer"
            className={
              'fill-preview-trigger' +
              (paramsFlyout === 'fill' ? ' open' : '')
            }
            aria-haspopup="dialog"
            aria-expanded={paramsFlyout === 'fill'}
            aria-label="Fill parameters"
            title="Fill parameters"
            onMouseEnter={() => hoverOpenFlyout('fill')}
            onMouseLeave={scheduleHoverClose}
            onClick={() => toggleFlyout('fill')}
          >
            <FillPreviewSvg spec={fillSpec} on={fillOn} />
          </button>
          <ShapeParamsFlyout
            open={paramsFlyout === 'fill'}
            triggerRef={fillPreviewRef}
            tone="fill"
            title="Fill"
            preview={
              <FillPreviewSvg spec={fillSpec} on={fillOn} wide />
            }
            onClose={closeFlyout}
            onMenuMouseEnter={cancelHoverClose}
            onMenuMouseLeave={scheduleHoverClose}
          >
            <FillParams engine={engine} spec={fillSpec} />
          </ShapeParamsFlyout>
        </header>
      </PanelSection>
      )}

      {isRemoved('textControls') ? null : (
      <PanelSection
        id="textControls"
        label="Text"
        icon={
          <TitleIcon>
            <path d="M3 3 H13 M8 3 V11" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['textControls']}
        {...sectionProps('textControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="textControls" title="Text" menuOpen={iconMenu?.id === 'textControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <path d="M3 3 H13 M8 3 V11" />
            </TitleIcon>
            <span className="pane-title-text">Text</span></span>
          </SectionTitleButton>
          <label className="toggle-switch square-knob">
            <input
              type="checkbox"
              id="textModeEnabledCheckbox"
              checked={engine.textModeEnabled}
              title="Text Mode: shape keys draw text"
              onChange={(e) => engine.setTextModeEnabled(e.target.checked)}
            />
            <span className="slider" />
          </label>
          <button
            type="button"
            ref={textPreviewRef}
            id="textPreviewContainer"
            className={
              'text-preview-trigger' +
              (paramsFlyout === 'text' ? ' open' : '')
            }
            aria-haspopup="dialog"
            aria-expanded={paramsFlyout === 'text'}
            aria-label="Text parameters"
            title="Text parameters"
            onMouseEnter={() => hoverOpenFlyout('text')}
            onMouseLeave={scheduleHoverClose}
            onClick={() => toggleFlyout('text')}
          >
            <TextPreviewBox spec={engine.globalText} />
          </button>
          <ShapeParamsFlyout
            open={paramsFlyout === 'text'}
            triggerRef={textPreviewRef}
            tone="text"
            title="Text"
            preview={<TextPreviewBox spec={engine.globalText} large />}
            onClose={closeFlyout}
            onMenuMouseEnter={cancelHoverClose}
            onMenuMouseLeave={scheduleHoverClose}
          >
            <TextParams engine={engine} spec={engine.globalText} />
          </ShapeParamsFlyout>
        </header>
      </PanelSection>
      )}

      {isRemoved('circleFrameControls') ? null : (
      <PanelSection
        id="circleFrameControls"
        label="Circle Keys"
        icon={
          <TitleIcon>
            <circle cx="8" cy="7" r="5" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['circleFrameControls']}
        {...sectionProps('circleFrameControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="circleFrameControls" title="Circle Keys" menuOpen={iconMenu?.id === 'circleFrameControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <circle cx="8" cy="7" r="5" />
            </TitleIcon>
            <span className="pane-title-text">Circle Keys</span></span>
          </SectionTitleButton>
        <CustomSelect
          id="circleInnerShapeSelect"
          ariaLabel="Circle Keys shape"
          value={engine.circleInnerShapeType}
          options={CIRCLE_OPTION_TREE}
          onChange={(v) =>
            engine.setCircleInnerShapeType(v as CircleInnerShape)
          }
          openOnHover
          onHoverOpen={handleSelectHoverOpen}
          forceCloseKey={selectCloseKey}
        />
        <button
          type="button"
          ref={circlePreviewRef}
          id="shapePreviewContainer"
          className={
            'shape-preview-trigger' +
            (paramsFlyout === 'circle' ? ' open' : '')
          }
          aria-haspopup="dialog"
          aria-expanded={paramsFlyout === 'circle'}
          aria-label="Circle Keys shape parameters"
          title="Shape parameters"
          onMouseEnter={() => hoverOpenFlyout('circle')}
          onMouseLeave={scheduleHoverClose}
          onClick={() => toggleFlyout('circle')}
        >
          <InnerShapePreviewSvg
            id="shapePreview"
            pathId="shapePreviewPath"
            frame="circle"
            width={120}
            height={64}
            d={engine.innerShapePreviewPath(
              engine.circleInnerShapeType,
              engine.circleInnerShapeParams,
            )}
          />
        </button>
        <ShapeParamsFlyout
          open={paramsFlyout === 'circle'}
          triggerRef={circlePreviewRef}
          tone="circle"
          title={CIRCLE_SHAPE_LABELS[engine.circleInnerShapeType]}
          preview={
            <InnerShapePreviewSvg
              frame="circle"
              d={engine.innerShapePreviewPath(
                engine.circleInnerShapeType,
                engine.circleInnerShapeParams,
              )}
            />
          }
          onClose={closeFlyout}
          onMenuMouseEnter={cancelHoverClose}
          onMenuMouseLeave={scheduleHoverClose}
        >
          <CircleShapeParams engine={engine} />
        </ShapeParamsFlyout>
        </header>
      </PanelSection>
      )}

      {isRemoved('rectFrameControls') ? null : (
      <PanelSection
        id="rectFrameControls"
        label="Rect Keys"
        icon={
          <TitleIcon>
            <path d="M3 2 H13 V12 H3 Z" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['rectFrameControls']}
        {...sectionProps('rectFrameControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="rectFrameControls" title="Rect Keys" menuOpen={iconMenu?.id === 'rectFrameControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <path d="M3 2 H13 V12 H3 Z" />
            </TitleIcon>
            <span className="pane-title-text">Rect Keys</span></span>
          </SectionTitleButton>
        <CustomSelect
          id="rectInnerShapeSelect"
          ariaLabel="Rect Keys shape"
          value={engine.rectangleInnerShapeType}
          options={RECT_OPTION_TREE}
          onChange={(v) =>
            engine.setRectangleInnerShapeType(v as RectangleInnerShape)
          }
          openOnHover
          onHoverOpen={handleSelectHoverOpen}
          forceCloseKey={selectCloseKey}
        />
        <button
          type="button"
          ref={rectPreviewRef}
          id="rectShapePreviewContainer"
          className={
            'shape-preview-trigger' +
            (paramsFlyout === 'rect' ? ' open' : '')
          }
          aria-haspopup="dialog"
          aria-expanded={paramsFlyout === 'rect'}
          aria-label="Rect Keys shape parameters"
          title="Shape parameters"
          onMouseEnter={() => hoverOpenFlyout('rect')}
          onMouseLeave={scheduleHoverClose}
          onClick={() => toggleFlyout('rect')}
        >
          <InnerShapePreviewSvg
            id="rectShapePreview"
            pathId="rectShapePreviewPath"
            frame="rect"
            width={120}
            height={64}
            d={engine.innerShapePreviewPath(
              engine.rectangleInnerShapeType,
              engine.rectangleInnerShapeParams,
              'rect',
            )}
          />
        </button>
        <ShapeParamsFlyout
          open={paramsFlyout === 'rect'}
          triggerRef={rectPreviewRef}
          tone="rect"
          title={RECT_SHAPE_LABELS[engine.rectangleInnerShapeType]}
          preview={
            <InnerShapePreviewSvg
              frame="rect"
              d={engine.innerShapePreviewPath(
                engine.rectangleInnerShapeType,
                engine.rectangleInnerShapeParams,
                'rect',
              )}
            />
          }
          onClose={closeFlyout}
          onMenuMouseEnter={cancelHoverClose}
          onMenuMouseLeave={scheduleHoverClose}
        >
          <RectShapeParams engine={engine} />
        </ShapeParamsFlyout>
        </header>
      </PanelSection>
      )}

      {isRemoved('combinatoricsControls') ? null : (
      <PanelSection
        id="combinatoricsControls"
        label="Combinatorics"
        icon={
          <TitleIcon>
            <circle cx="6" cy="7" r="3.5" />
            <circle cx="10" cy="7" r="3.5" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['combinatoricsControls']}
        {...sectionProps('combinatoricsControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="combinatoricsControls" title="Combinatorics" menuOpen={iconMenu?.id === 'combinatoricsControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <circle cx="6" cy="7" r="3.5" />
              <circle cx="10" cy="7" r="3.5" />
            </TitleIcon>
            <span className="pane-title-text">Combinatorics</span></span>
          </SectionTitleButton>
          <CombinatoricsButtons engine={engine} />
        </header>
      </PanelSection>
      )}

      {isRemoved('historyControls') ? null : (
      <PanelSection
        id="historyControls"
        label="History"
        icon={
          <TitleIcon>
            <path d="M6.5 3.5 H3 A4 4 0 0 0 3 10.7 H9" />
            <path d="M5.3 1.6 L3 3.5 L5.3 5.4" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['historyControls']}
        {...sectionProps('historyControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="historyControls" title="History" menuOpen={iconMenu?.id === 'historyControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <path d="M6.5 3.5 H3 A4 4 0 0 0 3 10.7 H9" />
              <path d="M5.3 1.6 L3 3.5 L5.3 5.4" />
            </TitleIcon>
            <span className="pane-title-text">History</span></span>
          </SectionTitleButton>
          <HistoryButtons
            engine={engine}
            showUndoRedo={historySegs.undoRedo !== false}
            showGrouping={historySegs.grouping !== false}
            showHistory={historySegs.history !== false}
          />
        </header>
      </PanelSection>
      )}
      {isRemoved('gridControls') ? null : (
      <PanelSection
        id="gridControls"
        label="Grid"
        icon={
          <TitleIcon>
            <circle cx="3" cy="2.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="8" cy="2.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="13" cy="2.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="3" cy="7" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="8" cy="7" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="13" cy="7" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="3" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="8" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="13" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['gridControls']}
        {...sectionProps('gridControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="gridControls" title="Grid" menuOpen={iconMenu?.id === 'gridControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <circle cx="3" cy="2.5" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="8" cy="2.5" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="13" cy="2.5" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="3" cy="7" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="8" cy="7" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="13" cy="7" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="3" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="8" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="13" cy="11.5" r="1.4" fill="currentColor" stroke="none" />
            </TitleIcon>
            <span className="pane-title-text">Grid</span></span>
          </SectionTitleButton>
          <span className="key-switch-group">
            <label className="toggle-switch square-knob">
              <input
                type="checkbox"
                id="gridEnabledCheckbox"
                checked={engine.isGridEnabled}
                onChange={(e) => engine.setGridEnabled(e.target.checked)}
              />
              <span className="slider" />
            </label>
            <kbd className="title-seg-kbd">/</kbd>
          </span>
          <CustomSelect
            id="gridTypeSelect"
            ariaLabel="Grid type"
            value={engine.gridType}
            options={GRID_TYPE_OPTIONS}
            onChange={(v) => engine.setGridType(v as GridType)}
            openOnHover
            onHoverOpen={handleSelectHoverOpen}
            forceCloseKey={selectCloseKey}
          />
        </header>
      </PanelSection>
      )}
      {isRemoved('snappingControls') ? null : (
      <PanelSection
        id="snappingControls"
        label="Snapping"
        icon={
          <TitleIcon>
            <circle cx="8" cy="7" r="3.5" />
            <path d="M8 0.5 V2.5 M8 11.5 V13.5 M1.5 7 H3.5 M12.5 7 H14.5" />
            <circle cx="8" cy="7" r="1" fill="currentColor" stroke="none" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['snappingControls']}
        {...sectionProps('snappingControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="snappingControls" title="Snapping" menuOpen={iconMenu?.id === 'snappingControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <circle cx="8" cy="7" r="3.5" />
              <path d="M8 0.5 V2.5 M8 11.5 V13.5 M1.5 7 H3.5 M12.5 7 H14.5" />
              <circle cx="8" cy="7" r="1" fill="currentColor" stroke="none" />
            </TitleIcon>
            <span className="pane-title-text">Snapping</span></span>
          </SectionTitleButton>
          <div className="snapping-seg" role="group" aria-label="Snapping modes">
          {snapVisible.grid !== false ? (
          <SnapToggle
            id="gridSnappingToggle"
            label="Grid"
            pressed={engine.isGridSnappingEnabled}
            onToggle={(next) => engine.setGridSnappingEnabled(next)}
          >
            <circle cx="2.5" cy="2.5" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="6" cy="2.5" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="9.5" cy="2.5" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="2.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="6" cy="6" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="9.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="2.5" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="6" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="9.5" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
          </SnapToggle>
          ) : null}
          {snapVisible.path !== false ? (
          <SnapToggle
            id="pathSnappingToggle"
            label="Path"
            pressed={engine.isPathSnappingEnabled}
            onToggle={(next) => engine.setPathSnappingEnabled(next)}
          >
            <path d="M1.5 9 C4 9 4 3.5 6.5 3.5 S9.5 6 10.5 6" />
            <circle cx="1.5" cy="9" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="10.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
          </SnapToggle>
          ) : null}
          {snapVisible.points !== false ? (
          <SnapToggle
            id="pointSnappingToggle"
            label="Points"
            pressed={engine.isPointSnappingEnabled}
            onToggle={(next) => engine.setPointSnappingEnabled(next)}
          >
            <path d="M2 9.5 L6 4 L10 7" />
            <circle cx="2" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="6" cy="4" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="10" cy="7" r="1.2" fill="currentColor" stroke="none" />
          </SnapToggle>
          ) : null}
          {snapVisible.angle !== false ? (
          <span className="snap-field" title="Angle">
            <SnapToggle
              id="angleSnappingToggle"
              label="Angle"
              pressed={engine.isAngleSnappingEnabled}
              onToggle={(next) => engine.setAngleSnappingEnabled(next)}
            >
              <path d="M1.5 10.5 H10.5 M1.5 10.5 L8.5 2" />
              <path d="M4.8 10.5 A3.4 3.4 0 0 0 4.2 7.6" />
            </SnapToggle>
            <SnapNumInput
              id="angleSnapStepInput"
              label="Angle snap step in degrees"
              value={engine.angleSnapDegrees}
              min={1}
              max={90}
              step={1}
              disabled={!engine.isAngleSnappingEnabled}
              onCommit={(n) => engine.setAngleSnapDegrees(n)}
            />
          </span>
          ) : null}
          {snapVisible.length !== false ? (
          <span className="snap-field" title="Length">
            <SnapToggle
              id="lengthSnappingToggle"
              label="Length"
              pressed={engine.isLengthSnappingEnabled}
              onToggle={(next) => engine.setLengthSnappingEnabled(next)}
            >
              <path d="M2 6 H10 M2 6 L4 4 M2 6 L4 8 M10 6 L8 4 M10 6 L8 8" />
            </SnapToggle>
            <SnapNumInput
              id="lengthSnapStepInput"
              label={`Length snap step in ${lengthField.unit}`}
              value={lengthStepDisplay}
              min={lengthField.min}
              max={lengthField.max}
              step={lengthField.step}
              disabled={!engine.isLengthSnappingEnabled}
              onCommit={(n) => engine.setLengthSnapStepFromUnit(n)}
            />
          </span>
          ) : null}
          {snapVisible.aspect !== false ? (
          <div className="snapping-aspect">
            <SnapToggle
              id="aspectSnappingToggle"
              label="Aspect"
              pressed={engine.isAspectSnappingEnabled}
              onToggle={(next) => engine.setAspectSnappingEnabled(next)}
            >
              <path d="M1 2.5 H11 V9.5 H1 Z M6 2.5 V9.5" />
            </SnapToggle>
            <CustomSelect
              id="aspectRatioSelect"
              ariaLabel="Aspect ratio"
              value={engine.aspectRatioKey()}
              options={ASPECT_RATIO_OPTIONS}
              onChange={(v) => engine.setAspectRatioKey(v)}
              openOnHover
              onHoverOpen={handleSelectHoverOpen}
              forceCloseKey={selectCloseKey}
            />
          </div>
          ) : null}
          </div>
        </header>
      </PanelSection>
      )}
      </div>
      {ctxMenu
        ? createPortal(
            <div
              className="section-ctx-menu"
              role="menu"
              aria-label={`${sectionLabel(ctxMenu.id)} section menu`}
              style={{
                left: Math.min(ctxMenu.x, window.innerWidth - 200),
                top: Math.min(ctxMenu.y, window.innerHeight - 120),
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="section-ctx-title">{sectionLabel(ctxMenu.id)}</div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  toggleCollapse(ctxMenu.id);
                  setCtxMenu(null);
                }}
              >
                {collapsedMap[ctxMenu.id] ? 'Expand section' : 'Collapse to icon'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => removeSection(ctxMenu.id)}
              >
                Remove section
              </button>
            </div>,
            document.body,
          )
        : null}
      {opDialog ? (
        <OperationDialog
          kind={opDialog.kind}
          draft={opDialog.draft}
          onDraft={handleOpDraft}
          onCommit={commitOpDialog}
          onCancel={cancelOpDialog}
        />
      ) : null}
      {iconMenu ? (
        <SectionIconMenu
          anchor={iconMenu.anchor}
          label={sectionLabel(iconMenu.id)}
          collapsed={!!collapsedMap[iconMenu.id]}
          onToggleCollapse={() => toggleCollapse(iconMenu.id)}
          onClose={closeIconMenu}
        >
          {iconMenuBody(iconMenu.id)}
        </SectionIconMenu>
      ) : null}
      <input
        ref={importInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleImportFile}
      />
      {galleryMode ? (
        <DocumentGallery
          mode={galleryMode}
          docs={galleryDocs}
          openId={galleryCurrentId(browserStore())}
          initialName={galleryCurrentName(browserStore()) ?? 'Untitled'}
          saveLabel="Save"
          onOpen={handleGalleryOpen}
          onSave={handleGallerySave}
          onRename={handleGalleryRename}
          onDelete={handleGalleryDelete}
          onClose={() => setGalleryMode(null)}
        />
      ) : null}
    </div>
  );
}
