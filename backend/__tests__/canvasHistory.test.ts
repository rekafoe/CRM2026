import { CanvasHistoryStack } from '../../frontend/src/pages/admin/designEditor/canvas/canvasHistory';

describe('CanvasHistoryStack', () => {
  it('push → undo twice → redo once', () => {
    const history = new CanvasHistoryStack(50);

    expect(history.flags()).toEqual({ canUndo: false, canRedo: false });

    history.push('{"a":1}');
    expect(history.flags()).toEqual({ canUndo: false, canRedo: false });

    history.push('{"a":2}');
    expect(history.flags()).toEqual({ canUndo: true, canRedo: false });

    history.push('{"a":3}');
    expect(history.moveUndo()).toBe('{"a":2}');
    expect(history.flags()).toEqual({ canUndo: true, canRedo: true });

    expect(history.moveUndo()).toBe('{"a":1}');
    expect(history.flags()).toEqual({ canUndo: false, canRedo: true });

    expect(history.moveRedo()).toBe('{"a":2}');
    expect(history.flags()).toEqual({ canUndo: true, canRedo: true });
  });

  it('respects limit and reset', () => {
    const history = new CanvasHistoryStack(2);
    history.push('1');
    history.push('2');
    history.push('3');
    expect(history.length).toBe(2);
    expect(history.moveUndo()).toBe('2');

    history.reset('{"fresh":true}');
    expect(history.flags()).toEqual({ canUndo: false, canRedo: false });
    expect(history.moveUndo()).toBeNull();
  });
});
