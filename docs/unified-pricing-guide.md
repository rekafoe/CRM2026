# ✅ Единый источник истины + Исправление 401 после логина

## 1. 🎯 Единый источник истины для ценообразования

### Проблема
Было несколько сервисов ценообразования:
- `PricingService` (deprecated)
- `RealPricingService` (старая система)
- `FlexiblePricingService` (новая система)
- `DynamicPricingService` (настройки из БД)

### Решение: UnifiedPricingService

Создан **единый сервис** `UnifiedPricingService`, который:

✅ Автоматически выбирает метод расчета:
- Если у продукта есть операции → использует `FlexiblePricingService` (новая система)
- Если нет операций → фоллбэк на старую систему (для обратной совместимости)

✅ Унифицированный результат:
```typescript
{
  productId: number;
  productName: string;
  quantity: number;
  
  // Размеры и раскладка
  productSize: { width, height };
  layout: {...};
  
  // Стоимость
  materials: [...];
  operations: [...];
  
  // Итоги
  materialCost: number;
  operationsCost: number;
  setupCosts: number;
  subtotal: number;
  markup: number;
  discountPercent: number;
  discountAmount: number;
  finalPrice: number;
  pricePerUnit: number;
  
  // Метаданные
  calculatedAt: string;
  calculationMethod: 'flexible_operations' | 'fallback_legacy';
}
```

### Файлы

**Создан:**
- `backend/src/modules/pricing/services/unifiedPricingService.ts`

**Обновлен:**
- `backend/src/modules/pricing/index.ts` - экспорт `UnifiedPricingService` первым
- `backend/src/modules/products/routes/products.ts` - использует `UnifiedPricingService`

### Использование

```typescript
import { UnifiedPricingService } from './modules/pricing';

// 🎯 Единственный метод для расчета цен!
const result = await UnifiedPricingService.calculatePrice(
  productId,
  configuration,
  quantity
);

console.log(result.calculationMethod); // 'flexible_operations' или 'fallback_legacy'
```

### API Endpoint

```bash
POST /api/products/:productId/calculate
{
  "quantity": 100,
  "parameters": {
    "width": 90,
    "height": 50,
    "sides": 2
  }
}
```

**Response:**
```json
{
  "productId": 1,
  "productName": "Визитки 90x50",
  "quantity": 100,
  "finalPrice": 23.32,
  "pricePerUnit": 0.23,
  "calculationMethod": "flexible_operations",
  "materials": [...],
  "operations": [...],
  ...
}
```

---

## 2. 🔧 Исправление 401 после логина

### Проблема

После успешного логина происходил редирект на `/`, но возникала ошибка 401:
```
🔴 GET / - 401 - 2ms
```

### Причины

1. **Корневой путь требовал авторизацию**
   - Auth middleware проверял все пути, включая `/`
   - Путь `/` не был добавлен в `openPaths`

2. **Race condition при редиректе**
   - После логина происходит `navigate('/', { replace: true })`
   - Главная страница загружается и делает API запросы
   - Axios interceptor читает токен из localStorage
   - Если токен еще не записался → 401

### Решение

#### 2.1. Добавлен корневой путь в исключения

**`backend/src/middleware/auth.ts`:**
```typescript
const openPaths = [
  // Root and static paths
  /^\/$/,                    // ← Корневой путь
  /^\/uploads\//,            // ← Статические файлы
  /^\/api\/uploads\//,       // ← API загрузок
  // ... остальные пути
]
```

#### 2.2. Добавлен обработчик для корневого пути

**`backend/src/index.ts`:**
```typescript
// Root endpoint (before auth middleware)
app.get('/', (req, res) => {
  res.json({ 
    message: 'CRM API Server',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  })
})
```

#### 2.3. Проверка токена в фронтенде

Убедитесь, что `setAuthToken` вызывается синхронно:

**`frontend/src/pages/LoginPage.tsx`:**
```typescript
try {
  const res = await api.post('/auth/login', { email, password });
  
  // 1. Сохраняем токен (синхронно!)
  setAuthToken(res.data.token);
  
  // 2. Сохраняем остальные данные
  localStorage.setItem(APP_CONFIG.storage.role, res.data.role || '');
  
  // 3. Только после этого делаем redirect
  navigate('/', { replace: true });
} catch (e: any) {
  setError('Неверный email или пароль');
}
```

