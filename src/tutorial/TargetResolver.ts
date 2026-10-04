// Logical-to-DOM target resolution for tutorials.
// Pointable GUI elements carry a stable data-tutorial-id attribute; steps name
// the logical id and this module maps it to a screen rect for the overlay.
// Missing, hidden, or zero-area targets resolve to null so the bubble can
// fall back to a centered position instead of pointing at nothing.

export const TUTORIAL_TARGET_ATTR = 'data-tutorial-id';

export interface TutorialTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface QueryRoot {
  querySelector(selector: string): { getBoundingClientRect(): { x: number; y: number; width: number; height: number } } | null;
}

function defaultRoot(): QueryRoot | null {
  if (typeof document === 'undefined') return null;
  return document as unknown as QueryRoot;
}

function escapeId(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id);
  return id.replace(/["\\]/g, '\\$&');
}

/** Find the element carrying the given tutorial target id, or null. */
export function resolveTutorialTarget(
  id: string,
  root: QueryRoot | null = defaultRoot(),
): { getBoundingClientRect(): { x: number; y: number; width: number; height: number } } | null {
  if (!root || typeof id !== 'string' || id.length === 0) return null;
  try {
    return root.querySelector(`[${TUTORIAL_TARGET_ATTR}="${escapeId(id)}"]`);
  } catch {
    return null;
  }
}

/**
 * Screen rect of a tutorial target, or null when the target is absent,
 * hidden, or has no area. Callers re-query on scroll/resize (like the panel
 * rect reporting in App.tsx) so the bubble tracks layout changes.
 */
export function getTutorialTargetRect(
  id: string,
  root: QueryRoot | null = defaultRoot(),
): TutorialTargetRect | null {
  const el = resolveTutorialTarget(id, root);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) return null;
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
