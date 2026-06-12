export type CanvasHistoryFlags = {
  canUndo: boolean;
  canRedo: boolean;
};

export class CanvasHistoryStack {
  private stack: string[] = [];

  private index = -1;

  constructor(private readonly limit = 50) {}

  get length(): number {
    return this.stack.length;
  }

  get currentIndex(): number {
    return this.index;
  }

  flags(): CanvasHistoryFlags {
    return {
      canUndo: this.index > 0,
      canRedo: this.index >= 0 && this.index < this.stack.length - 1,
    };
  }

  push(json: string): CanvasHistoryFlags {
    const newStack = this.stack.slice(0, this.index + 1);
    newStack.push(json);
    if (newStack.length > this.limit) newStack.shift();
    this.stack = newStack;
    this.index = newStack.length - 1;
    return this.flags();
  }

  peekUndoTarget(): string | null {
    if (this.index <= 0) return null;
    return this.stack[this.index - 1] ?? null;
  }

  peekRedoTarget(): string | null {
    if (this.index >= this.stack.length - 1) return null;
    return this.stack[this.index + 1] ?? null;
  }

  moveUndo(): string | null {
    const target = this.peekUndoTarget();
    if (target == null) return null;
    this.index -= 1;
    return target;
  }

  moveRedo(): string | null {
    const target = this.peekRedoTarget();
    if (target == null) return null;
    this.index += 1;
    return target;
  }

  reset(snapshot?: string): CanvasHistoryFlags {
    if (snapshot) {
      this.stack = [snapshot];
      this.index = 0;
    } else {
      this.stack = [];
      this.index = -1;
    }
    return this.flags();
  }
}
