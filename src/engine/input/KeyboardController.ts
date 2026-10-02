// Physical keyboard routing.
//
// Owns: the live-key binding list and which shortcut runs for a keydown.
// May read: drawing, selection, and style state through KeyboardHost.
// May mutate: only by calling host commands. Drawing algorithms stay on
//   the engine. App-owned keymap entries are ignored here.
// Public methods: handleKeyDown, reportKeyHighlight, reportKeyUp,
//   register, liveBindings.
// Events: host.onKeyActivity for on-screen keycap highlight.
// Tests: dispatch follows KEY_COMMANDS order, including fall-through for
//   Escape, Space, W, and Q. Text fields are ignored. See
//   refs/engine-smoke-checklist.md.

import type { KeyActivity, LiveKeyBinding } from '../types';
import {
  KEY_COMMANDS,
  commandById,
  isTextEntryTarget,
  type KeyState,
} from './keymap';

type Item = any;

export interface KeyboardHost {
  isDrawingPath(): boolean;
  isDrawingShape(): boolean;
  isDrawingQuad(): boolean;
  isLiveDrawing(): boolean;
  shapeType(): string | null;
  selectedItems(): Item[];
  globalStrokeWidth(): number;
  maxShapeWidth(): number;
  maxStrokeWidth(): number;
  splineTensionDefault(): number;
  strokeEnabled(): boolean;
  fillEnabled(): boolean;
  isInDragLock(): boolean;
  shapeWidth(): number;
  setShapeWidth(v: number): void;
  splineTension(): number;
  setSplineTension(v: number): void;
  setSelectedItems(items: Item[]): void;
  liveAdjustApplies(): boolean;
  resetZoom(): void;
  stepZoom(dir: 1 | -1): void;
  undo(): void;
  redo(): void;
  groupSelection(): void;
  ungroupSelected(): void;
  nudgeSelection(dx: number, dy: number): void;
  scaleSelection(factor: number): void;
  rotateSelection(degrees: number): void;
  updateTextContent(): void;
  updateShapePreview(): void;
  notify(): void;
  setIsInDragLock(on: boolean): void;
  removeAllSelectedItemsAndReset(): void;
  stampCurrentPreview(): void;
  stampItems(items: Item[] | null): void;
  rectCenterlineKC(): void;
  rectDiagonalKC(): void;
  rectTwoEdgesKC(): void;
  polyLineKC(): void;
  splinePointKC(): void;
  circleKC(mode: string): void;
  radialStampKC(): void;
  quadPointKC(): void;
  toggleGrid(): void;
  thinStrokeWidth(): void;
  thickenStrokeWidth(): void;
  finishRadialStamp(): void;
  completeShapeWithSpline(): void;
  endPathOrShape(): void;
  selectionPaint(): { strokeOn: boolean; fillOn: boolean } | null;
  setStrokeEnabled(on: boolean): void;
  setFillEnabled(on: boolean): void;
  cancelCurrentDrawingOperation(): void;
  hitTestUnderCursor(): void;
  applyLiveScale(event: KeyboardEvent, dir: -1 | 1): void;
  applyLiveRotate(event: KeyboardEvent, dir: -1 | 1): void;
  toggleRadialStampRadiusLock(): void;
  onKeyActivity(activity: KeyActivity): void;
}

export class KeyboardController {
  private readonly host: KeyboardHost;
  private liveKeyBindings: LiveKeyBinding[] = [];

  constructor(host: KeyboardHost) {
    this.host = host;
    this.registerBuiltIns();
  }

  register(binding: LiveKeyBinding): void {
    if (!this.liveKeyBindings.some((b) => b.id === binding.id)) {
      this.liveKeyBindings.push(binding);
    }
  }

  liveBindings(): LiveKeyBinding[] {
    return this.liveKeyBindings;
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (isTextEntryTarget(event)) return;
    for (const cmd of KEY_COMMANDS) {
      if (cmd.owner === 'app' || cmd.dispatch === false) continue;
      if (!cmd.match(event)) continue;
      if (!cmd.available(this.keyState())) continue;
      this.perform(cmd.action, event);
      if (cmd.exclusive) return;
    }
    this.host.updateTextContent();
  }

  /** Second keydown listener: highlights the on-screen keycap. */
  reportKeyHighlight(event: KeyboardEvent): void {
    if (isTextEntryTarget(event)) return;
    // Slash resets tension or toggles the grid and does not light a keycap.
    if (event.key.toLowerCase() === '/') return;
    if (event.code && event.metaKey === false) {
      this.host.onKeyActivity({ code: event.code, active: true });
    }
  }

  reportKeyUp(event: KeyboardEvent): void {
    if (event.code) this.host.onKeyActivity({ code: event.code, active: false });
  }

