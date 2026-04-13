export interface UndoEntry {
  layerId: number;
  imageData: ImageData;
}

export class UndoManager {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private memoryBudget: number;
  private onStateChange: () => void;

  constructor(memoryBudgetMB = 300, onStateChange: () => void = () => {}) {
    this.memoryBudget = memoryBudgetMB * 1024 * 1024;
    this.onStateChange = onStateChange;
  }

  /**
   * Push a new user action (stroke, clear) onto the undo stack.
   * Clears the redo stack (new action invalidates redo history).
   */
  pushAction(entry: UndoEntry): void {
    this.redoStack = [];
    this.undoStack.push(entry);
    this.trimMemory();
    this.onStateChange();
  }

  popUndo(): UndoEntry | null {
    return this.undoStack.pop() ?? null;
  }

  popRedo(): UndoEntry | null {
    return this.redoStack.pop() ?? null;
  }

  pushToRedo(entry: UndoEntry): void {
    this.redoStack.push(entry);
    this.onStateChange();
  }

  /** Push to undo stack without clearing redo (used during redo operation). */
  pushToUndo(entry: UndoEntry): void {
    this.undoStack.push(entry);
    this.onStateChange();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onStateChange();
  }

  private trimMemory(): void {
    let total = this.totalMemory();
    while (total > this.memoryBudget && this.undoStack.length > 1) {
      const removed = this.undoStack.shift()!;
      total -= removed.imageData.data.byteLength;
    }
  }

  private totalMemory(): number {
    let total = 0;
    for (const e of this.undoStack) total += e.imageData.data.byteLength;
    for (const e of this.redoStack) total += e.imageData.data.byteLength;
    return total;
  }
}
