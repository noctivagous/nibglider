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

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  // Parity with the legacy showSpacebarKey=false default: the on-screen
  // Space key starts hidden; the physical spacebar still toggles drag-lock.
  const [showSpacebar, setShowSpacebar] = useState(false);
  const [keyboardWidth, setKeyboardWidth] = useState(loadKeyboardWidth);
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

  useEffect(() => {
    try {
      localStorage.setItem(KEYBOARD_WIDTH_KEY, String(keyboardWidth));
    } catch {
      /* ignore */
    }
  }, [keyboardWidth]);

  return (
    <div id="mainLayout">
      <div id="controlPanel" className="control-panel-fixed">
        <ControlPanel engine={engine} />
      </div>
      <div id="canvasContainer">
        <canvas
          id="nibgliderCanvas"
          className="nibglider-canvas"
          tabIndex={0}
          ref={canvasRef}
        />
        <StatusOverlay engine={engine} />
        <div className="corner-div">
          <div
            id="keyboardContainer"
            className={showSpacebar ? undefined : 'no-spacebar'}
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
