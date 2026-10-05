// PageRuler overlay: top + left rulers for the active DrawingPage.
// Two placements (a Document Settings option): viewer edges fixed to
// the canvas container, or the page frame traveling with the page.
// The ruler origin is the page corner and major ticks fall on
// board-grid lines, so ruler, page edges, and grid stay continuous.
// Display-only overlay inside #canvasContainer; pointer events fall
// through. View tracking reuses the subscribeView channel; container
// size comes from a ResizeObserver, never a render-time ref read.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import { computeRulerTicks, pageFrameTracks } from '../engine/document/pageRuler';

const RULER = 22;
const SCROLLBAR = 12;
const LABEL_MIN_PX = 64;
const MINOR_MIN_PX = 4;

function useWorkspace(engine: NibGliderEngine): void {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  useSyncExternalStore(engine.subscribeView, engine.getViewVersion);
}

function useContainer(ref: React.RefObject<HTMLDivElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const rect = el.getBoundingClientRect();
      setSize((prev) => (
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export default function PageRuler({ engine }: { engine: NibGliderEngine }) {
  useWorkspace(engine);
  const wrapRef = useRef<HTMLDivElement>(null);
  const container = useContainer(wrapRef);
  const state = engine.getViewState();
  const page = engine.pageRect();
  if (!state || !page) return null;
  const unit = engine.getPageSettings().unit;
  const spacing = engine.gridSpacing;
  const placement = engine.rulerPlacement;

  const renderTicks = (
    horizontal: boolean,
    trackLenPx: number,
    toLocal: (project: number) => number,
    sizePt: number,
    pageStart: number,
    pad: number,
  ): ReactNode => {
    if (!(trackLenPx > 0)) return null;
    const viewSize = horizontal ? state.viewWidth : state.viewHeight;
    const stride = Math.max(1, Math.ceil(LABEL_MIN_PX / Math.max(spacing * (trackLenPx / viewSize), 0.001)));
    const showMinors = ((spacing / 4) * trackLenPx) / sizePt >= MINOR_MIN_PX;
    let majorIndex = -1;
    return (
      <>
        {computeRulerTicks(sizePt, spacing, unit).map((tick, i) => {
          if (tick.major) majorIndex += 1;
          if (!tick.major && !showMinors) return null;
          if (tick.major && majorIndex % stride !== 0) return null;
          const pos = toLocal(pageStart + tick.offsetPt);
          if (pos < pad - 1 || pos > pad + trackLenPx + 1) return null;
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

  if (placement === 'page') {
    if (!(container.width > 0)) return <div id="pageRuler" ref={wrapRef} aria-hidden="true" />;
    const frame = pageFrameTracks(
      { centerX: state.centerX, centerY: state.centerY, viewWidth: state.viewWidth, viewHeight: state.viewHeight },
      page,
      container,
      RULER,
    );
    const pxPerPt = container.width / state.viewWidth;
    return (
      <div id="pageRuler" ref={wrapRef} aria-hidden="true">
        <div
          className="pruler-track-h frame"
          style={{ left: frame.top.left, top: frame.top.top, width: frame.top.width }}
        >
          {renderTicks(true, page.width * pxPerPt, (p) => (p - page.x) * pxPerPt, page.width, page.x, 0)}
        </div>
        <div
          className="pruler-track-v frame"
          style={{ left: frame.left.left, top: frame.left.top, height: frame.left.height }}
        >
          {renderTicks(false, page.height * pxPerPt, (p) => (p - page.y) * pxPerPt, page.height, page.y, 0)}
        </div>
        <div className="pruler-corner frame" style={{ left: frame.corner.left, top: frame.corner.top }}>{unit}</div>
      </div>
    );
  }

  const topLen = Math.max(0, container.width - RULER - SCROLLBAR);
  const leftLen = Math.max(0, container.height - RULER - SCROLLBAR);
  const viewLeft = state.centerX - state.viewWidth / 2;
  const viewTop = state.centerY - state.viewHeight / 2;
  const topPxPerPt = topLen > 0 ? topLen / state.viewWidth : 0;
  const leftPxPerPt = leftLen > 0 ? leftLen / state.viewHeight : 0;
  return (
    <div id="pageRuler" ref={wrapRef} aria-hidden="true">
      <div className="pruler-track-h">
        {renderTicks(true, topLen, (p) => RULER + (p - viewLeft) * topPxPerPt, page.width, page.x, RULER)}
      </div>
      <div className="pruler-track-v">
        {renderTicks(false, leftLen, (p) => RULER + (p - viewTop) * leftPxPerPt, page.height, page.y, RULER)}
      </div>
      <div className="pruler-corner">{unit}</div>
    </div>
  );
}