**`frontend/src/api.ts`:**
```typescript
export function setAuthToken(token?: string) {
  if (token) {
    // Синхронно сохраняем в localStorage
    localStorage.setItem('crmToken', token);
  } else {
    localStorage.removeItem('crmToken');
  }
}
```

### Проверка

#### До исправления:
```bash
curl http://localhost:3000/
# 401 Unauthorized
```

#### После исправления:
```bash
curl http://localhost:3000/
# {
#   "message": "CRM API Server",
#   "version": "1.0.0",
#   "status": "running",
#   "timestamp": "2025-02-02T16:00:00.000Z"
# }
```

---

## Тестирование

### 1. Проверка компиляции
```bash
cd backend
npx tsc --noEmit
```

### 2. Запуск тестов
```bash
cd backend
npm test
```

### 3. Тестирование ценообразования

#### Продукт с операциями:
```bash
curl -X POST http://localhost:3000/api/products/1/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 100,
    "parameters": {
      "width": 90,
      "height": 50,
      "sides": 2
    }
  }'
```

**Ожидаемый результат:**
```json
{
  "calculationMethod": "flexible_operations",
  "operations": [
    {
      "operationName": "Цифровая печать",
      "totalCost": 1.50
    },
    {
      "operationName": "Резка",
      "totalCost": 5.10
    }
  ],
  ...
}
```

#### Продукт без операций (фоллбэк):
```bash
curl -X POST http://localhost:3000/api/products/99/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 100,
    "parameters": {
      "width": 90,
      "height": 50
    }
  }'
```

**Ожидаемый результат:**
```json
{
  "calculationMethod": "fallback_legacy",
  "operations": [
    {
      "operationName": "Печать",
      "totalCost": 1.00
    }
  ],
  ...
}
```

### 4. Тестирование логина

```bash
# 1. Логин
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password"
  }'

# Response:
# {
#   "token": "...",
#   "role": "admin",
#   "user_id": 1
# }

# 2. Проверка токена
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
# {
#   "id": 1,
#   "name": "Admin",
#   "role": "admin"
# }
```

---

## Миграция на единый источник

### Старый код (НЕ ИСПОЛЬЗОВАТЬ):
```typescript
// ❌ Deprecated
import { RealPricingService } from './modules/pricing';
const result = await RealPricingService.calculateRealPrice(...);

// ❌ Deprecated
import { FlexiblePricingService } from './modules/pricing';
const result = await FlexiblePricingService.calculatePrice(...);
```

### Новый код (ИСПОЛЬЗОВАТЬ):
```typescript
// ✅ Единый источник истины
import { UnifiedPricingService } from './modules/pricing';
const result = await UnifiedPricingService.calculatePrice(
  productId,
  configuration,
  quantity
);

// Сервис автоматически выберет правильный метод!
console.log(result.calculationMethod); 
// 'flexible_operations' или 'fallback_legacy'
```

---

## Архитектура ценообразования

```
┌──────────────────────────────────────┐
│      UnifiedPricingService           │ ← ЕДИНСТВЕННАЯ ТОЧКА ВХОДА
│   (Единый источник истины)           │
└───────────────┬──────────────────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
┌─────────────┐  ┌──────────────────┐
│  Продукт с  │  │  Продукт без     │
│  операциями │  │  операций        │
└──────┬──────┘  └─────────┬────────┘
       │                   │
       ▼                   ▼
┌──────────────────┐  ┌─────────────────┐
│ Flexible         │  │ Legacy System   │
│ PricingService   │  │ (Fallback)      │
│ (Новая система)  │  │                 │
└───────┬──────────┘  └────────┬────────┘
        │                      │
        ▼                      ▼
┌────────────────────────────────────────┐
│     DynamicPricingService              │
│   (Настройки, наценки, скидки из БД)   │
└────────────────────────────────────────┘
```

---

## Статус

✅ Создан `UnifiedPricingService` - единый источник истины  
✅ Обновлен endpoint `/api/products/:id/calculate`  
✅ Исправлена ошибка 401 для корневого пути  
✅ Добавлен обработчик `GET /`  
✅ Обновлен экспорт в `pricing/index.ts`  
✅ Компиляция прошла успешно  
✅ Обратная совместимость сохранена (фоллбэк на старую систему)  

---

**Дата:** 2025-02-02  
**Задачи:**  
1. ✅ Единый источник истины для ценообразования  
2. ✅ Исправление 401 после логина

