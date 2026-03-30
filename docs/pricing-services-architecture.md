# Архитектура сервисов ценообразования в CRM

> ⚠️ Обновление: документ частично исторический. Текущий production-поток расчёта — только `UnifiedPricingService -> SimplifiedPricingService`; legacy ветки `FlexiblePricingService` и `/api/universal-calculator/*` удалены.

## 🎯 Обзор

В системе существует **4 сервиса**, связанных с расчетом цен. Вот полная картина:

---

## ✅ 1. UnifiedPricingService (ГЛАВНЫЙ - для клиентов)

**Файл**: `backend/src/modules/pricing/services/unifiedPricingService.ts`

**Назначение**: 🎯 **ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ для ценообразования**

### API Endpoints:
```
POST /api/pricing/calculate
POST /api/products/:productId/calculate
```

### Что делает:
1. Принимает запрос с `productId` и параметрами
2. Вызывает `FlexiblePricingService.calculatePrice()`
3. Возвращает финальную цену для клиента

### Пример запроса:
```typescript
POST /api/products/58/calculate

{
  product_id: 58,
  quantity: 100,
  params: {
    material_id: 44,
    format: '210×297',
    print_method: 'Двусторонняя цветная'
  }
}
```

### Пример ответа:
```json
{
  "productId": 58,
  "productName": "Штуки",
  "quantity": 100,
  "finalPrice": 12.00,
  "pricePerUnit": 0.12,
  "materialCost": 7.50,
  "operationsCost": 2.50,
  "subtotal": 10.00,
  "markup": 2.00,
  "materials": [...],
  "operations": [...],
  "calculationMethod": "flexible_operations"
}
```

### Использование:
- ✅ Калькулятор для клиентов
- ✅ Quick Test на странице шаблона
- ✅ Все расчеты цен для заказов

**Статус**: ✅ **АКТИВНЫЙ - ГЛАВНЫЙ СЕРВИС**

---

## ⚙️ 2. FlexiblePricingService (ВНУТРЕННИЙ - используется UnifiedPricingService)

**Файл**: `backend/src/modules/pricing/services/flexiblePricingService.ts`

**Назначение**: Реализация расчета через систему операций (новая гибкая система)

### Что делает:
1. **Получает продукт** из БД (`products`)
2. **Получает размеры** из `product_template_configs`
3. **Рассчитывает раскладку** через `LayoutCalculationService`
   - `sheetsNeeded` - сколько листов нужно
   - `itemsPerSheet` - сколько изделий на листе
4. **Получает материалы**:
   ```sql
   SELECT m.* FROM materials m
   WHERE m.id = :material_id
   ```
5. **Получает операции**:
   ```sql
   SELECT * FROM product_operations_link pol
   JOIN post_processing_services pps ON pol.operation_id = pps.id
   WHERE pol.product_id = :productId
   ```
6. **Рассчитывает стоимость каждой операции**:
   - Печать: `sheetsNeeded × price_per_sheet`
   - Резка: `cutsNeeded × price_per_cut`
   - Ламинация: `itemsNeeded × price_per_item`
7. **Применяет правила ценообразования** (`operation_pricing_rules`):
   - `quantity_discount` - скидки на тираж
   - `rush` - наценка за срочность
   - `material_based` - зависит от материала
8. **Рассчитывает итог**:
   ```
   materialCost + operationsCost + setupCosts
   → subtotal
   → subtotal × markup%
   → finalPrice
   ```

### Таблицы, которые использует:
- `products`
- `product_template_configs`
- `materials`
- `product_operations_link`
- `post_processing_services`
- `operation_pricing_rules`

### Вызывается из:
```typescript
// Только из UnifiedPricingService!
const result = await FlexiblePricingService.calculatePrice(
  productId,
  configuration,
  quantity
);
```

**Статус**: ✅ **АКТИВНЫЙ - используется UnifiedPricingService**

**Важно**: НЕ вызывается напрямую через API, только через UnifiedPricingService!

---

## 📊 3. CostCalculationService (АНАЛИТИКА - для внутреннего анализа)

**Файл**: `backend/src/modules/pricing/services/costCalculationService.ts`

**Назначение**: Анализ **себестоимости** и прибыльности (для менеджеров и админов)

### API Endpoints:
```
POST /api/cost-calculation/calculate      - Расчет себестоимости
GET  /api/cost-calculation/history        - История расчетов
POST /api/cost-calculation/compare        - Сравнение вариантов
POST /api/cost-calculation/profitability  - Анализ прибыльности
GET  /api/cost-calculation/report         - Отчет по себестоимости
```

### Что делает:
1. Рассчитывает себестоимость (затраты):
   - Материалы: стоимость закупки
   - Услуги: стоимость выполнения
2. Сравнивает с ценой продажи
3. Показывает:
   - `totalCost` - себестоимость
   - `sellingPrice` - цена продажи
   - `profit` - прибыль
   - `profitMargin` - % маржи
   - `margin` - наценка

