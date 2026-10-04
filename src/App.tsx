import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import paper from 'paper';
import { NibGliderEngine, type KeyActivity } from './engine/engine';
import { isCommandAvailable, matchAppCommand } from './engine/input/keymap';
import ControlPanel from './components/ControlPanel';
import OnscreenKeyboard from './components/OnscreenKeyboard';
import TutorialOverlay from './components/TutorialOverlay';
import WidgetHandle from './components/WidgetHandle';
import StatusOverlay from './components/StatusOverlay';
import { GUIManager, KEYBOARD_WIDTH_DEFAULT } from './ui/GUIManager';
import { WidgetLayout } from './ui/WidgetLayout';
import { writePreviewPaths } from './ui/PreviewBoxPresenter';
import { TutorialRunner } from './tutorial/TutorialRunner';
import {
  attachTutorialKeyListener,
  bridgeEngineToRunner,
  emitTutorialCommand,
} from './tutorial/completionDetectors';
import { parseTutorialText } from './tutorial/tutorialLoader';
import helloTutorialRaw from '../../tutorials/hello-rectangle.tutorial.json?raw';

// Section title labels in the panel are hidden; icons, keys, and hover
// tooltips still identify each section.
const HIDE_SECTION_TITLES = true;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [gui] = useState(() => new GUIManager());
  const ui = useSyncExternalStore(gui.subscribe, gui.getSnapshot);
  const [layout] = useState(() => new WidgetLayout());
  const layoutSnap = useSyncExternalStore(layout.subscribe, layout.getSnapshot);
  const [engine] = useState(
    () =>
      new NibGliderEngine(new paper.PaperScope(), (a: KeyActivity) =>
        setActiveCode(a.active ? a.code : null),
      ),
  );
  const [tutorialRunner] = useState(() => new TutorialRunner());
  const tutorialSnap = useSyncExternalStore(tutorialRunner.subscribe, tutorialRunner.getSnapshot);

  // Tutorial completion: physical keys and engine mutations feed the runner.
  useEffect(() => bridgeEngineToRunner(engine, tutorialRunner), [engine, tutorialRunner]);
  useEffect(() => attachTutorialKeyListener(tutorialRunner), [tutorialRunner]);

  const startTutorial = () => {
    const loaded = parseTutorialText(helloTutorialRaw);
    if (!loaded.ok || !loaded.tutorial) return;
    tutorialRunner.load(loaded.tutorial);
    tutorialRunner.start();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    engine.attach(canvas);
    return () => engine.detach();
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

  return (
    <div id="mainLayout">
      <div id="canvasContainer">
        <canvas
          id="nibgliderCanvas"
          className="nibglider-canvas"
          data-tutorial-id="canvas"
          tabIndex={0}
          ref={canvasRef}
        />
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
            <ControlPanel engine={engine} onTutorialRequest={startTutorial} />
          </div>
          <StatusOverlay
            engine={engine}
            hidden={!ui.statusVisible}
            shiftX={layoutSnap.statusShiftX}
          />
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
      {tutorialSnap.status === 'active' && tutorialRunner.currentStep && tutorialSnap.tutorial && (
        <TutorialOverlay
          key={tutorialRunner.currentStep.id}
          tutorialTitle={tutorialSnap.tutorial.title}
          step={tutorialRunner.currentStep}
          stepIndex={tutorialSnap.stepIndex}
          stepCount={tutorialSnap.tutorial.steps.length}
          onNext={() => tutorialRunner.next()}
          onBack={() => tutorialRunner.back()}
          onSkip={() => tutorialRunner.skip()}
          onEnd={() => tutorialRunner.abort()}
        />
      )}
    </div>
  );
}