  private keyState(): KeyState {
    const host = this.host;
    return {
      isDrawingPath: host.isDrawingPath(),
      isDrawingShape: host.isDrawingShape(),
      isDrawingQuad: host.isDrawingQuad(),
      isLiveDrawing: host.isLiveDrawing(),
      shapeType: host.shapeType(),
      selectedCount: host.selectedItems().length,
      liveAdjustApplies: host.liveAdjustApplies(),
    };
  }

  private perform(action: string, event: KeyboardEvent): void {
    const host = this.host;
    switch (action) {
      case 'reset-zoom':
        event.preventDefault();
        host.resetZoom();
        return;
      case 'step-zoom':
        event.preventDefault();
        host.stepZoom(event.key === '-' ? -1 : 1);
        return;
      case 'undo':
        event.preventDefault();
        host.undo();
        return;
      case 'redo':
        event.preventDefault();
        host.redo();
        return;
      case 'group':
        event.preventDefault();
        if (event.shiftKey) host.ungroupSelected();
        else host.groupSelection();
        return;
      case 'nudge':
        this.nudge(event);
        return;
      case 'brackets':
        this.brackets(event);
        return;
      case 'rotate':
        this.rotate(event);
        return;
      case 'radial-lock':
        this.runLive(event);
        return;
      case 'drag-lock':
        host.setIsInDragLock(!host.isInDragLock());
        return;
      case 'delete-selection':
        host.removeAllSelectedItemsAndReset();
        return;
      case 'clear-selection':
        this.clearSelection();
        return;
      case 'stamp':
        if (host.isDrawingPath() || host.isDrawingShape() || host.isDrawingQuad()) {
          host.stampCurrentPreview();
        } else {
          host.stampItems(host.selectedItems());
        }
        return;
      case 'rect-centerline':
        host.rectCenterlineKC();
        return;
      case 'rect-diagonal':
        host.rectDiagonalKC();
        return;
      case 'rect-two-edges':
        host.rectTwoEdgesKC();
        return;
      case 'sharp-point':
        host.polyLineKC();
        return;
      case 'spline-point':
        host.splinePointKC();
        return;
      case 'circle-diameter':
        host.circleKC('diameter');
        return;
      case 'circle-radius':
        host.circleKC('radius');
        return;
      case 'radial-stamp':
        host.radialStampKC();
        return;
      case 'quad':
        host.quadPointKC();
        return;
      case 'tension-down':
        host.setSplineTension(Math.max(0.1, host.splineTension() - 0.1));
        host.updateTextContent();
        host.notify();
        return;
      case 'tension-up':
        host.setSplineTension(Math.min(1.0, host.splineTension() + 0.1));
        host.updateTextContent();
        host.notify();
        return;
      case 'tension-reset':
        host.setSplineTension(host.splineTensionDefault());
        host.updateTextContent();
        host.notify();
        return;
      case 'grid-toggle':
        host.toggleGrid();
        return;
      case 'stroke-thinner':
        this.bumpStroke(-1);
        return;
      case 'stroke-thicker':
        this.bumpStroke(1);
        return;
      case 'finish-drawing':
        this.finishDrawing(event);
        return;
      case 'toggle-stroke': {
        const sel = host.selectionPaint();
        host.setStrokeEnabled(sel ? !sel.strokeOn : !host.strokeEnabled());
        host.updateTextContent();
        return;
      }
      case 'toggle-fill': {
        const sel = host.selectionPaint();
        host.setFillEnabled(sel ? !sel.fillOn : !host.fillEnabled());
        host.updateTextContent();
        return;
      }
      case 'cancel':
        host.cancelCurrentDrawingOperation();
        return;
      case 'select':
        this.selectUnderCursor(event);
        return;
      default:
        return;
    }
  }

