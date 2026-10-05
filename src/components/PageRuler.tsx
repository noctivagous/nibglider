// PageRuler overlay: top + left rulers for the active DrawingPage.
// The ruler origin is the page corner and major ticks fall on board-grid
// lines, so the ruler, the page edges, and the grid stay continuous.
// DOM overlay inside #canvasContainer (mounted by App next to the
// scrollbars); fully pointer-transparent. View tracking reuses the
// subscribeView channel, like CanvasScrollbars.
import { useEffect, useReducer, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import { computeRulerTicks } from '../engine/document/pageRuler';

const CORNER = 22;
const LABEL_MIN_PX = 64;
const MINOR_MIN_PX = 4;

function useWorkspace(engine: NibGliderEngine): void {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  useSyncExternalStore(engine.subscribeView, engine.getViewVersion);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', bump);
    return () => window.removeEventListener('resize', bump);
  }, []);
}

export default function PageRuler({ engine }: { engine: NibGliderEngine }) {
  useWorkspace(engine);
  const topRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const state = engine.getViewState();
  const page = engine.pageRect();
  if (!state || !page) return null;
  const unit = engine.getPageSettings().unit;
  const spacing = engine.gridSpacing;

  const renderAxis = (
    horizontal: boolean,
    track: RefObject<HTMLDivElement | null>,
    sizePt: number,
    pageStart: number,
    viewStart: number,
    viewSize: number,
  ): ReactNode => {
    const rect = track.current?.getBoundingClientRect();
    const trackLen = Math.max(0, (horizontal ? rect?.width : rect?.height) ?? 0);
    if (!(trackLen > 0) || !(viewSize > 0)) return null;
    const pxPerPt = trackLen / viewSize;
    const majorPx = spacing * pxPerPt;
    if (!(majorPx > 0)) return null;
    const stride = Math.max(1, Math.ceil(LABEL_MIN_PX / majorPx));
    const showMinors = (spacing / 4) * pxPerPt >= MINOR_MIN_PX;
    let majorIndex = -1;
    return (
      <>
        {computeRulerTicks(sizePt, spacing, unit).map((tick, i) => {
          if (tick.major) majorIndex += 1;
          if (!tick.major && !showMinors) return null;
          if (tick.major && majorIndex % stride !== 0) return null;
          const pos = CORNER + (pageStart + tick.offsetPt - viewStart) * pxPerPt;
          if (pos < CORNER - 1 || pos > CORNER + trackLen + 1) return null;
          return (
            <div
              key={i}
              className={tick.major ? 'pruler-tick major' : 'pruler-tick'}
              style={horizontal ? { left: `${pos}px` } : { top: `${pos}px` }}
            >
              {tick.major && tick.label != null && (
                <span className="pruler-label">{tick.label}</span>
              )}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div id="pageRuler" aria-hidden="true">
      <div ref={topRef} className="pruler-track-h">
        {renderAxis(true, topRef, page.width, page.x, state.centerX - state.viewWidth / 2, state.viewWidth)}
      </div>
      <div ref={leftRef} className="pruler-track-v">
        {renderAxis(false, leftRef, page.height, page.y, state.centerY - state.viewHeight / 2, state.viewHeight)}
      </div>
      <div className="pruler-corner">{unit}</div>
    </div>
  );
}
