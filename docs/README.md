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

### Интеграция клиентского редактора на сайт

- **[client-editor-site-integration.md](./client-editor-site-integration.md)** — единый гайд: архитектура, встраивание React, BFF-прокси, API, корзина и checkout
- **[souvenir-3d-editor.md](./souvenir-3d-editor.md)** — сувенирный 3D-редактор (майка/кружка): Fabric + R3F, зоны печати, production без 3D

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
- [🎨 Галерея дизайнов на сайте](./site-design-gallery-integration.md) - 4 экрана, `productId`/`typeId`/`sizeId`, public API
- [📐 Каталог шаблонов CRM](./design-templates-catalog.md) - автор, плата в бел. руб., привязки к размерам, `design_author` в ЗП
- [💬 Воронка чатов + безопасность](./inbox-funnel-and-security-plan.md) - единый inbox (TG/Viber/Inst/сайт), стратегия каналов, security hotfix; в админке `/adminpanel/inbox-plan`

## 🛠️ Технологии

- **Backend:** Node.js, Express, TypeScript, SQLite
- **Frontend:** React, TypeScript, Vite
- **Bot:** Telegram Bot API
- **Image Processing:** Sharp
- **PDF Generation:** Puppeteer