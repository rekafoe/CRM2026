/** In-app браузеры (Telegram, Instagram и т.д.) часто блокируют programmatic input.click() и скрытый textarea Fabric. */
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
