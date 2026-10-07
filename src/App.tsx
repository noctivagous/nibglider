import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import paper from 'paper';
import {
  NibGliderEngine,
  type CircleInnerShape,
  type KeyActivity,
  type RectangleInnerShape,
} from './engine/engine';
import { isCommandAvailable, matchAppCommand } from './engine/input/keymap';
import ControlPanel, { type ControlPanelHandle } from './components/ControlPanel';
import { FILE_COMMANDS, type FileCommand } from './ui/fileCommands';
import AppMenu, { type MenuPanelSection, type PanelSectionAction } from './components/AppMenu';
import ContextMenu from './components/ContextMenu';
import SettingsWindow from './components/SettingsWindow';
import DocumentInfoWindow from './components/DocumentInfoWindow';
import DocumentSettingsWindow from './components/DocumentSettingsWindow';
import DocumentSizeWindow from './components/DocumentSizeWindow';
import OnscreenKeyboard from './components/OnscreenKeyboard';
import CanvasScrollbars from './components/CanvasScrollbars';
import PageRuler from './components/PageRuler';
import TutorialOverlay from './components/TutorialOverlay';
import WidgetHandle from './components/WidgetHandle';
import StatusOverlay from './components/StatusOverlay';
import ExportFramePopover from './components/ExportFramePopover';
import InterlacePopover from './components/InterlacePopover';
import { browserStore, GUIManager, KEYBOARD_WIDTH_DEFAULT } from './ui/GUIManager';
import { formatInUnit } from './engine/document/MeasurementUnits';
import { autosaveDocument, restorableDocument } from './ui/DocumentGallery';
import { CONTEXT_MENU_ID, MENU_PANEL_SECTIONS, PanelsManager, hideMenuSection, sectionLabel } from './ui/PanelsManager';
import { WidgetLayout } from './ui/WidgetLayout';
import { writePreviewPaths } from './ui/PreviewBoxPresenter';
import { TutorialRunner } from './tutorial/TutorialRunner';
import { DemonstrationPlayer, type DemoHooks, type DemoWorkspace } from './tutorial/demonstrationPlayer';
import { getTutorialTargetRect } from './tutorial/TargetResolver';
import { schemaById } from './engine/input/KeySettingsRegistry';
import { settingsView } from './engine/input/KeySettingsViewModel';
import {
  attachTutorialKeyListener,
  bridgeEngineToRunner,
  emitTutorialCommand,
} from './tutorial/completionDetectors';
import { parseTutorialText } from './tutorial/tutorialLoader';
import {
  clearNibGliderSettings,
  markTutorialCompleted,
  markTutorialDismissed,
  shouldAutoShowTutorial,
} from './tutorial/tutorialProgress';
import helloTutorialRaw from '../tutorials/hello-rectangle.tutorial.json?raw';

// Section title labels in the panel are hidden; icons, keys, and hover
// tooltips still identify each section.
const HIDE_SECTION_TITLES = true;

/** Menu commands with a wired handler; everything else renders disabled. */
const MENU_COMMANDS: Set<string> = new Set([
  ...FILE_COMMANDS,
  'settings', 'document-settings', 'canvas-size', 'tutorial', 'reset-settings', 'empty-canvas',
  'undo', 'redo',
  'cut', 'copy', 'paste', 'select-all',
  'toggle-panel', 'toggle-keyboard', 'toggle-status',
  'length-unit-pt', 'length-unit-inch', 'length-unit-cm',
  'bring-to-front', 'send-to-back', 'duplicate-selection',
  'group', 'ungroup-selection', 'delete-selection', 'transform-mode',
  'combinatorics-none', 'combinatorics-union', 'combinatorics-subtract', 'combinatorics-intersect', 'combinatorics-crop', 'combinatorics-interlace',
  'interlace', 'interlace-group', 'remove-from-interlace',
  'rect-shape-rectangle', 'rect-shape-circle', 'rect-shape-polygon', 'rect-shape-supershape',
  'rect-shape-trapezoid', 'rect-shape-parallelogram', 'rect-shape-rightTriangle',
  'rect-shape-rhombus', 'rect-shape-kite', 'rect-shape-exportFrame',
  'circle-shape-circle', 'circle-shape-semicircle', 'circle-shape-sector', 'circle-shape-segment',
  'circle-shape-polygon', 'circle-shape-supershape', 'circle-shape-trapezoid',
  'circle-shape-parallelogram', 'circle-shape-rightTriangle', 'circle-shape-rhombus',
  'circle-shape-kite',
  'snap-grid', 'snap-path', 'snap-points', 'snap-angle', 'snap-length', 'snap-aspect',
  'text-mode-display', 'text-mode-body',
  'scale-dialog', 'rotate-dialog',
]);

