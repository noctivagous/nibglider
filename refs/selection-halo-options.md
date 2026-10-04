# Selection halo options

Selected objects need an additional appearance that reads on any background.
Floating Marker precedent: a soft blue glow shadow around the selected
drawable's own edges (green while the selection is being dragged), plus a
white stroke for images and a blue stroke for groups.

## Candidates

1. **Two-tone halo (dark under-glow + light outline).** One tone always
   contrasts, so it is backdrop-proof. Static and cheap; matches the
   preview-frame convention (light overlay + dark drop shadow so it reads
   on any canvas background). No motion, no timer.
2. **Marching ants.** Animated dashed outline; motion catches the eye on
   any background. Needs an animation loop while anything is selected and
   can feel noisy over a long session.
3. **Glow plus thin dark keyline.** FM-style glow for presence on dark or
   busy art, hairline dark edge to save it on white. Slightly heavier look
   than a plain halo.
4. **Bounding-box frame with corner handles.** CAD-style, cheap, precise
   about membership, but a rectangle says less than the shape's own outline
   and sinks inside dense artwork.
5. **Pulsing glow.** Strongest "look here" signal, but permanent animation
   costs frames and distracts. Better as a transient: a brief settle pulse
   on selection change, decaying to a static halo.
6. **Tinted wash.** Translucent fill over the selected area. Reads on
   filled shapes, weak on stroke-only paths, and muddies actual colors
   while active.
7. **XOR/difference outline.** Theoretically perfect contrast everywhere,
   but per-item compositing is fiddly in Paper.js and the resulting colors
   can read as broken rather than intentional.

## Decision

Two-tone halo as the steady state (white Paper selection outline over a
dark blurred item glow; both follow the item through transforms for free),
plus a short settle pulse on discrete selection commits: the glow fires hot
(wider blur) and settles to steady after ~300ms. Continuous updates (Z
marquee live-select, Esc restore) stay quiet so dragging never shimmers.
Reduced-motion users get the steady halo with no pulse.
