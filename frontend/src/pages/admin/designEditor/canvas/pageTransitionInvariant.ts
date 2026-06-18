export interface PageLoadKeyTransitionResult {
  displayedKey: string;
  canvasInstance: number;
  activePageIndex: number;
  objectCountBeforeFlush: number;
  objectCountAfterLoad: number;
}

export function getPageTransitionInvariantError(input: {
  result: PageLoadKeyTransitionResult;
  targetKey: string;
  requestedKey: string;
  displayedKey: string | null;
  loadedCanvasInstance: number;
  expectedCanvasInstance: number;
}): string | null {
  const {
    result,
    targetKey,
    displayedKey,
    loadedCanvasInstance,
    expectedCanvasInstance,
  } = input;
  if (
    result.displayedKey !== targetKey
    || displayedKey !== targetKey
    || loadedCanvasInstance !== expectedCanvasInstance
  ) {
    return `Page transition did not display requested key: ${targetKey}`;
  }
  if (!Number.isInteger(result.activePageIndex) || result.activePageIndex < 0) {
    return `Page transition has invalid active page index: ${String(result.activePageIndex)}`;
  }
  if (result.objectCountBeforeFlush < 0 || result.objectCountAfterLoad < 0) {
    return 'Page transition has invalid object count metrics.';
  }
  return null;
}

export function assertPageTransitionDisplayed(input: {
  result: PageLoadKeyTransitionResult;
  targetKey: string;
  requestedKey: string;
  displayedKey: string | null;
  loadedCanvasInstance: number;
  expectedCanvasInstance: number;
}): void {
  const error = getPageTransitionInvariantError(input);
  if (!error) return;
  throw new Error(error);
}
