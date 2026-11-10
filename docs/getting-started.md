# Getting Started with NibGlider

Ten minutes from launch to a saved drawing. If you get lost at
any point, the **status box** (bottom of the screen) tells you
what is happening and what you can do next, and the
**available-keys box** lists the keys that will work right now.

## 1. Steer with the mouse, click with keys

There is one idea to learn, and everything else follows from it:

> The mouse only *steers* the cursor. A key press is a click.

To place a point, steer the cursor there and press the key. To
finish a shape, steer to the last point and press the key again
(or the key the status box names). You never hold a mouse button
down to draw — there is no dragging a shape out. Two key presses,
two exact points, done.

Mouse buttons are not dead: clicking selects objects and dragging
moves them, because your hands will do that anyway. But drawing
and editing are designed for keys, and keys are faster.

## 2. Draw your first rectangle

1. Press **I** — this starts *Rect by Diagonal*. The status box
   now says a rectangle is being drawn.
2. Steer to where the opposite corner should be. A live preview
   follows the cursor; snapping will offer you grid points, path
   points and exact angles as you pass them.
3. Press **I** again. The rectangle is deposited.

Try **U** next: *Rect by Two Edges* takes two steered edges
instead of a diagonal. **Esc** cancels any drawing in progress.

Before you press the first key, the shape the frame will draw is
chosen in the **Rect Keys** panel section — rectangle by default,
but the same two key presses can draw a circle, a polygon, a
supershape and more. The **Circle Keys** section works the same
way from a diameter or a radius.

## 3. Fill, stroke, and colour

The **Stroke** and **Fill** panel sections hold the current
paint. Change them *before* drawing to set what new shapes get,
or select a shape first and change them to repaint it: stroke
on/off, colour and width; dash pattern, cap and join; fill
solid, linear gradient or radial gradient. The preview box at
the top of the panel always shows the paint you are about to use.

## 4. Select, move, transform

- Click an object (or steer over it and use the selection keys)
  to select it. **Shift-click** adds to the selection.
- Arrow keys nudge the selection; Shift makes the step bigger,
  Alt/Opt smaller.
- **Alt+T** (shown in the keys table when a selection exists)
  shows transform controls: eight scale handles and a rotate
  handle.
- The Operations dialogs give exact **Scale…** and **Rotate…**
  by number.
- **Undo** is Cmd/Ctrl+Z, **Redo** Cmd/Ctrl+Shift+Z. Everything
  you deposit or change is one undo step.

## 5. Fixing mistakes

Undo is the blunt tool; the precise one is point editing. Select
a path and enter point-edit mode to move its anchors and curve
handles, add or delete points, and convert corners to smooth
points and back. The **Fix a Shape** tutorial (Help menu) walks
through it. Whole shapes can always be deleted with Backspace
and redrawn — but once you can edit points, you will redraw far
less.

## 6. Text

Choose *Display Text* or *Body Text* in the **Text** panel
section, steer to the baseline, and type. Display text is one
styled line; body text flows in a frame. Text can also be set on
a path. Font family, size, weight and justification live in the
same section.

## 7. Organise: groups and layers

- Select several objects and press **Cmd/Ctrl+G** to group them;
  **Cmd/Ctrl+Shift+G** ungroups.
- Bring to Front / Send to Back (and the one-step Bring Forward /
  Send Backward) set the stacking order.
- The **Layers & Objects** panel section lists every layer and
  the objects in it: rename them, hide them, lock them, set
  their opacity, and click a row to select an object that is
  hard to click on the canvas.

## 8. Save, open, export

- Work autosaves to the built-in **gallery** (File → Open
  Document). The gallery lives in your browser, per device.
- **File → Save to File** downloads a NibGlider document file
  you can keep, back up, send to someone, and reopen with
  **File → Open File** (or by dropping the file on the canvas).
- **File → Export** produces PNG/JPG (raster) or SVG/PDF
  (vector) of the whole document frame, the current viewport, or
  just the selection. **Export Frames** — placeable frames on
  the canvas — give you repeatable exports at exact sizes.

## 9. Where to go next

- The rest of the tutorials, under **Help**: Fill & Stroke,
  Text, Grouping & Ordering, Saving & Exporting.
- The [keys reference](keys-reference.md) — every key, from the
  engine's own keymap.
- Open the on-screen keyboard's key settings (click a keycap) to
  see what each key is set to do, and change it.