### Пример использования:
```typescript
POST /api/cost-calculation/calculate

{
  "productType": "business_cards",
  "productVariant": "premium",
  "quantity": 100
}

// Ответ:
{
  "breakdown": {
    "totalMaterialCost": 7.50,     // Затраты на материалы
    "totalServiceCost": 2.50,      // Затраты на услуги
    "totalCost": 10.00,            // СЕБЕСТОИМОСТЬ
    "sellingPrice": 12.00,         // Цена продажи
    "profit": 2.00,                // Прибыль
    "profitMargin": 16.67          // % маржи
  },
  "recommendations": [
    "Маржа ниже целевой (30%). Рассмотрите повышение цены.",
    "Материалы составляют 75% себестоимости."
  ],
  "warnings": [
    "Низкая маржа! Цена может быть неконкурентоспособной."
  ]
}
```

### Где используется:
- 📊 Аналитика в админке
- 📊 Отчеты по прибыльности
- 📊 Сравнение вариантов продуктов
- 📊 Принятие решений о ценообразовании

**Статус**: 📊 **АКТИВНЫЙ - для аналитики, НЕ для расчета цен клиентам**

**Важно**: Это НЕ расчет цены для клиента, а анализ себестоимости!

---

## ⚠️ 4. UniversalCalculatorService (LEGACY - старая система)

**Файл**: `backend/src/modules/products/services/universalCalculatorService.ts`

**Назначение**: Работа с таблицей `product_material_rules` (старая система)

### API Endpoints:
```
POST /api/universal-calculator/calculate   - Расчет по старым правилам
GET  /api/universal-calculator/rules       - Получить правила
POST /api/universal-calculator/rules       - Создать правило
DELETE /api/universal-calculator/rules/:id - Удалить правило
POST /api/universal-calculator/clone-rules - Клонировать правила
```

### Что делает:
1. Работает с таблицей `product_material_rules`
2. Рассчитывает по типу продукта (productType + productName)
3. Использует правила:
   - `qty_per_item` - количество материала на единицу
   - `calculation_type`: per_item, per_sheet, per_sqm, fixed

### Таблица product_material_rules:
```sql
CREATE TABLE product_material_rules (
  id INTEGER PRIMARY KEY,
  product_type TEXT NOT NULL,        -- 'flyers', 'business_cards'
  product_name TEXT,                 -- 'A4', 'premium'
  material_id INTEGER NOT NULL,
  qty_per_item REAL NOT NULL,
  calculation_type TEXT,             -- 'per_item', 'per_sheet', 'per_sqm'
  is_required INTEGER DEFAULT 1
)
```

### Пример использования:
```typescript
POST /api/universal-calculator/calculate

{
  "productType": "flyers",
  "productName": "A4",
  "quantity": 100
}

// Ищет в product_material_rules:
// WHERE product_type = 'flyers' AND product_name = 'A4'
// Рассчитывает по старым правилам
```

**Статус**: ⚠️ **LEGACY - устаревшая система**

### Проблемы:
- ❌ Дублирует функционал новой системы
- ❌ Использует старую структуру (productType + productName вместо productId)
- ❌ Таблица `product_material_rules` может быть не синхронизирована
- ❌ НЕ используется в основном калькуляторе

**Рекомендация**: Проверить, используется ли где-то, и если нет - **DEPRECATED**

---

## 📊 Сравнительная таблица

| Характеристика | UnifiedPricing | FlexiblePricing | CostCalculation | UniversalCalculator |
|---------------|----------------|-----------------|-----------------|---------------------|
| **Цель** | Цена для клиента | Расчет через операции | Анализ себестоимости | Старые правила |
| **API** | `/pricing/calculate` | Нет (внутренний) | `/cost-calculation/calculate` | `/universal-calculator/calculate` |
| **Таблицы** | Через Flexible | operations, materials | materials, services | product_material_rules |
| **Для кого** | Клиенты | Внутренний | Менеджеры/Админы | Legacy |
| **Статус** | ✅ ГЛАВНЫЙ | ✅ ИСПОЛЬЗУЕТСЯ | 📊 АНАЛИТИКА | ⚠️ LEGACY |
| **Использование** | Калькулятор | UnifiedPricing | Отчеты | Не используется? |

---

## 🔄 Полный flow расчета цены для клиента

