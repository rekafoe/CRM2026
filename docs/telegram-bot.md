# Telegram Bot

Telegram-бот для простого доступа к статусам активных заказов и входа в PrintCore App.

## Основные функции

- показать активные незавершённые заказы пользователя;
- открыть PrintCore App для нового заказа;
- дать максимально простой вход без дополнительных команд и меню.

## 🏗️ Архитектура

### Backend
- **Контроллер:** `backend/src/controllers/telegramWebhookController.ts`
- **Сервисы:**
  - `backend/src/services/telegramService.ts` - Основной сервис
  - `backend/src/services/telegramBotCommands.ts` - Команды бота
  - `backend/src/services/telegramOrderStatusService.ts` - Сводка по активным заказам
- **Роуты (актуально):** `backend/src/routes/notifications.ts` — вебхук: `POST /api/notifications/telegram/webhook`

### Источник данных

Бот читает активные заказы из таблицы `orders`:

- сначала по `orders.telegram_chat_id = chat_id пользователя`;
- затем, если в `telegram_users` заполнен `crm_customer_id`, добирает заказы по `orders.customer_id`;
- дубли исключаются по `orders.id`;
- завершённые, отменённые и draft-заказы PrintCore App не показываются.

## 📱 Команды бота

### Основные команды
- `/start` - Приветствие и инструкции
- `/help` - Показать доступные команды
- `/miniapp` - Открыть PrintCore App
- `/orders` - Активные заказы
- `/track <id или номер>` - Статус заказа и ссылка `…/miniapp?order=<id>`
- `/pay <id или номер>` - Ссылка BePaid, существующая или вновь созданная с сохранением в заказе
- `/reorder <id или номер>` - Корзина с параметрами исходного заказа `…/miniapp?repeat=<id>`
- `/support` - Диалог с оператором в чатах CRM
- `/pickup` - Адреса точек самовывоза

### Поведение

- `/start` и `/help` показывают короткое приветствие и список активных заказов, если они есть.
- `/orders` дополнительно выводит web_app кнопки для открытия каждого заказа.
- `/track`, `/pay` и `/reorder` ищут заказ только по `orders.telegram_chat_id`; чужой заказ возвращает общий ответ «не найден» без раскрытия данных.
- `/pay` переиспользует валидный `paymentUrl` либо вызывает существующий `createBePaidCheckout` и сохраняет `paymentUrl`, `paymentId`, сумму и статус `pending`.
- `/reorder` создаёт новую корзину с новым checkout и не изменяет исходный заказ.
- Любой произвольный текст также приводит к показу активных заказов; если их нет, бот предлагает использовать `/miniapp`.
- Основные ответы бота отправляются с клавиатурой действий: показать заказы, открыть PrintCore App, открыть `/help`.
- `/miniapp` отправляет кнопку `web_app` для открытия PrintCore App.
- Старые inline-кнопки и media-flow больше не используются: бот отвечает, что сценарий перенесён в PrintCore App.

## Статусы заказов

- Человекочитаемое имя статуса берётся из `order_statuses.name`.
- Бот показывает только активные незавершённые заказы.
- Для новых заказов пользователь всегда уходит в `/miniapp` / PrintCore App.

## 🔧 Настройка

### Переменные окружения
```bash
TELEGRAM_BOT_TOKEN=your_bot_token
# Публичный HTTPS URL для getUpdates/setWebhook (документация/админка), сам приём:
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/notifications/telegram/webhook
# Опционально: тот же секрет, что передаётся в setWebhook (заголовок X-Telegram-Bot-Api-Secret-Token)
# TELEGRAM_WEBHOOK_SECRET=...
```

### Webhook
- **URL:** `https://<домен>/api/notifications/telegram/webhook`
- **Метод:** POST
- **Авторизация:** публичный маршрут (Telegram не шлёт Bearer). Опционально `TELEGRAM_WEBHOOK_SECRET` + заголовок от Telegram
- **Обработка:** `TelegramWebhookController.handleWebhook` в `backend/src/controllers/telegramWebhookController.ts`

**Polling и вебхук** не используйте вместе: при активном вебхуке getUpdates (polling) пустой. В проде с вебхуком задайте `TELEGRAM_USE_WEBHOOK=true` — в процессе бэкенда не стартует long polling, только `POST /api/notifications/telegram/webhook`. Для снятия вебхука: `POST /api/notifications/telegram/webhook/set` с телом `{ "removeWebhook": true }` (с авторизацией админа) или `deleteWebhook` через Telegram API

## Текущее состояние

- Бот открывает PrintCore App, показывает заказы, статусы, ссылки BePaid и повтор заказа, передаёт диалог в поддержку и показывает самовывоз.
- Основной пользовательский сценарий оформления перенесён в PrintCore App.
- Webhook вызывает методы напрямую через `TelegramWebhookController`, без зависимости от Express `this`.

