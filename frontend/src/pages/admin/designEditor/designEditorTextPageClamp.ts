import type { TextLikeObject } from './textStyleRuns';

/** Раньше ограничивал ширину у края страницы — отключено, ширину не меняем автоматически. */
export function resolveDesignedTextboxAbsoluteMaxWidth(_obj: TextLikeObject): number | undefined {
  return undefined;
}

/** @deprecated Ширину больше не сужаем автоматически — только предупреждение на канвасе и в preflight. */
export function clampDesignedTemplateTextToPageBounds(
  _obj: TextLikeObject,
  _pageWidthPx: number,
  _pageHeightPx: number,
): boolean {
  return false;
}
