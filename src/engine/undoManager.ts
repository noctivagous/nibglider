// Generic undo/redo command stack. Dependency-free so it can be unit
// tested without Paper.js; the engine builds scene-aware commands
// (deposit/delete/group/move) out of closures over live items.

export interface UndoCommand {
  label: string;
  undo(): void;
  redo(): void;
  /** Commands sharing a key within the window fold into one entry. */
  coalesceKey?: string;
  /** Fold `next` into this command; true when absorbed. */
  absorb?(next: UndoCommand): boolean;
}

export class UndoManager {
  private undoStack: UndoCommand[] = [];
  private redoStack: UndoCommand[] = [];
  private lastPushAt = 0;
  private maxDepth: number;
  private coalesceWindowMs: number;
  private onChange: () => void;

  constructor(
    maxDepth = 100,
    coalesceWindowMs = 800,
    onChange: () => void = () => {},
  ) {
    this.maxDepth = maxDepth;
    this.coalesceWindowMs = coalesceWindowMs;
    this.onChange = onChange;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undoLabel(): string | null {
    const top = this.undoStack[this.undoStack.length - 1];
    return top ? top.label : null;
  }

  redoLabel(): string | null {
    const top = this.redoStack[this.redoStack.length - 1];
    return top ? top.label : null;
  }

  /** Record an already-applied mutation. Clears the redo stack. */
  push(cmd: UndoCommand): void {
    const now = Date.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      cmd.coalesceKey !== undefined &&
      top !== undefined &&
      top.coalesceKey === cmd.coalesceKey &&
      now - this.lastPushAt < this.coalesceWindowMs &&
      typeof top.absorb === 'function' &&
      top.absorb(cmd)
    ) {
      this.redoStack = [];
      this.lastPushAt = now;
      this.onChange();
      return;
    }
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack = [];
    this.lastPushAt = now;
    this.onChange();
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.redo();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.onChange();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange();
  }
}
