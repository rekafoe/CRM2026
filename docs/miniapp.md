# Mini App (Telegram MAP)

Публичная витрина: `GET /miniapp` — HTML + inline-скрипт (см. `backend/src/utils/miniappIndexHtml.ts`).

## Сессия и заказы

- `POST /api/miniapp/auth` — `initData` от Telegram, ответ: JWT.
- `GET /api/miniapp/me` — профиль.
- `POST /api/miniapp/checkout` — тело JSON: `{ customer, order: { items, order_notes? } }`.  
  `order.items[]`: `type` (как на сайте, часто id продукта), `params` (объект), `price`, `quantity`, `priceType` (например `standard`).

## Параметры позиции для CRM

В `items.params` в Mini App рекомендуется передавать:

- `productName` — отображаемое имя;
- `description` — одна строка для списков;
- `parameterSummary` — `Array<{ label: string, value: string }>` (чипы в карточке позиции в CRM);
- `source: 'miniapp'`;
- для калькулятора: `calculator: true`, `configuration` — payload расчёта.

См. также [website-orders-integration.md](./website-orders-integration.md) (аналогия с заказом с сайта).

## Многофайловая загрузка при оформлении

После **успешного** `POST /api/miniapp/checkout` клиент последовательно вызывает существующий эндпоинт:

- `POST /api/miniapp/orders/:orderId/files` — `multipart/form-data`, поле `file` (один файл на запрос).

Ограничения как у общего upload (по умолчанию: до 20 файлов, до 25 МБ на файл — см. `UPLOAD_MAX_*` / `UPLOAD_MAX_FILE_SIZE_BYTES` в окружении). Заказ создаётся **до** загрузок; при ошибке части файлов заказ остаётся, пользователю показывается предупреждение с номером заказа; дозагрузка возможна в карточке заказа в MAP (`GET /api/miniapp/orders/:id` + `POST` файлов).
