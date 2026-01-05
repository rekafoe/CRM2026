# 📊 Пошаговый расчет цены для визитки (ID 59)

## ⚠️ Важно: Источники данных

**Все цены берутся из базы данных, а не хардкодятся в коде:**

1. **Цены операций** → таблица `post_processing_services` (поле `price`)
2. **Цены материалов** → таблица `materials` (поле `sheet_price_single`)
3. **Наценка** → таблица `markup_settings` (поле `setting_value`, где `setting_name = 'base_markup'`)
4. **Скидки за тираж** → таблица `quantity_discounts` (поле `discount_percent`)

**В этом документе используются ПРИМЕРНЫЕ значения для демонстрации логики расчета.**
**Реальные значения могут отличаться и хранятся в вашей базе данных.**

---

## Входные данные

**Продукт:** Визитки (ID: 59)  
**Параметры заказа:**
- Формат: A6 (105×148 мм)
- Количество: 100 шт
- Стороны: 1 (односторонние)
- Материал: Полуглянец 300 г/м²
- Ламинация: Нет

---

## Шаг 1: Получение продукта и размеров

**Код:** `FlexiblePricingService.calculatePrice()` → строка 74-89

```sql
SELECT p.*, pc.name as category_name 
FROM products p 
JOIN product_categories pc ON p.category_id = pc.id 
WHERE p.id = 59
```

**Результат:**
- Название продукта: "Визитки"
- Тип продукта: `business_cards`
- Категория: "Визитки"

**Извлечение размеров:**
- `trim_size`: { width: 105, height: 148 } (из формата A6)
- `productSize`: { width: 105, height: 148, unit: 'mm' }

---

## Шаг 2: Расчет раскладки (Layout)

**Код:** `LayoutCalculationService.findOptimalSheetSize()` → строка 137

**Расчет:**
- Размер изделия: 105×148 мм
- Оптимальный лист: A4 (210×297 мм)
- Укладка: 4 визитки на лист (2×2)
- Количество листов: `Math.ceil(100 / 4) = 25 листов`
- Количество резов: 2 реза на лист (1 горизонтальный + 1 вертикальный)
- Количество стоп для резки: `Math.ceil(25 / 333) = 1 стопа` (333 листа в стопе высотой 5 см)

**Результат:**
```javascript
layout = {
  fitsOnSheet: true,
  itemsPerSheet: 4,
  sheetsNeeded: 25,
  cutsPerSheet: 2,
  recommendedSheetSize: 'A4'
}
```

---

## Шаг 3: Получение операций продукта

**Код:** `FlexiblePricingService.getProductOperations()` → строка 250-389

**SQL запрос:**
```sql
SELECT 
  pol.id as link_id,
  pol.sort_order,
  pol.is_required,
  pol.is_optional,
  pol.default_params,
  pps.id,
  pps.name,
  pps.description,
  pps.price,
  pps.unit,
  pps.operation_type,
  pps.price_unit,
  pps.setup_cost,
  pps.min_quantity,
  pps.parameters
FROM product_operations_link pol
JOIN post_processing_services pps ON pol.operation_id = pps.id
WHERE pol.product_id = 59 AND pps.is_active = 1
ORDER BY pol.sort_order
```

**Пример операций для визитки (значения из БД):**

**SQL запрос для получения операций:**
```sql
SELECT 
  pps.id,
  pps.name,
  pps.price,              -- ⚠️ Цена берется из БД!
  pps.price_unit,
  pps.setup_cost,         -- ⚠️ Стоимость настройки из БД!
  pps.operation_type
FROM product_operations_link pol
JOIN post_processing_services pps ON pol.operation_id = pps.id
WHERE pol.product_id = 59 AND pps.is_active = 1
ORDER BY pol.sort_order
```

**Пример результата (ПРИМЕРНЫЕ значения):**
1. **Печать** (ID: 1)
   - `price_unit`: `per_sheet`
   - `price`: **0.50 BYN** за лист (из `post_processing_services.price`)
   - `setup_cost`: **0 BYN** (из `post_processing_services.setup_cost`)

