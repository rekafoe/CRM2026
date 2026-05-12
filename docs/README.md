# 🏢 CRM System - Полиграфия

Современная CRM система для управления заказами полиграфической компании.

## 📁 Структура проекта

```
CRM/
├── backend/          # Backend API (Node.js + Express + SQLite)
├── frontend/         # Frontend приложение (React + TypeScript)
├── shared/           # Общие типы и интерфейсы
└── docs/            # Документация по сервисам
```

## 🚀 Быстрый старт

### Локальная разработка

1. **Backend:**
```bash
cd backend
npm install
npm run dev  # Запуск на порту 3001
```

2. **Frontend:**
```bash
cd frontend
npm install
npm run dev  # Запуск на порту 5173
```

## 📚 Документация по сервисам

- [📋 Order Management](./order-management.md) - Управление заказами
- [🤖 Telegram Bot](./telegram-bot.md) - Telegram бот для заказов
- [🧮 Calculator](./calculator.md) - Калькулятор печати
- [💰 Ценообразование](./pricing-architecture.md) - Канон: simplified + `/api/pricing/calculate`
- [📐 Раскладка и дозаливка](./dynamic-layout-bleed.md) - Лист материала, `bleed_mm`, произвольный trim
- [📄 Многостраничные продукты](./multipage-products-review.md) - Политика `multi_page` vs legacy multipage
- [🗂️ S3-файлы заказов](./s3-order-files-integration.md) - Тяжёлые файлы сайта, external artifacts, signed URL и аудит скачиваний
- [📦 Materials](./materials.md) - Управление материалами
- [📊 Reports](./reports.md) - Отчеты и аналитика
- [👥 Users](./users.md) - Пользователи и роли

## 🛠️ Технологии

- **Backend:** Node.js, Express, TypeScript, SQLite
- **Frontend:** React, TypeScript, Vite
- **Bot:** Telegram Bot API
- **Image Processing:** Sharp
- **PDF Generation:** Puppeteer

## 📞 Поддержка

При возникновении проблем проверьте документацию по конкретному сервису или создайте Issue в GitHub.

