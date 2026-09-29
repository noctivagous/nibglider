import { useSyncExternalStore } from 'react';
import type {
  CircleInnerShape,
  InnerShapeParams,
  NibGliderEngine,
  RectangleInnerShape,
} from '../engine/engine';

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
      <fieldset id="strokeControls" className="panel-card panel-card-row">
        <legend>
          <label className="toggle-switch square-knob">
            <input
              type="checkbox"
              id="strokeEnabledCheckbox"
              checked={engine.strokeEnabled}
              onChange={(e) => engine.setStrokeEnabled(e.target.checked)}
            />
            <span className="slider" />
          </label>
          Stroke <kbd>R</kbd>
        </legend>
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
      </fieldset>

      <fieldset id="fillControls" className="panel-card panel-card-row">
        <legend>
          <label className="toggle-switch square-knob">
            <input
              type="checkbox"
              id="fillEnabledCheckbox"
              checked={engine.fillEnabled}
              onChange={(e) => engine.setFillEnabled(e.target.checked)}
            />
            <span className="slider" />
          </label>
          Fill <kbd>T</kbd>
        </legend>
        <input
          type="color"
          id="fillColorWell"
          value={engine.globalFillColor}
          title="Fill Color"
          onChange={(e) => engine.setFillColor(e.target.value)}
        />
      </fieldset>

      <fieldset id="snappingControls" className="panel-card panel-card-col">
        <legend>Snapping</legend>
        <label className="check-row">
          <input
            type="checkbox"
            id="gridSnappingCheckbox"
            checked={engine.isGridSnappingEnabled}
            onChange={(e) => engine.setGridSnappingEnabled(e.target.checked)}
          />
          <span>Grid snapping</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            id="pathSnappingCheckbox"
            checked={engine.isPathSnappingEnabled}
            onChange={(e) => engine.setPathSnappingEnabled(e.target.checked)}
          />
          <span>Path snapping</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            id="angleSnappingCheckbox"
            checked={engine.isAngleSnappingEnabled}
            onChange={(e) => engine.setAngleSnappingEnabled(e.target.checked)}
          />
          <span>Angle snapping</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            id="lengthSnappingCheckbox"
            checked={engine.isLengthSnappingEnabled}
            onChange={(e) => engine.setLengthSnappingEnabled(e.target.checked)}
          />
          <span>Length snapping</span>
        </label>
      </fieldset>

      <fieldset id="circleFrameControls" className="panel-card panel-card-row">
        <legend>Circle Keys:</legend>
        <select
          id="circleInnerShapeSelect"
          value={engine.circleInnerShapeType}
          onChange={(e) =>
            engine.setCircleInnerShapeType(e.target.value as CircleInnerShape)
          }
        >
          <option value="circle">Circle</option>
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
              d="M 1,0 L 1,0"
            />
          </svg>
        </div>
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
      </fieldset>

      <fieldset id="rectFrameControls" className="panel-card panel-card-row">
        <legend>Rect Keys:</legend>
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
              d="M 1,0 L 1,0"
            />
          </svg>
        </div>
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
      </fieldset>
    </>
  );
}