/** Guard prefix dispatch: the shape setters assign blindly, so only known values pass. */
const RECT_SHAPE_VALUES = [
  'rectangle', 'circle', 'polygon', 'supershape', 'trapezoid',
  'parallelogram', 'rightTriangle', 'rhombus', 'kite', 'exportFrame',
];
const CIRCLE_SHAPE_VALUES = [
  'circle', 'semicircle', 'sector', 'segment', 'polygon', 'supershape',
  'trapezoid', 'parallelogram', 'rightTriangle', 'rhombus', 'kite',
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [gui] = useState(() => new GUIManager());
  const ui = useSyncExternalStore(gui.subscribe, gui.getSnapshot);
  const [layout] = useState(() => new WidgetLayout());
  const layoutSnap = useSyncExternalStore(layout.subscribe, layout.getSnapshot);
  const [engine] = useState(
    () =>
      new NibGliderEngine(
        new paper.PaperScope(),
        (a: KeyActivity) => setActiveCode(a.active ? a.code : null),
        browserStore(),
      ),
  );
  const [tutorialRunner] = useState(() => new TutorialRunner());
  const tutorialSnap = useSyncExternalStore(tutorialRunner.subscribe, tutorialRunner.getSnapshot);
  // Shared with ControlPanel so demonstrations can expand scripted sections.
  const [panels] = useState(() => new PanelsManager());
  const [demoPlayer] = useState(
    () => new DemonstrationPlayer((suspended) => tutorialRunner.setSuspended(suspended)),
  );
  const demoSnap = useSyncExternalStore(demoPlayer.subscribe, demoPlayer.getSnapshot);
  const [demoCursor, setDemoCursor] = useState<{ x: number; y: number } | null>(null);
  const [demoPointAt, setDemoPointAt] = useState<{ target: string; label?: string } | null>(null);
  const [demoSettingsKey, setDemoSettingsKey] = useState<string | null>(null);
  // Canvas right-click popup position; null while closed. Right-clicks never
  // change the selection — the menu acts on whatever is already selected.
  const [contextMenuAt, setContextMenuAt] = useState<{ x: number; y: number } | null>(null);
  const demoCursorRef = useRef<{ x: number; y: number } | null>(null);
  const setGhost = useCallback((pos: { x: number; y: number } | null) => {
    demoCursorRef.current = pos;
    setDemoCursor(pos);
  }, []);

  // Tutorial completion: physical keys and engine mutations feed the runner.
  useEffect(() => bridgeEngineToRunner(engine, tutorialRunner), [engine, tutorialRunner]);
  useEffect(() => attachTutorialKeyListener(tutorialRunner), [tutorialRunner]);

  const canvasClientPoint = useCallback((fx: number, fy: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + fx * rect.width, y: rect.top + fy * rect.height };
  }, []);

  const animateGhost = useCallback(
    (to: { x: number; y: number }, durationMs: number, onFrame?: (pos: { x: number; y: number }) => void) => {
      const from = demoCursorRef.current ?? to;
      return new Promise<void>((resolve) => {
        if (durationMs <= 0 || (from.x === to.x && from.y === to.y)) {
          setGhost(to);
          onFrame?.(to);
          resolve();
          return;
        }
        const start = performance.now();
        const tick = (now: number) => {
          // Takeover aborts the motion where it stands; the player loop
          // exits on its generation check right after this hook resolves.
          if (!demoPlayer.isPlaying) {
            resolve();
            return;
          }
          const t = Math.min(1, (now - start) / durationMs);
          const pos = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
          setGhost(pos);
          onFrame?.(pos);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    },
    [demoPlayer, setGhost],
  );

  const demoWorkspace = useCallback(
    (): DemoWorkspace => ({
      resetZoom: () => engine.resetZoomForDemo(),
      cancelDrawing: () => engine.cancelCurrentDrawingOperation(),
      setKeyboardVisible: (visible) => gui.setKeyboardVisible(visible),
      setPanelVisible: (visible) => gui.setControlsVisible(visible),
      setStatusVisible: (visible) => gui.setStatusVisible(visible),
      expandSections: (ids) => {
        for (const id of ids) {
          if (panels.collapsed[id]) panels.toggleCollapse(id);
        }
      },
    }),
    [engine, gui, panels],
  );

  const demoHooks = useCallback(
    (): DemoHooks => ({
      pressKey: async (key, holdMs) => {
        engine.demoKeyDown(key);
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, holdMs)));
        engine.demoKeyUp(key);
      },
      moveCursorToTarget: async (target, durationMs) => {
        if (target === 'canvas') {
          const dest = canvasClientPoint(0.5, 0.5);
          if (!dest) return;
          await animateGhost(dest, durationMs, (pos) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              engine.demoMoveCursorToFraction((pos.x - rect.left) / rect.width, (pos.y - rect.top) / rect.height);
            }
          });
          return;
        }
        const rect = getTutorialTargetRect(target);
        if (!rect) return;
        await animateGhost({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, durationMs);
      },
      moveCursorToXY: async (x, y, durationMs) => {
        const dest = canvasClientPoint(x, y);
        if (!dest) return;
        await animateGhost(dest, durationMs, (pos) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            engine.demoMoveCursorToFraction((pos.x - rect.left) / rect.width, (pos.y - rect.top) / rect.height);
          }
        });
      },
      openPopover: async (key) => {
        setDemoSettingsKey(key);
        await new Promise((resolve) => setTimeout(resolve, 80));
      },
      pointAt: (target, label) => {
        setDemoPointAt(target ? { target, label } : null);
      },
      setParam: (settingsId, field, value) => {
        const schema = schemaById(settingsId);
        if (!schema) return;
        const control = settingsView(schema, engine).controls.find((entry) => entry.id === field);
        if (!control) return;
        (control as unknown as { commit: (v: unknown) => void }).commit(value);
      },
      closePopover: () => {
        setDemoSettingsKey(null);
        setDemoPointAt(null);
      },
      showNarration: () => {
        // Narration renders from the player snapshot; nothing to do here.
      },
    }),
    [animateGhost, canvasClientPoint, engine],
  );

  const playDemo = useCallback(() => {
    const step = tutorialRunner.currentStep;
    if (!step?.demo || demoPlayer.isPlaying) return;
    setGhost(null);
    setDemoPointAt(null);
    void demoPlayer.play(step, demoHooks(), demoWorkspace()).then(() => {
      setGhost(null);
      setDemoPointAt(null);
      setDemoSettingsKey(null);
    });
  }, [demoHooks, demoPlayer, demoWorkspace, setGhost, tutorialRunner]);

  const stopDemo = useCallback(() => {
    demoPlayer.stop();
  }, [demoPlayer]);

  // Any physical input during playback hands control back to the user.
  // Capture phase runs before the engine's own document handlers, so the
  // keypress or click both stops the demo and takes its normal effect.
  // Every tutorial exit (Next/Back/Skip/End, physical keys, canvas clicks)
  // passes through such input, so a stopped player always settles through
  // play()'s then() above — no separate step-change cleanup is needed.
  const demoPlaying = demoSnap.status === 'playing';
  useEffect(() => {
    if (!demoPlaying) return;
    const takeOver = () => demoPlayer.stop();
    document.addEventListener('keydown', takeOver, true);
    document.addEventListener('mousedown', takeOver, true);
    return () => {
      document.removeEventListener('keydown', takeOver, true);
      document.removeEventListener('mousedown', takeOver, true);
    };
  }, [demoPlaying, demoPlayer]);

  // Gate the demo layer on the step that started it: stale ghost, arrow,
  // narration, or popover state never leaks onto another step.
  const demoStepActive =
    demoPlaying &&
    tutorialSnap.status === 'active' &&
    demoSnap.stepId === tutorialRunner.currentStep?.id;

  const startTutorial = useCallback(() => {
    const loaded = parseTutorialText(helloTutorialRaw);
    if (!loaded.ok || !loaded.tutorial) return;
    tutorialRunner.load(loaded.tutorial);
    tutorialRunner.start();
  }, [tutorialRunner]);

  const controlPanelRef = useRef<ControlPanelHandle>(null);
  const handleMenuCommand = useCallback((commandId: string) => {
    if ((FILE_COMMANDS as readonly string[]).includes(commandId)) {
      controlPanelRef.current?.dispatchFileCommand(commandId as FileCommand);
      return;
    }
    if (commandId === 'settings') gui.openWindow('settings');
    else if (commandId === 'document-settings') gui.openWindow('document-settings');
    else if (commandId === 'canvas-size') gui.openWindow('document-size');
    else if (commandId === 'tutorial') startTutorial();
    else if (commandId === 'undo') engine.undo();
    else if (commandId === 'redo') engine.redo();
    else if (commandId === 'cut') engine.cutSelection();
    else if (commandId === 'copy') engine.copySelection();
    else if (commandId === 'paste') void engine.pasteFromSystemClipboard();
    else if (commandId === 'select-all') engine.selectAll();
    else if (commandId === 'reset-settings') {
      try {
        clearNibGliderSettings(localStorage);
      } catch { /* Storage can be unavailable in private browsing. */ }
      window.location.reload();
    } else if (commandId === 'empty-canvas') engine.newDocument();
    else if (commandId === 'toggle-panel') gui.toggleControls();
    else if (commandId === 'toggle-keyboard') gui.toggleKeyboard();
    else if (commandId === 'toggle-status') gui.toggleStatus();
    else if (commandId === 'length-unit-pt') engine.setLengthUnit('pt');
    else if (commandId === 'length-unit-inch') engine.setLengthUnit('inch');
    else if (commandId === 'length-unit-cm') engine.setLengthUnit('cm');
    else if (commandId === 'bring-to-front') engine.bringSelectionToFront();
    else if (commandId === 'send-to-back') engine.sendSelectionToBack();
    else if (commandId === 'duplicate-selection') engine.duplicateSelection();
    else if (commandId === 'group') engine.groupSelection();
    else if (commandId === 'ungroup-selection') engine.ungroupSelected();
    else if (commandId === 'delete-selection') engine.removeAllSelectedItemsAndReset();
    else if (commandId === 'transform-mode') engine.toggleTransformMode();
    else if (commandId === 'interlace') engine.interlaceSelection();
    else if (commandId === 'interlace-group') engine.interlaceGroupSelection();
    else if (commandId === 'remove-from-interlace') engine.removeFromInterlace();
    else if (commandId.startsWith('combinatorics-')) {
      const mode = commandId.slice('combinatorics-'.length);
      if (mode === 'none' || mode === 'union' || mode === 'subtract' || mode === 'intersect' || mode === 'crop' || mode === 'interlace') {
        // Panel parity (ControlPanel arm): arming with a selection combines immediately.
        engine.setCombineMode(mode);
        if (mode !== 'none' && engine.canCombineSelection()) engine.combineSelection(mode);
      }
    } else if (commandId.startsWith('rect-shape-')) {
      const shape = commandId.slice('rect-shape-'.length);
      if ((RECT_SHAPE_VALUES as readonly string[]).includes(shape)) {
        engine.setRectangleInnerShapeType(shape as RectangleInnerShape);
      }
    } else if (commandId.startsWith('circle-shape-')) {
      const shape = commandId.slice('circle-shape-'.length);
      if ((CIRCLE_SHAPE_VALUES as readonly string[]).includes(shape)) {
        engine.setCircleInnerShapeType(shape as CircleInnerShape);
      }
    } else if (commandId === 'snap-grid') engine.setGridSnappingEnabled(!engine.isGridSnappingEnabled);
    else if (commandId === 'snap-path') engine.setPathSnappingEnabled(!engine.isPathSnappingEnabled);
    else if (commandId === 'snap-points') engine.setPointSnappingEnabled(!engine.isPointSnappingEnabled);
    else if (commandId === 'snap-angle') engine.setAngleSnappingEnabled(!engine.isAngleSnappingEnabled);
    else if (commandId === 'snap-length') engine.setLengthSnappingEnabled(!engine.isLengthSnappingEnabled);
    else if (commandId === 'snap-aspect') engine.setAspectSnappingEnabled(!engine.isAspectSnappingEnabled);
    else if (commandId === 'text-mode-display') engine.setTextMode('display');
    else if (commandId === 'text-mode-body') engine.setTextMode('body');
    else if (commandId === 'scale-dialog') controlPanelRef.current?.openOperationDialog('scale');
    else if (commandId === 'rotate-dialog') controlPanelRef.current?.openOperationDialog('rotate');
  }, [engine, gui, startTutorial]);

  // Re-render on engine changes so menu checkmarks (length unit) stay fresh.
  // Visibility toggles arrive through the gui snapshot above.
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  // Re-render on panel changes so the menu's Panel toggle groups mirror
  // live collapsed/hidden section state.
  useSyncExternalStore(panels.subscribe, panels.getVersion);

  // Snap step fields hosted in the Snapping submenu, mirroring the panel's
  // units and ranges (see ControlPanel lengthField).
  const menuLengthField =
    engine.lengthUnit === 'inch'
      ? { min: 0.05, max: 10, step: 0.125, unit: 'inches' }
      : engine.lengthUnit === 'cm'
        ? { min: 0.5, max: 200, step: 0.5, unit: 'cm' }
        : { min: 1, max: 500, step: 1, unit: 'pt' };
  const menuNumberFields = {
    'snap-angle': {
      value: engine.angleSnapDegrees,
      min: 1, max: 90, step: 1,
      disabled: !engine.isAngleSnappingEnabled,
      label: 'Angle snap step in degrees',
    },
    'snap-length': {
      value: Math.round(engine.lengthSnapStepInUnit() * 1000) / 1000,
      min: menuLengthField.min, max: menuLengthField.max, step: menuLengthField.step,
      disabled: !engine.isLengthSnappingEnabled,
      label: `Length snap step in ${menuLengthField.unit}`,
    },
  };
  const handleMenuNumberCommit = useCallback((commandId: string, value: number) => {
    if (commandId === 'snap-angle') engine.setAngleSnapDegrees(value);
    else if (commandId === 'snap-length') engine.setLengthSnapStepFromUnit(value);
  }, [engine]);

  // Bottom Panel toggle group per mapped menu, reflecting live section state.
  const menuPanelSections: Record<string, MenuPanelSection[]> = {};
  for (const [menuId, ids] of Object.entries(MENU_PANEL_SECTIONS)) {
    menuPanelSections[menuId] = ids.map((id) => ({
      id,
      label: sectionLabel(id),
      hidden: panels.removed.includes(id),
      collapsed: !!panels.collapsed[id],
    }));
  }
  const handlePanelSection = useCallback((action: PanelSectionAction, sectionId: string) => {
    if (action === 'toggle-show') {
      if (panels.removed.includes(sectionId)) panels.restoreSection(sectionId);
      else panels.removeSection(sectionId);
    } else {
      panels.toggleCollapse(sectionId);
    }
  }, [panels]);
  const checkedCommands = new Set<string>([
    ...(ui.controlsVisible ? ['toggle-panel'] : []),
    ...(ui.keyboardVisible ? ['toggle-keyboard'] : []),
    ...(ui.statusVisible ? ['toggle-status'] : []),
    `length-unit-${engine.lengthUnit}`,
    `combinatorics-${engine.combineMode}`,
    `rect-shape-${engine.rectangleInnerShapeType}`,
    `circle-shape-${engine.circleInnerShapeType}`,
    `text-mode-${engine.textMode}`,
    ...(engine.isGridSnappingEnabled ? ['snap-grid'] : []),
    ...(engine.isPathSnappingEnabled ? ['snap-path'] : []),
    ...(engine.isPointSnappingEnabled ? ['snap-points'] : []),
    ...(engine.isAngleSnappingEnabled ? ['snap-angle'] : []),
    ...(engine.isLengthSnappingEnabled ? ['snap-length'] : []),
    ...(engine.isAspectSnappingEnabled ? ['snap-aspect'] : []),
  ]);

  // Live canvas-size label for the top Document menu row, e.g. "1920 × 1080 pt".
  // Engine notifies on page changes, so this recomputes on every render.
  const pageForMenu = engine.getPageSettings();
  const canvasSizeLabel =
    pageForMenu.widthPt != null && pageForMenu.heightPt != null
      ? `${formatInUnit(pageForMenu.widthPt, pageForMenu.unit)} × ${formatInUnit(pageForMenu.heightPt, pageForMenu.unit)}`
      : 'Canvas size';

  // New users (config flag on, no completion recorded) land in the tutorial.
  // startTutorial is idempotent, so StrictMode's double-effect is harmless.
  useEffect(() => {
    if (shouldAutoShowTutorial(browserStore())) startTutorial();
  }, [startTutorial]);

  const endTutorial = useCallback(() => {
    markTutorialDismissed(browserStore());
    tutorialRunner.abort();
  }, [tutorialRunner]);

  // Finishing the last step records completion so it won't auto-show again.
  // Ending early records dismissal (distinct from completion) so the
  // tutorial stays closed on the next load.
  useEffect(() => {
    if (tutorialSnap.status === 'done') markTutorialCompleted(browserStore());
  }, [tutorialSnap.status]);

  // Restores the open gallery document when the scene is empty. attach()
  // keeps the Paper project across StrictMode remounts, so a second pass
  // sees the restored artwork and skips this.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    engine.attach(canvas);
    try {
      const doc = restorableDocument(browserStore());
      if (doc && !engine.hasContent()
        && engine.replaceScene(`Open ${doc.name}`, doc.svg, { history: false })) {
        engine.markDocumentClean();
      }
    } catch { /* A bad save never blocks startup. */ }
    return () => engine.detach();
  }, [engine]);

  // Autosave: persist dirty artwork and the view to the gallery shortly
  // after they settle, and synchronously on hide/close. The first save
  // creates the Untitled document, so work is never lost before an explicit Save.
  useEffect(() => {
    let timer: number | null = null;
    const save = (): void => {
      try {
        autosaveDocument(engine, browserStore());
      } catch { /* Autosave never interrupts drawing. */ }
    };
    const schedule = (): void => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        save();
      }, 1000);
    };
    const flush = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      save();
    };
    const unsubscribe = engine.subscribe(schedule);
    const unsubscribeView = engine.subscribeView(schedule);
    window.addEventListener('pagehide', flush);
    return () => {
      unsubscribe();
      unsubscribeView();
      window.removeEventListener('pagehide', flush);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [engine]);

  useEffect(() => {
    const paint = () => {
      writePreviewPaths(document, {
        circle: engine.innerShapePreviewPath(engine.circleInnerShapeType, engine.circleInnerShapeParams),
        rect: engine.innerShapePreviewPath(engine.rectangleInnerShapeType, engine.rectangleInnerShapeParams, 'rect'),
      });
    };
    paint();
    return engine.subscribe(paint);
  }, [engine]);

  // Layout awareness: report the panel and floating side-column rects so
  // the layout manager can keep the status box out from under the menus
  // rail and the keymap table beneath it.
  // Measured synchronously on mount (before paint) so the first frame is
  // already placed; ResizeObserver picks up later changes.
  useEffect(() => {
    const panel = document.getElementById('controlPanel');
    const rail = panel?.querySelector('.panel-side') ?? panel?.querySelector('.panel-rail');
    if (!panel || !rail) return;
    const report = () => {
      const p = panel.getBoundingClientRect();
      const r = rail.getBoundingClientRect();
      layout.setRect('panel', { x: p.x, y: p.y, width: p.width, height: p.height });
      layout.setRect('menus', { x: r.x, y: r.y, width: r.width, height: r.height });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(panel);
    ro.observe(rail);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [layout, ui.controlsVisible]);

  // Console parity with the legacy global setSpacebarVisible():
  // window.setSpacebarVisible(true) reveals the on-screen Space key.
  useEffect(() => {
    (window as unknown as { setSpacebarVisible: (v: boolean) => void }).setSpacebarVisible =
      (visible) => gui.setShowSpacebar(visible);
  }, [gui]);

  // K key toggles the on-screen keyboard with a slide. Listened here
  // (not in the engine) because the visible state lives in React.
  // Skipped while drawing a path, where K adjusts spline tension, and
  // inside panel text fields, where "k" is typed content.
  useEffect(() => {
    const onToggleKeyboard = (event: KeyboardEvent) => {
      if (matchAppCommand(event, { isDrawingPath: engine.isDrawingPath }) !== 'toggle-keyboard') {
        return;
      }
      gui.toggleKeyboard();
      emitTutorialCommand('toggle-keyboard');
    };
    document.addEventListener('keydown', onToggleKeyboard);
    (
      window as unknown as { setKeyboardVisible: (v: boolean) => void }
    ).setKeyboardVisible = (visible) => gui.setKeyboardVisible(visible);
    return () => {
      document.removeEventListener('keydown', onToggleKeyboard);
    };
  }, [engine, gui]);

  // J key toggles the controls bar overlay with a slide. Listened here
  // (not in the engine) because the visible state lives in React.
  // Skipped while drawing a path, where J trims spline tension, and
  // inside panel text fields, where "j" is typed content.
  useEffect(() => {
    const onToggleControls = (event: KeyboardEvent) => {
      if (matchAppCommand(event, { isDrawingPath: engine.isDrawingPath }) !== 'toggle-panel') {
        return;
      }
      gui.toggleControls();
      emitTutorialCommand('toggle-panel');
    };
    document.addEventListener('keydown', onToggleControls);
    (
      window as unknown as { setControlsVisible: (v: boolean) => void }
    ).setControlsVisible = (visible) => gui.setControlsVisible(visible);
    return () => {
      document.removeEventListener('keydown', onToggleControls);
    };
  }, [engine, gui]);

  // L key toggles the status box overlay with a slide. Listened here
  // (not in the engine) because the visible state lives in React.
  // Skipped while drawing a path and inside panel text fields, matching
  // the J/K listeners.
  useEffect(() => {
    const onToggleStatus = (event: KeyboardEvent) => {
      if (matchAppCommand(event, { isDrawingPath: engine.isDrawingPath }) !== 'toggle-status') {
        return;
      }
      gui.toggleStatus();
      emitTutorialCommand('toggle-status');
    };
    document.addEventListener('keydown', onToggleStatus);
    (
      window as unknown as { setStatusVisible: (v: boolean) => void }
    ).setStatusVisible = (visible) => gui.setStatusVisible(visible);
    return () => {
      document.removeEventListener('keydown', onToggleStatus);
    };
  }, [engine, gui]);

  // Right-click menu definition and enablement: order and transform
  // commands need a selection, so they render disabled on an
  // empty-canvas right-click.
  const contextMenuDef = panels.menus.find((menu) => menu.id === CONTEXT_MENU_ID);
  // Obj. Actions only shows up when relevant: the section is dropped from
  // the popup def unless the selection holds a baked interlace band.
  const visibleContextMenuDef = contextMenuDef && !engine.canRemoveFromInterlace()
    ? hideMenuSection(contextMenuDef, 'Obj. Actions')
    : contextMenuDef;
  const contextEnabled = engine.selectedItems.length > 0
    ? MENU_COMMANDS
    : new Set([...MENU_COMMANDS].filter((id) => id !== 'bring-to-front' && id !== 'send-to-back' && id !== 'transform-mode' && id !== 'interlace' && id !== 'interlace-group'));

  return (
    <div id="mainLayout">
      <AppMenu
        menus={panels.menus.filter((menu) => menu.id !== CONTEXT_MENU_ID)}
        enabledCommands={MENU_COMMANDS}
        checkedCommands={checkedCommands}
        labelOverrides={{ 'canvas-size': canvasSizeLabel }}
        onCommand={handleMenuCommand}
        numberFields={menuNumberFields}
        onNumberCommit={handleMenuNumberCommit}
        panelSections={menuPanelSections}
        onPanelSection={handlePanelSection}
      />
      {ui.openWindowId === 'settings' && (
        <SettingsWindow engine={engine} gui={gui} windowId={ui.openWindowId} />
      )}
      {ui.openWindowId === 'document-info' && (
        <DocumentInfoWindow engine={engine} gui={gui} windowId={ui.openWindowId} />
      )}
      {ui.openWindowId === 'document-settings' && (
        <DocumentSettingsWindow engine={engine} gui={gui} windowId={ui.openWindowId} />
      )}
      {ui.openWindowId === 'document-size' && (
        <DocumentSizeWindow engine={engine} gui={gui} windowId={ui.openWindowId} />
      )}
      <div
        id="canvasContainer"
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenuAt({ x: e.clientX, y: e.clientY });
        }}
      >
        <canvas
          id="nibgliderCanvas"
          className="nibglider-canvas"
          data-tutorial-id="canvas"
          tabIndex={0}
          ref={canvasRef}
        />
        <CanvasScrollbars engine={engine} />
        <PageRuler engine={engine} />
        <div id="topOverlayStack">
          <div
            id="controlPanel"
            className={
              (ui.controlsVisible
                ? 'control-panel-fixed'
                : 'control-panel-fixed panel-hidden') +
              (HIDE_SECTION_TITLES ? ' titles-hidden' : '')
            }
            aria-hidden={!ui.controlsVisible}
            inert={!ui.controlsVisible}
          >
            <ControlPanel
              ref={controlPanelRef}
              engine={engine}
              panels={panels}
              onOpenDocumentSettings={() => gui.openWindow('document-settings')}
            />
          </div>
          <StatusOverlay
            engine={engine}
            hidden={!ui.statusVisible}
            shiftX={layoutSnap.statusShiftX}
          />
          <ExportFramePopover engine={engine} />
          <InterlacePopover engine={engine} />
        </div>
        <div className="corner-div">
          <div
            id="keyboardContainer"
            className={
              [
                ui.showSpacebar ? '' : 'no-spacebar',
                ui.keyboardVisible ? '' : 'kb-hidden',
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
            aria-hidden={!ui.keyboardVisible}
            style={
              {
                width: ui.keyboardWidth,
                '--kb-scale': ui.keyboardWidth / KEYBOARD_WIDTH_DEFAULT,
              } as CSSProperties
            }
          >
            <WidgetHandle widget="keyboard" label="On-screen keyboard" />
            <OnscreenKeyboard
              engine={engine}
              activeCode={activeCode}
              showSpacebar={ui.showSpacebar}
              width={ui.keyboardWidth}
              demoSettingsKey={demoStepActive ? demoSettingsKey : null}
              onWidthChange={(width) => gui.setKeyboardWidth(width)}
              onCommand={(id) => {
                emitTutorialCommand(id);
                if (
                  id === 'toggle-status' &&
                  isCommandAvailable('toggle-status', {
                    isDrawingPath: engine.isDrawingPath,
                  })
                ) {
                  gui.toggleStatus();
                }
              }}
            />
          </div>
        </div>
      </div>
      {contextMenuAt && visibleContextMenuDef && (
        <ContextMenu
          menu={visibleContextMenuDef}
          position={contextMenuAt}
          enabledCommands={contextEnabled}
          onCommand={(id) => {
            setContextMenuAt(null);
            handleMenuCommand(id);
          }}
          onClose={() => setContextMenuAt(null)}
        />
      )}
      {tutorialSnap.status === 'active' && tutorialRunner.currentStep && tutorialSnap.tutorial && (
        <TutorialOverlay
          tutorialTitle={tutorialSnap.tutorial.title}
          step={tutorialRunner.currentStep}
          stepIndex={tutorialSnap.stepIndex}
          stepCount={tutorialSnap.tutorial.steps.length}
          onNext={() => tutorialRunner.next()}
          onBack={() => tutorialRunner.back()}
          onSkip={() => tutorialRunner.skip()}
          onEnd={endTutorial}
          demoAvailable={!!tutorialRunner.currentStep.demo}
          demoPlaying={demoStepActive}
          demoNarration={demoStepActive ? demoSnap.narration : null}
          onPlayDemo={playDemo}
          onStopDemo={stopDemo}
          demoCursor={demoStepActive ? demoCursor : null}
          demoPointAt={demoStepActive ? demoPointAt : null}
        />
      )}
    </div>
  );
}
