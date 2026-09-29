import { useSyncExternalStore } from 'react';
import type {
  CircleInnerShape,
  InnerShapeParams,
  NibGliderEngine,
  RectangleInnerShape,
  StrokeCap,
  StrokeJoin,
} from '../engine/engine';

const ASPECT_RATIO_PRESETS = ['1:1', '3:4', '2:3', '16:9'];

function AngleSlider({
  value,
  onChange,
  min = 10,
  max = 170,
  fallback = 60,
}: {
  value: number;
  onChange: (deg: number) => void;
  min?: number;
  max?: number;
  fallback?: number;
}) {
  const deg = Number.isFinite(value) ? value : fallback;
  return (
    <span className="panelParameters">
      <span className="param-item">
        <label>Angle: {Math.round(deg)}°</label>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={deg}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
        />
      </span>
    </span>
  );
}

const CAP_OPTIONS: Array<{ value: StrokeCap; label: string; icon: string }> = [
  { value: 'butt', label: 'Butt', icon: 'M3 7 H13 M13 4 V10' },
  { value: 'round', label: 'Round', icon: 'M3 7 H10 A3.5 3.5 0 0 1 10 7' },
  { value: 'square', label: 'Square', icon: 'M3 7 H10 M10 4 H16 V10 H10' },
];

const JOIN_OPTIONS: Array<{ value: StrokeJoin; label: string; icon: string }> = [
  { value: 'miter', label: 'Miter', icon: 'M3 12 L8 4 L13 12' },
  { value: 'round', label: 'Round', icon: 'M3 12 L8 7 A3 3 0 0 1 11 12' },
  { value: 'bevel', label: 'Bevel', icon: 'M3 12 L6 6 L12 6 L13 12' },
];

const SUPERSHAPE_SLIDERS: Array<{
  key: keyof InnerShapeParams;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'm', label: 'M', min: 1, max: 20, step: 1.0 },
  { key: 'n1', label: 'N1', min: 0.1, max: 4, step: 0.1 },
  { key: 'n2', label: 'N2', min: 0.1, max: 4, step: 0.1 },
  { key: 'n3', label: 'N3', min: 0.1, max: 4, step: 0.1 },
  { key: 'a1', label: 'A1', min: 0.1, max: 1.7, step: 0.1 },
  { key: 'a2', label: 'A2', min: 0.1, max: 1.7, step: 0.1 },
];