  private nudge(event: KeyboardEvent): void {
    const host = this.host;
    // Let focused panel controls keep native arrow behavior (sliders etc.).
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA')
    ) {
      return;
    }
    event.preventDefault();
    if (
      !host.isDrawingPath() &&
      !host.isDrawingShape() &&
      !host.isDrawingQuad() &&
      host.selectedItems().length > 0
    ) {
      // Base nudge 1 unit; Shift = longer, Alt = shorter.
      let d = 1;
      if (event.shiftKey) d *= 10;
      if (event.altKey) d *= 0.2;
      let dx = 0;
      let dy = 0;
      if (event.key === 'ArrowLeft') dx = -d;
      else if (event.key === 'ArrowRight') dx = d;
      else if (event.key === 'ArrowUp') dy = -d;
      else dy = d;
      host.nudgeSelection(dx, dy);
    }
  }

  private brackets(event: KeyboardEvent): void {
    const host = this.host;
    const down = event.code === 'BracketLeft' || event.key === '[';
    if (host.isDrawingShape() && host.shapeType() === 'rectangle_centerline') {
      if (down) {
        host.setShapeWidth(Math.max(
          1,
          (host.shapeWidth() || host.globalStrokeWidth() * 2) - 2,
        ));
      } else {
        host.setShapeWidth(Math.min(
          host.maxShapeWidth(),
          (host.shapeWidth() || host.globalStrokeWidth() * 2) + 2,
        ));
      }
      host.updateTextContent();
      host.updateShapePreview();
      host.notify();
      return;
    }
    // Live drawing takes precedence over idle selection scaling.
    if (this.runLive(event)) return;
    if (host.selectedItems().length > 0) {
      // Shift = bigger step, Alt = finer step.
      const factorDown = event.shiftKey ? 0.8 : event.altKey ? 0.98 : 0.9;
      const factorUp = event.shiftKey ? 1.25 : event.altKey ? 1.02 : 1.1;
      host.scaleSelection(down ? factorDown : factorUp);
    }
  }

  private rotate(event: KeyboardEvent): void {
    const host = this.host;
    const down = event.code === 'Semicolon' || event.key === ';';
    // Live drawing takes precedence over idle selection rotation.
    if (this.runLive(event)) return;
    if (host.selectedItems().length > 0) {
      // Shift = 45°, Alt = 5°, otherwise 10°.
      const step = event.shiftKey ? 45 : event.altKey ? 5 : 10;
      host.rotateSelection(down ? -step : step);
    }
  }

  private clearSelection(): void {
    const items = this.host.selectedItems();
    for (let i = 0; i < items.length; i++) items[i].selected = false;
    this.host.setSelectedItems([]);
    this.host.setIsInDragLock(false);
  }

  private bumpStroke(dir: -1 | 1): void {
    const host = this.host;
    if (dir < 0) host.thinStrokeWidth();
    else host.thickenStrokeWidth();
    if (host.selectedItems().length > 0) {
      for (let i = 0; i < host.selectedItems().length; i++) {
        const item = host.selectedItems()[i];
        if (item.strokeWidth !== undefined) {
          item.strokeWidth =
            dir < 0
              ? Math.max(1, item.strokeWidth - 1)
              : Math.min(host.maxStrokeWidth(), item.strokeWidth + 1);
        }
      }
    }
  }

  private finishDrawing(event: KeyboardEvent): void {
    const host = this.host;
    const key = event.key.toLowerCase();
    if (!(host.isDrawingPath() || host.isDrawingShape() || host.isDrawingQuad())) {
      return;
    }
    if (key !== 'r' && key !== 'e' && key !== 's' && key !== 'a') return;
    // In Radial Stamp, END and Complete Shape both deposit the live
    // shape and finish the stamping session.
    if (host.shapeType() === 'circle_radial_stamp') host.finishRadialStamp();
    else if (key === 'r' && host.isDrawingPath()) host.completeShapeWithSpline();
    else host.endPathOrShape();
  }

  private selectUnderCursor(event: KeyboardEvent): void {
    // Native tab order wins inside panel fields; everywhere else Tab
    // selects under the cursor and must not leave the page for the Omnibox.
    const target = event.target as HTMLElement | null;
    const inField =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'BUTTON');
    if (!inField) {
      event.preventDefault();
      this.host.hitTestUnderCursor();
    }
  }

  private runLive(event: KeyboardEvent): boolean {
    if (!this.host.isLiveDrawing()) return false;
    for (const binding of this.liveKeyBindings) {
      if (binding.match(event) && binding.applies()) {
        binding.apply(event);
        return true;
      }
    }
    return false;
  }

  private registerBuiltIns(): void {
    const down = commandById('scale-down');
    const up = commandById('scale-up');
    const ccw = commandById('rotate-ccw');
    const cw = commandById('rotate-cw');
    const lock = commandById('radial-lock');
    if (!down || !up || !ccw || !cw || !lock) return;
    this.register({
      id: 'live-scale-down',
      keys: [down.keycap],
      label: 'scale',
      match: down.match,
      applies: () => this.host.liveAdjustApplies(),
      apply: (event) => this.host.applyLiveScale(event, -1),
    });
    this.register({
      id: 'live-scale-up',
      keys: [up.keycap],
      label: 'scale',
      match: up.match,
      applies: () => this.host.liveAdjustApplies(),
      apply: (event) => this.host.applyLiveScale(event, 1),
    });
    this.register({
      id: 'live-rotate-down',
      keys: [ccw.keycap],
      label: 'rotate',
      match: ccw.match,
      applies: () => this.host.liveAdjustApplies(),
      apply: (event) => this.host.applyLiveRotate(event, -1),
    });
    this.register({
      id: 'live-rotate-up',
      keys: [cw.keycap],
      label: 'rotate',
      match: cw.match,
      applies: () => this.host.liveAdjustApplies(),
      apply: (event) => this.host.applyLiveRotate(event, 1),
    });
    this.register({
      id: 'radial-stamp-radius-lock',
      keys: [lock.keycap],
      label: 'lock/unlock radius',
      match: lock.match,
      applies: () =>
        this.host.isDrawingShape() && this.host.shapeType() === 'circle_radial_stamp',
      apply: () => this.host.toggleRadialStampRadiusLock(),
    });
  }
}
