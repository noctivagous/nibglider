// PageRuler overlay: top + left rulers for the active DrawingPage,
// falling back to the DrawingBoard when no page is set (rulers are
// always visible). Two placements (a Document Settings option):
// viewer edges fixed to the canvas container, or the page frame
// traveling with the page (viewer rendering when there is no page).
// An optional guide layer projects the labeled majors to the canvas
// edges. Display-only overlay inside #canvasContainer; pointer events
// fall through. View tracking reuses the subscribeView channel;
// container size comes from a ResizeObserver.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { NibGliderEngine } from '../engine/engine';
import { computeRulerTicks, labeledMajors, pageFrameTracks, rulerSource } from '../engine/document/pageRuler';

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
  if (!state || !(container.width > 0)) return <div id="pageRuler" ref={wrapRef} aria-hidden="true" />;
  const page = engine.pageRect();
  const source = rulerSource(page, engine.getPageSettings().unit, state.board, engine.lengthUnit);
  const rect = source.rect;
  const unit = source.unit;
  const spacing = engine.gridSpacing;
  const placement = page && engine.rulerPlacement === 'page' ? 'page' : 'viewer';
  const pxPerPt = container.width / state.viewWidth;
  const viewLeft = state.centerX - state.viewWidth / 2;
  const viewTop = state.centerY - state.viewHeight / 2;
  /** Container px for a project coordinate. */
  const toContainer = (project: number, viewStart: number): number => (project - viewStart) * pxPerPt;

  const renderTicks = (
    horizontal: boolean,
    trackLenPx: number,
    toLocal: (project: number) => number,
    sizePt: number,
    rectStart: number,
    pad: number,
    labeled: Set<number>,
  ): ReactNode => {
    if (!(trackLenPx > 0)) return null;
    const showMinors = ((spacing / 4) * trackLenPx) / sizePt >= MINOR_MIN_PX;
    return (
      <>
        {computeRulerTicks(sizePt, spacing, unit).map((tick, i) => {
          if (!tick.major && !showMinors) return null;
          const pos = toLocal(rectStart + tick.offsetPt);
          if (pos < pad - 1 || pos > pad + trackLenPx + 1) return null;
          const showLabel = tick.major && tick.label != null && labeled.has(tick.offsetPt);
          if (tick.major && !showLabel) return null;
          return (
            <div
              key={i}
              className={tick.major ? 'pruler-tick major' : 'pruler-tick'}
              style={horizontal ? { left: `${pos}px` } : { top: `${pos}px` }}
            >
              {showLabel && (
                <span className="pruler-label">{tick.label}</span>
              )}
            </div>
          );
        })}
      </>
    );
  };

  const renderGuides = (labeledH: number[], labeledV: number[]): ReactNode => {
    if (!engine.rulerGuides) return null;
    return (
      <>
        {labeledH.map((offset) => {
          const pos = toContainer(rect.x + offset, viewLeft);
          if (pos < 0 || pos > container.width) return null;
          return <div key={`v${offset}`} className="pruler-guide-v" style={{ left: `${pos}px` }} />;
        })}
        {labeledV.map((offset) => {
          const pos = toContainer(rect.y + offset, viewTop);
          if (pos < 0 || pos > container.height) return null;
          return <div key={`h${offset}`} className="pruler-guide-h" style={{ top: `${pos}px` }} />;
        })}
      </>
    );
  };

  const labeledH = labeledMajors(rect.width, spacing, LABEL_MIN_PX, pxPerPt);
  const labeledV = labeledMajors(rect.height, spacing, LABEL_MIN_PX, pxPerPt);
  const labeledHSet = new Set(labeledH);
  const labeledVSet = new Set(labeledV);

  if (placement === 'page' && page) {
    const frame = pageFrameTracks(
      { centerX: state.centerX, centerY: state.centerY, viewWidth: state.viewWidth, viewHeight: state.viewHeight },
      page,
      container,
      RULER,
    );
    return (
      <div id="pageRuler" ref={wrapRef} aria-hidden="true">
        {renderGuides(labeledH, labeledV)}
        <div
          className="pruler-track-h frame"
          style={{ left: frame.top.left, top: frame.top.top, width: frame.top.width }}
        >
          {renderTicks(true, page.width * pxPerPt, (p) => (p - page.x) * pxPerPt, page.width, page.x, 0, labeledHSet)}
        </div>
        <div
          className="pruler-track-v frame"
          style={{ left: frame.left.left, top: frame.left.top, height: frame.left.height }}
        >
          {renderTicks(false, page.height * pxPerPt, (p) => (p - page.y) * pxPerPt, page.height, page.y, 0, labeledVSet)}
        </div>
        <div className="pruler-corner frame" style={{ left: frame.corner.left, top: frame.corner.top }}>{unit}</div>
      </div>
    );
  }

  const topLen = Math.max(0, container.width - RULER - SCROLLBAR);
  const leftLen = Math.max(0, container.height - RULER - SCROLLBAR);
  return (
    <div id="pageRuler" ref={wrapRef} aria-hidden="true">
      {renderGuides(labeledH, labeledV)}
      <div className="pruler-track-h">
        {renderTicks(true, topLen, (p) => RULER + (p - viewLeft) * pxPerPt, rect.width, rect.x, RULER, labeledHSet)}
      </div>
      <div className="pruler-track-v">
        {renderTicks(false, leftLen, (p) => RULER + (p - viewTop) * pxPerPt, rect.height, rect.y, RULER, labeledVSet)}
      </div>
      <div className="pruler-corner">{unit}</div>
    </div>
  );
}
