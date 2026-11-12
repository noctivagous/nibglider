// Tutorial spotlight + bubble overlay.
// Points at a data-tutorial-id target (tracked across scroll/resize) and
// falls back to a centered bubble when the target is missing or hidden.
// Steps that demo on the canvas or wait on canvas input park the bubble in
// a screen corner instead: the overlay scores the four corners by overlap
// with the demo footprint, named avoid targets, and visible screen chrome
// (panel, keyboard, status, keys box) and glides to the clearest one. An
// authored bubble.anchor always wins: sitting on top of an element is
// allowed when the step deliberately asks for it.
// Plain system styling: no gradients, glows, or icon decoration.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getTutorialTargetRect, resolveTutorialTarget, type TutorialTargetRect } from '../tutorial/TargetResolver';
import {
  BUBBLE_DEFAULT_WIDTH,
  BUBBLE_ESTIMATED_HEIGHT,
  chooseParkCorner,
  cornerBoxStyle,
  demoFootprint,
} from '../tutorial/bubbleParking';
import type { TutorialStep } from '../tutorial/tutorialSchema';
import DemoOverlay, { type DemoCursor, type DemoPointAt } from './DemoOverlay';

const BUBBLE_WIDTH = 320;
const GAP = 10;

function countRangeHint(what: string, min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) {
    return min === max
      ? `Waiting until ${what} is exactly ${min}.`
      : `Waiting until ${what} is between ${min} and ${max}.`;
  }
  if (min !== undefined) return `Waiting until ${what} reaches ${min}.`;
  if (max !== undefined) return `Waiting until ${what} is at most ${max}.`;
  return `Waiting for ${what} to change.`;
}

function waitingHint(step: TutorialStep): string | null {
  const expect = step.expect;
  if (!expect || expect.kind === 'none') return null;
  switch (expect.kind) {
    case 'press-key':
      return expect.count && expect.count > 1
        ? `Waiting for you to press ${expect.key.toUpperCase()} ${expect.count} times.`
        : `Waiting for you to press ${expect.key.toUpperCase()}.`;
    case 'run-command':
      return 'Waiting for you to run the described action.';
    case 'selection-changed':
      return 'Waiting for the selection to change.';
    case 'scene-changed':
      return 'Waiting for a change on the canvas.';
    case 'selection-count':
      return countRangeHint('the selection', expect.min, expect.max);
    case 'object-count':
      return countRangeHint('the object count', expect.min, expect.max);
    case 'setting-is':
      return 'Waiting for the setting described above.';
  }
}

/** Steps that perform on the canvas park the bubble instead of floating it
 * over the work area: live demos, canvas targets, and explicit anchor/avoid.
 * A step that says placement "center" and names no corner stays centered.
 * That is the reading position for the first two intro slides: parking
 * them sends the card to a corner and back again as the reader moves
 * between those slides. A later canvas step that must leave the drawing
 * clear names an anchor, and that anchor still parks. */
function needsParking(step: TutorialStep): boolean {
  if (step.bubble.placement === 'center' && !step.bubble.anchor) return false;
  return (
    (step.demo?.length ?? 0) > 0 ||
    step.target === 'canvas' ||
    !!step.bubble.anchor ||
    (step.bubble.avoid?.length ?? 0) > 0
  );
}

/** Screen rect of a chrome element by DOM id, or null when absent/hidden. */
function elementRectById(id: string): TutorialTargetRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(id);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) return null;
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

interface ParkLayout {
  target: TutorialTargetRect | null;
  canvas: TutorialTargetRect | null;
  footprint: TutorialTargetRect[];
  named: TutorialTargetRect[];
  chrome: TutorialTargetRect[];
  vw: number;
  vh: number;
}

/** Screen chrome the parked bubble treats as occupied: the control panel,
 * the on-screen keyboard, the status box, and the available-keys box.
 * The step's own target is never an avoid rect: pointing at it is deliberate. */
function measureChrome(step: TutorialStep): TutorialTargetRect[] {
  const out: TutorialTargetRect[] = [];
  const byId = (id: string): void => {
    if (step.target === id) return;
    const rect = elementRectById(id);
    if (rect) out.push(rect);
  };
  const byTarget = (id: string): void => {
    if (step.target === id) return;
    const rect = getTutorialTargetRect(id);
    if (rect) out.push(rect);
  };
  byId('controlPanel');
  byId('keyboardContainer');
  byTarget('status');
  byTarget('available-keys');
  return out;
}

