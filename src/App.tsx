import { useEffect, useRef, useState } from 'react';
import paper from 'paper';
import { NibGliderEngine, type KeyActivity } from './engine/engine';
import ControlPanel from './components/ControlPanel';
import Keyboard from './components/Keyboard';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  // Parity with the legacy showSpacebarKey=false default: the on-screen
  // Space key starts hidden; the physical spacebar still toggles drag-lock.
  const [showSpacebar, setShowSpacebar] = useState(false);
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
        <div className="corner-div">
          <div id="keyboardContainer">
            <Keyboard activeCode={activeCode} showSpacebar={showSpacebar} />
          </div>
        </div>
      </div>
    </div>
  );
}
