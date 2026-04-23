# 🤖 Telegram Bot - Заказы через мессенджер

Telegram бот для приема заказов фотографий и управления заказами.

## 🎯 Основные функции

- Заказ фотографий с выбором размера
- Обработка изображений (кроп, вписать с полями)
- Отслеживание статуса заказов
- Проверка остатков материалов
- Генерация PDF отчетов

## 🏗️ Архитектура

### Backend
- **Контроллер:** `backend/src/controllers/telegramWebhookController.ts`
- **Сервисы:**
  - `backend/src/services/telegramService.ts` - Основной сервис
  - `backend/src/services/telegramBotCommands.ts` - Команды бота
  - `backend/src/services/photoOrderService.ts` - Заказы фотографий
  - `backend/src/services/imageProcessingService.ts` - Обработка изображений
- **Роуты (актуально):** `backend/src/routes/notifications.ts` — вебхук: `POST /api/notifications/telegram/webhook`

### База данных
- **Таблица:** `photo_orders` - Заказы фотографий
- **Схема:**
```sql
CREATE TABLE photo_orders (
  id INTEGER PRIMARY KEY,
  chat_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  original_photos TEXT[], -- JSON массив
  selected_size JSON,     -- JSON объект
  processing_options JSON,
  quantity INTEGER DEFAULT 1,
  total_price INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 📱 Команды бота

### Основные команды
- `/start` - Приветствие и инструкции
- `/order_photo` - Заказ фотографий
- `/my_orders` - Мои заказы
- `/stock` - Проверка остатков
- `/stock_pdf` - PDF отчет по остаткам

### Процесс заказа фотографий
1. **Выбор размера** - Интерактивные кнопки
2. **Выбор режима обработки** - Кроп, вписать с полями, умный кроп
3. **Выбор количества** - Кнопки 1-10 копий
4. **Загрузка фотографий** - Поддержка изображений
5. **Подтверждение заказа** - Финальная проверка

## 🖼️ Обработка изображений

### Размеры фотографий
- 9x13 см
- 10x15 см
- 13x18 см
- 15x21 см
- 21x29.7 см (A4)

### Режимы обработки
- **Кроп** - Обрезка под размер без полей
- **Вписать с полями** - Масштабирование с белыми полями
- **Умный кроп** - ИИ для сохранения важных элементов

### Технологии
- **Sharp** - Обработка изображений
- **Multer** - Загрузка файлов
- **Telegram Bot API** - Отправка файлов

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

## 📊 Статусы заказов

- `pending` - Ожидает обработки
- `processing` - В процессе обработки
- `completed` - Завершен
- `cancelled` - Отменен

## 🚧 Статус разработки

- ✅ Базовая структура бота
- ✅ Команды и обработка сообщений
- ✅ Интерактивные клавиатуры
- ✅ Загрузка и обработка фотографий
- ✅ Создание заказов в базе данных
- 🔄 Обработка изображений (в разработке)
- 🔄 ИИ для умного кропа (планируется)

## 📝 TODO

1. Завершить обработку изображений
2. Реализовать ИИ для умного кропа
3. Добавить уведомления о статусе
4. Улучшить интерфейс команд
5. Добавить поддержку документов

