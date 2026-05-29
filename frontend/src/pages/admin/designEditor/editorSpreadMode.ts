/**
 * Разворот на канвасе (две страницы рядом) на узком экране не показываем:
 * layout и hit-test ломаются, а постраничный режим покрывает мобильный сценарий.
 * Флаг spread_mode в draft/шаблоне при этом не сбрасываем — на десктопе развороты остаются.
 */
export function isEditorSpreadModeActive(spreadMode: boolean, isMobileViewport: boolean): boolean {
  return spreadMode && !isMobileViewport;
}
