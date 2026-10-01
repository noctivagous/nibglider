import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import CustomSelect, { type CustomSelectOption } from './CustomSelect';
import FontFamilySelect, { type FontFamilyGroup } from './FontFamilySelect';
import NumericStepper from './NumericStepper';
import type {
  CircleInnerShape,
  CombineMode,
  FillSpec,
  FillType,
  GridType,
  InnerShapeParams,
  NibGliderEngine,
  RectangleInnerShape,
  StrokeCap,
  StrokeJoin,
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

function HistoryButtons({ engine }: { engine: NibGliderEngine }) {
  const undoTitle = engine.canUndo()
    ? `Undo ${engine.undoLabel() ?? ''} (Ctrl/⌘+Z)`
    : 'Nothing to undo';
  const redoTitle = engine.canRedo()
    ? `Redo ${engine.redoLabel() ?? ''} (Ctrl/⌘+Shift+Z)`
    : 'Nothing to redo';
  const groupTitle = engine.canGroupSelection()
    ? 'Group selection (Ctrl/⌘+G)'
    : 'Select 2+ shapes to group';
  const ungroupTitle = engine.canUngroupSelection()
    ? 'Ungroup selection (Ctrl/⌘+Shift+G)'
    : 'Select a group to ungroup';
  return (
    <>
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
            <path d="M6.5 3.5 H3.8 A4.2 4.2 0 0 0 3.8 10.9 H8" />
            <path d="M6.2 1.2 L3 3.5 L6.2 5.8" />
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
            <path d="M9.5 3.5 H12.2 A4.2 4.2 0 0 1 12.2 10.9 H8" />
            <path d="M9.8 1.2 L13 3.5 L9.8 5.8" />
          </svg>
        </button>
      </div>
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

export default function ControlPanel({ engine }: { engine: NibGliderEngine }) {
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
  // Hover-open select menus (panel CustomSelects only) share the same
  // single-open invariant: opening one closes the params flyout, and
  // opening a flyout dismisses any hover-open select menu.
  const [selectCloseKey, setSelectCloseKey] = useState(0);
  const dismissSelects = useCallback(() => setSelectCloseKey((k) => k + 1), []);
  const handleSelectHoverOpen = useCallback(() => {
    setParamsFlyout(null);
  }, []);
  const openFlyoutAndDismissSelects = useCallback(
    (name: 'circle' | 'rect' | 'stroke' | 'fill' | 'text') => {
      setParamsFlyout(name);
      dismissSelects();
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
      }
    },
    [paramsFlyout, dismissSelects],
  );
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

  return (
    <>
      <div className="panel-row panel-row-main">
      <div className="panel-group panel-group-paint" role="group" aria-label="Paint">
      <section
        id="strokeControls"
        className={sel ? 'panel-card reflecting-selection' : 'panel-card'}
        aria-label="Stroke"
      >
        <header className="pane-titlebar titlebar-single">
          
          <span className="title-seg" title="Stroke"><span className="pane-title">
            <TitleIcon>
              <path d="M2 12 L14 2" />
            </TitleIcon>
            <span className="pane-title-text">Stroke</span></span> <kbd>S</kbd>
          </span>
<label className="toggle-switch square-knob">
            <input
              type="checkbox"
              id="strokeEnabledCheckbox"
              checked={strokeOn}
              onChange={(e) => engine.setStrokeEnabled(e.target.checked)}
            />
            <span className="slider" />
          </label>
          <input
            type="color"
            id="strokeColorWell"
            className="titlebar-well"
            value={strokeColor}
            title="Stroke Color"
            onChange={(e) => engine.setStrokeColor(e.target.value)}
          />
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
      </section>

      <section
        id="fillControls"
        className={sel ? 'panel-card reflecting-selection' : 'panel-card'}
        aria-label="Fill"
      >
        <header className="pane-titlebar titlebar-single">
          
          <span className="title-seg" title="Fill"><span className="pane-title">
            <TitleIcon>
              <path
                d="M8 1.5 C8 1.5 3.5 7.5 3.5 10 A4.5 4.5 0 0 0 12.5 10 C12.5 7.5 8 1.5 8 1.5 Z"
                fill="currentColor"
                stroke="none"
              />
            </TitleIcon>
            <span className="pane-title-text">Fill</span></span> <kbd>D</kbd>
          </span>
<label className="toggle-switch square-knob">
            <input
              type="checkbox"
              id="fillEnabledCheckbox"
              checked={fillOn}
              onChange={(e) => engine.setFillEnabled(e.target.checked)}
            />
            <span className="slider" />
          </label>
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
      </section>

      <section id="textControls" className="panel-card" aria-label="Text">
        <header className="pane-titlebar titlebar-single">
          <span className="title-seg" title="Text"><span className="pane-title">
            <TitleIcon>
              <path d="M3 3 H13 M8 3 V11" />
            </TitleIcon>
            <span className="pane-title-text">Text</span></span>
          </span>
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
      </section>
      </div>
      <div className="panel-group panel-group-keys" role="group" aria-label="Shape keys">

      <section id="circleFrameControls" className="panel-card" aria-label="Circle Keys">
        <header className="pane-titlebar titlebar-single">
          <span className="title-seg" title="Circle Keys"><span className="pane-title">
            <TitleIcon>
              <circle cx="8" cy="7" r="5" />
            </TitleIcon>
            <span className="pane-title-text">Circle Keys</span></span>
          </span>
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
      </section>

      <section id="rectFrameControls" className="panel-card" aria-label="Rect Keys">
        <header className="pane-titlebar titlebar-single">
          <span className="title-seg" title="Rect Keys"><span className="pane-title">
            <TitleIcon>
              <path d="M3 2 H13 V12 H3 Z" />
            </TitleIcon>
            <span className="pane-title-text">Rect Keys</span></span>
          </span>
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
      </section>

      <section id="combinatoricsControls" className="panel-card" aria-label="Combinatorics">
        <header className="pane-titlebar titlebar-single">
          <span className="title-seg" title="Combinatorics"><span className="pane-title">
            <TitleIcon>
              <circle cx="6" cy="7" r="3.5" />
              <circle cx="10" cy="7" r="3.5" />
            </TitleIcon>
            <span className="pane-title-text">Combinatorics</span></span>
          </span>
          <CombinatoricsButtons engine={engine} />
        </header>
      </section>

      <section id="historyControls" className="panel-card" aria-label="History">
        <header className="pane-titlebar titlebar-single">
          <span className="title-seg" title="History"><span className="pane-title">
            <TitleIcon>
              <path d="M6.5 3.5 H3.8 A4.2 4.2 0 0 0 3.8 10.9 H8" />
              <path d="M6.2 1.2 L3 3.5 L6.2 5.8" />
            </TitleIcon>
            <span className="pane-title-text">History</span></span>
          </span>
          <HistoryButtons engine={engine} />
        </header>
      </section>
      </div>
      </div>
      <div className="panel-row panel-row-snap">
      <div className="panel-group panel-group-snapping" role="group" aria-label="Snapping">
      <section id="gridControls" className="panel-card" aria-label="Grid">
        <header className="pane-titlebar titlebar-single">
          <span className="title-seg" title="Grid"><span className="pane-title">
            <TitleIcon>
              <path d="M1 4 H11 M1 8 H11 M4 1 V11 M8 1 V11" />
            </TitleIcon>
            <span className="pane-title-text">Grid</span></span> <kbd>/</kbd>
          </span>
          <label className="toggle-switch square-knob">
            <input
              type="checkbox"
              id="gridEnabledCheckbox"
              checked={engine.isGridEnabled}
              onChange={(e) => engine.setGridEnabled(e.target.checked)}
            />
            <span className="slider" />
          </label>
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
      </section>
      <section id="snappingControls" className="panel-card" aria-label="Snapping">
        <header className="pane-titlebar titlebar-single">
          <span className="title-seg" title="Snapping"><span className="pane-title">
            <TitleIcon>
              <circle cx="8" cy="7" r="3.5" />
              <path d="M8 0.5 V2.5 M8 11.5 V13.5 M1.5 7 H3.5 M12.5 7 H14.5" />
              <circle cx="8" cy="7" r="1" fill="currentColor" stroke="none" />
            </TitleIcon>
            <span className="pane-title-text">Snapping</span></span>
          </span>
          <div className="snapping-seg" role="group" aria-label="Snapping modes">
          <SnapToggle
            id="gridSnappingToggle"
            label="Grid"
            pressed={engine.isGridSnappingEnabled}
            onToggle={(next) => engine.setGridSnappingEnabled(next)}
          >
            <path d="M1 4 H11 M1 8 H11 M4 1 V11 M8 1 V11" />
          </SnapToggle>
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
              label="Length snap step in points"
              value={engine.lengthSnapStep}
              min={1}
              max={500}
              step={1}
              disabled={!engine.isLengthSnappingEnabled}
              onCommit={(n) => engine.setLengthSnapStep(n)}
            />
          </span>
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
          </div>
        </header>
      </section>
      </div>
      </div>
    </>
  );
}