/** One layout snapshot: re-taken on step change, scroll, resize, and any
 * body layout shift (popover open, section expand) via ResizeObserver. */
function measure(step: TutorialStep): ParkLayout {
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const target = step.target ? getTutorialTargetRect(step.target) : null;
  const canvas = needsParking(step) ? getTutorialTargetRect('canvas') : null;
  const footprint = step.demo && canvas ? demoFootprint(step.demo, getTutorialTargetRect, canvas) : [];
  const named: TutorialTargetRect[] = [];
  for (const id of step.bubble.avoid ?? []) {
    if (id === step.target) continue;
    const rect = getTutorialTargetRect(id);
    if (rect) named.push(rect);
  }
  return { target, canvas, footprint, named, chrome: measureChrome(step), vw, vh };
}

function bubbleStyle(
  rect: TutorialTargetRect | null,
  placement: TutorialStep['bubble']['placement'],
  bubbleH: number,
): { left?: number; top?: number; right?: number; bottom?: number; centered: boolean } {
  if (!rect || placement === 'center') return { centered: true };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const midY = Math.min(Math.max(rect.y + rect.height / 2 - 80, GAP), Math.max(vh - bubbleH, GAP));
  const raw: { left?: number; top?: number; right?: number; bottom?: number } = (() => {
    if (placement === 'above') {
      if (rect.y > bubbleH + GAP) return { left: rect.x, bottom: vh - rect.y + GAP };
      return { left: rect.x, top: rect.y + rect.height + GAP };
    }
    if (placement === 'below') {
      if (rect.y + rect.height + bubbleH + GAP <= vh) {
        return { left: rect.x, top: rect.y + rect.height + GAP };
      }
      return { left: rect.x, bottom: vh - rect.y + GAP };
    }
    if (placement === 'left') {
      if (rect.x > BUBBLE_WIDTH + GAP * 2) {
        return { right: vw - rect.x + GAP, top: midY };
      }
      return { left: rect.x + rect.width + GAP, top: midY };
    }
    // 'right' or unset: prefer right, flip to left when there is no room.
    if (rect.x + rect.width + BUBBLE_WIDTH + GAP * 2 <= vw) {
      return { left: rect.x + rect.width + GAP, top: midY };
    }
    return { right: vw - rect.x + GAP, top: midY };
  })();
  // Normalize to left/top and clamp the whole bubble on screen: a target
  // near or past a viewport edge must never push the bubble off with it.
  const rawLeft = raw.left ?? (raw.right !== undefined ? vw - raw.right - BUBBLE_WIDTH : GAP);
  const rawTop = raw.top ?? (raw.bottom !== undefined ? vh - raw.bottom - bubbleH : GAP);
  return {
    left: Math.min(Math.max(rawLeft, GAP), Math.max(vw - BUBBLE_WIDTH - GAP, GAP)),
    top: Math.min(Math.max(rawTop, GAP), Math.max(vh - bubbleH - GAP, GAP)),
    centered: false,
  };
}