```
1️⃣ Клиент в калькуляторе
   ↓
   Выбирает: материал, формат, количество
   ↓
   Нажимает "Рассчитать"

2️⃣ Frontend
   ↓
   POST /api/products/58/calculate
   {
     product_id: 58,
     quantity: 100,
     params: { material_id: 44, ... }
   }

3️⃣ UnifiedPricingService.calculatePrice()
   ↓
   • Проверяет наличие операций у продукта
   • Вызывает FlexiblePricingService

4️⃣ FlexiblePricingService.calculatePrice()
   ↓
   a) Получает продукт (products)
   b) Получает шаблон (product_template_configs)
   c) Рассчитывает раскладку (LayoutCalculationService)
   d) Получает материал:
      SELECT * FROM materials WHERE id = 44
      → matt 300, price: 0.75 BYN
   e) Получает операции:
      SELECT * FROM product_operations_link pol
      JOIN post_processing_services pps
      WHERE pol.product_id = 58
      → Печать (0.15 BYN/лист), Резка (0.05 BYN/рез)
   f) Рассчитывает стоимость:
      • Материалы: 10 листов × 0.75 = 7.50 BYN
      • Печать: 10 листов × 0.15 = 1.50 BYN
      • Резка: 20 резов × 0.05 = 1.00 BYN
      • Subtotal: 10.00 BYN
      • Markup 20%: +2.00 BYN
      • ИТОГО: 12.00 BYN
   g) Применяет правила (operation_pricing_rules)

5️⃣ Ответ клиенту
   ↓
   {
     finalPrice: 12.00,
     pricePerUnit: 0.12,
     materials: [...],
     operations: [...]
   }

6️⃣ Клиент добавляет в заказ
   ↓
   POST /api/orders/:orderId/items
   {
     price: 0.12,          // ← Цена за единицу
     quantity: 100,
     params: { ... },      // Полная детализация
     components: [         // Для резервирования
       { materialId: 44, qtyPerItem: 0.1 }
     ]
   }

7️⃣ Сохранение в БД
   ↓
   INSERT INTO items (orderId, type, params, price, quantity)
   VALUES (123, 'Штуки', '...JSON...', 0.12, 100)
   
   INSERT INTO material_reservations (material_id, quantity_reserved)
   VALUES (44, 10)
```

**Вывод**: ✅ Только **ОДИН** сервис используется для расчета цены клиенту!

---

## 📊 Параллельные системы (не влияют на расчет для клиентов)

### CostCalculationService - Анализ себестоимости

**Цель**: Аналитика для менеджеров

**Что показывает**:
```
Себестоимость: 10.00 BYN      (наши затраты)
Цена продажи: 12.00 BYN       (от UnifiedPricingService)
Прибыль: 2.00 BYN
Маржа: 20%

Рекомендации:
- Маржа ниже целевой (30%)
- Материалы составляют 75% себестоимости
```

**Использование**: Отчеты и аналитика в админке

---

### UniversalCalculatorService - Старая система

**Цель**: ⚠️ Устаревшая система с `product_material_rules`

**Таблица**: `product_material_rules` (не используется в новой системе)

**Статус**: ⚠️ **LEGACY** - вероятно не используется

**Рекомендация**: Проверить использование и если не используется - пометить как DEPRECATED

---

## ✅ ИТОГОВЫЙ ОТВЕТ

### Да, цены считаются еще в нескольких местах, НО:

1. **Для клиентов (расчет цены)**: ✅ **ТОЛЬКО UnifiedPricingService**
   - Вызывает FlexiblePricingService внутри
   - Единый источник истины
   - Используется калькулятором

2. **Для аналитики (себестоимость)**: 📊 **CostCalculationService**
   - Анализ прибыльности
   - Не влияет на цену для клиента
   - Параллельная система

3. **Legacy (старая система)**: ⚠️ **UniversalCalculatorService**
   - Таблица product_material_rules
   - Вероятно не используется
   - Можно deprecated

---

## 🎯 Рекомендации

### ✅ Что правильно:
1. ✅ **Единая точка входа** - UnifiedPricingService
2. ✅ **Четкое разделение** - расчет цены vs аналитика
3. ✅ **Модульность** - FlexiblePricingService инкапсулирует логику

### ⚠️ Что можно улучшить:
1. ⚠️ **Пометить UniversalCalculatorService как DEPRECATED**
   - Если не используется - удалить
   - Если используется - мигрировать на новую систему

2. ⚠️ **Документировать различие**:
   - UnifiedPricing = цена для КЛИЕНТА
   - CostCalculation = анализ СЕБЕСТОИМОСТИ

3. ⚠️ **Проверить product_material_rules**:
   - Нужна ли эта таблица?
   - Не дублирует ли она product_operations_link?

---

## 🔍 Проверка использования UniversalCalculatorService

Давайте проверим, используется ли старая система:

```bash
# Поиск в логах или коде фронтенда
grep -r "universal-calculator/calculate" frontend/src
grep -r "UniversalCalculatorService" backend/src
```

**Если НЕ используется** → можно пометить как DEPRECATED:

```typescript
/**
 * @deprecated Используйте UnifiedPricingService вместо этого
 * Эта система работает со старой таблицей product_material_rules
 * и будет удалена в будущих версиях.
 */
export class UniversalCalculatorService {
  // ...
}
```

---

## ✨ Заключение

**Ответ на ваш вопрос**: Да, цены считаются в нескольких местах:

1. ✅ **UnifiedPricingService + FlexiblePricingService** → Цена для клиентов (ГЛАВНЫЙ)
2. 📊 **CostCalculationService** → Себестоимость для аналитики (вспомогательный)
3. ⚠️ **UniversalCalculatorService** → Старая система (legacy, проверить использование)

**Главное**: Для расчета цены клиенту используется **ТОЛЬКО UnifiedPricingService**! ✅

Хотите, чтобы я проверил, используется ли `UniversalCalculatorService` где-то в коде, и если нет - пометил его как DEPRECATED? 🔍

