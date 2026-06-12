import { describe, expect, it } from '@jest/globals';
import { assertPageTransitionDisplayed } from '../../frontend/src/pages/admin/designEditor/canvas/pageTransitionInvariant';

describe('page transition displayed invariant', () => {
  it('accepts a transition only when requested key is actually displayed on the same canvas instance', () => {
    expect(() => assertPageTransitionDisplayed({
      result: { displayedKey: 'single-2', canvasInstance: 7 },
      targetKey: 'single-2',
      displayedKey: 'single-2',
      loadedCanvasInstance: 7,
      expectedCanvasInstance: 7,
    })).not.toThrow();
  });

  it('rejects a transition that finished without displaying the requested key', () => {
    expect(() => assertPageTransitionDisplayed({
      result: { displayedKey: 'single-1', canvasInstance: 7 },
      targetKey: 'single-2',
      displayedKey: 'single-1',
      loadedCanvasInstance: 7,
      expectedCanvasInstance: 7,
    })).toThrow('single-2');
  });

  it('rejects a transition loaded into a stale canvas instance', () => {
    expect(() => assertPageTransitionDisplayed({
      result: { displayedKey: 'single-2', canvasInstance: 6 },
      targetKey: 'single-2',
      displayedKey: 'single-2',
      loadedCanvasInstance: 6,
      expectedCanvasInstance: 7,
    })).toThrow('single-2');
  });
});
