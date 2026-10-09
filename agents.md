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
- `engineSettings.ts` — Engine configuration
- `hosts.ts` — Host interfaces
- `undoManager.ts` — Undo/redo coordination
- `fontMetrics.ts` — Font measurement utilities
- `drawing/` — RectangleTool, QuadTool, CircleTool, PathTool, DrawingSession, PathDrawingSession, DrawingHost, PathRenderer, stampFrame
- `geometry/` — ShapeFactory, RectangleGeometry, booleanResolver, pathResolver, compositeExpansion, splineInterpolation
- `snapping/` — SnappingManager, GridRenderer, snappingMath
- `input/` — KeyboardController, keymap, InputManager, PointerController, KeySettingsRegistry, KeyboardLayoutResolver, ModifierStateTracker, KeySettingsViewModel
- `document/` — CoordinateManager, SceneIO, DropController, ViewportManager, DocumentManager, LayerManager, MeasurementUnits
- `scene/` — SelectionManager, CombinatoricsManager, DrawableRenderer, SceneRepository, exportFrames
- `image/` — Node-only Sharp codec (`sharpCodec.ts`). Do not import from the Vite browser graph (`App.tsx`, `engine.ts`, `DropController`, `exportFrames`). Browser raster export stays on DOM canvas.
- `model/` — NGPath, NGShape, NGGroup, NGText, NGImage, NGDrawable, NGExportFrame, serialization, geometryResolution
- `appearance/` — StyleManager, TextLayout, strokePosition, statusSchema, keymapSchema
- `history/` — HistoryManager, TransformManager

**UI modules** (in `src/ui/`):
- `GUIManager.ts` — GUI orchestration
- `PanelsManager.ts` — Panel layout management
- `KeyboardViewModel.ts` — On-screen keyboard state
- `fileCommands.ts` — File operations
- `inCanvasGui.ts` — In-canvas GUI
- `menuNavigation.ts`, `menuXML.ts`, `xmlParser.ts`, `windowXML.ts` — Menu/window XML system
- `WidgetLayout.ts`, `KeymapPresenter.ts`, `StatusPresenter.ts`, `PreviewBoxPresenter.ts` — Widget presenters
- `DocumentGallery.ts` — Document gallery

**Components** (in `src/components/`):
- `ControlPanel.tsx` — Main control panel
- `AppMenu.tsx` — Application menu
- `SettingsWindow.tsx` — Settings dialog
- `NewDocumentDialog.tsx`, `ExportFramePopover.tsx` — Dialogs
- `OnscreenKeyboard.tsx`, `KeymapWidget.tsx`, `KeySettingsPopover.tsx` — Keyboard UI
- `DocumentGallery.tsx`, `TutorialOverlay.tsx`, `DemoOverlay.tsx`, `StatusOverlay.tsx` — Overlays
- `WidgetHandle.tsx`, `CustomSelect.tsx`, `FontFamilySelect.tsx`, `NumericStepper.tsx` — Widgets
- `selectMenuPolicy.ts` — Menu policies

**Tutorial system** (in `src/tutorial/`):
- `TutorialRunner.ts`, `tutorialLoader.ts`, `tutorialSchema.ts`, `tutorialProgress.ts`
- `demonstrationPlayer.ts`, `completionDetectors.ts`, `TargetResolver.ts`

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
- **Engine core**: `src/engine/engine.ts`, `EngineContext.ts`, `types.ts`, `engineSettings.ts`
- **Drawing tools**: `src/engine/drawing/`
- **Geometry/math**: `src/engine/geometry/`, `src/engine/snapping/`
- **Input/keyboard**: `src/engine/input/`, `src/ui/KeyboardViewModel.ts`, `src/components/OnscreenKeyboard.tsx`
- **UI components**: `src/components/`, `src/ui/`
- **Document/viewport**: `src/engine/document/`
- **Selection/combinatorics**: `src/engine/scene/SelectionManager.ts`, `CombinatoricsManager.ts`
- **Text/typography**: `src/engine/appearance/TextLayout.ts`
- **Styling**: `src/engine/appearance/StyleManager.ts`, `strokePosition.ts`
- **Tutorial system**: `src/tutorial/`, `src/components/TutorialOverlay.tsx`
- **Parametric components**: Tasks under "PARAMETRIC ADAPTIVE SHAPES" in TASKS.txt
- **Repeat/pattern**: Tasks under "REPEAT" in TASKS.txt
- **Export/manufacture**: Tasks under "MANUFACTURE" in TASKS.txt

Cross-cutting: keyboard shortcuts (input ↔ UI), snap system (geometry ↔ drawing ↔ selection), live preview (drawing ↔ parametric ↔ UI), undo/history (engine ↔ all mutation), tutorial system (tutorial ↔ UI ↔ engine).