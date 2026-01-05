# 📋 Система пошаговой настройки продуктов

## Проблема

Раньше продукты могли быть активированы без полной конфигурации, что приводило к:
- Ошибкам при расчёте цен
- Fallback'ам на хардкод
- Неопределённости в конфигурации

## Решение: Product Setup Workflow

Теперь каждый продукт проходит через **валидируемые этапы настройки** перед активацией.

## Статусы продукта (`setup_status`)

```
draft → materials_configured → operations_configured → ready
```

| Статус | Описание | Может быть активирован? |
|--------|----------|-------------------------|
| `draft` | Только создан, нет конфигурации | ❌ Нет |
| `materials_configured` | Настроены материалы | ❌ Нет |
| `operations_configured` | Настроены операции | ❌ Нет |
| `ready` | Полная конфигурация | ✅ Да |

## Этапы настройки (Checklist)

### 1️⃣ Тип продукта (`product_type`)

**Что проверяется:**
- Установлен ли `product_type` (например, `sheet_single`, `flyers`, `business_cards`)

**Как настроить:**
```http
PUT /api/products/:id
{
  "product_type": "sheet_single"
}
```

### 2️⃣ Материалы (`materials`)

**Что проверяется:**
- Есть ли записи в `product_material_rules` для данного `product_type`

**Как настроить:**
```http
POST /api/pricing/product-schemas
{
  "productType": "sheet_single",
  "materials": [
    {
      "materialId": 1,
      "qtyPerItem": 1,
      "calculationType": "per_sheet",
      "isRequired": true
    }
  ]
}
```

### 3️⃣ Операции (`operations`)

**Что проверяется:**
- Есть ли записи в `product_operations_link` для данного продукта

**Как настроить:**
```http
POST /api/products/:productId/operations
{
  "operationId": 52,
  "sequence": 1,
  "sortOrder": 1,
  "isRequired": true,
  "priceMultiplier": 1.0
}
```

### 4️⃣ Правила ценообразования (опционально)

**Что проверяется:**
- Наличие `operation_pricing_rules` (пока не обязательно)

## API Endpoints

### Получить статус настройки

```http
GET /api/products/:id/setup-status
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "productId": 48,
    "productName": "Тестовый продукт",
    "currentStatus": "draft",
    "canActivate": false,
    "steps": [
      { "step": "product_type", "isCompleted": true },
      { "step": "materials", "isCompleted": false },
      { "step": "operations", "isCompleted": false },
      { "step": "pricing_rules", "isCompleted": true }
    ],
    "missingSteps": ["materials", "operations"]
  }
}
```

### Отметить этап как выполненный

```http
POST /api/products/:id/complete-step
{
  "step": "materials",
  "validatedBy": 1,
  "notes": "Настроены материалы для печати"
}
```

### Обновить статус на основе конфигурации

```http
POST /api/products/:id/update-setup-status
```

Автоматически проверит все этапы и обновит `setup_status`.

### Активировать продукт

```http
POST /api/products/:id/activate
```

**Успех (если `ready`):**
```json
{
  "success": true,
  "message": "Продукт успешно активирован"
}
```

**Ошибка (если не готов):**
```json
{
  "success": false,
  "error": "Продукт не может быть активирован. Отсутствуют этапы: materials, operations"
}
```

## База данных

### Таблица `products`

Добавлено поле:
```sql
setup_status TEXT CHECK (setup_status IN ('draft', 'materials_configured', 'operations_configured', 'ready')) DEFAULT 'draft'
```

### Таблица `product_setup_checklist`

Отслеживает прогресс настройки:

```sql
CREATE TABLE product_setup_checklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  step TEXT NOT NULL,
  is_completed INTEGER DEFAULT 0,
  completed_at TEXT,
  validated_by INTEGER,
  validation_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY(validated_by) REFERENCES users(id),
  UNIQUE(product_id, step)
);
```

## Workflow для создания нового продукта

```typescript
// 1. Создать продукт
const product = await createProduct({
  name: "Новый продукт",
  category_id: 28,
  product_type: "sheet_single"
});
// → setup_status = 'draft'

// 2. Настроить материалы
await createMaterialRules(product.product_type, [
  { materialId: 1, qtyPerItem: 1, calculationType: 'per_sheet' }
]);

// 3. Обновить статус
await updateSetupStatus(product.id);
// → setup_status = 'materials_configured'

// 4. Настроить операции
await addOperationsToProduct(product.id, [
  { operationId: 52, sequence: 1 },
  { operationId: 59, sequence: 2 }
]);

// 5. Обновить статус
await updateSetupStatus(product.id);
// → setup_status = 'ready'

// 6. Активировать
await activateProduct(product.id);
// → is_active = 1 ✅
```

## Преимущества

✅ **Нет хардкода** — все настраивается через БД  
✅ **Валидация** — продукт не может быть активирован без полной конфигурации  
✅ **Прозрачность** — всегда видно, какие этапы выполнены  
✅ **Автоматизация** — `operation_norms` создают базовые операции автоматически  
✅ **Гибкость** — легко добавить новые этапы проверки

## Миграция существующих продуктов

При запуске миграции `20250211000000_add_product_setup_status.ts`:

1. Все продукты с операциями → `setup_status = 'ready'`
2. Продукты с материалами, но без операций → `setup_status = 'materials_configured'`
3. Остальные → `setup_status = 'draft'`

## Интеграция с UnifiedPricingService

Теперь вместо fallback'ов:

```typescript
// СТАРЫЙ ПОДХОД (с fallback'ами)
if (!hasOperations) {
  // 😢 Фоллбек на хардкод
  return await LegacyPricingService.calculate(...);
}

// НОВЫЙ ПОДХОД (с валидацией)
if (!hasOperations) {
  // ❌ Ошибка: продукт не настроен
  throw new Error('Для продукта не настроены операции. Настройте через /products/:id/setup-status');
}
```

## Frontend интеграция

Добавить в ProductManagement.tsx:

```tsx
// Индикатор статуса настройки
{product.setup_status === 'draft' && (
  <Badge color="gray">Черновик</Badge>
)}
{product.setup_status === 'ready' && (
  <Badge color="green">Готов</Badge>
)}

// Кнопка активации только для ready
<Button
  disabled={product.setup_status !== 'ready'}
  onClick={() => activateProduct(product.id)}
>
  Активировать
</Button>
```

