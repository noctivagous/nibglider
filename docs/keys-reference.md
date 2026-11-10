# NibGlider Keys Reference

Generated from `KEY_COMMANDS` in `src/engine/input/keymap.ts` — the same table the engine dispatches from. Do not edit the tables by hand; regenerate after changing the keymap. `tests/keys-reference.test.mjs` fails if a command in the keymap is missing here.

The mouse steers the cursor. Keys do the clicking: a key press places a point, starts or finishes a shape, or runs the named operation on the current selection. Modifier chords change some keys' meaning while drawing (for example Shift makes scale and rotate steps larger, Alt/Opt makes them smaller); the status box always shows what the keys will do next.

## Everyday keys

| Key | Command | What it does |
| --- | --- | --- |
| 0 | `reset-zoom` | Reset zoom |
| − | `step-zoom` | Step zoom |
| Z | `undo` | Undo |
| Z | `redo` | Redo |
| X | `cut` | Cut the selection |
| C | `copy` | Copy the selection |
| V | `paste` | Paste from the clipboard |
| A | `select-all` | Select all artwork |
| G | `group` | Group or ungroup the selection |
| Arrow | `nudge` | Nudge the selection |
| 0 | `radial-lock` | Lock or unlock the radial-stamp radius |
| Space | `drag-lock` | Toggle drag-lock |
| Z | `pan-lock` | Pan-lock the canvas |
| T | `transform-mode` | Toggle transform controls |
| Backspace | `delete-selection` | Delete the selection |
| F | `sharp-point` | Sharp path point |
| G | `spline-point` | Spline path point |
| H | `rounded-point` | Rounded composite path corner |
| P | `type-text` | Type text at cursor |
| J | `tension-down` | Decrease spline tension |
| K | `tension-up` | Increase spline tension |
| / | `tension-reset` | Reset spline tension |
| / | `grid-toggle` | Toggle the grid |
| C | `stroke-thinner` | Thinner stroke |
| V | `stroke-thicker` | Thicker stroke |
| E | `finish-e` | End the drawing |
| S | `toggle-stroke` | Toggle stroke |
| D | `toggle-fill` | Toggle fill |
| Tab | `select` | Select the item under the cursor |
| X | `select-rectangle` | Selection rectangle |
| J | `toggle-panel` | Toggle the control panel |
| K | `toggle-keyboard` | Toggle the on-screen keyboard |
| L | `toggle-status` | Toggle the status overlay |

## Rect Keys

| Key | Command | What it does |
| --- | --- | --- |
| Y | `rect-centerline` | Rectangle by centerline |
| I | `rect-diagonal` | Rectangle by diagonal |
| U | `rect-two-edges` | Rectangle by two edges |

## Circle Keys

| Key | Command | What it does |
| --- | --- | --- |
| M | `circle-diameter` | Circle by diameter |
| N | `circle-radius` | Circle by radius |
| , | `radial-stamp` | Radial stamp |

## Quad Keys

| Key | Command | What it does |
| --- | --- | --- |
| O | `quad` | Four-point quad |

## Operations on a selection

| Key | Command | What it does |
| --- | --- | --- |
| [ | `scale-down` | Scale down |
| ] | `scale-up` | Scale up |
| ; | `rotate-ccw` | Rotate counter-clockwise |
| ' | `rotate-cw` | Rotate clockwise |
| S | `transform-scale` | Live scale from the cursor |
| R | `transform-rotate` | Live rotation from the cursor |
| H | `transform-shear-h` | Live horizontal shear from the cursor |
| V | `transform-shear-v` | Live vertical shear from the cursor |
| W | `stamp` | Stamp the preview or the selection |

## Ending a drawing

| Key | Command | What it does |
| --- | --- | --- |
| Escape | `clear-selection` | Clear the selection and drag-lock |
| R | `finish-r` | Complete the shape |
| S | `finish-s` | End the drawing |
| A | `finish-a` | End the drawing |
| Q | `cancel` | Cancel the current drawing |
| Escape | `cancel-escape` | Cancel the current drawing |

## Adjust actions

While a selection or a live drawing is active, these paired keys adjust it:

- **Scale** — commands: `scale-down`, `scale-up`
- **Rotate** — commands: `rotate-ccw`, `rotate-cw`
- **Adjust tension** — commands: `tension-down`, `tension-up`, `tension-reset`

## App shortcuts (menu commands)

| Shortcut | Command |
| --- | --- |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z | Redo |
| Cmd/Ctrl+X / C / V | Cut / Copy / Paste |
| Cmd/Ctrl+A | Select all |
| Cmd/Ctrl+G | Group selection |
| Cmd/Ctrl+Shift+G | Ungroup selection |
| Cmd/Ctrl+− / = / 0 | Zoom out / in / 100% |
| Backspace | Delete selection |
| Esc | Cancel the current drawing or dialog |
| Arrow keys | Nudge the selection (Shift: larger step, Alt/Opt: smaller step) |
