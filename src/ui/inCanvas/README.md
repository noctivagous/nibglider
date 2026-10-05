# In-Canvas Element GUI definitions

Each In-Canvas Element (Export Frame, and later Repeat portals, Filter
covers, Crop frames) owns one XML file here that declares the controls
mounted into the canvas while the element is selected. Controls withdraw
on deselect. Parsed by `src/ui/inCanvasGui.ts` (`parseInCanvasXML`);
malformed files degrade to an error box, never a crash.

## Elements

- `<inCanvas (id, title)>` — root. Contains controls.
- `<field (key, label, type, min, max, step) />` — text or number input.
  Number fields accept `min`/`max`/`step`.
- `<select (key, label)>` with `<option (value, label)>` children.
- `<toggle (key, label) />`
- `<exportButton (label) />` — the element's primary action.
- `<popoverButton (label)>` — a button that opens a popover window
  containing more controls. Use it when an element has too many controls
  for the canvas; popovers cannot nest.

Labels fall back to the key when omitted. Unknown tags, attributes outside
this list, and text content are errors. See `exportFrame.xml` for the
reference example and `tests/export-frame.test.mjs` for the contract.
