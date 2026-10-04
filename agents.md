# AGENTS.md

This repository contains NibGlider, a key-click based vector editor built with React, TypeScript, and Vite. When working on this project with a coding agent, follow these guidelines.

## Project Overview

NibGlider replaces mouse clicks with keyboard key presses 
("key-clicks"). The mouse steers the cursor but buttons are unused for drawing
and editing (except as fallback for when the user uses them 
out of habit for selecting, dragging). 
Core tech: React 19, TypeScript, Vite, Paper.js for canvas, opentype.js for fonts.

## Development Environment

- **Always use `npm run dev`** for development with HMR enabled
- **Do not run `npm run build`** during agent sessions — it disables hot reload
- Restart dev server after adding dependencies: `npm install` then `npm run dev`
- Run `npm run lint` (oxlint) before committing
- Run `npm run test` to execute test suite (Node.js test runner)

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run lint` | Run oxlint checks |
| `npm run test` | Run test suite |
| `npm run build` | Production build — **avoid during agent sessions** |

## Coding Conventions

- Use TypeScript (`.ts`/`.tsx`) for all new code
- Follow existing patterns in `src/engine/` for engine code, `src/components/` for React components
- Co-locate component styles when practical
- Engine uses dependency injection via `EngineContext.ts`
- Drawing tools extend `DrawingSession.ts`
- Geometry math in `src/engine/geometry/`, snapping in `src/engine/snapping/`

## Architecture Notes

**Engine modules** (in `src/engine/`):
- `engine.ts` — Main entry point
- `EngineContext.ts` — DI container
- `types.ts` — Core types
- `drawing/` — All drawing tools and sessions
- `geometry/` — Path resolution, boolean ops, splines
- `snapping/` — Snap calculations and management
- `input/` — Keyboard controller, keymaps, modifiers
- `document/` — Document, layers, viewport, coordinates
- `scene/` — Selection, combinatorics, renderers
- `model/` — NGPath, NGShape, NGGroup, NGText, NGImage
- `appearance/` — Styles, text layout, stroke position
- `history/` — Undo/redo, transform manager

**UI modules** (in `src/ui/`, `src/components/`):
- `ControlPanel.tsx` — Main control panel
- `PanelsManager.ts` — Panel layout management
- `GUIManager.ts` — GUI orchestration
- `KeyboardViewModel.ts` — On-screen keyboard state

## Testing

- Tests in `tests/` directory using Node.js test runner
- Run `npm run test` to execute
- Add tests for new functionality

## Important Files

- `TASKS.txt` — Active task list with checkboxes
- `AGENTS.md` — This file
- `README.md` — Project overview

## Agent Coordination

When working on tasks, identify the relevant subsystem:
- **Engine core**: `src/engine/engine.ts`, `EngineContext.ts`, `types.ts`
- **Drawing tools**: `src/engine/drawing/`
- **Geometry/math**: `src/engine/geometry/`, `src/engine/snapping/`
- **Input/keyboard**: `src/engine/input/`, `src/ui/KeyboardViewModel.ts`
- **UI components**: `src/components/`, `src/ui/`
- **Document/viewport**: `src/engine/document/`
- **Selection/combinatorics**: `src/engine/scene/SelectionManager.ts`, `CombinatoricsManager.ts`
- **Text/typography**: `src/engine/appearance/TextLayout.ts`
- **Styling**: `src/engine/appearance/StyleManager.ts`, `strokePosition.ts`
- **Parametric components**: Tasks under "PARAMETRIC ADAPTIVE SHAPES" in TASKS.txt
- **Repeat/pattern**: Tasks under "REPEAT" in TASKS.txt
- **Export/manufacture**: Tasks under "MANUFACTURE" in TASKS.txt

Cross-cutting: keyboard shortcuts (input ↔ UI), snap system (geometry ↔ drawing ↔ selection), live preview (drawing ↔ parametric ↔ UI), undo/history (engine ↔ all mutation).