2. **Резка** (ID: 2)
   - `price_unit`: `per_cut`
   - `price`: **0.10 BYN** за рез (из `post_processing_services.price`)
   - `setup_cost`: **0 BYN** (из `post_processing_services.setup_cost`)

3. **Ламинация** (ID: 3) - не применяется (ламинация: нет)

---

## Шаг 4: Расчет стоимости операций

**Код:** `FlexiblePricingService.calculateOperationCost()` → строка 409-500

### Операция 1: Печать

**Расчет:**
- `price_unit`: `per_sheet`
- `effectiveQuantity`: `sheetsNeeded = 25 листов`
- `unitPrice`: `0.50 BYN` (базовая цена из `post_processing_services.price`)
- `setupCost`: `0 BYN` (из `post_processing_services.setup_cost`)
- `totalCost`: `0.50 × 25 = 12.50 BYN`

**Код:** `FlexiblePricingService.calculateOperationCost()` → строка 462
```typescript
let unitPrice = operation.price * (operation.price_multiplier || 1.0);
// operation.price берется из БД (post_processing_services.price)
```

**Результат:**
```javascript
{
  operationId: 1,
  operationName: "Печать",
  operationType: "print",
  priceUnit: "per_sheet",
  unitPrice: 0.50,
  quantity: 25,
  setupCost: 0,
  totalCost: 12.50
}
```

### Операция 2: Резка

**Расчет:**
- `price_unit`: `per_cut`
- `effectiveQuantity`: `layout.cutsPerSheet × numberOfStacks = 2 × 1 = 2 реза`
- `unitPrice`: `0.10 BYN` (базовая цена из `post_processing_services.price`)
- `setupCost`: `0 BYN` (из `post_processing_services.setup_cost`)
- `totalCost`: `0.10 × 2 = 0.20 BYN`

**Результат:**
```javascript
{
  operationId: 2,
  operationName: "Резка",
  operationType: "cutting",
  priceUnit: "per_cut",
  unitPrice: 0.10,
  quantity: 2,
  setupCost: 0,
  totalCost: 0.20
}
```

**Итого по операциям:**
- `totalOperationsCost`: `12.50 + 0.20 = 12.70 BYN`
- `totalSetupCost`: `0 + 0 = 0 BYN`

---

## Шаг 5: Расчет стоимости материалов

**Код:** `FlexiblePricingService.calculateMaterialCosts()` → строка 546-739

### Приоритет 1: Материал из конфигурации

Если в конфигурации указан `material_id`, используется он.

**SQL запрос:**
```sql
SELECT id, name, sheet_price_single, unit 
FROM materials 
WHERE id = ?
```

**Пример (ПРИМЕРНЫЕ значения):**
- `material_id`: 5 (Полуглянец 300 г/м²)
- `unitPrice`: `0.15 BYN` за лист (**из `materials.sheet_price_single`**)
- `quantity`: `25 листов`
- `totalCost`: `0.15 × 25 = 3.75 BYN`

**Код:** `FlexiblePricingService.calculateMaterialCosts()` → строка 560-566

### Приоритет 2: Материалы из product_materials

Если материал не указан в конфигурации, используются материалы из `product_materials`.

**SQL запрос:**
```sql
SELECT 
  pm.material_id,
  pm.qty_per_sheet,
  pm.is_required,
  m.name as material_name,
  m.unit,
  m.sheet_price_single
FROM product_materials pm
JOIN materials m ON m.id = pm.material_id
WHERE pm.product_id = 59
ORDER BY pm.is_required DESC, m.name
```

**Пример результата (ПРИМЕРНЫЕ значения):**
- Материал: Полуглянец 300 г/м² (ID: 5)
- `qty_per_sheet`: `1` (из `product_materials.qty_per_sheet`)
- `sheet_price_single`: `0.15 BYN` (**из `materials.sheet_price_single`**)
- `quantity`: `1 × 25 = 25 листов`
- `totalCost`: `0.15 × 25 = 3.75 BYN`

