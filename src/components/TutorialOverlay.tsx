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
import { getTutorialTargetRect, type TutorialTargetRect } from '../tutorial/TargetResolver';
import {
  BUBBLE_DEFAULT_WIDTH,
  BUBBLE_ESTIMATED_HEIGHT,
  chooseParkCorner,
  cornerPosition,
  demoFootprint,
} from '../tutorial/bubbleParking';
import type { TutorialStep } from '../tutorial/tutorialSchema';
import DemoOverlay, { type DemoCursor, type DemoPointAt } from './DemoOverlay';

const BUBBLE_WIDTH = 320;
const GAP = 10;

function waitingHint(step: TutorialStep): string | null {
  const expect = step.expect;
  if (!expect || expect.kind === 'none') return null;
  switch (expect.kind) {
    case 'press-key':
      return `Waiting for you to press ${expect.key.toUpperCase()}.`;
    case 'run-command':
      return 'Waiting for you to run the described action.';
    case 'selection-changed':
      return 'Waiting for the selection to change.';
    case 'scene-changed':
      return 'Waiting for a change on the canvas.';
  }
}

/** Steps that perform on the canvas park the bubble instead of floating it
 * over the work area: live demos, canvas targets, and explicit anchor/avoid. */
function needsParking(step: TutorialStep): boolean {
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
): { left?: number; top?: number; right?: number; bottom?: number; centered: boolean } {
  if (!rect || placement === 'center') return { centered: true };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const midY = Math.min(Math.max(rect.y + rect.height / 2 - 80, GAP), Math.max(vh - 220, GAP));
  if (placement === 'above') {
    if (rect.y > 220) return { left: Math.min(Math.max(rect.x, GAP), Math.max(vw - BUBBLE_WIDTH - GAP, GAP)), bottom: vh - rect.y + GAP, centered: false };
    return { left: Math.min(Math.max(rect.x, GAP), Math.max(vw - BUBBLE_WIDTH - GAP, GAP)), top: rect.y + rect.height + GAP, centered: false };
  }
  if (placement === 'below') {
    if (rect.y + rect.height + 220 <= vh) {
      return { left: Math.min(Math.max(rect.x, GAP), Math.max(vw - BUBBLE_WIDTH - GAP, GAP)), top: rect.y + rect.height + GAP, centered: false };
    }
    return { left: Math.min(Math.max(rect.x, GAP), Math.max(vw - BUBBLE_WIDTH - GAP, GAP)), bottom: vh - rect.y + GAP, centered: false };
  }
  if (placement === 'left') {
    if (rect.x > BUBBLE_WIDTH + GAP * 2) {
      return { right: vw - rect.x + GAP, top: midY, centered: false };
    }
    return { left: rect.x + rect.width + GAP, top: midY, centered: false };
  }
  // 'right' or unset: prefer right, flip to left when there is no room.
  if (rect.x + rect.width + BUBBLE_WIDTH + GAP * 2 <= vw) {
    return { left: rect.x + rect.width + GAP, top: midY, centered: false };
  }
  return { right: vw - rect.x + GAP, top: midY, centered: false };
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

  // True bubble height for exact corner placement. The width is fixed by
  // CSS, so observing the bubble's own box also picks up content growth
  // (e.g. demo narration appearing mid-step) and re-parks the bubble.
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

  const parked = needsParking(step);
  const parkPos = useMemo(() => {
    if (!parked) return null;
    const avoid = [...layout.footprint, ...layout.named, ...layout.chrome];
    if (step.target === 'canvas' && layout.canvas) avoid.push(layout.canvas);
    const corner = chooseParkCorner(
      { width: layout.vw, height: layout.vh },
      { width: BUBBLE_DEFAULT_WIDTH, height: bubbleH },
      avoid,
      step.bubble.anchor,
    );
    return cornerPosition(corner, { width: layout.vw, height: layout.vh }, {
      width: BUBBLE_DEFAULT_WIDTH,
      height: bubbleH,
    });
  }, [parked, layout, bubbleH, step]);

  const rect = layout.target;
  const pos = parked
    ? { centered: false as const, left: parkPos?.left ?? GAP, top: parkPos?.top ?? GAP }
    : bubbleStyle(rect, step.bubble.placement);
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
