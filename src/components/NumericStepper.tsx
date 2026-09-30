import { useEffect, useRef, useState } from 'react';

// Decimals present in a step (0.5 -> 1, 0.05 -> 2, 1 -> 0).
function stepPrecision(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  const dot = s.indexOf('.');
  if (dot < 0) {
    const exp = s.indexOf('e-');
    return exp >= 0 ? Number(s.slice(exp + 2)) : 0;
  }
  return s.length - dot - 1;
}

// Snap a value onto the min-anchored step grid.
function quantize(v: number, min: number | undefined, step: number): number {
  if (!Number.isFinite(v) || !Number.isFinite(step) || step <= 0) return v;
  const base = min ?? 0;
  const q = base + Math.round((v - base) / step) * step;
  return Number(q.toFixed(Math.min(10, stepPrecision(step))));
}

function clamp(v: number, min?: number, max?: number): number {
  let out = v;
  if (min !== undefined) out = Math.max(min, out);
  if (max !== undefined) out = Math.min(max, out);
  return out;
}

// Up to three decimals, no trailing zeros ("4", "4.5", "4.125").
function defaultFormat(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Number(n.toFixed(3)));
}

export interface NumericStepperProps {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Large click target shifts by 10x step. Defaults to 10x step. */
  largeStep?: number;
  onCommit: (n: number) => void;
  onDone?: () => void;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  /** Compact fits panel titlebars; medium fits flyout rows. */
  size?: 'compact' | 'medium';
  /** Fixed decimals shown in the field (e.g. 1 for supershape params). */
  decimals?: number;
  /** Custom display mapping (e.g. fraction -> percent). */
  formatValue?: (v: number) => string;
  /** Custom text parsing; return NaN to ignore the keystroke. */
  parseValue?: (s: string) => number;
  /** Unit suffix shown after the field (never typed). */
  unit?: string;
  className?: string;
}

// Custom numeric field with [-]/[+] steppers. Typing tolerates
// intermediate text ("4.", ""): the draft shows verbatim while every
// finite prefix still commits live. Step buttons quantize onto the step
// grid, clamp, hold-to-repeat, and honour Shift for a large step.
export default function NumericStepper({
  id,
  value,
  min,
  max,
  step = 1,
  largeStep,
  onCommit,
  onDone,
  ariaLabel,
  title,
  disabled,
  size = 'medium',
  decimals,
  formatValue,
  parseValue,
  unit,
  className,
}: NumericStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const repeatTimer = useRef<number | null>(null);
  const repeatInterval = useRef<number | null>(null);

  const stopRepeat = () => {
    if (repeatTimer.current !== null) {
      window.clearTimeout(repeatTimer.current);
      repeatTimer.current = null;
    }
    if (repeatInterval.current !== null) {
      window.clearInterval(repeatInterval.current);
      repeatInterval.current = null;
    }
  };

  useEffect(() => stopRepeat, []);

  const big = largeStep ?? step * 10;

  const format = (v: number): string => {
    if (formatValue) return formatValue(v);
    if (decimals !== undefined) {
      if (!Number.isFinite(v)) return (0).toFixed(decimals);
      return v.toFixed(decimals);
    }
    return defaultFormat(v);
  };

  const parse = (s: string): number =>
    parseValue ? parseValue(s) : parseFloat(s);

  const stepBy = (dir: 1 | -1, amount: number) => {
    const next = clamp(quantize(value + dir * amount, min, step), min, max);
    setDraft(null);
    onCommit(next);
  };

  const beginRepeat = (dir: 1 | -1, amount: number) => {
    if (disabled) return;
    stepBy(dir, amount);
    stopRepeat();
    repeatTimer.current = window.setTimeout(() => {
      repeatTimer.current = null;
      repeatInterval.current = window.setInterval(() => {
        stepBy(dir, amount);
      }, 60);
    }, 400);
  };

  const commitDraft = (raw: string) => {
    const n = parse(raw);
    if (Number.isFinite(n)) onCommit(clamp(n, min, max));
  };

  return (
    <span
      className={
        `num-stepper num-stepper-${size}` +
        (disabled ? ' is-disabled' : '') +
        (className ? ` ${className}` : '')
      }
    >
      <button
        type="button"
        className="num-stepper-btn"
        aria-label={`Decrease ${ariaLabel}`}
        title={`Decrease ${ariaLabel} (Shift: large step)`}
        disabled={disabled}
        tabIndex={-1}
        onPointerDown={(e) => {
          e.preventDefault();
          beginRepeat(-1, e.shiftKey ? big : step);
        }}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            stepBy(-1, e.shiftKey ? big : step);
          }
        }}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path
            d="M2 5 H8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <input
        type="number"
        id={id}
        className="num-stepper-input"
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        min={min}
        max={max}
        step={step}
        value={draft ?? format(value)}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parse(e.target.value);
          if (Number.isFinite(n)) onCommit(clamp(n, min, max));
        }}
        onBlur={() => {
          if (draft !== null) commitDraft(draft);
          setDraft(null);
          onDone?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? big : step);
          } else if (e.key === 'PageUp' || e.key === 'PageDown') {
            e.preventDefault();
            e.stopPropagation();
            stepBy(e.key === 'PageUp' ? 1 : -1, big);
          } else if (e.key === 'Enter') {
            e.stopPropagation();
            if (draft !== null) commitDraft(draft);
            setDraft(null);
            onDone?.();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setDraft(null);
            onDone?.();
          }
        }}
      />
      {unit && (
        <span className="num-stepper-unit" aria-hidden="true">
          {unit}
        </span>
      )}
      <button
        type="button"
        className="num-stepper-btn"
        aria-label={`Increase ${ariaLabel}`}
        title={`Increase ${ariaLabel} (Shift: large step)`}
        disabled={disabled}
        tabIndex={-1}
        onPointerDown={(e) => {
          e.preventDefault();
          beginRepeat(1, e.shiftKey ? big : step);
        }}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            stepBy(1, e.shiftKey ? big : step);
          }
        }}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path
            d="M2 5 H8 M5 2 V8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}