**Итого по материалам:**
- `totalMaterialCost`: `3.75 BYN`

---

## Шаг 6: Промежуточная сумма (Subtotal)

**Код:** `FlexiblePricingService.calculatePrice()` → строка 194

**Расчет:**
```javascript
subtotal = totalMaterialCost + totalOperationsCost + totalSetupCost
subtotal = 3.75 + 12.70 + 0
subtotal = 16.45 BYN
```

**Детализация:**
- Материалы: `3.75 BYN`
- Операции: `12.70 BYN`
- Настройка: `0 BYN`
- **Итого:** `16.45 BYN`

---

## Шаг 7: Применение наценки (Markup)

**Код:** `FlexiblePricingService.getBaseMarkup()` → строка 900-909

**SQL запрос:**
```sql
SELECT setting_value FROM markup_settings 
WHERE setting_name = 'base_markup' AND is_active = 1
```

**Результат (ПРИМЕРНОЕ значение):**
- `markup`: `2.2` (220% или наценка 120%) (**из `markup_settings.setting_value`**)

**Код:** `FlexiblePricingService.getBaseMarkup()` → строка 900-909
```typescript
const markup = await db.get(`
  SELECT setting_value FROM markup_settings 
  WHERE setting_name = 'base_markup' AND is_active = 1
`);
return markup?.setting_value || 2.2; // Дефолт 2.2, если не найдено
```

**Расчет:**
```javascript
priceWithMarkup = subtotal × markup
priceWithMarkup = 16.45 × 2.2
priceWithMarkup = 36.19 BYN
```

**Детализация:**
- Себестоимость: `16.45 BYN`
- Наценка (120%): `19.74 BYN`
- **Цена с наценкой:** `36.19 BYN`

---

## Шаг 8: Применение скидки за тираж

**Код:** `FlexiblePricingService.getQuantityDiscount()` → строка 914-940

**SQL запрос:**
```sql
SELECT discount_percent FROM quantity_discounts 
WHERE min_quantity <= 25 
  AND (max_quantity IS NULL OR max_quantity >= 25)
  AND is_active = 1
ORDER BY min_quantity DESC
LIMIT 1
```

**Пример результата (ПРИМЕРНОЕ значение):**
- `discount_percent`: `5%` (для тиража 20-50 листов) (**из `quantity_discounts.discount_percent`**)

**Код:** `FlexiblePricingService.getQuantityDiscount()` → строка 914-940

**Расчет:**
```javascript
discountAmount = priceWithMarkup × (discountPercent / 100)
discountAmount = 36.19 × (5 / 100)
discountAmount = 1.81 BYN

finalPrice = priceWithMarkup - discountAmount
finalPrice = 36.19 - 1.81
finalPrice = 34.38 BYN
```

**Детализация:**
- Цена с наценкой: `36.19 BYN`
- Скидка (5%): `-1.81 BYN`
- **Финальная цена:** `34.38 BYN`

---

## Шаг 9: Расчет цены за единицу

**Код:** `FlexiblePricingService.calculatePrice()` → строка 204

**Расчет:**
```javascript
pricePerUnit = finalPrice / quantity
pricePerUnit = 34.38 / 100
pricePerUnit = 0.34 BYN за визитку
```

---

## Итоговая структура цены

### 📋 Сводная таблица

| Этап | Сумма (BYN) | Описание |
|------|-------------|----------|
| **Материалы** | 3.75 | Полуглянец 300 г/м² (25 листов × 0.15) |
| **Операции** | 12.70 | Печать (25 листов × 0.50) + Резка (2 реза × 0.10) |
| **Настройка** | 0.00 | Нет настройки |
| **Промежуточная сумма** | **16.45** | Себестоимость |
| **Наценка (120%)** | +19.74 | Наценка 2.2× |
| **Цена с наценкой** | **36.19** | До скидки |
| **Скидка за тираж (5%)** | -1.81 | Скидка за 25 листов |
| **Финальная цена** | **34.38** | Итоговая стоимость |
| **Цена за единицу** | **0.34** | За 1 визитку |

