# Trackpad gestures: what others do, what we do

Sources: mdview (`dde1143`), analog-canvas (#382), openfrontio (#4709),
rails-mermaid (#207), draw-architecture (#7), kanban (#280), plus the
ctrl+wheel pinch convention (Auchenberg) and page-zoom detection notes
(xjavascript.com — page zoom only, not gestures).

## Findings

1. **Safari/WebKit never sends ctrl+wheel for pinch.** It fires
   proprietary `gesturestart` / `gesturechange` / `gestureend` with a
   *cumulative* `scale` and no wheel event. Keying zoom off `ctrlKey`
   alone leaves Safari pinch doing page zoom. Per-event zoom is
   `scale / lastScale`, anchored at the pointer, with `preventDefault`
   on every gesture event.
2. **An engine sending both gesture and ctrl+wheel for one pinch zooms
   twice.** The wheel-zoom branch must stand down while a gesture is in
   flight.
3. **Scale continuously from each event's own delta.** A pinch arrives
   as a burst of small events; one fixed step per event hits the zoom
   clamp within a few events.
4. **Cap each event's contribution.** One mouse-wheel notch should zoom
   the same step as the zoom buttons (~1.2x), never ~2.7x spikes. Same
   idea for pan deltas.
5. **Normalize line/page-mode deltas to pixels**, or one wheel notch
   pans by a few pixels.
6. **Bound the pan.** A trackpad flick carries momentum; unbounded pan
   lands on an empty stage with nothing saying which way to scroll back.
   Rule: an axis the content does not fill stays centered; an overflowed
   axis keeps a margin of content on screen. Applies to drag, keys, and
   scroll alike.
7. **Session the gesture.** Lock interpretation per burst so a pan
   zigzag cannot flap into zoom mid-stream (our sticky window is the
   time-based version of this).

## Applied in NibGlider

- `gesturestart/change/end` listeners on the canvas drive
  `ViewportManager.zoomByFactor(scale / lastScale)` at the pointer;
  ctrl+wheel zoom/pinch stands down while a gesture is in flight.
- Every zoom step is capped per event (`MAX_ZOOM_STEP`); every pan
  delta is capped per axis (`MAX_PAN_STEP_PX`).
- Pan clamps to content (`PAN_EDGE_MARGIN` of artwork kept on screen;
  small axes stay centered; empty canvas pans free).
- Pinch uses `TRACKPAD_PINCH_GAIN`; all three constants are tunable in
  one place.
