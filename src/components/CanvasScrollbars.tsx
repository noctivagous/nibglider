// Custom canvas scrollbars: always-visible right + bottom bars that pan
// the Paper.js view over the DrawingBoard. Overlay inside
// #canvasContainer (mounted by App); pointer events on the bars never
// reach the canvas. Thumb geometry comes from scrollbarMath over the
// board/view union, so thumbs stay on-track in empty space too.
import { useRef, useSyncExternalStore } from 'react';
import type { NibGliderEngine, ViewState } from '../engine/engine';
import {
  computeScrollGeometry,
  scrollCenterForOffset,
  scrollCenterForPage,
} from '../engine/document/scrollbarMath';

function useViewState(engine: NibGliderEngine): ViewState | null {
  useSyncExternalStore(engine.subscribeView, engine.getViewVersion);
  return engine.getViewState();
}

function AxisBar({
  orientation,
  state,
  onScrollCenter,
}: {
  orientation: 'horizontal' | 'vertical';
  state: ViewState | null;
  onScrollCenter: (center: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startPx: number; startRatio: number } | null>(null);
  const horizontal = orientation === 'horizontal';

  const viewCenter = state ? (horizontal ? state.centerX : state.centerY) : 0;
  const viewMin = viewCenter - (state ? (horizontal ? state.viewWidth : state.viewHeight) : 1) / 2;
  const viewSize = state ? (horizontal ? state.viewWidth : state.viewHeight) : 1;
  const contentMin = state ? (horizontal ? state.board.x : state.board.y) : 0;
  const contentSize = state ? (horizontal ? state.board.width : state.board.height) : 1;
  const geo = computeScrollGeometry(viewMin, viewSize, contentMin, contentSize);
  // Thumb fill and travel fractions of the track (travel = 1 - fill).
  const fill = geo.sizeRatio;
  const start = geo.offsetRatio * (1 - fill);

  const ratioAt = (clientX: number, clientY: number): number | null => {
    const track = trackRef.current;
    if (!track || !(1 - fill > 0)) return null;
    const rect = track.getBoundingClientRect();
    const length = horizontal ? rect.width : rect.height;
    if (!(length > 0)) return null;
    const pos = (horizontal ? clientX - rect.left : clientY - rect.top) / length;
    return (pos - fill / 2) / (1 - fill);
  };

  return (
    <div
      ref={trackRef}
      className={horizontal ? 'csb-track-h' : 'csb-track-v'}
      role="scrollbar"
      aria-orientation={orientation}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(geo.offsetRatio * 100)}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).dataset.thumb === '1') return;
        const ratio = ratioAt(event.clientX, event.clientY);
        if (ratio == null || !state) return;
        // Track click pages toward the click; a click on the thumb itself
        // never reaches here (it stops propagation below).
        const direction = ratio < geo.offsetRatio - 0.001 ? -1 : ratio > geo.offsetRatio + 0.001 ? 1 : 0;
        if (direction !== 0) {
          onScrollCenter(scrollCenterForPage(viewCenter, viewSize, direction, geo.rangeMin, geo.rangeSize));
        }
      }}
    >
      <div
        data-thumb="1"
        className="csb-thumb"
        style={horizontal
          ? { width: `${fill * 100}%`, left: `${start * 100}%` }
          : { height: `${fill * 100}%`, top: `${start * 100}%` }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          drag.current = { startPx: horizontal ? event.clientX : event.clientY, startRatio: geo.offsetRatio };
        }}
        onPointerMove={(event) => {
          const held = drag.current;
          const track = trackRef.current;
          if (!held || !track || !(1 - fill > 0)) return;
          const rect = track.getBoundingClientRect();
          const length = horizontal ? rect.width : rect.height;
          if (!(length > 0)) return;
          const delta = ((horizontal ? event.clientX : event.clientY) - held.startPx) / length / (1 - fill);
          onScrollCenter(scrollCenterForOffset(held.startRatio + delta, viewSize, geo.rangeMin, geo.rangeSize));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      />
    </div>
  );
}

export default function CanvasScrollbars({ engine }: { engine: NibGliderEngine }) {
  const state = useViewState(engine);
  const scrollX = (center: number): void => {
    const current = engine.getViewState();
    if (current) engine.scrollViewTo(center, current.centerY);
  };
  const scrollY = (center: number): void => {
    const current = engine.getViewState();
    if (current) engine.scrollViewTo(current.centerX, center);
  };
  return (
    <div id="canvasScrollbars">
      <AxisBar orientation="horizontal" state={state} onScrollCenter={scrollX} />
      <AxisBar orientation="vertical" state={state} onScrollCenter={scrollY} />
      <div className="csb-corner" />
    </div>
  );
}
