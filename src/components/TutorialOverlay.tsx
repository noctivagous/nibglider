// Tutorial spotlight + bubble overlay.
// Points at a data-tutorial-id target (tracked across scroll/resize) and
// falls back to a centered bubble when the target is missing or hidden.
// Plain system styling: no gradients, glows, or icon decoration.

import { useEffect, useState } from 'react';
import { getTutorialTargetRect, type TutorialTargetRect } from '../tutorial/TargetResolver';
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
  const [rect, setRect] = useState<TutorialTargetRect | null>(() =>
    step.target ? getTutorialTargetRect(step.target) : null,
  );

  useEffect(() => {
    if (!step.target) return;
    const target = step.target;
    const update = () => setRect(getTutorialTargetRect(target));
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

  const pos = bubbleStyle(rect, step.bubble.placement);
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
