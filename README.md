# NibGlider

A key-click based vector editor.

## What it is

NibGlider is a vector-drawing program in which mouse clicks are
replaced by keyboard key presses — "key-clicks". The mouse
continues to steer the cursor, but its buttons are left unused for
drawing and editing (they still work as a fallback for selecting
and dragging, for when you reach for them out of habit).

That sounds like a small change. It isn't. When key-clicks are
implemented comprehensively — the whole of a vector-drawing
program's interactions and tools redesigned around them — drawing
becomes faster and more precise than clicking: every placement is
a deliberate key press at the exact steered point, both hands stay
where they are, and the program can show you, at all times, exactly
which keys are available and what each one will do next (the status
box and the available-keys box at the side of the canvas).

## What you can draw with it

- **Key tools:** Rectangle (by diagonal, by two edges, by
  centerline), Circle (by diameter, by radius, radial stamp),
  Quadrilateral by four points, and Paths — straight, B-spline,
  and composite paths with sharp and rounded corners.
- **Parametric shapes:** the rectangle and circle frames draw
  circles, regular polygons, supershapes, trapezoids,
  parallelograms, right triangles, rhombi and kites, all with
  live preview and adjustable parameters.
- **Paint:** solid, linear-gradient and radial-gradient fills;
  stroke width, cap, join, miter, dash and stroke position.
- **Operations:** union, subtract, intersect, crop and interlace
  combinatorics; grouping; repeat; whole-object transforms with
  handles, dialogs and keys.
- **Text:** display text and body text, including text on a path.
- **Snapping:** to grid, paths, points (including shape origins
  and path intersections), angles, lengths and aspect ratios.
- **Documents and files:** multiple documents in the built-in
  gallery with autosave; export frames for repeatable exports;
  PNG/JPG and SVG/PDF export; SVG, PDF and image import;
  Printify garment export.

## Run it

```sh
npm install
npm run dev
```

Then open the address Vite prints (by default
<http://localhost:5173>). On first run the guided tutorial starts
by itself: it demonstrates rectangle drawing live, then hands the
keys to you. Further tutorials — fixing a shape, fill and stroke,
text, grouping and ordering, saving and exporting — are under the
**Help** menu.

Other commands:

| Command         | Purpose                               |
| --------------- | ------------------------------------- |
| `npm run dev`   | Start the dev server with HMR         |
| `npm test`      | Run the test suite                    |
| `npm run lint`  | Run oxlint                            |
| `npm run build` | Production build (typecheck + bundle) |

## Learn it

- [Getting started](docs/getting-started.md) — the first ten
  minutes: steering, key-clicks, the status box, drawing,
  selecting, fixing mistakes, saving.
- [Keys reference](docs/keys-reference.md) — every drawing key,
  generated from the engine's own keymap.
- [Introduction](docs/introduction.txt) — the key-click idea in
  the author's words.
- [Drawing tools](docs/drawing-tools.txt) — the key tools at a
  glance.
- [Roadmap](docs/ROADMAP.md) — where the program is going and
  what "usable" means for it.

## How it is built

React 19 + TypeScript + Vite, with [Paper.js](http://paperjs.org)
as the canvas/geometry substrate and opentype.js for font
metrics. The document's authoritative form is a model of drawable
records (`src/engine/model/`); Paper items are derived from it.
Engine code lives in `src/engine/`, React components in
`src/components/`, tutorials as JSON in `tutorials/`, and the
test suite (Node's test runner) in `tests/`. See `agents.md` for
the contributor's map of the codebase.
