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
 * Отдельная модалка текста — только в in-app браузерах (Telegram и т.п.),
 * где скрытый textarea Fabric часто не работает.
 */
export function shouldPreferTextEditSheet(
  _editorMode?: DesignEditorInteractionMode,
): boolean {
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
