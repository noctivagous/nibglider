# In-Canvas Element GUI definitions

Each In-Canvas Element (Export Frame, and later Repeat portals, Filter
covers, Crop frames) owns one XML file here that declares the controls
mounted into the canvas while the element is selected. Controls withdraw
on deselect. Parsed by `src/ui/inCanvasGui.ts` (`parseInCanvasXML`);
malformed files degrade to an error box, never a crash.

## Elements

- `<inCanvas (id, title)>` — root. Contains `<edge>` sections (and,
  for legacy files, bare controls, which form an implied top section).
- `<edge (side, label)>` — one preferred exterior edge of the element's
  frame: `top` | `right` | `bottom` | `left`. Groups the controls that
  belong on that edge; label falls back to "Top edge" etc. Sections cannot
  nest, and `<edge>` cannot appear inside a popover.
- `<field (key, label, type, min, max, step) />` — text or number input.
  Number fields accept `min`/`max`/`step`.
- `<select (key, label)>` with `<option (value, label)>` children.
- `<toggle (key, label) />`
- `<exportButton (label) />` — the element's primary action.
- `<popoverButton (label)>` — a button that opens a popover window
  containing more controls. Use it when an element has too many controls
  for the canvas; popovers cannot nest. Author it trailing its section so
  it overflows first.

When an edge cannot fit its section, trailing controls move to the widget
strip above the canvas (underneath the status box), which mirrors the same
sections with their labels. XML order is priority order: earlier controls
keep the edge. See `exportFrame.xml` for the reference example and
`tests/export-frame.test.mjs` for the contract.
