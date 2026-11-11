import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
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
import { combinePreviewBoxLabel } from '../ui/PreviewBoxPresenter';
import {
  browserGallerySession,
  newDocumentNameFrom,
  nextUntitledFrom,
  type GalleryMeta,
} from '../ui/DocumentGallery';
import {
  nativeFileName,
  serializeNativeDocument,
  wrapSceneAsNativeDocument,
} from '../engine/document/NativeDocument';
import { useGallerySnapshot } from '../ui/useGallerySnapshot';

import CustomSelect, { type CustomSelectOption } from './CustomSelect';
import DocumentGallery, { type GalleryMode } from './DocumentGallery';
import NewDocumentDialog, { type NewDocumentSpec } from './NewDocumentDialog';
import FindReplaceDialog from './FindReplaceDialog';
import PdfImportDialog from './PdfImportDialog';
import LayersPanel from './LayersPanel';
import PagesPanel from './PagesPanel';
import SwatchesPanel from './SwatchesPanel';
import ArrangePanel from './ArrangePanel';
import {
  IMPORT_ACCEPT,
  renameTarget,
  saveTarget,
  type FileCommand,
  type ImportCommand,
} from '../ui/fileCommands';
import {
  formatInUnit,
  pointsToUnit,
  targetScalePercent,
  unitLabel,
} from '../engine/document/MeasurementUnits';
import type { RepeatAnchor, RepeatDirection } from '../engine/geometry/RepeatGeometry';
import {
  FRIEZE_GROUP_IDS,
  FRIEZE_GROUPS,
  FRIEZE_ORBIFOLD,
  REPEAT_OUTCOMES,
  WALLPAPER_GROUP_IDS,
  WALLPAPER_GROUPS,
  WALLPAPER_ORBIFOLD,
  type FriezeGroupId,
  type Progression,
  type RepeatFamilyName,
  type WallpaperGroupId,
} from '../engine/repeat/symmetry';
import KeymapWidget from './KeymapWidget';
import ConfigSummaryBox from './ConfigSummaryBox';
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
  TextJustification,
  TextSpec,
  TypeCursorAnchor,
  TypeCursorBottomEdge,
} from '../engine/engine';
import type { ArrowheadStyle } from '../engine/appearance/arrowheads';

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
export function SnapNumInput({
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
  history: true,
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
const SCALE_SIZE_UNITS: LengthUnit[] = ['pt', 'pica', 'inch', 'ft', 'mm', 'cm', 'm'];

function trimDims(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

// Scale-by-size section: target width/height in a chosen unit plus a live
// readout of the selection size. Scaling stays uniform (the engine previews
// one factor about the center), so the aspect from dialog-open is locked and
// editing either axis drives the same percent draft as the slider.
function ScaleSizeFields({
  baseW,
  baseH,
  live,
  defaultUnit,
  onDraft,
}: {
  baseW: number;
  baseH: number;
  live: { width: number; height: number } | null;
  defaultUnit: LengthUnit;
  onDraft: (percent: number) => void;
}) {
  const sized = baseW > 0 && baseH > 0;
  const aspect = sized ? baseH / baseW : 0;
  const [unit, setUnit] = useState<LengthUnit>(defaultUnit);
  const [targetW, setTargetW] = useState(() => trimDims(pointsToUnit(baseW, defaultUnit)));
  const [targetH, setTargetH] = useState(() => trimDims(pointsToUnit(baseH, defaultUnit)));
  const [error, setError] = useState<string | null>(null);

  const changeUnit = (next: LengthUnit) => {
    setUnit(next);
    setTargetW(trimDims(pointsToUnit(baseW, next)));
    setTargetH(trimDims(pointsToUnit(baseH, next)));
    setError(null);
  };
  const commitAxis = (raw: string, axis: 'w' | 'h') => {
    if (axis === 'w') setTargetW(raw);
    else setTargetH(raw);
    const v = Number(raw);
    if (!sized || raw.trim() === '' || !Number.isFinite(v) || v <= 0) {
      setError(sized ? 'Enter a positive target size.' : null);
      return;
    }
    setError(null);
    if (axis === 'w') setTargetH(trimDims(v * aspect));
    else setTargetW(trimDims(v / aspect));
    onDraft(targetScalePercent(axis === 'w' ? baseW : baseH, v, unit));
  };

  return (
    <>
      <p className="op-modal-readout" aria-live="polite">
        {live
          ? `Current size: ${formatInUnit(live.width, unit)} × ${formatInUnit(live.height, unit)}`
          : 'Current size: no selection'}
      </p>
      {sized ? (
        <div className="op-modal-size">
          <label className="op-modal-size-field">
            <span>Width</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Target width"
              value={targetW}
              onChange={(e) => commitAxis(e.target.value, 'w')}
            />
          </label>
          <span className="op-modal-times" aria-hidden="true">×</span>
          <label className="op-modal-size-field">
            <span>Height</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="Target height"
              value={targetH}
              onChange={(e) => commitAxis(e.target.value, 'h')}
            />
          </label>
          <label className="op-modal-size-field">
            <span>Unit</span>
            <select
              className="op-modal-select"
              aria-label="Target size unit"
              value={unit}
              onChange={(e) => changeUnit(e.target.value as LengthUnit)}
            >
              {SCALE_SIZE_UNITS.map((option) => (
                <option key={option} value={option}>
                  {unitLabel(option)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="op-modal-hint">Target size needs a selection with positive width and height.</p>
      )}
      {error ? (
        <p className="op-modal-error" role="alert">{error}</p>
      ) : (
        <p className="op-modal-hint">Aspect locked — scaling stays uniform.</p>
      )}
    </>
  );
}

function OperationDialog({
  kind,
  draft,
  base,
  live,
  defaultUnit,
  onDraft,
  onCommit,
  onCancel,
}: {
  kind: 'scale' | 'rotate';
  draft: number;
  base: { width: number; height: number } | null;
  live: { width: number; height: number } | null;
  defaultUnit: LengthUnit;
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
        {kind === 'scale' && base ? (
          <ScaleSizeFields
            baseW={base.width}
            baseH={base.height}
            live={live}
            defaultUnit={defaultUnit}
            onDraft={onDraft}
          />
        ) : null}
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

// Path Operations (Slice 20): the reshape operations that used to
// live inside the Stroke flyout. The Stroke section keeps paint
// only; these buttons disable when the selection cannot take them.
function PathOpsParams({ engine }: { engine: NibGliderEngine }) {
  const ops = engine.pathOpAvailability();
  return (
    <div className="panelParameters">
      <div className="flyout-trio-row">
        <span className="param-item">
          <label>Outline</label>
          <button
            type="button"
            disabled={!ops.strokeOutline}
            onClick={() => engine.strokeToOutlineSelection()}
            title="Convert the selected stroked paths to their outlined filled form"
          >
            Stroke to Outline
          </button>
        </span>
      </div>
      <div className="flyout-trio-row">
        <span className="param-item">
          <label htmlFor="noiseAmplitudeInput">Noise size</label>
          <NumericStepper
            id="noiseAmplitudeInput"
            value={engine.noiseAmplitude}
            min={0}
            max={200}
            step={1}
            ariaLabel="Noise size"
            title="How far the noise pushes the path sideways"
            onCommit={(n) => engine.setNoiseAmplitude(n)}
          />
        </span>
        <span className="param-item">
          <label htmlFor="noiseScaleInput">Noise scale</label>
          <NumericStepper
            id="noiseScaleInput"
            value={engine.noiseScale}
            min={5}
            max={1000}
            step={5}
            ariaLabel="Noise scale"
            title="How quickly the noise changes along the path — smaller is rougher"
            onCommit={(n) => engine.setNoiseScale(n)}
          />
        </span>
        <span className="param-item">
          <label htmlFor="noiseSeedInput">Noise seed</label>
          <NumericStepper
            id="noiseSeedInput"
            value={engine.noiseSeed}
            min={0}
            max={999999}
            step={1}
            ariaLabel="Noise seed"
            title="The same seed and path always give the same result"
            onCommit={(n) => engine.setNoiseSeed(n)}
          />
        </span>
        <span className="param-item">
          <label className="check-row">
            <input
              type="checkbox"
              checked={engine.noisePreviewOn}
              onChange={(e) => engine.setNoisePreview(e.target.checked)}
            />
            Preview
          </label>
          <button
            type="button"
            disabled={!ops.noise}
            onClick={() => engine.applyNoiseDisplacement()}
            title="Push the selected paths sideways with seeded noise (one undo step)"
          >
            Apply noise
          </button>
        </span>
      </div>
      <div className="flyout-trio-row">
        <span className="param-item">
          <label htmlFor="simplifyToleranceInput">Simplify within</label>
          <NumericStepper
            id="simplifyToleranceInput"
            value={engine.simplifyTolerance}
            min={0.05}
            max={100}
            step={0.5}
            ariaLabel="Simplify tolerance"
            title="Points that stay within this distance of the simplified path are dropped"
            onCommit={(n) => engine.setSimplifyTolerance(n)}
          />
        </span>
        <span className="param-item">
          <label>Simplify</label>
          <button
            type="button"
            disabled={!ops.simplify}
            onClick={() => engine.simplifySelectionPaths()}
            title="Reduce the selected paths to fewer points (one undo step)"
          >
            Simplify path
          </button>
        </span>
        <span className="param-item">
          <label htmlFor="fitToleranceInput">Fit within</label>
          <NumericStepper
            id="fitToleranceInput"
            value={engine.fitTolerance}
            min={0.05}
            max={100}
            step={0.25}
            ariaLabel="Fit tolerance"
            title="Largest error you accept between the fitted curves and the path"
            onCommit={(n) => engine.setFitTolerance(n)}
          />
        </span>
        <span className="param-item">
          <label>Fit</label>
          <button
            type="button"
            disabled={!ops.fit}
            onClick={() => engine.fitBeziersSelection()}
            title="Convert the selected paths to editable Bézier curves (one undo step)"
          >
            Fit curves
          </button>
        </span>
      </div>
      <div className="flyout-trio-row">
        <span className="param-item">
          <label htmlFor="hullConcavenessInput">Hull tightness</label>
          <NumericStepper
            id="hullConcavenessInput"
            value={engine.hullConcaveness}
            min={0}
            max={1}
            step={0.05}
            ariaLabel="Hull tightness"
            title="How closely the hull follows gaps and bays in the selected points — 1 follows them closely, 0 stays near the convex hull"
            onCommit={(n) => engine.setHullConcaveness(n)}
          />
        </span>
        <span className="param-item">
          <label>Hull</label>
          <button
            type="button"
            disabled={!ops.hull}
            onClick={() => engine.concaveHullSelection()}
            title="Draw a new closed path around the selected items' anchor points (one undo step)"
          >
            Concave hull
          </button>
        </span>
      </div>
      {engine.pathOpFeedback ? (
        <div className="flyout-trio-row">
          <span className="param-item">{engine.pathOpFeedback}</span>
        </div>
      ) : null}
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
  const showOrient = type !== 'rectangle' && type !== 'circle' && type !== 'exportFrame';
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
  tone: 'circle' | 'rect' | 'stroke' | 'fill' | 'text' | 'combinatorics';
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

const ARROWHEAD_OPTIONS: Array<{ value: ArrowheadStyle; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'barb', label: 'Barb' },
  { value: 'dot', label: 'Dot' },
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
const STROKE_WIDTH_PRESETS = [1, 3, 5, 10, 20];

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
  miterLimit,
}: {
  engine: NibGliderEngine;
  strokeWidth: number;
  dash: number;
  gap: number;
  strokeCap: StrokeCap;
  strokeJoin: StrokeJoin;
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
      <div className="flyout-trio-row">
        <span className="param-item">
          <label htmlFor="arrowStartSelect">Start arrow</label>
          <select
            id="arrowStartSelect"
            value={engine.selectionPaint()?.arrowStart ?? engine.globalArrowStart}
            onChange={(e) => engine.setArrowStart(e.target.value as ArrowheadStyle)}
          >
            {ARROWHEAD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </span>
        <span className="param-item">
          <label htmlFor="arrowEndSelect">End arrow</label>
          <select
            id="arrowEndSelect"
            value={engine.selectionPaint()?.arrowEnd ?? engine.globalArrowEnd}
            onChange={(e) => engine.setArrowEnd(e.target.value as ArrowheadStyle)}
          >
            {ARROWHEAD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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

/** The fontWeight string the panel's numeric weight select shows:
 * legacy 'normal'/'bold' map to 400/700. */
function panelWeightValue(fontWeight: string): string {
  if (fontWeight === 'bold') return '700';
  if (fontWeight === 'normal') return '400';
  return fontWeight;
}

const TEXT_JUSTIFY_OPTIONS: Array<{ value: TextJustification; label: string; icon: string }> = [
  { value: 'left', label: 'Left', icon: 'M2 3 H14 M2 7 H10 M2 11 H14' },
  { value: 'center', label: 'Center', icon: 'M2 3 H14 M4 7 H12 M2 11 H14' },
  { value: 'right', label: 'Right', icon: 'M2 3 H14 M6 7 H14 M2 11 H14' },
];

/** Body Align group adds Justify; display/on-edge keeps the three
 * above (Justify behaves as Left there). */
const BODY_JUSTIFY_OPTIONS: Array<{ value: TextJustification; label: string; icon: string }> = [
  ...TEXT_JUSTIFY_OPTIONS,
  { value: 'justify', label: 'Justify', icon: 'M2 3 H14 M2 7 H14 M2 11 H14' },
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

const TYPE_CURSOR_ANCHORS: Array<{ value: TypeCursorAnchor; label: string; x: number; y: number }> = [
  { value: 'top-left', label: 'Top left', x: 0, y: 0 },
  { value: 'top-center', label: 'Top center', x: 50, y: 0 },
  { value: 'top-right', label: 'Top right', x: 100, y: 0 },
  { value: 'middle-left', label: 'Middle left', x: 0, y: 50 },
  { value: 'center', label: 'Center', x: 50, y: 50 },
  { value: 'middle-right', label: 'Middle right', x: 100, y: 50 },
  { value: 'bottom-left', label: 'Bottom left', x: 0, y: 100 },
  { value: 'bottom-center', label: 'Bottom center', x: 50, y: 100 },
  { value: 'bottom-right', label: 'Bottom right', x: 100, y: 100 },
];

const TYPE_CURSOR_BOTTOM_EDGES: Array<{
  value: TypeCursorBottomEdge;
  label: string;
  title: string;
}> = [
  {
    value: 'baseline',
    label: 'Baseline',
    title: 'Bottom corners pin the baseline (lower edge of the baseline box)',
  },
  {
    value: 'descender',
    label: 'Descender',
    title: 'Bottom corners pin the descender line (full ascender-to-descender box)',
  },
];

function TypeCursorAnchorBox({ engine }: { engine: NibGliderEngine }) {
  const active = engine.typeCursorAnchor;
  const bottomEdge = engine.typeCursorBottomEdge;
  const activeLabel = TYPE_CURSOR_ANCHORS.find((a) => a.value === active)?.label ?? active;
  const bottomLabel = bottomEdge === 'baseline' ? 'baseline' : 'descender line';
  return (
    <>
      <span className="param-item">
        <label>Cursor pin: {activeLabel}</label>
        <span
          aria-hidden="false"
          style={{
            position: 'relative',
            display: 'block',
            width: 132,
            height: 88,
            border: '1px solid currentColor',
            opacity: 0.9,
          }}
        >
          {TYPE_CURSOR_ANCHORS.map((anchor) => (
            <button
              key={anchor.value}
              type="button"
              title={anchor.label}
              aria-label={`Pin ${anchor.label} to the cursor`}
              aria-pressed={anchor.value === active}
              onClick={() => engine.setTypeCursorAnchor(anchor.value)}
              style={{
                position: 'absolute',
                left: `${anchor.x}%`,
                top: `${anchor.y}%`,
                width: 14,
                height: 14,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: '1px solid currentColor',
                background: anchor.value === active ? 'currentColor' : 'transparent',
                padding: 0,
                cursor: 'pointer',
              }}
            />
          ))}
        </span>
        <span style={{ fontSize: 11, opacity: 0.75 }}>
          Top edge: ascender · Bottom edge: {bottomLabel}
        </span>
      </span>
      <span className="param-item">
        <label>Bottom edge</label>
        <div
          className="seg-ctrl seg-text"
          role="group"
          aria-label="Bottom edge of the cursor pin box"
        >
          {TYPE_CURSOR_BOTTOM_EDGES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.title}
              className={bottomEdge === opt.value ? 'active' : undefined}
              onClick={() => engine.setTypeCursorBottomEdge(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </span>
    </>
  );
}

function TextParams({
  engine,
  spec,
  kind,
  onFindReplace,
}: {
  engine: NibGliderEngine;
  spec: TextSpec;
  kind: 'display' | 'body' | null;
  onFindReplace?: () => void;
}) {
  // Editing an existing object: creation-only controls (Kind, Flow,
  // Orientation, Spline, rings, Line 2) hide, and mode-dependent rows follow
  // the object's kind instead of the global text mode.
  const editingObject = kind !== null;
  const mode = kind ?? engine.textMode;
  const displayFlow = engine.displayFlow;
  const glyphOrientation = engine.glyphOrientation;
  const splineTextPlacement = engine.splineTextPlacement;
  const [tab, setTab] = useState<'style' | 'type'>('style');
  const [styleName, setStyleName] = useState('Body');
  const [newStyleName, setNewStyleName] = useState('');
  const textStyleList = engine.textStyles();
  const selectedStyle = textStyleList.find((s) => s.name === styleName) ?? textStyleList[0];
  const userFonts = engine.userFonts();
  const fontGroups: FontFamilyGroup[] = userFonts.length > 0
    ? [...TEXT_FONT_GROUPS, {
      label: 'Your fonts',
      fonts: userFonts.map((f) => ({
        value: f.family,
        label: f.loaded ? f.family : `${f.family} (re-add file to use)`,
        family: f.family,
      })),
    }]
    : TEXT_FONT_GROUPS;
  const fontFileRef = useRef<HTMLInputElement>(null);
  const [fontUrl, setFontUrl] = useState('');
  const [fontNote, setFontNote] = useState<string | null>(null);
  const addFontFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const family = await engine.addUserFontFromBytes(await file.arrayBuffer(), 'file');
    setFontNote(family
      ? `Added ${family}. The file itself is kept for this session only; its name is remembered in settings.`
      : 'That file could not be read as a font.');
  };
  const addFontUrl = async (): Promise<void> => {
    const url = fontUrl.trim();
    if (!url) return;
    const family = await engine.addUserFontFromUrl(url);
    setFontNote(family ? `Added ${family} from URL.` : 'That URL did not return a readable font.');
    if (family) setFontUrl('');
  };
  return (
    <div className="panelParameters">
      <div className="seg-ctrl seg-text" role="tablist" aria-label="Text settings">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'style'}
          className={tab === 'style' ? 'active' : undefined}
          onClick={() => setTab('style')}
        >
          Style
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'type'}
          className={tab === 'type' ? 'active' : undefined}
          onClick={() => setTab('type')}
        >
          Type At Cursor
        </button>
      </div>
      {tab === 'style' ? (
      <>
      {editingObject ? null : (
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
              className={engine.textMode === opt.value ? 'active' : undefined}
              onClick={() => engine.setTextMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </span>
      )}
      {mode === 'display' && !editingObject ? (
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
        {mode === 'body' ? (
          <textarea
            id="textContentInput"
            className="flyout-text-input"
            rows={4}
            value={spec.content}
            aria-label="Text content"
            onChange={(e) => engine.setTextContent(e.target.value)}
          />
        ) : (
          <input
            type="text"
            id="textContentInput"
            className="flyout-text-input"
            value={spec.content}
            aria-label="Text content"
            onChange={(e) => engine.setTextContent(e.target.value)}
          />
        )}
      </span>
      {editingObject ? null : (
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
      )}
      <div className="flyout-inline-row param-item">
        <label>Typeface</label>
        <FontFamilySelect
          id="textFontSelect"
          ariaLabel="Typeface"
          value={spec.fontFamily}
          groups={fontGroups}
          onChange={(v) => engine.setTextFontFamily(v)}
        />
      </div>
      <div className="flyout-inline-row param-item">
        <label>Add font</label>
        <span>
          <input
            ref={fontFileRef}
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            style={{ display: 'none' }}
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => { void addFontFile(e.target.files?.[0]); e.target.value = ''; }}
          />
          <button type="button" onClick={() => fontFileRef.current?.click()}>Font file…</button>
          <input
            type="url"
            placeholder="https://…/font.ttf"
            aria-label="Font URL"
            value={fontUrl}
            onChange={(e) => setFontUrl(e.target.value)}
          />
          <button type="button" onClick={() => void addFontUrl()}>Load URL</button>
        </span>
      </div>
      {fontNote && <div className="param-item" role="status">{fontNote}</div>}
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
          <label htmlFor="textWeightSelect">Weight</label>
          <select
            id="textWeightSelect"
            aria-label="Font weight"
            value={panelWeightValue(spec.fontWeight)}
            onChange={(e) => engine.setTextFontWeight(e.target.value)}
          >
            {engine.textWeightOptions(spec.fontFamily).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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
            <button
              type="button"
              title="Underline"
              className={spec.underline ? 'active' : undefined}
              onClick={() => engine.setTextUnderline(!spec.underline)}
            >
              <span style={{ textDecoration: 'underline' }}>Underline</span>
            </button>
            <button
              type="button"
              title="Strikethrough"
              className={spec.strikethrough ? 'active' : undefined}
              onClick={() => engine.setTextStrikethrough(!spec.strikethrough)}
            >
              <span style={{ textDecoration: 'line-through' }}>Strike</span>
            </button>
          </div>
        </span>
      </div>
      <span className="param-item">
        <label>Case</label>
        <div className="seg-ctrl seg-text" role="group" aria-label="Case transform">
          {(
            [
              { value: 'none', label: 'As typed', title: 'Keep the text as typed' },
              { value: 'upper', label: 'UPPER', title: 'Lay the text out in capitals' },
              { value: 'smallCaps', label: 'Small caps', title: 'Lowercase letters as smaller capitals; whole-line text falls back to UPPER' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.title}
              className={spec.caseTransform === opt.value ? 'active' : undefined}
              onClick={() => engine.setTextCaseTransform(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </span>
      <span className="param-item">
        <label>Style preset</label>
        <span>
          <select
            aria-label="Text style"
            value={selectedStyle?.name ?? ''}
            onChange={(e) => setStyleName(e.target.value)}
          >
            {textStyleList.map((s) => (
              <option key={s.name} value={s.name}>{s.builtIn ? s.name : `${s.name} (yours)`}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedStyle}
            title="Restyle the selected text (one undo step); with no selection, set the creation style"
            onClick={() => { if (selectedStyle) engine.applyTextStyle(selectedStyle.name); }}
          >
            Apply
          </button>
          <button
            type="button"
            disabled={!selectedStyle || selectedStyle.builtIn}
            title={selectedStyle?.builtIn ? 'Built-in styles cannot be deleted' : 'Delete this style'}
            onClick={() => { if (selectedStyle) engine.deleteTextStyle(selectedStyle.name); }}
          >
            Delete
          </button>
        </span>
        <span>
          <input
            type="text"
            placeholder="New style name"
            aria-label="New style name"
            value={newStyleName}
            onChange={(e) => setNewStyleName(e.target.value)}
          />
          <button
            type="button"
            disabled={!newStyleName.trim()}
            title="Save the current text settings as a style (kept in app settings, shared by all documents)"
            onClick={() => {
              if (engine.saveCurrentTextStyle(newStyleName)) {
                setStyleName(newStyleName.trim());
                setNewStyleName('');
              }
            }}
          >
            Save current as style
          </button>
        </span>
      </span>
      <span className="param-item">
        <button type="button" onClick={() => onFindReplace?.()}>
          Find &amp; Replace…
        </button>
      </span>
      {mode === 'body' ? (
        <span className="param-item">
          <label>Align</label>
          <div className="seg-ctrl" role="group" aria-label="Text alignment">
            {BODY_JUSTIFY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.value === 'justify'
                  ? 'Justify: body lines spread to the full measure (the last line of each paragraph stays left). On display text, Justify behaves as Left.'
                  : opt.label}
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
      <ParamSlider
        id="textTrackingSlider"
        label="Tracking"
        value={spec.letterSpacing}
        min={-2}
        max={20}
        step={0.1}
        decimals={1}
        unit="pt"
        formatValue={(v) => v.toFixed(1)}
        onChange={(n) => engine.setTextLetterSpacing(n)}
      />
      <ParamSlider
        id="textWordSpacingSlider"
        label="Word space"
        value={spec.wordSpacing}
        min={0}
        max={20}
        step={0.5}
        decimals={1}
        unit="pt"
        formatValue={(v) => v.toFixed(1)}
        onChange={(n) => engine.setTextWordSpacing(n)}
      />
      <ParamSlider
        id="textBaselineShiftSlider"
        label="Baseline shift"
        value={spec.baselineShift}
        min={-20}
        max={40}
        step={1}
        unit="pt"
        formatValue={(v) => String(Math.round(v))}
        onChange={(n) => engine.setTextBaselineShift(n)}
      />
      {mode === 'body' ? (
        <ParamSlider
          id="textParagraphSlider"
          label="Paragraph space"
          value={spec.paragraphSpacing}
          min={0}
          max={72}
          step={1}
          unit="pt"
          formatValue={(v) => String(Math.round(v))}
          onChange={(n) => engine.setTextParagraphSpacing(n)}
        />
      ) : null}
      {editingObject ? (
        <span className="param-item">
          <button
            type="button"
            onClick={() => engine.convertSelectedTextToOutlines()}
            title="Replace the selected live text with its glyph outlines (one undo step). Families without a parsed font stay live."
          >
            Convert to Outlines
          </button>
        </span>
      ) : null}
      </>
      ) : (
        <TypeCursorAnchorBox engine={engine} />
      )}
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
  {
    value: 'exclude',
    label: 'Exclude',
    tip: 'Exclude: keep the parts of base + tool that do not overlap (XOR)',
    icon: (
      <>
        <path d="M6 3.4 A3.6 3.6 0 1 0 6 10.6 A3.6 3.6 0 0 0 10 6.99 A3.6 3.6 0 1 0 6 3.4 Z" />
        <path d="M10 3.4 A3.6 3.6 0 1 1 10 10.6 A3.6 3.6 0 0 1 6 7.01 A3.6 3.6 0 1 1 10 3.4 Z" />
      </>
    ),
  },
  {
    value: 'crop',
    label: 'Crop',
    tip: 'Crop: clip each touched shape to the deposited frame; the frame is consumed',
    icon: (
      <>
        <circle cx="8" cy="7" r="3.6" strokeDasharray="2 1.4" />
        <path d="M5.5 4.5 H10.5 V9.5 H5.5 Z" />
      </>
    ),
  },
  {
    value: 'cut',
    label: 'Cut',
    tip: 'Cut: split each touched shape along the deposited cutter; the cutter is consumed',
    icon: (
      <>
        <circle cx="8" cy="7" r="3.6" />
        <path d="M8 3.4 V10.6" />
      </>
    ),
  },
  {
    value: 'interlace',
    label: 'Interlace',
    tip: 'Interlace: weave the deposited shape with the strokes it lands on',
    // Overpass weave: the horizontal band breaks at the crossing so the
    // continuous vertical strand reads as passing over it. Paint order
    // matters — the vertical is last so it renders on top.
    icon: (
      <>
        <path d="M2 7 H6.1" />
        <path d="M9.9 7 H14" />
        <path d="M8 2.2 V11.8" />
      </>
    ),
  },
];

// The armed submode, whether combinatorics is on (combineMode) or off
// (remembered in combineTool). Used for the flyout title and preview label.
function activeCombineMode(
  mode: CombineMode | 'none',
  tool: CombineMode,
): CombineMode {
  return mode === 'none' ? tool : mode;
}

function activeCombineLabel(
  mode: CombineMode | 'none',
  tool: CombineMode,
): string {
  const active = activeCombineMode(mode, tool);
  return COMBINE_OPTIONS.find((opt) => opt.value === active)?.label ?? 'Combinatorics';
}

/** One progression editor (Amendment C): a target named in words,
 * a kind, and Start / Difference-or-Ratio fields. Checking the box
 * turns the progression on with editable defaults; every field
 * edit goes straight back to the engine, so the live preview and
 * the next deposit follow at once. */
function ProgressionFields(props: {
  idPrefix: string;
  label: string;
  value: Progression | null;
  onChange: (v: { kind: 'arithmetic' | 'geometric'; start: number; step: number } | null) => void;
}) {
  const { idPrefix, label, value, onChange } = props;
  const current = value ?? { kind: 'arithmetic' as const, start: 0, step: 1 };
  return (
    <>
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? { ...current } : null)}
        />
        {label}
      </label>
      {value ? (
        <>
          <span className="param-item">
            <label htmlFor={`${idPrefix}KindSelect`}>Sequence</label>
            <select
              id={`${idPrefix}KindSelect`}
              value={value.kind}
              onChange={(e) => onChange({ ...value, kind: e.target.value as 'arithmetic' | 'geometric' })}
            >
              <option value="arithmetic">Arithmetic (add each time)</option>
              <option value="geometric">Geometric (multiply each time)</option>
            </select>
          </span>
          <span className="param-item">
            <label htmlFor={`${idPrefix}StartStepper`}>Start</label>
            <NumericStepper
              id={`${idPrefix}StartStepper`}
              size="compact"
              value={value.start}
              min={-1000}
              max={1000}
              step={1}
              ariaLabel={`${label} start`}
              title={`${label} start`}
              onCommit={(n) => onChange({ ...value, start: n })}
            />
          </span>
          <span className="param-item">
            <label htmlFor={`${idPrefix}StepStepper`}>{value.kind === 'arithmetic' ? 'Difference' : 'Ratio'}</label>
            <NumericStepper
              id={`${idPrefix}StepStepper`}
              size="compact"
              value={value.step}
              min={-100}
              max={100}
              step={value.kind === 'arithmetic' ? 1 : 0.05}
              ariaLabel={value.kind === 'arithmetic' ? `${label} difference` : `${label} ratio`}
              title={value.kind === 'arithmetic' ? `${label} difference` : `${label} ratio`}
              onCommit={(n) => onChange({ ...value, step: n })}
            />
          </span>
        </>
      ) : null}
    </>
  );
}

function RepeatPreview() {
  return (
    <svg className="combine-preview" viewBox="0 0 64 32" aria-hidden="true">
      <rect x="7" y="4" width="20" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="37" y="4" width="20" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="17" width="20" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="37" y="17" width="20" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CombinePreview({
  mode,
  gap,
}: {
  mode: CombineMode | 'none';
  gap: number;
}) {
  const notch = Math.max(1.6, Math.min(7, 1.6 + gap * 0.18));
  const stroke = {
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  let body: ReactNode;
  if (mode === 'interlace') {
    // Overpass weave matching the section button: the horizontal band
    // breaks at the crossing (gap follows the Gap slider via notch) and
    // the continuous vertical strand passes over it. Paint order matters.
    body = (
      <>
        <path d={`M10 16 H${32 - notch - 2}`} strokeWidth="3.2" />
        <path d={`M${32 + notch + 2} 16 H54`} strokeWidth="3.2" />
        <path d="M32 6 V26" strokeWidth="3.2" />
      </>
    );
  } else if (mode === 'union') {
    body = (
      <>
        <circle cx="26" cy="16" r="8" />
        <circle cx="38" cy="16" r="8" />
      </>
    );
  } else if (mode === 'subtract') {
    body = (
      <>
        <circle cx="26" cy="16" r="8" />
        <circle cx="38" cy="16" r="8" strokeDasharray="2.2 1.6" opacity="0.55" />
      </>
    );
  } else if (mode === 'intersect') {
    body = <path d="M26 8 A8 8 0 0 1 26 24 A8 8 0 0 1 26 8 Z M38 8 A8 8 0 0 0 38 24 A8 8 0 0 0 38 8 Z" />;
  } else if (mode === 'exclude') {
    // Two crescents: everything except the shared lens.
    body = (
      <>
        <path d="M26 8 A8 8 0 1 0 26 24 A8 8 0 0 0 38 16 A8 8 0 1 0 26 8 Z" />
        <path d="M38 8 A8 8 0 1 1 38 24 A8 8 0 0 1 26 16 A8 8 0 1 1 38 8 Z" />
      </>
    );
  } else if (mode === 'crop') {
    body = (
      <>
        <circle cx="32" cy="16" r="8" strokeDasharray="2.2 1.6" />
        <path d="M26 10 H38 V22 H26 Z" />
      </>
    );
  } else if (mode === 'cut') {
    body = (
      <>
        <circle cx="32" cy="16" r="8" />
        <path d="M32 8 V24" />
      </>
    );
  } else {
    body = (
      <>
        <circle cx="32" cy="16" r="8" />
        <path d="M26 22 L38 10" />
      </>
    );
  }
  return (
    <svg className="combine-preview" viewBox="0 0 64 32" aria-hidden="true" {...stroke}>
      {body}
    </svg>
  );
}

function HistoryButtons({
  engine,
  showUndoRedo = true,
  showHistory = true,
}: {
  engine: NibGliderEngine;
  showUndoRedo?: boolean;
  showHistory?: boolean;
}) {
  const undoTitle = engine.canUndo()
    ? `Undo ${engine.undoLabel() ?? ''} (${primaryShortcut('Z')})`
    : 'Nothing to undo';
  const redoTitle = engine.canRedo()
    ? `Redo ${engine.redoLabel() ?? ''} (${primaryShortcut('Z', true)})`
    : 'Nothing to redo';
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
      {historyReadout}
    </>
  );
}

// The History section's entry list (Slice 20): every undoable step
// in order, entries past the current position dimmed (they are the
// redo future). Clicking an entry walks undo/redo to that point as
// one user action.
function HistoryList({ engine }: { engine: NibGliderEngine }) {
  const { labels, position } = engine.historyEntries();
  if (labels.length === 0) {
    return (
      <div className="history-list">
        <span className="history-list-empty">Nothing yet — your edits will appear here.</span>
      </div>
    );
  }
  return (
    <ol className="history-list">
      {labels.map((label, i) => {
        const undone = i >= position;
        const current = i === position - 1;
        return (
          <li key={i}>
            <button
              type="button"
              className={`history-list-entry${undone ? ' is-undone' : ''}${current ? ' is-current' : ''}`}
              aria-current={current || undefined}
              title={undone ? `Redo to here: ${label}` : `Undo back to here: ${label}`}
              onClick={() => engine.jumpToHistoryPosition(i + 1)}
            >
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function CombinatoricsButtons({ engine }: { engine: NibGliderEngine }) {
  const selected = engine.combineMode === 'none' ? engine.combineTool : engine.combineMode;
  // Arming a button turns combinatorics on in that mode. With 2+ shapes
  // already selected the same click combines the selection on the spot.
  const arm = (value: CombineMode): void => {
    engine.setCombineMode(value);
    if (engine.canCombineSelection()) engine.combineSelection(value);
  };
  return (
    <span className="param-item">
      <div className="seg-ctrl" role="group" aria-label="Combine mode">
        {COMBINE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            title={`${opt.tip} — arms future deposits; combines the selection now when 2+ shapes are selected`}
            aria-label={opt.label}
            className={selected === opt.value ? 'active' : undefined}
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
  exportFrame: 'Export Frame',
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
  exportFrame: <path d="M2.8 3.2 H13.2 V10.8 H2.8 Z" strokeDasharray="2.2 1.6" />,
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

const GRID_STYLE_OPTIONS: CustomSelectOption[] = [
  { value: 'dots', label: 'Dots' },
  { value: 'lines', label: 'Lines' },
];

const REPEAT_ANCHOR_OPTIONS: CustomSelectOption[] = [
  { value: 'cell-center', label: 'Cell centers' },
  { value: 'intersection', label: 'Intersections' },
];

const REPEAT_DIRECTION_OPTIONS: CustomSelectOption[] = [
  { value: 'both', label: 'All' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
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
  {
    value: 'grp-incanvas',
    label: 'In-Canvas Elements',
    children: (['exportFrame'] as const).map((v) =>
      shapeLeaf(v, RECT_SHAPE_LABELS),
    ),
  },
];

/** Actions the top File menu forwards to the panel, which owns the
 * gallery and New Document dialogs. */
export interface ControlPanelHandle {
  dispatchFileCommand: (command: FileCommand | ImportCommand) => void;
  openOperationDialog: (kind: 'scale' | 'rotate') => void;
  openFindReplace: () => void;
  /** Restore + expand a panel section and scroll it into view
   * (the Document menu's Pages & Guides item). */
  focusSection: (id: string) => void;
}

const ControlPanel = forwardRef<ControlPanelHandle, {
  engine: NibGliderEngine;
  /** Shared layout manager. When omitted the panel owns one internally.
   * App passes its own instance so live demonstrations can expand the
   * sections their scripts point at. */
  panels?: PanelsManager;
  /** Opens the Document Settings window. App wires this to the window
   * registry; the summary box document menu calls it from Settings. */
  onOpenDocumentSettings?: () => void;
  /** Opens the Page Setup dialog (Pages & Guides section button). */
  onOpenPageSetup?: () => void;
}>(function ControlPanel({
  engine,
  panels: panelsProp,
  onOpenDocumentSettings,
  onOpenPageSetup,
}, ref) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const [paramsFlyout, setParamsFlyout] = useState<
    'circle' | 'rect' | 'stroke' | 'fill' | 'text' | 'combinatorics' | 'repeat' | null
  >(null);
  const textPreviewRef = useRef<HTMLButtonElement>(null);
  const fillPreviewRef = useRef<HTMLButtonElement>(null);
  const circlePreviewRef = useRef<HTMLButtonElement>(null);
  const rectPreviewRef = useRef<HTMLButtonElement>(null);
  const combinePreviewRef = useRef<HTMLButtonElement>(null);
  const repeatPreviewRef = useRef<HTMLButtonElement>(null);
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
      if (
        raw === 'pt' || raw === 'pica' || raw === 'inch' || raw === 'ft' ||
        raw === 'mm' || raw === 'cm' || raw === 'm'
      ) {
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
    (name: 'circle' | 'rect' | 'stroke' | 'fill' | 'text' | 'combinatorics' | 'repeat') => {
      setParamsFlyout(name);
      dismissSelects();
      setIconMenu(null);
    },
    [dismissSelects],
  );
  const hoverOpenFlyout = useCallback(
    (name: 'circle' | 'rect' | 'stroke' | 'fill' | 'text' | 'combinatorics' | 'repeat') => {
      if (window.matchMedia?.('(hover: none)').matches) return;
      cancelHoverClose();
      openFlyoutAndDismissSelects(name);
    },
    [cancelHoverClose, openFlyoutAndDismissSelects],
  );
  const toggleFlyout = useCallback(
    (name: 'circle' | 'rect' | 'stroke' | 'fill' | 'text' | 'combinatorics' | 'repeat') => {
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
  // Scale/rotate modal dialog with a live on-page preview, opened from the
  // top Operations menu. Scale captures the selection size at open so target
  // dimensions resolve against unscaled bounds.
  const [opDialog, setOpDialog] = useState<
    | { kind: 'scale'; draft: number; applied: number; baseW: number; baseH: number }
    | { kind: 'rotate'; draft: number; applied: number }
    | null
  >(null);
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
  // Open document name for the page title and the rail label. Gallery
  // writes update this snapshot, so the title stays current without
  // reading IndexedDB during render.
  const gallery = useGallerySnapshot();
  const docName = engine.currentFileName ?? gallery.displayName;
  const docDirty = engine.isDocumentDirty();
  useEffect(() => {
    document.title = `${docName}${docDirty ? ' •' : ''} — NibGlider`;
  }, [docName, docDirty]);
  // Document gallery dialog state. The list comes from the gallery snapshot,
  // which updates after every mutation while the dialog is showing.
  const [galleryMode, setGalleryMode] = useState<GalleryMode | null>(null);
  // New Document dialog: opened from File > New, applies the chosen canvas
  // size on confirm (dirty guard included) instead of wiping immediately.
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const openFindReplace = useCallback(() => setFindReplaceOpen(true), []);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importKindRef = useRef<ImportCommand>('import-svg');
  const [pdfImport, setPdfImport] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const openGallery = useCallback(
    (mode: GalleryMode) => {
      dismissSelects();
      setGalleryMode(mode);
    },
    [dismissSelects],
  );
  const saveSceneToGallery = useCallback(
    async (name: string): Promise<boolean> => {
      const payload = engine.exportScene();
      if (!payload) return false;
      const session = await browserGallerySession();
      await session.save(name, payload);
      engine.markDocumentClean();
      return true;
    },
    [engine],
  );
  const handleGalleryOpen = useCallback(
    (meta: GalleryMeta) => {
      void (async () => {
        if (
          engine.isDocumentDirty() &&
          !window.confirm(`Open "${meta.name}"? Unsaved changes will be lost.`)
        ) {
          return;
        }
        const session = await browserGallerySession();
        const doc = await session.get(meta.id);
        if (!doc) return;
        if (engine.replaceScene(`Open ${doc.name}`, doc.svg)) {
          await session.setCurrent(doc.id);
          engine.markDocumentClean();
        }
        setGalleryMode(null);
      })();
    },
    [engine],
  );
  // Summary box document menu: switch to the picked gallery document
  // through the same guarded open path as the gallery dialog.
  const handleSummarySelect = useCallback(
    (id: string) => {
      const meta = gallery.docs.find((entry) => entry.id === id);
      if (meta) handleGalleryOpen(meta);
    },
    [gallery.docs, handleGalleryOpen],
  );
  const handleGallerySave = useCallback(
    (name: string) => {
      void saveSceneToGallery(name).then((saved) => {
        if (!saved) return;
        setGalleryMode(null);
      });
    },
    [saveSceneToGallery],
  );
  const handleGalleryRename = useCallback(
    (name: string) => {
      void (async () => {
        const session = await browserGallerySession();
        const id = session.getSnapshot().currentId;
        if (id) await session.rename(id, name);
        setGalleryMode(null);
      })();
    },
    [],
  );
  const handleGalleryDelete = useCallback(
    (id: string) => {
      void browserGallerySession().then((session) => session.remove(id));
    },
    [],
  );
  // Save to File: download the native document envelope under the
  // document's name; the file becomes the document's file home.
  const downloadTextFile = useCallback((fileName: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchorEl = document.createElement('a');
    anchorEl.href = url;
    anchorEl.download = fileName;
    anchorEl.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, []);
  const handleSaveToFile = useCallback(() => {
    const name = engine.currentFileName ?? gallery.displayName;
    const text = engine.exportNativeDocument(name);
    if (!text) {
      engine.noteImportFailure('Save to file failed: nothing to save.');
      return;
    }
    downloadTextFile(nativeFileName(name), text, 'application/json');
    engine.currentFileName = name;
    engine.markDocumentClean();
  }, [engine, gallery.displayName, downloadTextFile]);
  const handleGalleryExport = useCallback(
    (meta: GalleryMeta) => {
      void (async () => {
        const session = await browserGallerySession();
        const doc = await session.get(meta.id);
        if (!doc) return;
        const wrapped = wrapSceneAsNativeDocument(doc.name, doc.svg, new Date(doc.updatedAt).toISOString());
        if (wrapped) {
          downloadTextFile(nativeFileName(doc.name), serializeNativeDocument(wrapped), 'application/json');
        } else {
          // Legacy SVG gallery body: the file is the SVG itself.
          downloadTextFile(`${doc.name.replace(/[\\/:*?"<>|]+/g, '-')}.svg`, doc.svg, 'image/svg+xml');
        }
      })();
    },
    [downloadTextFile],
  );
  const openFileInputRef = useRef<HTMLInputElement>(null);
  const handleOpenFilePicked = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (
        engine.isDocumentDirty()
        && !window.confirm(`Open "${file.name}"? Unsaved changes will be lost.`)
      ) {
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        engine.noteImportFailure(`Open failed: could not read ${file.name}.`);
      };
      reader.onload = () => {
        const text = reader.result;
        if (typeof text !== 'string') return;
        if (engine.openDocumentText(text, file.name)) {
          void browserGallerySession().then((session) => session.setCurrent(null));
        }
      };
      reader.readAsText(file);
    },
    [engine],
  );
  const handleNewDocumentConfirm = useCallback(
    (spec: NewDocumentSpec) => {
      if (
        engine.isDocumentDirty() &&
        !window.confirm('Start a new document? Unsaved changes will be lost.')
      ) {
        return;
      }
      void (async () => {
        const session = await browserGallerySession();
        const name = newDocumentNameFrom(session.getSnapshot().docs, spec.name);
        engine.applyPageSpec(spec.widthPt, spec.heightPt, spec.unit);
        engine.newDocument();
        const payload = engine.exportScene();
        try {
          if (payload) await session.save(name, payload, null);
          engine.markDocumentClean();
        } catch { /* The new canvas stays dirty so autosave can retry. */ }
        setNewDocOpen(false);
      })();
    },
    [engine],
  );
  // Top File menu entry point: the menu bar owns the File menu, the panel
  // owns the dialogs, so App forwards commands here. Export scope leaves
  // are handled in App (format state + JPG dialog live there), not here.
  const dispatchFileCommand = useCallback((command: FileCommand | ImportCommand) => {
    dismissSelects();
    switch (command) {
      case 'open-gallery':
        openGallery('open');
        break;
      case 'new-document':
        setNewDocOpen(true);
        break;
      case 'save-gallery': {
        const target = saveTarget({ id: gallery.currentId, name: gallery.currentName });
        if (target.kind === 'direct') void saveSceneToGallery(target.name);
        else openGallery('save');
        break;
      }
      case 'rename-document':
        openGallery(renameTarget({ id: gallery.currentId }));
        break;
      case 'save-file':
        handleSaveToFile();
        break;
      case 'open-file':
        openFileInputRef.current?.click();
        break;
      case 'print':
        engine.printDocument('page');
        break;
      case 'print-selection':
        engine.printDocument('selection');
        break;
      case 'import-svg':
      case 'import-pdf':
      case 'import-raster': {
        importKindRef.current = command;
        const input = importInputRef.current;
        if (!input) break;
        input.accept = IMPORT_ACCEPT[command];
        input.click();
        break;
      }
    }
  }, [dismissSelects, engine, gallery.currentId, gallery.currentName, openGallery, saveSceneToGallery, handleSaveToFile]);
  // Top Operations menu entry point for the scale/rotate modal dialog.
  const openOperationDialog = useCallback((kind: 'scale' | 'rotate') => {
    if (!engine.canTransformSelection()) return;
    dismissSelects();
    if (kind === 'scale') {
      const base = engine.selectionSize() ?? { width: 0, height: 0 };
      setOpDialog({ kind, draft: 100, applied: 1, baseW: base.width, baseH: base.height });
      return;
    }
    setOpDialog({ kind, draft: 0, applied: 0 });
  }, [engine, dismissSelects]);
  const focusSection = useCallback((id: string) => {
    panels.restoreSection(id);
    if (panels.collapsed[id]) panels.toggleCollapse(id);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
    });
  }, [panels]);
  useImperativeHandle(
    ref,
    () => ({ dispatchFileCommand, openOperationDialog, openFindReplace, focusSection }),
    [dispatchFileCommand, openOperationDialog, openFindReplace, focusSection],
  );
  const handleImportFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const kind = importKindRef.current;
      const reader = new FileReader();
      reader.onerror = () => {
        engine.noteImportFailure(`Import failed: could not read ${file.name}.`);
      };
      if (kind === 'import-pdf') {
        reader.onload = () => {
          const result = reader.result;
          if (!(result instanceof ArrayBuffer)) return;
          setPdfImport({ name: file.name, bytes: new Uint8Array(result) });
        };
        reader.readAsArrayBuffer(file);
        return;
      }
      if (kind === 'import-raster') {
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== 'string') return;
          const image = new Image();
          image.onerror = () => {
            engine.noteImportFailure(`Import failed: ${file.name} did not decode.`);
          };
          image.onload = () => {
            engine.importRasterDataUrl(result, `Import ${file.name}`);
          };
          image.src = result;
        };
        reader.readAsDataURL(file);
        return;
      }
      reader.onload = () => {
        const text = reader.result;
        if (typeof text !== 'string' || !/<svg[\s>]/i.test(text.slice(0, 4096))) {
          engine.noteImportFailure(`Import failed: ${file.name} is not SVG.`);
          return;
        }
        engine.importSceneSVG(text, `Import ${file.name}`);
      };
      reader.readAsText(file);
    },
    [engine],
  );
  // Document menu: document controls only. Section restore
  // and settings reset live in the Sections and Debug menus below.
  // Selection state: when items are selected the Stroke/Fill panels
  // reflect the selection (first selected item) instead of the globals.
  const sel = engine.selectionPaint();
  const strokeOn = sel ? sel.strokeOn : engine.strokeEnabled;
  const strokeColor = sel ? sel.strokeColor : engine.globalStrokeColor;
  const strokeWidth = sel ? sel.strokeWidth : engine.globalStrokeWidth;
  const strokeCap = sel ? sel.strokeCap : engine.globalStrokeCap;
  const strokeJoin = sel ? sel.strokeJoin : engine.globalStrokeJoin;
  const miterLimit = sel ? sel.miterLimit : engine.globalMiterLimit;
  const dashLength = sel ? sel.dashLength : engine.globalDashLength;
  const gapLength = sel ? sel.gapLength : engine.globalGapLength;
  const fillOn = sel ? sel.fillOn : engine.fillEnabled;
  const fillColor = sel ? sel.fillColor : engine.globalFillColor;
  const fillSpec = sel ? sel.fillSpec : engine.fillSpec();
  // Text panel: when editable text is selected the flyout reflects the
  // selection (first editable root) instead of the globals.
  const editableKind = engine.selectedEditableKind();
  const textSpec = engine.selectionText() ?? engine.globalText;

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
              { key: 'history', label: 'History list' },
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
        <ConfigSummaryBox
          engine={engine}
          docName={docName}
          docDirty={docDirty}
          currentDocId={gallery.currentId}
          documents={gallery.docs}
          selectedCount={engine.selectedItems.length}
          selection={sel}
          onSelectDocument={handleSummarySelect}
          onOpenSettings={onOpenDocumentSettings}
          onRequestRename={() => dispatchFileCommand('rename-document')}
          globals={{
            strokeOn: engine.strokeEnabled,
            strokeColor: engine.globalStrokeColor,
            strokeWidth: engine.globalStrokeWidth,
            strokeCap: engine.globalStrokeCap,
            strokeJoin: engine.globalStrokeJoin,
            strokePosition: engine.globalStrokePosition,
            miterLimit: engine.globalMiterLimit,
            dashLength: engine.globalDashLength,
            gapLength: engine.globalGapLength,
            fillOn: engine.fillEnabled,
            fillColor: engine.globalFillColor,
            fillSpec: engine.fillSpec(),
          }}
        />
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
      {isRemoved('swatchesControls') ? null : (
      <PanelSection
        id="swatchesControls"
        label="Swatches"
        icon={
          <TitleIcon>
            <rect x="2" y="2" width="5" height="5" />
            <rect x="9" y="2" width="5" height="5" />
            <rect x="2" y="9" width="5" height="5" />
            <rect x="9" y="9" width="5" height="5" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['swatchesControls']}
        {...sectionProps('swatchesControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="swatchesControls" title="Swatches" menuOpen={iconMenu?.id === 'swatchesControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <rect x="2" y="2" width="5" height="5" />
              <rect x="9" y="2" width="5" height="5" />
              <rect x="2" y="9" width="5" height="5" />
              <rect x="9" y="9" width="5" height="5" />
            </TitleIcon>
            <span className="pane-title-text">Swatches</span></span>
          </SectionTitleButton>
        </header>
        <SwatchesPanel engine={engine} />
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
            <TextPreviewBox spec={textSpec} />
          </button>
          <ShapeParamsFlyout
            open={paramsFlyout === 'text'}
            triggerRef={textPreviewRef}
            tone="text"
            title="Text"
            preview={<TextPreviewBox spec={textSpec} large />}
            onClose={closeFlyout}
            onMenuMouseEnter={cancelHoverClose}
            onMenuMouseLeave={scheduleHoverClose}
          >
            <TextParams engine={engine} spec={textSpec} kind={editableKind} onFindReplace={openFindReplace} />
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
          tutorialId="rect-shape-select"
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
          <label className="toggle-switch square-knob">
            <input
              type="checkbox"
              id="combineEnabledCheckbox"
              checked={engine.combineMode !== 'none'}
              aria-label="Combinatorics"
              title="Combinatorics: deposit shapes with the armed combine mode"
              onChange={(e) => engine.setCombineMode(e.target.checked ? engine.combineTool : 'none')}
            />
            <span className="slider" />
          </label>
          <CombinatoricsButtons engine={engine} />
          <button
            type="button"
            ref={combinePreviewRef}
            id="combinePreviewContainer"
            className={
              'shape-preview-trigger' +
              (paramsFlyout === 'combinatorics' ? ' open' : '')
            }
            aria-haspopup="dialog"
            aria-expanded={paramsFlyout === 'combinatorics'}
            aria-label="Combinatorics parameters"
            title="Combinatorics parameters"
            onMouseEnter={() => hoverOpenFlyout('combinatorics')}
            onMouseLeave={scheduleHoverClose}
            onClick={() => toggleFlyout('combinatorics')}
          >
            <span className="combine-preview-wrap" aria-hidden="true">
              <CombinePreview mode={engine.combineMode} gap={engine.interlaceGap} />
              <span className="combine-preview-label">
                {combinePreviewBoxLabel(engine.combineMode)}
              </span>
            </span>
          </button>
          <ShapeParamsFlyout
            open={paramsFlyout === 'combinatorics'}
            triggerRef={combinePreviewRef}
            tone="combinatorics"
            title={activeCombineLabel(engine.combineMode, engine.combineTool)}
            preview={
              <span className="combine-preview-wrap" aria-hidden="true">
                <CombinePreview
                  mode={activeCombineMode(engine.combineMode, engine.combineTool)}
                  gap={engine.interlaceGap}
                />
                <span className="combine-preview-label">
                  {activeCombineLabel(engine.combineMode, engine.combineTool)}
                </span>
              </span>
            }
            onClose={closeFlyout}
            onMenuMouseEnter={cancelHoverClose}
            onMenuMouseLeave={scheduleHoverClose}
          >
            {activeCombineMode(engine.combineMode, engine.combineTool) === 'interlace' ? (
              <div className="panelParameters">
                <ParamSlider
                  id="interlaceGapSlider"
                  label="Gap"
                  value={engine.interlaceGap}
                  min={0}
                  max={40}
                  step={0.5}
                  decimals={1}
                  onChange={(n) => engine.setInterlaceGap(n)}
                />
              </div>
            ) : (
              <p className="param-empty">No extra parameters</p>
            )}
          </ShapeParamsFlyout>
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
            showHistory={historySegs.history !== false}
          />
        </header>
        {historySegs.history !== false ? <HistoryList engine={engine} /> : null}
      </PanelSection>
      )}
      {isRemoved('layersControls') ? null : (
      <PanelSection
        id="layersControls"
        label="Layers & Objects"
        icon={
          <TitleIcon>
            <path d="M8 2 L14 5.5 L8 9 L2 5.5 Z" />
            <path d="M2 8.5 L8 12 L14 8.5" />
            <path d="M2 11.5 L8 15 L14 11.5" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['layersControls']}
        {...sectionProps('layersControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="layersControls" title="Layers & Objects" menuOpen={iconMenu?.id === 'layersControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <path d="M8 2 L14 5.5 L8 9 L2 5.5 Z" />
              <path d="M2 8.5 L8 12 L14 8.5" />
              <path d="M2 11.5 L8 15 L14 11.5" />
            </TitleIcon>
            <span className="pane-title-text">Layers &amp; Objects</span></span>
          </SectionTitleButton>
        </header>
        <LayersPanel engine={engine} />
      </PanelSection>
      )}
      {isRemoved('pagesControls') ? null : (
      <PanelSection
        id="pagesControls"
        label="Pages & Guides"
        icon={
          <TitleIcon>
            <path d="M3 2 H11 V14 H3 Z" />
            <path d="M6 5 H13 V14 H6 Z" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['pagesControls']}
        {...sectionProps('pagesControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="pagesControls" title="Pages & Guides" menuOpen={iconMenu?.id === 'pagesControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <path d="M3 2 H11 V14 H3 Z" />
              <path d="M6 5 H13 V14 H6 Z" />
            </TitleIcon>
            <span className="pane-title-text">Pages &amp; Guides</span></span>
          </SectionTitleButton>
        </header>
        <PagesPanel engine={engine} onPageSetup={onOpenPageSetup} />
      </PanelSection>
      )}
      {isRemoved('arrangeControls') ? null : (
      <PanelSection
        id="arrangeControls"
        label="Arrange"
        icon={
          <TitleIcon>
            <path d="M2 2 H7 V7 H2 Z" />
            <path d="M9 9 H14 V14 H9 Z" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['arrangeControls']}
        {...sectionProps('arrangeControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="arrangeControls" title="Arrange" menuOpen={iconMenu?.id === 'arrangeControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <path d="M2 2 H7 V7 H2 Z" />
              <path d="M9 9 H14 V14 H9 Z" />
            </TitleIcon>
            <span className="pane-title-text">Arrange</span></span>
          </SectionTitleButton>
        </header>
        <ArrangePanel engine={engine} />
      </PanelSection>
      )}
      {isRemoved('pathOpsControls') ? null : (
      <PanelSection
        id="pathOpsControls"
        label="Path Operations"
        icon={
          <TitleIcon>
            <path d="M2.5 11.5 C5 5, 8 12, 10.5 5.5 L13.5 9" />
            <circle cx="2.5" cy="11.5" r="1.1" />
            <circle cx="13.5" cy="9" r="1.1" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['pathOpsControls']}
        {...sectionProps('pathOpsControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="pathOpsControls" title="Path Operations" menuOpen={iconMenu?.id === 'pathOpsControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <path d="M2.5 11.5 C5 5, 8 12, 10.5 5.5 L13.5 9" />
              <circle cx="2.5" cy="11.5" r="1.1" />
              <circle cx="13.5" cy="9" r="1.1" />
            </TitleIcon>
            <span className="pane-title-text">Path Operations</span></span>
          </SectionTitleButton>
        </header>
        <PathOpsParams engine={engine} />
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
          <NumericStepper
            id="gridSpacingStepper"
            size="compact"
            value={engine.gridSpacing}
            min={1}
            max={500}
            step={1}
            unit="pt"
            ariaLabel="Grid spacing in points"
            title="Grid spacing"
            onCommit={(n) => engine.setGridSpacing(n)}
          />
        </header>
        <div className="grid-body">
          <div className="grid-body-row">
            <label htmlFor="gridSubdivisionsStepper">Subdivisions</label>
            <NumericStepper
              id="gridSubdivisionsStepper"
              size="compact"
              value={engine.gridSubdivisions}
              min={1}
              max={10}
              step={1}
              ariaLabel="Grid subdivisions"
              title="Minor dots at the spacing divided by this number (1 = off)"
              onCommit={(n) => engine.setGridSubdivisions(n)}
            />
          </div>
          <div className="grid-body-row">
            <label htmlFor="gridStyleSelect">Style</label>
            <CustomSelect
              id="gridStyleSelect"
              ariaLabel="Grid style"
              value={engine.gridStyle}
              options={GRID_STYLE_OPTIONS}
              onChange={(v) => engine.setGridStyle(v as 'dots' | 'lines')}
              openOnHover
              onHoverOpen={handleSelectHoverOpen}
              forceCloseKey={selectCloseKey}
            />
          </div>
          <div className="grid-body-row">
            <label htmlFor="gridColorWell">Colour</label>
            <input
              type="color"
              id="gridColorWell"
              className="titlebar-well"
              value={engine.gridColor}
              title="Grid colour"
              onChange={(e) => engine.setGridColor(e.target.value)}
            />
          </div>
          <div className="grid-body-row">
            <label htmlFor="gridOpacityStepper">Opacity</label>
            <NumericStepper
              id="gridOpacityStepper"
              size="compact"
              value={Math.round(engine.gridOpacity * 100)}
              min={0}
              max={100}
              step={5}
              unit="%"
              ariaLabel="Grid opacity in percent"
              title="Grid opacity"
              onCommit={(n) => engine.setGridOpacity(n / 100)}
            />
          </div>
        </div>
      </PanelSection>
      )}
      {isRemoved('repeatControls') ? null : (
      <PanelSection
        id="repeatControls"
        label="Repeat"
        icon={
          <TitleIcon>
            <rect x="2" y="2" width="4.5" height="4.5" />
            <rect x="9.5" y="2" width="4.5" height="4.5" />
            <rect x="2" y="9" width="4.5" height="4.5" />
            <rect x="9.5" y="9" width="4.5" height="4.5" />
          </TitleIcon>
        }
        collapsed={!!collapsedMap['repeatControls']}
        {...sectionProps('repeatControls')}
      >
        <header className="pane-titlebar titlebar-single">
          <SectionTitleButton sectionId="repeatControls" title="Repeat" menuOpen={iconMenu?.id === 'repeatControls'} onOpen={toggleIconMenu}><span className="pane-title">
            <TitleIcon>
              <rect x="2" y="2" width="4.5" height="4.5" />
              <rect x="9.5" y="2" width="4.5" height="4.5" />
              <rect x="2" y="9" width="4.5" height="4.5" />
              <rect x="9.5" y="9" width="4.5" height="4.5" />
            </TitleIcon>
            <span className="pane-title-text">Repeat</span></span>
          </SectionTitleButton>
          <span className="key-switch-group">
            <label className="toggle-switch square-knob">
              <input
                type="checkbox"
                id="repeatEnabledCheckbox"
                checked={engine.isRepeatEnabled}
                onChange={(e) => engine.setRepeatEnabled(e.target.checked)}
              />
              <span className="slider" />
            </label>
          </span>
          <button
            type="button"
            ref={repeatPreviewRef}
            id="repeatPreviewContainer"
            className={'shape-preview-trigger' + (paramsFlyout === 'repeat' ? ' open' : '')}
            aria-haspopup="dialog"
            aria-expanded={paramsFlyout === 'repeat'}
            aria-label="Repeat scope"
            title="Repeat scope"
            onMouseEnter={() => hoverOpenFlyout('repeat')}
            onMouseLeave={scheduleHoverClose}
            onClick={() => toggleFlyout('repeat')}
          >
            <RepeatPreview />
          </button>
        </header>
        <ShapeParamsFlyout
          open={paramsFlyout === 'repeat'}
          triggerRef={repeatPreviewRef}
          tone="combinatorics"
          title="Repeat scope"
          preview={<RepeatPreview />}
          onClose={closeFlyout}
          onMenuMouseEnter={cancelHoverClose}
          onMenuMouseLeave={scheduleHoverClose}
        >
          <div className="flyout-seg">
            <div className="flyout-title">Grid</div>
            <span className="param-item">
              <label htmlFor="repeatRowsStepper">Rows</label>
              <NumericStepper
                id="repeatRowsStepper"
                size="compact"
                value={engine.repeatRows}
                min={1}
                max={12}
                step={1}
                ariaLabel="Repeat rows"
                title="Repeat rows (live keys 1 and 2)"
                onCommit={(n) => engine.setRepeatRows(n)}
              />
            </span>
            <span className="param-item">
              <label htmlFor="repeatColsStepper">Columns</label>
              <NumericStepper
                id="repeatColsStepper"
                size="compact"
                value={engine.repeatCols}
                min={1}
                max={12}
                step={1}
                ariaLabel="Repeat columns"
                title="Repeat columns (live keys 3 and 4)"
                onCommit={(n) => engine.setRepeatCols(n)}
              />
            </span>
            <span className="param-item">
              <label htmlFor="repeatAnchorSelect">Anchor</label>
              <CustomSelect
                id="repeatAnchorSelect"
                ariaLabel="Repeat anchor"
                value={engine.repeatAnchor}
                options={REPEAT_ANCHOR_OPTIONS}
                onChange={(v) => engine.setRepeatAnchor(v as RepeatAnchor)}
                openOnHover
                onHoverOpen={handleSelectHoverOpen}
                forceCloseKey={selectCloseKey}
              />
            </span>
            <span className="param-item">
              <label htmlFor="repeatDirectionSelect">Direction</label>
              <CustomSelect
                id="repeatDirectionSelect"
                ariaLabel="Repeat direction"
                value={engine.repeatDirection}
                options={REPEAT_DIRECTION_OPTIONS}
                onChange={(v) => engine.setRepeatDirection(v as RepeatDirection)}
                openOnHover
                onHoverOpen={handleSelectHoverOpen}
                forceCloseKey={selectCloseKey}
              />
            </span>
          </div>
          <div className="flyout-seg">
            <div className="flyout-title">Symmetry repeat</div>
            <span className="param-item">
              <label htmlFor="repeatFamilySelect">Family</label>
              <select
                id="repeatFamilySelect"
                value={engine.repeatFamily}
                onChange={(e) => engine.setRepeatFamily(e.target.value as RepeatFamilyName)}
              >
                <option value="wallpaper">Wallpaper</option>
                <option value="polar">Polar</option>
                <option value="frieze">Frieze</option>
                <option value="alongStroke">Along stroke</option>
                <option value="normals">Normals reflector</option>
              </select>
            </span>
            {engine.repeatFamily === 'wallpaper' ? (
              <span className="param-item">
                <label htmlFor="repeatWallpaperGroupSelect">Group</label>
                <select
                  id="repeatWallpaperGroupSelect"
                  value={engine.repeatWallpaperGroup}
                  onChange={(e) => engine.setRepeatWallpaperGroup(e.target.value as WallpaperGroupId)}
                >
                  {WALLPAPER_GROUP_IDS.map((id) => (
                    <option key={id} value={id} title={WALLPAPER_GROUPS[id].label}>{WALLPAPER_ORBIFOLD[id]}</option>
                  ))}
                </select>
              </span>
            ) : null}
            {engine.repeatFamily === 'frieze' ? (
              <span className="param-item">
                <label htmlFor="repeatFriezeGroupSelect">Group</label>
                <select
                  id="repeatFriezeGroupSelect"
                  value={engine.repeatFriezeGroup}
                  onChange={(e) => engine.setRepeatFriezeGroup(e.target.value as FriezeGroupId)}
                >
                  {FRIEZE_GROUP_IDS.map((id) => (
                    <option key={id} value={id} title={FRIEZE_GROUPS[id].label}>{FRIEZE_ORBIFOLD[id]}</option>
                  ))}
                </select>
              </span>
            ) : null}
            {engine.repeatFamily !== 'wallpaper' ? (
              <span className="param-item">
                <label htmlFor="repeatSymmetryCountStepper">Count</label>
                <NumericStepper
                  id="repeatSymmetryCountStepper"
                  size="compact"
                  value={engine.repeatSymmetryCount}
                  min={1}
                  max={64}
                  step={1}
                  ariaLabel="Repeat count"
                  title="Repeat count"
                  onCommit={(n) => engine.setRepeatSymmetryCount(n)}
                />
              </span>
            ) : (
              <span className="param-item">Wallpaper uses Rows / Columns above.</span>
            )}
            {engine.repeatFamily === 'wallpaper' || engine.repeatFamily === 'frieze' || engine.repeatFamily === 'polar' ? (
              <span className="param-item">
                <label htmlFor="repeatMotifOffsetStepper">Turn motif by (°)</label>
                <NumericStepper
                  id="repeatMotifOffsetStepper"
                  size="compact"
                  value={engine.repeatMotifOffsetDeg}
                  min={-360}
                  max={360}
                  step={5}
                  ariaLabel="Motif orientation offset in degrees"
                  title="Rotate the motif inside its cell before the group steps apply"
                  onCommit={(n) => engine.setRepeatMotifOffsetDeg(n)}
                />
              </span>
            ) : null}
            {engine.repeatFamily === 'polar' ? (
              <>
                <span className="param-item">
                  <label htmlFor="repeatPolarModeSelect">Arrange copies</label>
                  <select
                    id="repeatPolarModeSelect"
                    value={engine.repeatPolarMode}
                    onChange={(e) => engine.setRepeatPolarMode(e.target.value as 'division' | 'degrees')}
                  >
                    <option value="division">By division</option>
                    <option value="degrees">By degrees</option>
                  </select>
                </span>
                {engine.repeatPolarMode === 'degrees' ? (
                  <span className="param-item">
                    <label htmlFor="repeatPolarStepStepper">Step (°)</label>
                    <NumericStepper
                      id="repeatPolarStepStepper"
                      size="compact"
                      value={engine.repeatPolarStepDeg}
                      min={1}
                      max={360}
                      step={1}
                      ariaLabel="Step angle in degrees"
                      title="Angle between copies; it does not have to divide the circle"
                      onCommit={(n) => engine.setRepeatPolarStepDeg(n)}
                    />
                  </span>
                ) : null}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={engine.repeatPolarReflect}
                    onChange={(e) => engine.setRepeatPolarReflect(e.target.checked)}
                  />
                  Reflect (dihedral)
                </label>
              </>
            ) : null}
            {engine.repeatFamily === 'alongStroke' ? (
              <>
                <span className="param-item">
                  <label htmlFor="repeatStationModeSelect">Place copies</label>
                  <select
                    id="repeatStationModeSelect"
                    value={engine.repeatStationMode}
                    onChange={(e) => engine.setRepeatStationMode(e.target.value as 'division' | 'spacing' | 'progression')}
                  >
                    <option value="division">By division</option>
                    <option value="spacing">By spacing</option>
                    <option value="progression">By progression</option>
                  </select>
                </span>
                {engine.repeatStationMode === 'spacing' ? (
                  <span className="param-item">
                    <label htmlFor="repeatAlongSpacingStepper">Spacing</label>
                    <NumericStepper
                      id="repeatAlongSpacingStepper"
                      size="compact"
                      value={engine.repeatAlongSpacing}
                      min={1}
                      max={2000}
                      step={5}
                      ariaLabel="Spacing along the path"
                      title="Distance between copies along the path"
                      onCommit={(n) => engine.setRepeatAlongSpacing(n)}
                    />
                  </span>
                ) : null}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={engine.repeatAlongAlign}
                    onChange={(e) => engine.setRepeatAlongAlign(e.target.checked)}
                  />
                  Turn copies with the path
                </label>
                <span className="param-item">
                  <label htmlFor="repeatAlongOrientationStepper">Turn copies by (°)</label>
                  <NumericStepper
                    id="repeatAlongOrientationStepper"
                    size="compact"
                    value={engine.repeatAlongOrientationDeg}
                    min={-360}
                    max={360}
                    step={5}
                    ariaLabel="Copy orientation offset in degrees"
                    title="Extra turn for each copy, on top of the path direction"
                    onCommit={(n) => engine.setRepeatAlongOrientationDeg(n)}
                  />
                </span>
              </>
            ) : null}
            {(engine.repeatFamily === 'alongStroke' || engine.repeatFamily === 'normals') ? (
              <span className="param-item">Pick a path in the selection to repeat along; the last picked path is the guide.</span>
            ) : null}
            <span className="param-item">
              <button
                type="button"
                onClick={() => engine.applySymmetryRepeat()}
                title="Clone the selection under the symmetry family's transforms (one undo step)"
              >
                Apply repeat to selection
              </button>
            </span>
            {engine.selectionReplication() ? (
              <span className="param-item">
                <button
                  type="button"
                  onClick={() => engine.regenerateReplication()}
                  title="Rebuild the copies of the selected repeat from its stored settings (one undo step)"
                >
                  Regenerate repeat
                </button>
                <button
                  type="button"
                  onClick={() => engine.expandReplication()}
                  title="Keep the copies as ordinary items and detach the stored repeat settings"
                >
                  Expand repeat
                </button>
              </span>
            ) : null}
          </div>
          <div className="flyout-seg">
            <div className="flyout-title">Live repeat</div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={engine.liveSymmetryArmed}
                onChange={(e) => engine.setLiveSymmetryArmed(e.target.checked)}
              />
              Repeat live while drawing
            </label>
            {(engine.repeatFamily === 'alongStroke' || engine.repeatFamily === 'normals') ? (
              <>
                <span className="param-item">
                  {engine.liveGuidePathChosen()
                    ? 'Copies follow the guide path you picked.'
                    : 'Select a path first — your drawing is then placed along or across it.'}
                </span>
                <span className="param-item">
                  <button
                    type="button"
                    onClick={() => engine.captureLiveGuideFromSelection()}
                    title="Use the selected path as the guide for live repeats"
                  >
                    Use selected path as guide
                  </button>
                  {engine.liveGuidePathChosen() ? (
                    <button
                      type="button"
                      onClick={() => engine.clearLiveGuidePath()}
                      title="Stop following a guide path"
                    >
                      Clear guide
                    </button>
                  ) : null}
                </span>
              </>
            ) : (
              <span className="param-item">While you draw, the shape above repeats with the family settings. Finishing the shape keeps the copies.</span>
            )}
          </div>
          <div className="flyout-seg">
            <div className="flyout-title">Progressions</div>
            {engine.repeatFamily === 'wallpaper' || engine.repeatFamily === 'frieze' ? (
              <span className="param-item">Progressions do not apply to wallpaper and frieze repeats — changing copies one by one would break the symmetry group.</span>
            ) : null}
            {engine.repeatFamily === 'polar' ? (
              <>
                <span className="param-item">
                  <label>Start from</label>
                  {REPEAT_OUTCOMES.map((outcome) => (
                    <button
                      key={outcome.id}
                      type="button"
                      onClick={() => engine.applyRepeatOutcome(outcome.id)}
                      title={`Fill the polar and progression fields for a ${outcome.label.toLowerCase()}`}
                    >
                      {outcome.label}
                    </button>
                  ))}
                </span>
                <span className="param-item">
                  {engine.repeatOutcomeName
                    ? `You are using the ${REPEAT_OUTCOMES.find((o) => o.id === engine.repeatOutcomeName)?.label ?? ''} settings. Change any field to make it your own.`
                    : 'Pick Whorl or Phyllotaxis, or set the fields yourself.'}
                </span>
                <ProgressionFields
                  idPrefix="repeatRadiusProgression"
                  label="Distance from centre"
                  value={engine.polarRadiusProgression}
                  onChange={(v) => engine.setPolarRadiusProgression(v)}
                />
                <ProgressionFields
                  idPrefix="repeatScaleProgression"
                  label="Size"
                  value={engine.polarScaleProgression}
                  onChange={(v) => engine.setPolarScaleProgression(v)}
                />
              </>
            ) : null}
            {engine.repeatFamily === 'alongStroke' ? (
              <ProgressionFields
                idPrefix="repeatGapProgression"
                label="Spacing"
                value={engine.alongGapProgression}
                onChange={(v) => engine.setAlongGapProgression(v)}
              />
            ) : null}
            {engine.repeatFamily === 'normals' ? (
              <span className="param-item">Progressions do not apply to the normals reflector — every copy is a mirror of the same size.</span>
            ) : null}
          </div>
          <div className="flyout-seg">
            <div className="flyout-title">Paths</div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={engine.repeatPaths}
                onChange={(e) => engine.setRepeatPaths(e.target.checked)}
              />
              Repeat spline and path drawing
            </label>
          </div>
          <div className="flyout-seg">
            <div className="flyout-title">Shape Keys</div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={engine.repeatRectKeys}
                onChange={(e) => engine.setRepeatRectKeys(e.target.checked)}
              />
              Rect Keys
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={engine.repeatCircleKeys}
                onChange={(e) => engine.setRepeatCircleKeys(e.target.checked)}
              />
              Circle Keys
            </label>
          </div>
        </ShapeParamsFlyout>
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
          base={opDialog.kind === 'scale' ? { width: opDialog.baseW, height: opDialog.baseH } : null}
          live={engine.selectionSize()}
          defaultUnit={engine.lengthUnit}
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
        accept={IMPORT_ACCEPT['import-svg']}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleImportFile}
      />
      <input
        ref={openFileInputRef}
        type="file"
        accept=".nibglider,.nibglider.json,.json,application/json"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleOpenFilePicked}
      />
      {pdfImport ? (
        <PdfImportDialog
          engine={engine}
          fileName={pdfImport.name}
          bytes={pdfImport.bytes}
          onClose={() => setPdfImport(null)}
        />
      ) : null}
      {galleryMode ? (
        <DocumentGallery
          mode={galleryMode}
          docs={gallery.docs}
          openId={gallery.currentId}
          initialName={gallery.currentName ?? 'Untitled'}
          saveLabel="Save"
          onOpen={handleGalleryOpen}
          onSave={handleGallerySave}
          onRename={handleGalleryRename}
          onDelete={handleGalleryDelete}
          onExport={handleGalleryExport}
          onClose={() => setGalleryMode(null)}
        />
      ) : null}
      {newDocOpen ? (
        <NewDocumentDialog
          defaultName={nextUntitledFrom(gallery.docs)}
          onConfirm={handleNewDocumentConfirm}
          onClose={() => setNewDocOpen(false)}
        />
      ) : null}
      {findReplaceOpen ? (
        <FindReplaceDialog
          engine={engine}
          onClose={() => setFindReplaceOpen(false)}
        />
      ) : null}
    </div>
  );
});

export default ControlPanel;
