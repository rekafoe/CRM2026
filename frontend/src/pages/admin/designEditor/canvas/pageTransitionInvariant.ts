export interface PageLoadKeyTransitionResult {
  displayedKey: string;
  canvasInstance: number;
  activePageIndex: number;
  objectCountBeforeFlush: number;
  objectCountAfterLoad: number;
}

export function assertPageTransitionDisplayed(input: {
  result: PageLoadKeyTransitionResult;
  targetKey: string;
  requestedKey: string;
  displayedKey: string | null;
  loadedCanvasInstance: number;
  expectedCanvasInstance: number;
}): void {
  const {
    result,
    targetKey,
    requestedKey,
    displayedKey,
    loadedCanvasInstance,
    expectedCanvasInstance,
  } = input;
  if (
    result.displayedKey !== targetKey
    || displayedKey !== targetKey
    || loadedCanvasInstance !== expectedCanvasInstance
  ) {
    throw new Error(`Page transition did not display requested key: ${targetKey}`);
  }
  if (!Number.isInteger(result.activePageIndex) || result.activePageIndex < 0) {
    throw new Error(`Page transition has invalid active page index: ${String(result.activePageIndex)}`);
  }
  if (result.objectCountBeforeFlush < 0 || result.objectCountAfterLoad < 0) {
    throw new Error('Page transition has invalid object count metrics.');
  }
  if (requestedKey !== targetKey) {
    throw new Error(`Page transition invariant mismatch: requested=${requestedKey}, target=${targetKey}`);
  }
}
