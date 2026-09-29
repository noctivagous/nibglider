import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import CustomSelect, { type CustomSelectOption } from './CustomSelect';
import type {
  CircleInnerShape,
  GridType,
  InnerShapeParams,
  NibGliderEngine,
  RectangleInnerShape,
  StrokeCap,
  StrokeJoin,
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

// Tiny glyph marking each snapping mode in its check-row label.
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
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  id?: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <span className="param-item">
      <label htmlFor={id}>
        {label}: {display}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
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
          display={`${Math.round(deg)}°`}
          value={deg}
          min={10}
          max={350}
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
          display={`${Math.round(deg)}°`}
          value={deg}
          min={10}
          max={170}
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
          display={String(params.sides)}
          value={params.sides}
          min={3}
          max={12}
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
            display={params[s.key].toFixed(1)}
            value={params[s.key]}
            min={s.min}
            max={s.max}
            step={s.step}
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
          display={`${Math.round(deg)}°`}
          value={deg}
          min={10}
          max={170}
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
          display={String(params.sides)}
          value={params.sides}
          min={3}
          max={12}
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
            display={params[s.key].toFixed(1)}
            value={params[s.key]}
            min={s.min}
            max={s.max}
            step={s.step}
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
  children,
}: {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  tone: 'circle' | 'rect' | 'stroke';
  title: string;
  preview: ReactNode;
  onClose: () => void;
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
}: {
  engine: NibGliderEngine;
  strokeWidth: number;
  dash: number;
  gap: number;
}) {
  const presetId =
    DASH_PRESETS.find((p) => p.dash === dash && p.gap === gap)?.id ?? null;
  return (
    <div className="panelParameters">
      <span className="param-item">
        <label htmlFor="strokeWidthSlider">Width</label>
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
          <input
            type="number"
            id="strokeWidthInput"
            className="stroke-width-input"
            min={1}
            max={40}
            step={0.5}
            value={strokeWidth}
            aria-label="Stroke width in points"
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n)) engine.setStrokeWidth(n);
            }}
          />
        </span>
      </span>
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
          <label htmlFor="strokeDashInput">
            Dash
            <input
              type="number"
              id="strokeDashInput"
              className="stroke-width-input"
              min={0}
              max={80}
              step={0.5}
              value={dash}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) engine.setStrokeDash(n, gap);
              }}
            />
          </label>
          <label htmlFor="strokeGapInput">
            Gap
            <input
              type="number"
              id="strokeGapInput"
              className="stroke-width-input"
              min={0}
              max={80}
              step={0.5}
              value={gap}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) engine.setStrokeDash(dash, n);
              }}
            />
          </label>
        </span>
      </span>
    </div>
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
      ['polygon', 'trapezoid', 'parallelogram', 'rightTriangle', 'rhombus'] as const
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
    'circle' | 'rect' | 'stroke' | null
  >(null);
  const circlePreviewRef = useRef<HTMLButtonElement>(null);
  const rectPreviewRef = useRef<HTMLButtonElement>(null);
  const strokePreviewRef = useRef<HTMLButtonElement>(null);
  const closeFlyout = () => setParamsFlyout(null);
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
          <span id="strokeWidthDisplay">
            {strokeWidth.toFixed(1)} pt
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
            onClick={() =>
              setParamsFlyout((v) => (v === 'stroke' ? null : 'stroke'))
            }
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
          >
            <StrokeParams
              engine={engine}
              strokeWidth={strokeWidth}
              dash={dashLength}
              gap={gapLength}
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
          onClick={() =>
            setParamsFlyout((v) => (v === 'circle' ? null : 'circle'))
          }
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
          onClick={() =>
            setParamsFlyout((v) => (v === 'rect' ? null : 'rect'))
          }
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
        >
          <RectShapeParams engine={engine} />
        </ShapeParamsFlyout>
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
          <label className="check-row" title="Grid">
            <input
              type="checkbox"
              id="gridSnappingCheckbox"
              checked={engine.isGridSnappingEnabled}
              onChange={(e) => engine.setGridSnappingEnabled(e.target.checked)}
            />
            <CheckIcon>
              <path d="M1 4 H11 M1 8 H11 M4 1 V11 M8 1 V11" />
            </CheckIcon>
            <span>Grid</span>
          </label>
          <label className="check-row" title="Path">
            <input
              type="checkbox"
              id="pathSnappingCheckbox"
              checked={engine.isPathSnappingEnabled}
              onChange={(e) => engine.setPathSnappingEnabled(e.target.checked)}
            />
            <CheckIcon>
              <path d="M1.5 9 C4 9 4 3.5 6.5 3.5 S9.5 6 10.5 6" />
              <circle cx="1.5" cy="9" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="10.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
            </CheckIcon>
            <span>Path</span>
          </label>
          <label className="check-row" title="Angle">
            <input
              type="checkbox"
              id="angleSnappingCheckbox"
              checked={engine.isAngleSnappingEnabled}
              onChange={(e) => engine.setAngleSnappingEnabled(e.target.checked)}
            />
            <CheckIcon>
              <path d="M1.5 10.5 H10.5 M1.5 10.5 L8.5 2" />
              <path d="M4.8 10.5 A3.4 3.4 0 0 0 4.2 7.6" />
            </CheckIcon>
            <span>Angle</span>
          </label>
          <label className="check-row" title="Length">
            <input
              type="checkbox"
              id="lengthSnappingCheckbox"
              checked={engine.isLengthSnappingEnabled}
              onChange={(e) => engine.setLengthSnappingEnabled(e.target.checked)}
            />
            <CheckIcon>
              <path d="M2 6 H10 M2 6 L4 4 M2 6 L4 8 M10 6 L8 4 M10 6 L8 8" />
            </CheckIcon>
            <span>Length</span>
          </label>
          <div className="snapping-aspect">
            <label className="check-row" title="Aspect">
              <input
                type="checkbox"
                id="aspectSnappingCheckbox"
                checked={engine.isAspectSnappingEnabled}
                onChange={(e) => engine.setAspectSnappingEnabled(e.target.checked)}
              />
              <CheckIcon>
                <path d="M1 2.5 H11 V9.5 H1 Z M6 2.5 V9.5" />
              </CheckIcon>
              <span>Aspect</span>
            </label>
            <CustomSelect
              id="aspectRatioSelect"
              ariaLabel="Aspect ratio"
              value={engine.aspectRatioKey()}
              options={ASPECT_RATIO_OPTIONS}
              onChange={(v) => engine.setAspectRatioKey(v)}
            />
          </div>
          </div>
        </header>
      </section>
      </div>
      <div className="panel-group panel-group-capjoin" role="group" aria-label="Caps and joins">
      <section
        id="capJoinControls"
        className={sel ? 'panel-card reflecting-selection' : 'panel-card'}
        aria-label="Caps and Joins"
      >
        <header className="pane-titlebar titlebar-single">
          <span className="title-seg" title="Caps & Joins"><span className="pane-title">
            <TitleIcon>
              <path d="M2 11 L8 4 L14 11" />
              <path d="M2 11 H14" />
            </TitleIcon>
            <span className="pane-title-text">Caps &amp; Joins</span></span>
          </span>
          <div className="stroke-row">
            <div className="stroke-seg">
              <span className="stroke-seg-label">Cap</span>
              <div className="seg-ctrl" role="group" aria-label="Line cap">
                {CAP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.label}
                    className={
                      strokeCap === opt.value ? 'active' : undefined
                    }
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
            </div>
            <div className="stroke-seg">
              <span className="stroke-seg-label">Join</span>
              <div className="seg-ctrl" role="group" aria-label="Line join">
                {JOIN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.label}
                    className={
                      strokeJoin === opt.value ? 'active' : undefined
                    }
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
            </div>
            <div className="stroke-seg">
              <span className="stroke-seg-label">Miter</span>
              <input
                type="number"
                id="miterLimitInput"
                className="miter-limit-input"
                aria-label="Miter"
                title="Miter"
                min={1}
                max={40}
                step={0.5}
                value={miterLimit}
                disabled={strokeJoin !== 'miter'}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n)) engine.setMiterLimit(n);
                }}
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
