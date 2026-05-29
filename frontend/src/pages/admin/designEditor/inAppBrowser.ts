/** In-app браузеры (Telegram, Instagram и т.д.) часто блокируют programmatic input.click() и скрытый textarea Fabric. */
export function isCoarsePointerEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 760px)').matches
  );
}

export type DesignEditorInteractionMode = 'basic' | 'advanced';

/**
 * Bottom-sheet с текстом — in-app браузеры (Telegram и т.п.), где Fabric textarea ненадёжен.
 * На обычном мобильном Safari/Chrome правка идёт через поле в text-mobile-toolbar.
 */
export function shouldPreferTextEditSheet(
  editorMode?: DesignEditorInteractionMode,
): boolean {
  if (editorMode === 'advanced') return isRestrictiveInAppBrowser();
  return isRestrictiveInAppBrowser();
}

export function isRestrictiveInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /Telegram/i.test(ua)
    || /Instagram/i.test(ua)
    || /FBAN|FBAV/i.test(ua)
    || /Line\//i.test(ua)
    || /MicroMessenger/i.test(ua)
    || /TikTok/i.test(ua)
  );
}
