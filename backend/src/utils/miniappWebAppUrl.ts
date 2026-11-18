/**
 * Публичный HTTPS-URL страницы Mini App (для кнопки web_app в боте).
 * Пример: https://api.your-domain.com/miniapp
 */
export function getMiniappWebAppUrl(): string | null {
  const raw = (process.env.MINIAPP_WEBAPP_URL || '').trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/** Кнопка заказа открывает миниапп сразу на этом заказе. */
export function withMiniappOrder(base: string, orderId: number): string | null {
  const raw = base.trim();
  if (!raw || !Number.isInteger(orderId) || orderId <= 0) return null;
  try {
    const url = new URL(raw);
    url.searchParams.set('order', String(orderId));
    return url.toString();
  } catch {
    return null;
  }
}
