# 🚀 CRM Frontend

## Разработка

```bash
# Установка зависимостей
npm install

# Запуск dev сервера (с hot-reload)
npm run dev

# Открыть в браузере
http://localhost:5173
```

## Сборка для продакшена

```bash
# Сборка
npm run build

# Preview собранной версии
npm run preview
```

## ⚠️ Важно!

### Для разработки:
- **НЕ открывайте** `dist/index.html` напрямую в браузере
- **ИСПОЛЬЗУЙТЕ** `npm run dev` и открывайте `http://localhost:5173`
- Только через dev сервер работает proxy к backend API (`http://localhost:3001`)

### Логин:
- Email: `admin@example.com`
- Пароль: `admin`

## Структура API

- Dev: `http://localhost:5173/api` → проксируется на `http://localhost:3001/api`
- Prod (Vercel + Railway): задайте `VITE_API_URL=https://<railway-backend-domain>/api`

## Переменные окружения

`.env.development`:
```env
VITE_API_URL=http://localhost:3001/api
```

`.env.production`:
```env
VITE_API_URL=https://<railway-backend-domain>/api
```

## 🚀 Деплой на Vercel (frontend)

- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_URL=https://<railway-backend-domain>/api`

В проекте уже добавлен `frontend/vercel.json` с rewrite на `index.html`, чтобы работал `react-router` при прямом открытии deep-link’ов.

## Backend

Backend должен быть запущен на порту **3001**:

```bash
cd ../backend
npm start
```

Проверка: `http://localhost:3001/health` → должен вернуть `{"status":"OK"}`




