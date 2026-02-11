/**
 * Маркер «последний заказ с сайта» (printcore.by).
 * Обновляется при успешном создании заказа через POST /api/orders/from-website.
 * CRM опрашивает GET /api/orders/pool-sync и при изменении значения принудительно обновляет список в Order Pool.
 */
let lastWebsiteOrderAt = 0;

export function getLastWebsiteOrderAt(): number {
  return lastWebsiteOrderAt;
}

export function setLastWebsiteOrderAt(timestamp: number): void {
  lastWebsiteOrderAt = timestamp;
}
