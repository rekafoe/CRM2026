/**
 * Публичный HTTPS-URL страницы Mini App (для кнопки web_app в боте).
 * Пример: https://api.your-domain.com/miniapp
 */
export function getMiniappWebAppUrl(): string | null {
  const raw = (process.env.MINIAPP_WEBAPP_URL || '').trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}
