# EngineContext

`EngineContext` is the bag of long-lived objects created with the engine: the Paper.js scope, the scene services, and the React subscription. `NibGliderEngine` still owns the settings and the live drawing session, and it reads the services from that bag.

The class is `src/engine/EngineContext.ts`. The facade holds it as `readonly context` and reaches each service through a private getter (`this.context.scene`, and so on). React still talks to `NibGliderEngine`.

## What it holds

- The `PaperScope`, the Paper.js project attached to the canvas.
- One instance of each service the constructor builds: document, viewport, scene, history, selection, transforms, grid, snapping, style, text, shapes, combinatorics, drops, and the four drawing tools (`PathTool`, `CircleTool`, `RectangleTool`, `QuadTool`).
- The React subscription. `subscribe` registers a listener, `notify` bumps a version counter and calls those listeners, and `getVersion` returns that counter. The engine's own `subscribe`, `getVersion`, and `notify` forward to this object, including when the document changes.

The facade assigns each service once during construction. The context does not construct them.

## What it does not hold

It does not store stroke, fill, text, Circle Keys, Rect Keys, grid and snap flags, or the in-progress path. Those stay on `NibGliderEngine`. `StyleManager` mutates the engine's paint object directly. The context only keeps the service that applies that paint.

## How a change reaches React

A call such as `setStrokeWidth` updates the paint on the engine, then calls `notify()` on the context. That bumps the version and runs the listeners, which is what makes the panel re-render.
