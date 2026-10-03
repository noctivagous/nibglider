# Engine smoke checklist

Short manual pass for drawing, selection, keyboard shortcuts, snapping,
text, combinatorics, import, and undo/redo. Run it after each engine
extraction. The app is the Vite dev server (usually http://localhost:5173/).
Click the canvas once so keyboard events leave the panel fields.

A step passes when the canvas, status overlay, and History readout match
the expected result, and Undo then Redo restores both directions.

## Drawing

- [ ] M draws a circle by radius. A second M deposits it. Status reads
      Circle by (radius) while the preview is live.
- [ ] N draws a circle by diameter and deposits the same way.
- [ ] Comma starts Radial Stamp. Another comma stamps a copy and stays in
      the session. A deposits the live shape and ends the session. 0 locks
      and unlocks the placement radius.
- [ ] Y, U, and I draw rect by centerline, two edges, and diagonal.
      [ and ] change centerline width while that preview is live.
- [ ] O places a quad, one point per press, and A ends it.
- [ ] F starts a polyline. More F clicks add sharp points. G adds a spline
      point. R completes the shape. A ends the path.
- [ ] While a path is live, J and K change spline tension and / resets it.
      Status shows the tension. The panel, keyboard, and status overlays
      do not toggle.
- [ ] Q cancels a live circle, rect, quad, or path and leaves no new item.
- [ ] W stamps the live preview without ending the session. With a
      selection and no live drawing, W stamps the selection.

## Composite path (Phase 4b)

Open the F or G key popover and select Composite path. Return to Current path
after this pass to verify the legacy drawing checks above.

- [ ] F places sharp points, G places B-spline points, and H places rounded
      corners. The preview and key legends reflect the selected mode.
- [ ] Change the rounded-corner radius in the key popover during a live path.
      Existing rounded corners update; radius zero produces sharp corners.
      A mode change during drawing leaves the current mode intact.
- [ ] Move and drag the cursor with grid, point, path, angle, and length
      snapping enabled one at a time. The trailing point follows the constraint
      from the last semantic point. Transformed deposited paths still snap.
- [ ] [ ] scale and ; ' rotate the live path. A deposits it; R closes it.
      Joining near the starting point closes without a duplicate seam.
- [ ] W stamps independently and keeps the session live. Each stamp and final
      deposit has one undo step; Undo/Redo restores geometry and selection.
- [ ] Q/Escape cancels without depositing. Reload during a live preview and
      confirm cleanup produces no listener or animation-frame errors.
- [ ] Zoom while drawing a long spline. The preview remains smooth, the
      trailing point responds, and preview segments cannot be selected.
- [ ] Join an open composite path to a plain path endpoint; undo restores the
      original path. Union/Subtract/Intersect deposits restore operands on undo.
- [ ] Deposit with Display and Body text enabled. Text follows the preview
      and final geometry, and Undo/Redo restores the complete result.
- [ ] Cancel or finish, switch back to Current path, and confirm legacy F/G
      drawing and J/K tension commands still work.

## Selection and keyboard shortcuts

- [ ] Dragging empty canvas pans. The wheel zooms toward the cursor.
      Ctrl/Cmd+0 resets zoom. Ctrl/Cmd+- and Ctrl/Cmd+= step zoom.
- [ ] Click or Tab selects an item. Drag moves it. Escape clears the
      selection. Backspace deletes it.
- [ ] Space toggles drag-lock. Moving the mouse moves every selected item.
      Space releases the lock, as do Cancel (Q) and End (A).
- [ ] Arrow keys nudge the selection. Shift nudges farther. Alt nudges
      less. Undo restores the original place.
- [ ] [ ] scale a selection. ; ' rotate it. Shift and Alt change the step.
- [ ] Ctrl/Cmd+G groups two or more items. Ctrl/Cmd+Shift+G ungroups.
- [ ] J, K, and L toggle the panel, the on-screen keyboard, and the status
      overlay when no path is being drawn. Typing those letters in a panel
      field does not toggle anything.
- [ ] The on-screen L keycap toggles the status overlay. Other on-screen
      keycaps do not fire commands. The keycap under the physical key
      highlights while the key is down.

## Snapping, text, combinatorics, import, undo

- [ ] Grid section: enable the grid, switch Square and Diamond, and confirm
      L still toggles it when idle. Grid dots are not selectable and do
      not print as artwork.
- [ ] Snapping: turn on grid, path, point, angle, and length one at a time
      and draw a circle. The preview lands on that constraint. Aspect 3:4
      constrains a rect-key drag. The status line names the aspect pair.
- [ ] Text mode on, Display: a deposited circle carries text around the
      boundary. Switch to Body and deposit again. The text sits inside.
      Changing the Text panel updates the next shape.
- [ ] Select two overlapping shapes. Combinatorics Union, Subtract, and
      Intersect each produce one result. Undo restores both inputs.
- [ ] Drop an SVG and a raster onto the canvas. Each appears, can be
      selected, and has an undo step. A failed drop surfaces a note in
      the status overlay.
- [ ] History: Undo and Redo labels match the last command. Move, group,
      duplicate, delete, reorder, and a panel Scale or Rotate dialog each
      undo and redo once. A drag is one undo step, not one step per move
      event.

## Cleanup

- [ ] Phase 5: drag a selected item through several moves and release. History
      shows one Move entry; Undo restores the start and Redo the final place.
- [ ] Phase 5: use arrow nudges, [ ] scale, and ; ' rotate on a selection.
      Each completed action undoes and redoes correctly; repeated nudges
      coalesce into one Move entry.
- [ ] Phase 5: group, ungroup, duplicate, delete, send back, and bring front.
      Undo/Redo restores both selection and stacking order, including a
      composite path inside a duplicated group.
- [ ] Phase 6: turn on Square and Diamond grids at several zoom levels. Grid
      dots follow the visible canvas, remain unselectable, and the red cursor
      only appears when grid snapping is enabled.
- [ ] Phase 6: enable angle, length, path, point, and aspect snapping in
      turn. Draw and move near a curve, endpoint, midpoint, and centroid;
      indicator color and final point match the active constraint. Previews,
      cursors, and grid dots never become snapping targets.
- [ ] Phase 4d: pan empty canvas, zoom at the cursor with wheel, step zoom
      with Ctrl/Cmd+- and Ctrl/Cmd+=, then reset with Ctrl/Cmd+0. Shapes and
      snap targets stay aligned; selection and History do not change.
- [ ] Phase 4d: switch snapping length display between points, inches, and
      centimeters. Enter an equivalent length in each unit and verify the
      same canvas constraint. Reload and check the selected display unit.

- [ ] Reload the page. The canvas attaches, drawing still works, and
      leaving the page (or a dev-server reload) does not throw from a
      detached listener.
