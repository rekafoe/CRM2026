# 📋 Order Management - Управление заказами

Система управления заказами с поддержкой многопользовательской работы.

## 🎯 Основные функции

- Создание и редактирование заказов
- Управление статусами заказов
- Многопользовательская система
- Страницы заказов по датам
- Пул нераспределенных заказов

## 🏗️ Архитектура

### Backend
- **Контроллер:** `backend/src/controllers/orderManagementController.ts`
- **Сервис:** `backend/src/services/orderManagementService.ts`
- **Модели:** `backend/src/models/userOrderPage.ts`
- **Роуты:** `backend/src/routes/orderManagement.ts`

### Frontend
- **Компоненты:**
  - `frontend/src/components/orders/OrderPool.tsx` - Пул заказов
  - `frontend/src/components/orders/UserOrderPage.tsx` - Страница заказов
  - `frontend/src/pages/OrderManagementPage.tsx` - Главная страница
- **Кнопки в интерфейсе:**
  - 📋 Пул заказов (синяя кнопка)
  - 📄 Мои заказы (зеленая кнопка)

## 📊 База данных

### Таблицы
- `user_order_pages` - Страницы заказов пользователей
- `user_order_page_orders` - Связь заказов со страницами
- `photo_orders` - Заказы фотографий из Telegram

### Схема
```sql
-- Страницы заказов пользователей
CREATE TABLE user_order_pages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  status TEXT DEFAULT 'active',
  total_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  total_revenue INTEGER DEFAULT 0
);

-- Связь заказов со страницами
CREATE TABLE user_order_page_orders (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  order_type TEXT NOT NULL, -- 'website', 'telegram', 'manual'
  status TEXT DEFAULT 'pending',
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 API Endpoints

### Отмена vs удаление (orders)
- `POST /api/orders/:id/cancel-online` — мягкая отмена (`is_cancelled`), доступна любому авторизованному пользователю CRM с доступом к заказам (единый поток для сайта / Telegram / Mini App / CRM).
- `DELETE /api/orders/:id` — физическое удаление записи: только **admin**, только если заказ уже отменён (`is_cancelled = 1`).

### Order Management
- `GET /api/order-management/pool` - Получить пул заказов
- `POST /api/order-management/assign` - Назначить заказ пользователю
- `POST /api/order-management/complete` - Завершить заказ
- `GET /api/order-management/:orderId/:orderType` - Детали заказа

### User Order Pages
- `GET /api/order-management/pages/user/:userId` - Страница пользователя
- `GET /api/order-management/pages/all` - Все страницы (админ)
- `POST /api/order-management/pages/create` - Создать страницу

## 🎨 Интерфейс

### Кнопки в топбаре
- **📋 Пул заказов** - Просмотр нераспределенных заказов
- **📄 Мои заказы** - Личная страница заказов

### Модальные окна
- Открываются поверх основного интерфейса
- Кнопка закрытия (красная ×)
- Адаптивный дизайн

## 🚧 Статус разработки

- ✅ Базовая структура создана
- ✅ Кнопки в интерфейсе работают
- ✅ Модальные окна открываются
- ✅ OrderPool компонент (готов)
- 🔄 UserOrderPage компонент (в разработке)

## Тиражная скидка на уровне заказа

Для simplified-продуктов с `productId` в `params` цены позиций **пересчитываются автоматически** при добавлении без явного `totalCost`, при изменении (params/quantity) и удалении позиции, а также при создании заказа с сайта (`POST /api/orders/from-website`).

Если позиция добавлена из калькулятора с полем **`totalCost`** (и в `params` — `storedTotalCost`, `priceLockedByCalculator`), tier-пересчёт **не перезаписывает** итог (иначе подытог мог бы стать `price×qty` без скидки, например 110,50 вместо 92,95).

**Группировка:** одинаковые `material_id` + `print_technology` + `print_color_mode` + `print_sides_mode` (без `priceType`).

**Объём tier:** сумма физических листов (`sheetsNeeded`) по группе. Ставка tier одна на группу; стоимость каждой позиции — по её листам.

**`priceType`** (`online`, `urgent`, …) применяется **после** tier отдельно на каждую строку (в `SimplifiedPricingService`).

**API CRM:**
- `GET /api/orders/:id/pricing-groups` — сводка групп для подсказки в калькуляторе
- `POST /api/orders/:id/recalculate-prices` — ручной пересчёт

**Корзина сайта:** `POST /api/pricing/quote-cart` (ключ `WEBSITE_ORDER_API_KEY`) — см. [website-orders-integration.md](./website-orders-integration.md).

Код: `pricingGroupService.ts`, `orderPricingService.ts`.

## Суммы заказа (источник истины — бэкенд)

Расчёт в [`backend/src/utils/orderAmounts.ts`](../backend/src/utils/orderAmounts.ts):

| Поле | Смысл |
|------|--------|
| `lineTotal` (позиция) | `params.storedTotalCost` ?? `price × quantity` (+ `serviceCost`) |
| `subtotal` | Σ `lineTotal` |
| `discountAmount` | `subtotal × discount_percent / 100` |
| `totalAmount` | `subtotal − discountAmount` |
| `debt` | `max(0, totalAmount − prepaymentAmount)` |

После загрузки позиций заказы обогащаются в `OrderService.attachItemsToOrders` и в ответе дневного отчёта (`GET /api/daily-reports/...`).

**Фронт CRM** только отображает поля с API (`getOrderAmounts` в `frontend/src/utils/orderTotal.ts`), не пересчитывает позиции.

Скидка и синхронизация предоплаты (offline) используют ту же утилиту, не `SUM(price * quantity)` в SQL.

**SQL-фрагменты** (отчёты, клиенты, пул назначений, фильтр по сумме): [`orderAmountsSql.ts`](../backend/src/utils/orderAmountsSql.ts) — `json_extract(params, '$.storedTotalCost')` с fallback на `price×qty`.

Также переведены: `POST /api/orders/:id/issue`, экспорт CSV, `customerService` (последний заказ), `orderManagementService`, аналитика `reports`, `orderRepository` (фильтр по сумме).

## 📝 TODO

1. ✅ Реализовать OrderPool компонент
2. Реализовать UserOrderPage компонент
3. Добавить фильтрацию и поиск
4. Реализовать перемещение заказов между датами
5. Добавить статистику и аналитику