export default function TutorialOverlay({
  tutorialTitle,
  step,
  stepIndex,
  stepCount,
  onNext,
  onBack,
  onSkip,
  onEnd,
  demoAvailable,
  demoPlaying,
  demoNarration,
  onPlayDemo,
  onStopDemo,
  demoCursor,
  demoPointAt,
}: {
  tutorialTitle: string;
  step: TutorialStep;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onEnd: () => void;
  /** Live demonstration: the step carries a playable script. */
  demoAvailable?: boolean;
  demoPlaying?: boolean;
  demoNarration?: { title: string; body: string } | null;
  onPlayDemo?: () => void;
  onStopDemo?: () => void;
  /** Live ghost cursor + arrow, painted inside this overlay's stacking
   * context so it stays above the dim without outranking the bubble. */
  demoCursor?: DemoCursor | null;
  demoPointAt?: DemoPointAt | null;
}) {
  // Layout re-reads from the DOM on every render; scroll/resize/shift
  // events (and step changes) bump the tick to trigger that re-render.
  const [tick, setTick] = useState(0);
  const [bubbleH, setBubbleH] = useState<number>(BUBBLE_ESTIMATED_HEIGHT);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setTick((n) => n + 1);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (observer && typeof document !== 'undefined' && document.body) observer.observe(document.body);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
    };
  }, [step]);
  void tick;
  const layout: ParkLayout = measure(step);

  // True bubble height for beside-target placement. Parked corners pin to
  // a screen edge instead, so narration changing this height does not
  // slide the card.
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const update = () => {
      const height = el.offsetHeight;
      if (height > 0) setBubbleH((prev) => (Math.abs(height - prev) > 1 ? height : prev));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A step that points at something mostly off screen (a panel section
  // below the fold, say) scrolls it into view once, when the step becomes
  // current. The capture-phase scroll listener above re-measures the
  // layout, so the spotlight lands on the target where it settles.
  const stepTargetId = step.target;
  useEffect(() => {
    if (!stepTargetId || stepTargetId === 'canvas') return;
    const timer = window.setTimeout(() => {
      // The resolver's element type is a minimal structural interface;
      // the overlay only ever runs against the real document.
      const el = resolveTutorialTarget(stepTargetId) as unknown as Element | null;
      if (!el || typeof el.scrollIntoView !== 'function') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const visW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if ((visW * visH) / (r.width * r.height) < 0.5) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }, 90);
    return () => window.clearTimeout(timer);
  }, [stepIndex, stepTargetId]);

  const parked = needsParking(step);
  // Corner choice uses a fixed card size, not the live height. Narration
  // text changing the card's height must not flip the corner or slide a
  // bottom-pinned card up and down during a demo.
  const parkStyle = useMemo(() => {
    if (!parked) return null;
    const avoid = [...layout.footprint, ...layout.named, ...layout.chrome];
    if (step.target === 'canvas' && layout.canvas) avoid.push(layout.canvas);
    const corner = chooseParkCorner(
      { width: layout.vw, height: layout.vh },
      { width: BUBBLE_DEFAULT_WIDTH, height: BUBBLE_ESTIMATED_HEIGHT },
      avoid,
      step.bubble.anchor,
    );
    return cornerBoxStyle(corner, { width: layout.vw, height: layout.vh });
  }, [parked, layout, step]);

  const rect = layout.target;
  const pos = parked
    ? { centered: false as const, ...parkStyle }
    : bubbleStyle(rect, step.bubble.placement, bubbleH);
  const hint = waitingHint(step);
  const isLast = stepIndex + 1 >= stepCount;

  return (
    <div className="tutorial-overlay" aria-live="polite">
      {rect && (
        <div
          className="tutorial-spotlight"
          aria-hidden="true"
          style={{ left: rect.x - 4, top: rect.y - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div
        ref={bubbleRef}
        className={pos.centered ? 'tutorial-bubble tutorial-centered' : 'tutorial-bubble'}
        role="dialog"
        aria-label={step.bubble.title}
        style={
          pos.centered
            ? undefined
            : {
                left: pos.left,
                top: pos.top,
                right: pos.right,
                bottom: pos.bottom,
              }
        }
      >
        <div className="tutorial-kicker">
          {tutorialTitle} · Step {stepIndex + 1} of {stepCount}
        </div>
        <h2 className="tutorial-title">{step.bubble.title}</h2>
        <p className="tutorial-body">{step.bubble.body}</p>
        {demoNarration && (
          <p className="tutorial-demo-narration">
            <strong>{demoNarration.title}</strong> — {demoNarration.body}
          </p>
        )}
        {hint && !demoPlaying && <p className="tutorial-hint">{hint}</p>}
        {demoPlaying && (
          <p className="tutorial-hint">Demo playing — press any key or click the canvas to take over.</p>
        )}
        {!rect && step.target && (
          <p className="tutorial-hint">Its target is hidden right now, so this tip is centered.</p>
        )}
        <div className="tutorial-actions">
          {demoAvailable && !demoPlaying && onPlayDemo && (
            <button type="button" className="tutorial-btn tutorial-primary" onClick={onPlayDemo}>
              Watch demo
            </button>
          )}
          {demoPlaying && onStopDemo && (
            <button type="button" className="tutorial-btn" onClick={onStopDemo}>
              Stop demo
            </button>
          )}
          <button type="button" className="tutorial-btn" onClick={onBack} disabled={stepIndex === 0}>
            Back
          </button>
          {step.skippable !== false && !isLast && (
            <button type="button" className="tutorial-btn" onClick={onSkip}>
              Skip
            </button>
          )}
          <button type="button" className="tutorial-btn" onClick={onEnd}>
            End
          </button>
          <button type="button" className="tutorial-btn tutorial-primary" onClick={onNext}>
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
      {demoPlaying && (demoCursor || demoPointAt) && (
        <DemoOverlay
          key={demoPointAt?.target ?? 'cursor'}
          cursor={demoCursor ?? null}
          pointAt={demoPointAt ?? null}
        />
      )}
    </div>
  );
}
