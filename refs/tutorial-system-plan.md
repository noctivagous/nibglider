# Tutorial System — Architecture Plan

## Goal

Build a reusable tutorial system for NibGlider: point at GUI elements with a
bubble, script steps in a declarative schema language (Maestro-like, but for
teaching instead of UI tests), and detect whether the user completed each
action — reusable later for on-demand topic tutorials.

## Success Criteria

- Architecture names the schema, runner, target-resolution,
  completion-detection, and overlay surfaces with owning files.
- Reuses existing seams: `src/App.tsx`, `src/engine/EngineContext.ts`,
  `src/ui/GUIManager.ts`, `src/ui/PanelsManager.ts`,
  `src/engine/history/HistoryManager.ts`, `src/engine/scene/SelectionManager.ts`
  / `SceneRepository.ts`.
- No new dependencies; validation uses existing `npm run test` + `npm run lint`.
- First slice is executable without committing to full tutorial content.

## Approach

Keep tutorial logic UI-agnostic and engine-observant. Tutorials are
declarative data in `tutorials/`; a small runner interprets them; a target
resolver maps logical ids to DOM nodes; completion detectors subscribe to
existing engine notifications rather than intercepting input. Overlay is a
React portal (spotlight + bubble) mounted from `src/App.tsx`, parallel to
`src/components/StatusOverlay.tsx`.

Assumption: JSON-compatible step schema with TypeScript types and a
hand-written validator, no new schema library.

## Steps

1. **Target registry.** Add stable `data-tutorial-id` attributes to pointable
   controls (panel sections from `PANEL_SECTIONS`, menu items from
   `APPLICATION_MENUS`, keyboard keys). Build
   `src/tutorial/TargetResolver.ts`: resolve id to element rect, handle
   collapsed/hidden/missing targets, follow scroll/resize via the existing
   `ResizeObserver` pattern in `src/App.tsx`.
2. **Schema language v0.** Define `src/tutorial/tutorialSchema.ts` types —
   `Tutorial { id, title, steps[] }`,
   `Step { id, target?, bubble { title, body, placement }, expect?, skippable }`,
   `Expect` union: `pressKey`, `toolUsed`, `selectionChanged`, `sceneChanged`,
   `commandRun`, `noExpect` (info-only). Add pure `validateTutorial()`
   rejecting unknown targets/expects.
3. **Runner state machine.** Create `src/tutorial/TutorialRunner.ts` —
   detachable from React: `load()`, `start()`, `next()`, `back()`, `skip()`,
   `abort()`, `currentStep`, subscription for React. No DOM or engine imports
   inside; receives adapter interfaces.
4. **Completion detection adapters.** Implement
   `src/tutorial/completionDetectors.ts` bridging runner `Expect` to existing
   sources — `engine.subscribe` / `EngineContext` version bumps,
   `HistoryManager` record/undo callbacks, `SelectionManager` change events,
   keyboard controller callbacks. Read-only: tutorials never mutate the
   document directly.
5. **Overlay UI.** Add `src/components/TutorialOverlay.tsx` — portal rendering
   spotlight cutout around target rect plus positioned bubble
   (above/below/left/right with flip on overflow), Next/Back/Skip/End
   controls, progress indicator. Mount in `src/App.tsx` alongside control
   panel and keyboard.
6. **Files and loading.** Add `tutorials/` directory with
   `hello-rectangle.tutorial.json` (3–5 steps: point, info, one `expect`),
   plus `src/tutorial/tutorialLoader.ts` for fetch/import + validation. Update
   File menu `tutorial` command id in `src/ui/PanelsManager.ts` to open the
   tutorial picker.
7. **Tests.** Add `tests/tutorial-schema.test.mjs` (validator
   accepts/rejects fixtures) and `tests/tutorial-runner.test.mjs` (step
   advance on fake detector events, skip/back/abort). Follow existing Node
   test-runner patterns.

## Validation Plan

- `npm run test` covers new tutorial tests plus existing `ui-state`,
  `engine-context`, `scene-selection` suites.
- `npm run lint` clean on new files.
- Manual: `npm run dev`, load example tutorial, confirm bubble tracks target
  on resize, completion advances only after the required action, missing
  target shows graceful fallback text.

## Risks / Open Questions

- No `data-testid`-style hooks exist today, so first work must touch several
  components to add ids.
- Canvas-internal targets (snap points, cursor states) cannot be DOM-queried;
  v0 restricts targets to DOM controls and treats canvas expectations as
  detector-only.
- Open: where tutorial progress persists (`GUIManager` store vs. separate
  key) — propose separate key, non-blocking.
