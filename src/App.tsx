import { useEffect, useRef, useState, type CSSProperties } from 'react';
import paper from 'paper';
import { NibGliderEngine, type KeyActivity } from './engine/engine';
import ControlPanel from './components/ControlPanel';
import Keyboard from './components/Keyboard';
import StatusOverlay from './components/StatusOverlay';

const KEYBOARD_WIDTH_DEFAULT = 920;
const KEYBOARD_WIDTH_MIN = 480;
const KEYBOARD_WIDTH_MAX = 1600;
const KEYBOARD_WIDTH_KEY = 'nibglider.keyboardWidth';
const KEYBOARD_VISIBLE_KEY = 'nibglider.keyboardVisible';
const CONTROLS_VISIBLE_KEY = 'nibglider.controlsVisible';
const STATUS_VISIBLE_KEY = 'nibglider.statusVisible';

function loadKeyboardWidth(): number {
  try {
    const raw = localStorage.getItem(KEYBOARD_WIDTH_KEY);
    if (raw == null || raw === '') return KEYBOARD_WIDTH_DEFAULT;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return Math.min(KEYBOARD_WIDTH_MAX, Math.max(KEYBOARD_WIDTH_MIN, n));
    }
  } catch {
    /* ignore */
  }
  return KEYBOARD_WIDTH_DEFAULT;
}

function loadKeyboardVisible(): boolean {
  try {
    const raw = localStorage.getItem(KEYBOARD_VISIBLE_KEY);
    if (raw == null || raw === '') return true;
    return raw !== '0' && raw.toLowerCase() !== 'false';
  } catch {
    /* ignore */
  }
  return true;
}

function loadControlsVisible(): boolean {
  try {
    const raw = localStorage.getItem(CONTROLS_VISIBLE_KEY);
    if (raw == null || raw === '') return true;
    return raw !== '0' && raw.toLowerCase() !== 'false';
  } catch {
    /* ignore */
  }
  return true;
}

function loadStatusVisible(): boolean {
  try {
    const raw = localStorage.getItem(STATUS_VISIBLE_KEY);
    if (raw == null || raw === '') return true;
    return raw !== '0' && raw.toLowerCase() !== 'false';
  } catch {
    /* ignore */
  }
  return true;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  // Parity with the legacy showSpacebarKey=false default: the on-screen
  // Space key starts hidden; the physical spacebar still toggles drag-lock.
  const [showSpacebar, setShowSpacebar] = useState(false);
  const [keyboardWidth, setKeyboardWidth] = useState(loadKeyboardWidth);
  const [keyboardVisible, setKeyboardVisible] = useState(loadKeyboardVisible);
  const [controlsVisible, setControlsVisible] = useState(loadControlsVisible);
  const [statusVisible, setStatusVisible] = useState(loadStatusVisible);
  const [engine] = useState(
    () =>
      new NibGliderEngine(new paper.PaperScope(), (a: KeyActivity) =>
        setActiveCode(a.active ? a.code : null),
      ),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    engine.attach(canvas);
    return () => engine.detach();
  }, [engine]);

  // Console parity with the legacy global setSpacebarVisible():
  // window.setSpacebarVisible(true) reveals the on-screen Space key.
  useEffect(() => {
    (window as unknown as { setSpacebarVisible: (v: boolean) => void }).setSpacebarVisible =
      setShowSpacebar;
  }, []);

  // K key toggles the on-screen keyboard with a slide. Listened here
  // (not in the engine) because the visible state lives in React.
  // Skipped while drawing a path, where K adjusts spline tension, and
  // inside panel text fields, where "k" is typed content.
  useEffect(() => {
    const onToggleKeyboard = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      if (engine.isDrawingPath) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      setKeyboardVisible((v) => !v);
    };
    document.addEventListener('keydown', onToggleKeyboard);
    (
      window as unknown as { setKeyboardVisible: (v: boolean) => void }
    ).setKeyboardVisible = setKeyboardVisible;
    return () => {
      document.removeEventListener('keydown', onToggleKeyboard);
    };
  }, [engine]);

  useEffect(() => {
    try {
      localStorage.setItem(KEYBOARD_WIDTH_KEY, String(keyboardWidth));
    } catch {
      /* ignore */
    }
  }, [keyboardWidth]);

  // J key toggles the controls bar overlay with a slide. Listened here
  // (not in the engine) because the visible state lives in React.
  // Skipped while drawing a path, where J trims spline tension, and
  // inside panel text fields, where "j" is typed content.
  useEffect(() => {
    const onToggleControls = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      if (event.key.toLowerCase() !== 'j') return;
      if (engine.isDrawingPath) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      setControlsVisible((v) => !v);
    };
    document.addEventListener('keydown', onToggleControls);
    (
      window as unknown as { setControlsVisible: (v: boolean) => void }
    ).setControlsVisible = setControlsVisible;
    return () => {
      document.removeEventListener('keydown', onToggleControls);
    };
  }, [engine]);

  useEffect(() => {
    try {
      localStorage.setItem(KEYBOARD_VISIBLE_KEY, keyboardVisible ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [keyboardVisible]);

  // L key toggles the status box overlay with a slide. Listened here
  // (not in the engine) because the visible state lives in React.
  // Skipped while drawing a path and inside panel text fields, matching
  // the J/K listeners.
  useEffect(() => {
    const onToggleStatus = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      if (event.key.toLowerCase() !== 'l') return;
      if (engine.isDrawingPath) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      setStatusVisible((v) => !v);
    };
    document.addEventListener('keydown', onToggleStatus);
    (
      window as unknown as { setStatusVisible: (v: boolean) => void }
    ).setStatusVisible = setStatusVisible;
    return () => {
      document.removeEventListener('keydown', onToggleStatus);
    };
  }, [engine]);

  useEffect(() => {
    try {
      localStorage.setItem(CONTROLS_VISIBLE_KEY, controlsVisible ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [controlsVisible]);

  useEffect(() => {
    try {
      localStorage.setItem(STATUS_VISIBLE_KEY, statusVisible ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [statusVisible]);

  return (
    <div id="mainLayout">
      <div id="canvasContainer">
        <canvas
          id="nibgliderCanvas"
          className="nibglider-canvas"
          tabIndex={0}
          ref={canvasRef}
        />
        <div id="topOverlayStack">
          <div
            id="controlPanel"
            className={
              controlsVisible
                ? 'control-panel-fixed'
                : 'control-panel-fixed panel-hidden'
            }
            aria-hidden={!controlsVisible}
            inert={!controlsVisible}
          >
            <ControlPanel engine={engine} />
          </div>
          <StatusOverlay engine={engine} hidden={!statusVisible} />
        </div>
        <div className="corner-div">
          <div
            id="keyboardContainer"
            className={
              [
                showSpacebar ? '' : 'no-spacebar',
                keyboardVisible ? '' : 'kb-hidden',
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
            aria-hidden={!keyboardVisible}
            style={
              {
                width: keyboardWidth,
                '--kb-scale': keyboardWidth / KEYBOARD_WIDTH_DEFAULT,
              } as CSSProperties
            }
          >
            <Keyboard
              activeCode={activeCode}
              showSpacebar={showSpacebar}
              width={keyboardWidth}
              onWidthChange={setKeyboardWidth}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