### 📊 Визуализация расчета

```
Себестоимость:           16.45 BYN
├─ Материалы:             3.75 BYN
└─ Операции:             12.70 BYN
   ├─ Печать:            12.50 BYN (25 листов × 0.50)
   └─ Резка:              0.20 BYN (2 реза × 0.10)

Наценка (×2.2):          19.74 BYN
────────────────────────────────────
Цена с наценкой:         36.19 BYN

Скидка за тираж (-5%):    -1.81 BYN
────────────────────────────────────
ФИНАЛЬНАЯ ЦЕНА:          34.38 BYN

Цена за визитку:          0.34 BYN
```

---

## Шаг 10: Возврат результата на фронтенд

**Код:** `FlexiblePricingService.calculatePrice()` → строка 206-231

**Структура ответа:**
```json
{
  "productId": 59,
  "productName": "Визитки",
  "quantity": 100,
  "productSize": { "width": 105, "height": 148, "unit": "mm" },
  "layout": {
    "itemsPerSheet": 4,
    "sheetsNeeded": 25,
    "cutsPerSheet": 2,
    "numberOfStacks": 1
  },
  "materials": [
    {
      "materialId": 5,
      "materialName": "Полуглянец 300 г/м²",
      "quantity": 25,
      "unitPrice": 0.15,
      "totalCost": 3.75
    }
  ],
  "operations": [
    {
      "operationId": 1,
      "operationName": "Печать",
      "operationType": "print",
      "priceUnit": "per_sheet",
      "unitPrice": 0.50,
      "quantity": 25,
      "setupCost": 0,
      "totalCost": 12.50
    },
    {
      "operationId": 2,
      "operationName": "Резка",
      "operationType": "cutting",
      "priceUnit": "per_cut",
      "unitPrice": 0.10,
      "quantity": 2,
      "setupCost": 0,
      "totalCost": 0.20
    }
  ],
  "materialCost": 3.75,
  "operationsCost": 12.70,
  "setupCosts": 0,
  "subtotal": 16.45,
  "markup": 2.2,
  "discountPercent": 5,
  "discountAmount": 1.81,
  "finalPrice": 34.38,
  "pricePerUnit": 0.34,
  "calculatedAt": "2025-01-XX...",
  "calculationMethod": "flexible_operations"
}
```

---

## Шаг 11: Добавление в заказ

**Код:** `useOrderHandlers.handleAddToOrder()` → строка 48-100

**Действия:**
1. Создание/выбор заказа
2. Вызов API `addOrderItem(orderId, item)`
3. Оптимистичное обновление UI
4. Принудительная перезагрузка заказов

**Данные, отправляемые в заказ:**
```javascript
{
  type: "Визитки A6 (Полуглянец 300г/м², односторонние)",
  params: {
    description: "...",
    specifications: { ... },
    materials: [ ... ],
    services: [ ... ],
    ...
  },
  price: 0.34,  // цена за единицу
  quantity: 100,
  // ... другие поля
}
```

**Итоговая сумма в заказе:**
- `price × quantity = 0.34 × 100 = 34.38 BYN` ✅

---

## Примечания

1. **Единицы измерения операций:**
   - `per_sheet` - цена за лист
   - `per_item` - цена за изделие
   - `per_cut` - цена за рез (рассчитывается по стопам)
   - `per_m2` - цена за квадратный метр
   - `fixed` - фиксированная цена

2. **Приоритет материалов:**
   - Сначала используется `material_id` из конфигурации
   - Затем материалы из `product_materials`
   - Затем правила из `product_material_rules`
   - В конце - материалы из шаблона продукта

3. **Правила ценообразования:**
   - Применяются к каждой операции отдельно
   - Могут изменять `unitPrice` в зависимости от условий
   - Учитывают количество, размер, материал и т.д.

4. **Наценка и скидки:**
   - Наценка применяется к промежуточной сумме
   - Скидка за тираж применяется к цене с наценкой
   - Все расчеты округляются до 2 знаков после запятой