export default function ControlPanel({ engine }: { engine: NibGliderEngine }) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const params = engine.circleInnerShapeParams;
  const rectParams = engine.rectangleInnerShapeParams;

  return (
    <>
      <section id="strokeControls" className="panel-card" aria-label="Stroke">
        <header className="pane-titlebar">
          <label className="toggle-switch square-knob">
            <input
              type="checkbox"
              id="strokeEnabledCheckbox"
              checked={engine.strokeEnabled}
              onChange={(e) => engine.setStrokeEnabled(e.target.checked)}
            />
            <span className="slider" />
          </label>
          <span className="pane-title">
            Stroke <kbd>R</kbd>
          </span>
        </header>
        <div className="pane-body pane-body-col">
          <div className="stroke-row">
            <input
              type="color"
              id="strokeColorWell"
              value={engine.globalStrokeColor}
              title="Stroke Color"
              onChange={(e) => engine.setStrokeColor(e.target.value)}
            />
            <div className="control-inline">
              <label> Width:</label>
              <input
                type="range"
                id="strokeWidthSlider"
                min="1"
                max="40"
                step="0.5"
                value={engine.globalStrokeWidth}
                onChange={(e) => engine.setStrokeWidth(parseFloat(e.target.value))}
              />
              <span id="strokeWidthDisplay">
                {engine.globalStrokeWidth.toFixed(1)} pt
              </span>
            </div>
            <svg
              className="stroke-preview"
              viewBox="0 0 48 24"
              width="56"
              height="28"
              aria-hidden="true"
            >
              <path
                d="M6 18 L22 6 L42 18"
                fill="none"
                stroke={engine.strokeEnabled ? engine.globalStrokeColor : '#555'}
                strokeWidth={Math.max(2, Math.min(8, engine.globalStrokeWidth * 0.45))}
                strokeLinecap={engine.globalStrokeCap}
                strokeLinejoin={engine.globalStrokeJoin}
                strokeMiterlimit={engine.globalMiterLimit}
              />
            </svg>
          </div>
          <div className="stroke-row">
            <div className="stroke-seg">
              <span className="stroke-seg-label">Cap</span>
              <div className="seg-ctrl" role="group" aria-label="Line cap">
                {CAP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.label}
                    className={
                      engine.globalStrokeCap === opt.value ? 'active' : undefined
                    }
                    onClick={() => engine.setStrokeCap(opt.value)}
                  >
                    <svg viewBox="0 0 18 14" width="18" height="14">
                      <path
                        d={opt.icon}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap={opt.value}
                        strokeLinejoin="miter"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            <div className="stroke-seg">
              <span className="stroke-seg-label">Join</span>
              <div className="seg-ctrl" role="group" aria-label="Line join">
                {JOIN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.label}
                    className={
                      engine.globalStrokeJoin === opt.value ? 'active' : undefined
                    }
                    onClick={() => engine.setStrokeJoin(opt.value)}
                  >
                    <svg viewBox="0 0 16 14" width="16" height="14">
                      <path
                        d={opt.icon}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="butt"
                        strokeLinejoin={opt.value}
                        strokeMiterlimit={4}
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            <div className="stroke-seg">
              <span className="stroke-seg-label">Miter</span>
              <input
                type="number"
                id="miterLimitInput"
                className="miter-limit-input"
                aria-label="Miter"
                title="Miter"
                min={1}
                max={40}
                step={0.5}
                value={engine.globalMiterLimit}
                disabled={engine.globalStrokeJoin !== 'miter'}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n)) engine.setMiterLimit(n);
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <section id="fillControls" className="panel-card" aria-label="Fill">
        <header className="pane-titlebar">
          <label className="toggle-switch square-knob">
            <input
              type="checkbox"
              id="fillEnabledCheckbox"
              checked={engine.fillEnabled}
              onChange={(e) => engine.setFillEnabled(e.target.checked)}
            />
            <span className="slider" />
          </label>
          <span className="pane-title">
            Fill <kbd>T</kbd>
          </span>
        </header>
        <div className="pane-body pane-body-row">
          <input
            type="color"
            id="fillColorWell"
            value={engine.globalFillColor}
            title="Fill Color"
            onChange={(e) => engine.setFillColor(e.target.value)}
          />
        </div>
      </section>

      <section id="snappingControls" className="panel-card" aria-label="Snapping">
        <header className="pane-titlebar">
          <span className="pane-title">Snapping</span>
        </header>
        <div className="pane-body pane-body-col">
          <div className="snapping-grid">
          <label className="check-row">
            <input
              type="checkbox"
              id="gridSnappingCheckbox"
              checked={engine.isGridSnappingEnabled}
              onChange={(e) => engine.setGridSnappingEnabled(e.target.checked)}
            />
            <span>Grid</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              id="pathSnappingCheckbox"
              checked={engine.isPathSnappingEnabled}
              onChange={(e) => engine.setPathSnappingEnabled(e.target.checked)}
            />
            <span>Path</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              id="angleSnappingCheckbox"
              checked={engine.isAngleSnappingEnabled}
              onChange={(e) => engine.setAngleSnappingEnabled(e.target.checked)}
            />
            <span>Angle</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              id="lengthSnappingCheckbox"
              checked={engine.isLengthSnappingEnabled}
              onChange={(e) => engine.setLengthSnappingEnabled(e.target.checked)}
            />
            <span>Length</span>
          </label>
          <div className="snapping-aspect">
            <label className="check-row">
              <input
                type="checkbox"
                id="aspectSnappingCheckbox"
                checked={engine.isAspectSnappingEnabled}
                onChange={(e) => engine.setAspectSnappingEnabled(e.target.checked)}
              />
              <span>Aspect</span>
            </label>
            <select
              id="aspectRatioSelect"
              aria-label="Aspect ratio"
              value={engine.aspectRatioKey()}
              onChange={(e) => engine.setAspectRatioKey(e.target.value)}
            >
              {ASPECT_RATIO_PRESETS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
          </div>
        </div>
      </section>

      <section id="circleFrameControls" className="panel-card" aria-label="Circle Keys">
        <header className="pane-titlebar">
          <span className="pane-title">Circle Keys</span>
        </header>
        <div className="pane-body pane-body-row">
        <select
          id="circleInnerShapeSelect"
          value={engine.circleInnerShapeType}
          onChange={(e) =>
            engine.setCircleInnerShapeType(e.target.value as CircleInnerShape)
          }
        >
          <option value="circle">Circle</option>
          <option value="semicircle">Semicircle</option>
          <option value="sector">Sector</option>
          <option value="segment">Segment</option>
          <option value="polygon">Regular Polygon</option>
          <option value="supershape">Supershape</option>
          <option value="trapezoid">Trapezoid</option>
          <option value="parallelogram">Parallelogram</option>
          <option value="rightTriangle">Right Triangle</option>
          <option value="rhombus">Rhombus</option>
        </select>
        <div id="shapePreviewContainer">
          <svg id="shapePreview" viewBox="-1.2 -1.2 2.4 2.4" width="120" height="64">
            <path
              id="shapePreviewPath"
              fill="#ddd"
              stroke="#444"
              strokeWidth="0.015"
              strokeLinejoin="round"
              strokeLinecap="round"
              d={engine.innerShapePreviewPath(
                engine.circleInnerShapeType,
                engine.circleInnerShapeParams,
              )}
            />
          </svg>
        </div>
        {(engine.circleInnerShapeType === 'sector' ||
          engine.circleInnerShapeType === 'segment') && (
          <AngleSlider
            value={params.sector}
            min={10}
            max={350}
            fallback={90}
            onChange={(deg) => engine.setCircleSector(deg)}
          />
        )}
        {(engine.circleInnerShapeType === 'trapezoid' ||
          engine.circleInnerShapeType === 'parallelogram') && (
          <AngleSlider
            value={params.angle}
            onChange={(deg) => engine.setCircleAngle(deg)}
          />
        )}
        {engine.circleInnerShapeType === 'polygon' && (
          <span id="regularPolygonParametersForPanel" className="panelParameters">
            <span className="param-item">
              <label id="circlePolySidesLabel">Sides: {params.sides}</label>
              <input
                type="range"
                id="circlePolySides"
                min="3"
                max="12"
                value={params.sides}
                onChange={(e) => engine.setCircleSides(parseInt(e.target.value, 10))}
              />
            </span>
          </span>
        )}
        {engine.circleInnerShapeType === 'supershape' && (
          <span id="supershapeParametersForPanel" className="panelParameters">
            <span className="param-block">
              {SUPERSHAPE_SLIDERS.slice(0, 3).map((s) => (
                <span className="param-item" key={s.key}>
                  <label>
                    {s.label}: {params[s.key].toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={params[s.key]}
                    onChange={(e) =>
                      engine.setSupershapeParam(s.key, parseFloat(e.target.value))
                    }
                  />
                </span>
              ))}
            </span>
            <span className="param-block">
              {SUPERSHAPE_SLIDERS.slice(3).map((s) => (
                <span className="param-item" key={s.key}>
                  <label>
                    {s.label}: {params[s.key].toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={params[s.key]}
                    onChange={(e) =>
                      engine.setSupershapeParam(s.key, parseFloat(e.target.value))
                    }
                  />
                </span>
              ))}
            </span>
          </span>
        )}
        </div>
      </section>

      <section id="rectFrameControls" className="panel-card" aria-label="Rect Keys">
        <header className="pane-titlebar">
          <span className="pane-title">Rect Keys</span>
        </header>
        <div className="pane-body pane-body-row">
        <select
          id="rectInnerShapeSelect"
          value={engine.rectangleInnerShapeType}
          onChange={(e) =>
            engine.setRectangleInnerShapeType(e.target.value as RectangleInnerShape)
          }
        >
          <option value="rectangle">Rectangle</option>
          <option value="circle">Circle</option>
          <option value="polygon">Regular Polygon</option>
          <option value="supershape">Supershape</option>
          <option value="trapezoid">Trapezoid</option>
          <option value="parallelogram">Parallelogram</option>
          <option value="rightTriangle">Right Triangle</option>
          <option value="rhombus">Rhombus</option>
          <option value="kite">Kite</option>
        </select>
        <div id="rectShapePreviewContainer">
          <svg id="rectShapePreview" viewBox="-1.2 -1.2 2.4 2.4" width="120" height="64">
            <path
              id="rectShapePreviewPath"
              fill="#ddd"
              stroke="#444"
              strokeWidth="0.015"
              strokeLinejoin="round"
              strokeLinecap="round"
              d={engine.innerShapePreviewPath(
                engine.rectangleInnerShapeType,
                engine.rectangleInnerShapeParams,
                'rect',
              )}
            />
          </svg>
        </div>
        {(engine.rectangleInnerShapeType === 'trapezoid' ||
          engine.rectangleInnerShapeType === 'parallelogram') && (
          <AngleSlider
            value={rectParams.angle}
            onChange={(deg) => engine.setRectangleAngle(deg)}
          />
        )}
        {engine.rectangleInnerShapeType === 'polygon' && (
          <span id="rectRegularPolygonParametersForPanel" className="panelParameters">
            <span className="param-item">
              <label id="rectPolySidesLabel">Sides: {rectParams.sides}</label>
              <input
                type="range"
                id="rectPolySides"
                min="3"
                max="12"
                value={rectParams.sides}
                onChange={(e) => engine.setRectangleSides(parseInt(e.target.value, 10))}
              />
            </span>
          </span>
        )}
        {engine.rectangleInnerShapeType === 'supershape' && (
          <span id="rectSupershapeParametersForPanel" className="panelParameters">
            <span className="param-block">
              {SUPERSHAPE_SLIDERS.slice(0, 3).map((s) => (
                <span className="param-item" key={s.key}>
                  <label>
                    {s.label}: {rectParams[s.key].toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={rectParams[s.key]}
                    onChange={(e) =>
                      engine.setRectangleSupershapeParam(s.key, parseFloat(e.target.value))
                    }
                  />
                </span>
              ))}
            </span>
            <span className="param-block">
              {SUPERSHAPE_SLIDERS.slice(3).map((s) => (
                <span className="param-item" key={s.key}>
                  <label>
                    {s.label}: {rectParams[s.key].toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={rectParams[s.key]}
                    onChange={(e) =>
                      engine.setRectangleSupershapeParam(s.key, parseFloat(e.target.value))
                    }
                  />
                </span>
              ))}
            </span>
          </span>
        )}
        </div>
      </section>
    </>
  );
}
