# Mini App (Telegram MAP)

Публичная витрина: `GET /miniapp` — HTML + inline-скрипт (см. `backend/src/utils/miniappIndexHtml.ts`).

## Сессия и заказы

- `POST /api/miniapp/auth` — `initData` от Telegram, ответ: JWT.
- `GET /api/miniapp/me` — профиль.
- `POST /api/miniapp/checkout` — тело JSON: `{ customer, order: { items, order_notes? } }`.  
  `order.items[]`: `type` (как на сайте, часто id продукта), `params` (объект), `price`, `quantity`, `priceType` (например `standard`).  
  Ответ `201`: в теле `itemIds: number[]` — id строк `items` **в том же порядке**, что и `order.items` (для привязки макетов).

## Параметры позиции для CRM

В `items.params` в Mini App рекомендуется передавать:

- `productName` — отображаемое имя;
- `description` — одна строка для списков;
- `parameterSummary` — `Array<{ label: string, value: string }>` (чипы в карточке позиции в CRM);
- `source: 'miniapp'`;
- для калькулятора: `calculator: true`, `configuration` — payload расчёта.

См. также [website-orders-integration.md](./website-orders-integration.md) (аналогия с заказом с сайта).

## Загрузка макетов при оформлении (к позициям)

После **успешного** `POST /api/miniapp/checkout` клиент сопоставляет файлы с позициями по **индексу** (`itemIds[i]` ↔ `i`-я строка корзины) и последовательно вызывает:

- `POST /api/miniapp/orders/:orderId/files` — `multipart/form-data`: поле `file`, при необходимости **`orderItemId`** (id из `itemIds` для этой позиции; не передавать = файл «на весь заказ»).

Ограничения: до 25 МБ на файл (и общие `UPLOAD_*` в окружении). В форме оформления в MAP — **отдельный файл на каждую позицию**; в калькуляторе можно выбрать макет до «В корзину». Дозагрузка в карточке заказа — по-прежнему `POST` с привязкой к позиции.
