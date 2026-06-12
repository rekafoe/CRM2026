export interface PageLoadKeyTransitionResult {
  displayedKey: string;
  canvasInstance: number;
}

export function assertPageTransitionDisplayed(input: {
  result: PageLoadKeyTransitionResult;
  targetKey: string;
  displayedKey: string | null;
  loadedCanvasInstance: number;
  expectedCanvasInstance: number;
}): void {
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
    throw new Error(`Page transition did not display requested key: ${targetKey}`);
  }
}
