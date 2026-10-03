// Browser and Paper.js event registration.
//
// Owns: the listener set for one canvas, and the function that removes it.
// May read: the Paper view and the canvas element passed to attach().
// May mutate: view mouse handlers, and document/window/canvas listeners.
//   Also focuses the canvas on move and click so keys reach the document
//   handler. Does not change drawing, selection, or history.
// Public methods: attach(), detach().
// Events: each InputCallbacks method, in registration order. Two document
//   keydown listeners run in order: onKeyDown, then onKeyHighlight.
// Tests: attach then detach must leave no listeners and must clear the
//   view mouse handlers. Callbacks must receive the original event.
//   Shortcut meaning stays on the engine; see refs/engine-smoke-checklist.md
//   (keyboard, pan, zoom, drop, print).

export interface InputCallbacks {
  onMouseDown: (event: paper.MouseEvent) => void;
  onMouseMove: (event: paper.MouseEvent) => void;
  onMouseDrag: (event: paper.MouseEvent) => void;
  onMouseUp: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onKeyHighlight: (event: KeyboardEvent) => void;
  onKeyUp: (event: KeyboardEvent) => void;
  onInputReset: () => void;
  onDrop: (event: DragEvent) => void;
  onWheel: (event: WheelEvent) => void;
  onDocumentMouseUp: () => void;
  onBeforePrint: () => void;
  onAfterPrint: () => void;
}

export class InputManager {
  private cleanup: (() => void) | null = null;

  attach(
    scope: paper.PaperScope,
    canvas: HTMLCanvasElement,
    handlers: InputCallbacks,
  ): void {
    this.detach();
    const view = scope.view;

    view.onMouseDown = (event: paper.MouseEvent) => handlers.onMouseDown(event);
    view.onMouseMove = (event: paper.MouseEvent) => handlers.onMouseMove(event);
    view.onMouseDrag = (event: paper.MouseEvent) => handlers.onMouseDrag(event);
    view.onMouseUp = () => handlers.onMouseUp();

    const onKeyDown = (event: KeyboardEvent) => handlers.onKeyDown(event);
    const onKeyHighlight = (event: KeyboardEvent) =>
      handlers.onKeyHighlight(event);
    const onKeyUp = (event: KeyboardEvent) => handlers.onKeyUp(event);
    const onVisibilityChange = () => handlers.onInputReset();
    window.addEventListener('blur', handlers.onInputReset);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const onCanvasMove = () => {
      if (document.activeElement !== canvas) canvas.focus();
    };
    const onCanvasClick = () => {
      canvas.focus();
    };
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => handlers.onDrop(event);
    const onWheel = (event: WheelEvent) => handlers.onWheel(event);
    const onDocumentMouseUp = () => handlers.onDocumentMouseUp();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onKeyHighlight);
    document.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onCanvasMove);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('mouseup', onDocumentMouseUp);
    window.addEventListener('beforeprint', handlers.onBeforePrint);
    window.addEventListener('afterprint', handlers.onAfterPrint);

    this.cleanup = () => {
      window.removeEventListener('blur', handlers.onInputReset);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      handlers.onInputReset();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keydown', onKeyHighlight);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mouseup', onDocumentMouseUp);
      window.removeEventListener('beforeprint', handlers.onBeforePrint);
      window.removeEventListener('afterprint', handlers.onAfterPrint);
      canvas.removeEventListener('mousemove', onCanvasMove);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('drop', onDrop);
      canvas.removeEventListener('wheel', onWheel);
      view.onMouseDown = null;
      view.onMouseMove = null;
      view.onMouseDrag = null;
      view.onMouseUp = null;
    };
  }

  detach(): void {
    const cleanup = this.cleanup;
    this.cleanup = null;
    if (cleanup) cleanup();
  }
}
