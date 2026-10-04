// Live-demonstration pointer layer: ghost cursor + arrow callout.
// Fully click-through (pointer-events: none); the tutorial bubble keeps
// all interaction. The ghost cursor shows where the program is steering;
// the arrow callout names the parameter or control being demonstrated.
// Target rects resolve through the same TargetResolver as TutorialOverlay
// and track scroll/resize the same way.

import { useEffect, useState } from 'react';
import { getTutorialTargetRect, type TutorialTargetRect } from '../tutorial/TargetResolver';

export interface DemoCursor {
  x: number;
  y: number;
}

export interface DemoPointAt {
  target: string;
  label?: string;
}

const LABEL_GAP = 10;

function labelPos(rect: TutorialTargetRect): { left: number; top: number } {
  const left = Math.min(Math.max(rect.x, LABEL_GAP), Math.max(window.innerWidth - 250, LABEL_GAP));
  const below = rect.y + rect.height + LABEL_GAP;
  const top = below + 28 <= window.innerHeight ? below : Math.max(LABEL_GAP, rect.y - 34);
  return { left, top };
}

export default function DemoOverlay({
  cursor,
  pointAt,
}: {
  cursor: DemoCursor | null;
  pointAt: DemoPointAt | null;
}) {
  // Remounted per target (keyed by the caller), so the initial measure is
  // always fresh and this effect only tracks later layout shifts.
  const targetId = pointAt?.target ?? null;
  const [rect, setRect] = useState<TutorialTargetRect | null>(() =>
    targetId ? getTutorialTargetRect(targetId) : null,
  );

  useEffect(() => {
    if (!targetId) return;
    const update = () => setRect(getTutorialTargetRect(targetId));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (observer && typeof document !== 'undefined' && document.body) observer.observe(document.body);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
    };
  }, [targetId]);

  if (!cursor && !rect) return null;
  const label = pointAt?.label ?? null;
  const anchor = rect
    ? {
        x: Math.min(Math.max(cursor?.x ?? rect.x + rect.width / 2, rect.x), rect.x + rect.width),
        y: Math.min(Math.max(cursor?.y ?? rect.y + rect.height / 2, rect.y), rect.y + rect.height),
      }
    : null;
  const labelStyle = rect ? labelPos(rect) : null;

  return (
    <div className="demo-overlay" aria-hidden="true">
      {rect && (
        <div
          className="demo-spotlight"
          style={{ left: rect.x - 4, top: rect.y - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      {cursor && anchor && (
        <svg className="demo-arrow-layer" aria-hidden="true">
          <defs>
            <marker id="demo-arrow-head" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="demo-arrow-head" />
            </marker>
          </defs>
          <line
            x1={cursor.x}
            y1={cursor.y}
            x2={anchor.x}
            y2={anchor.y}
            className="demo-arrow-line"
            markerEnd="url(#demo-arrow-head)"
          />
        </svg>
      )}
      {rect && label && labelStyle && (
        <div className="demo-arrow-label" style={{ left: labelStyle.left, top: labelStyle.top }}>
          {label}
        </div>
      )}
      {cursor && (
        <div className="demo-ghost" style={{ left: cursor.x, top: cursor.y }}>
          <span className="demo-ghost-ring" />
          <span className="demo-ghost-dot" />
        </div>
      )}
    </div>
  );
}
