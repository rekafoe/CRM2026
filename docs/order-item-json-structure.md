# 📦 Структура JSON для добавления продукта в заказ

## ⚠️ ВАЖНО

**Это ПРИМЕР структуры с демонстрационными значениями!**

Реальные значения зависят от:
- Конкретного продукта (ID)
- Выбранных параметров пользователем
- Результатов расчета цены бэкендом
- Настроек шаблона продукта

## Основная структура `apiItem`

```json
{
  "type": "Название продукта",
  "params": {
    "description": "Описание товара",
    "specifications": {
      "productType": "business_cards",
      "format": "A6",
      "quantity": 100,
      "sides": 1,
      "paperType": "Полуглянец",
      "paperDensity": 300,
      "lamination": "none",
      "priceType": "standard",
      "customerType": "regular",
      "waste": 0,
      "formatInfo": {
        "width": 105,
        "height": 148
      },
      "parameterSummary": [
        {
          "label": "Формат",
          "value": "A6"
        },
        {
          "label": "Количество",
          "value": "100 шт"
        }
      ],
      "sheetsNeeded": 25,
      "piecesPerSheet": 4,
      "layout": {
        "itemsPerSheet": 4,
        "sheetsNeeded": 25,
        "cutsPerSheet": 2,
        "numberOfStacks": 1,
        "recommendedSheetSize": {
          "width": 210,
          "height": 297
        }
      },
      "customFormat": undefined,
      "print_technology": "digital",
      "printTechnology": "digital",
      "print_color_mode": "color",
      "printColorMode": "color"
    },
    "materials": [
      {
        "materialId": 5,
        "materialName": "Полуглянец 300 г/м²",
        "quantity": 25,
        "unitPrice": 0.15,
        "totalCost": 3.75,
        "unit": "лист"
      }
    ],
    "services": [
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
    "productionTime": "2-3 дня",
    "productType": "business_cards",
    "urgency": "standard",
    "customerType": "regular",
    "estimatedDelivery": "2025-12-28",
    "sheetsNeeded": 25,
    "piecesPerSheet": 4,
    "formatInfo": {
      "width": 105,
      "height": 148
    },
    "parameterSummary": [
      {
        "label": "Формат",
        "value": "A6"
      }
    ],
    "productId": 59,
    "productName": "Визитки",
    "layout": {
      "itemsPerSheet": 4,
      "sheetsNeeded": 25,
      "cutsPerSheet": 2,
      "numberOfStacks": 1,
      "recommendedSheetSize": {
        "width": 210,
        "height": 297
      }
    },
    "customFormat": undefined
  },
  "price": 0.34,
  "quantity": 100,
  "sides": 1,
  "sheets": 25,
  "waste": 0,
  "clicks": 50,
  "components": [
    {
      "materialId": 5,
      "qtyPerItem": 0.25
    }
  ]
}
```

## Как получить реальные данные

### 1. Через логи браузера

Откройте DevTools (F12) → Console, добавьте продукт в заказ, ищите логи:
```javascript
logger.info('Товар добавлен в заказ', { productName: result.productName });
```

### 2. Через Network tab

Откройте DevTools → Network, найдите запрос `POST /api/orders/:id/items`, посмотрите Request Payload.

### 3. Через код

Добавьте `console.log` в `ImprovedPrintingCalculatorModal.tsx`:
```typescript
const apiItem = { ... };
console.log('📦 JSON для заказа:', JSON.stringify(apiItem, null, 2));
```

## Описание полей

### Корневые поля `apiItem`

| Поле | Тип | Описание | Источник |
|------|-----|----------|----------|
| `type` | string | Название продукта | `selectedProduct.name` или `result.productName` |
| `params` | object | Параметры товара | Формируется из `result` |
| `price` | number | Цена за единицу (BYN) | `result.pricePerItem` |
| `quantity` | number | Количество изделий | `result.specifications.quantity` |
| `sides` | number | Количество сторон (1 или 2) | `result.specifications.sides` |
| `sheets` | number | Количество листов для печати | `result.layout.sheetsNeeded` |
| `waste` | number | Отходы (обычно 0) | `result.specifications.waste` |
| `clicks` | number | Количество кликов принтера | `sheets × sides × 2` |
| `components` | array | Материалы с количеством на единицу | Из `result.materials` |

### Объект `params`

| Поле | Тип | Описание | Источник |
|------|-----|----------|----------|
| `description` | string | Текстовое описание товара | Формируется из `parameterSummary` |
| `specifications` | object | Спецификации продукта | `result.specifications` + доп. поля |
| `materials` | array | Материалы с ценами | `result.materials` (из бэкенда) |
| `services` | array | Операции/услуги с ценами | `result.services` (из бэкенда) |
| `productionTime` | string | Время производства | `result.productionTime` |
| `productType` | string | Тип продукта | `result.specifications.productType` |
| `urgency` | string | Срочность заказа | `result.specifications.priceType` |
| `customerType` | string | Тип клиента | `result.specifications.customerType` |
| `estimatedDelivery` | string | Предполагаемая дата доставки | Рассчитывается от текущей даты |
| `sheetsNeeded` | number | Количество листов | `result.layout.sheetsNeeded` |
| `piecesPerSheet` | number | Штук на лист | `result.layout.itemsPerSheet` |
| `formatInfo` | object | Информация о формате | `result.formatInfo` |
| `parameterSummary` | array | Краткое описание параметров | Формируется из `result.specifications` |
| `productId` | number | ID продукта из БД | `selectedProduct.id` |
| `productName` | string | Название продукта | `selectedProduct.name` |
| `layout` | object | Информация о раскладке | `result.layout` (из бэкенда) |

### Объект `specifications`

| Поле | Тип | Описание | Источник |
|------|-----|----------|----------|
| `productType` | string | Тип продукта | Выбор пользователя |
| `format` | string | Формат (A6, A5, A4, или "50×90") | Выбор пользователя или из шаблона |
| `quantity` | number | Количество | Ввод пользователя |
| `sides` | number | Количество сторон | Выбор пользователя |
| `paperType` | string | Тип бумаги | Выбор пользователя |
| `paperDensity` | number | Плотность бумаги (г/м²) | Выбор пользователя |
| `lamination` | string | Ламинация | Выбор пользователя |
| `priceType` | string | Тип цены | Выбор пользователя |
| `customerType` | string | Тип клиента | Выбор пользователя |
| `waste` | number | Отходы | Обычно 0 |
| `formatInfo` | object | Размеры формата | Парсится из `format` или кастомный |
| `parameterSummary` | array | Сводка параметров | Формируется автоматически |
| `sheetsNeeded` | number | Листов нужно | Рассчитывается бэкендом |
| `piecesPerSheet` | number | Штук на лист | Рассчитывается бэкендом |
| `layout` | object | Раскладка на листе | Рассчитывается бэкендом |
| `customFormat` | object\|undefined | Кастомный формат | Если пользователь указал |
| `print_technology` | string | Технология печати | Выбор пользователя |
| `printTechnology` | string | Технология печати (дубликат) | Выбор пользователя |
| `print_color_mode` | string | Режим цвета (bw, color) | Выбор пользователя |
| `printColorMode` | string | Режим цвета (дубликат) | Выбор пользователя |

### Объект `layout` (из бэкенда)

| Поле | Тип | Описание | Источник |
|------|-----|----------|----------|
| `itemsPerSheet` | number | Количество изделий на листе | `LayoutCalculationService` |
| `sheetsNeeded` | number | Количество листов | `Math.ceil(quantity / itemsPerSheet)` |
| `cutsPerSheet` | number | Количество резов на лист | Рассчитывается по раскладке |
| `numberOfStacks` | number | Количество стоп для резки | Рассчитывается по толщине |
| `recommendedSheetSize` | object | Рекомендуемый размер листа | SRA3, A3 или A4 |

### Массив `materials` (из бэкенда)

| Поле | Тип | Описание | Источник |
|------|-----|----------|----------|
| `materialId` | number | ID материала | Из БД `materials` |
| `materialName` | string | Название материала | Из БД `materials` |
| `quantity` | number | Количество | Рассчитывается |
| `unitPrice` | number | Цена за единицу | Из БД `materials.sheet_price_single` |
| `totalCost` | number | Общая стоимость | `quantity × unitPrice` |
| `unit` | string | Единица измерения | Из БД `materials.unit` |

### Массив `services` (операции, из бэкенда)

| Поле | Тип | Описание | Источник |
|------|-----|----------|----------|
| `operationId` | number | ID операции | Из БД `post_processing_services` |
| `operationName` | string | Название операции | Из БД `post_processing_services` |
| `operationType` | string | Тип операции | Из БД `post_processing_services` |
| `priceUnit` | string | Единица цены | Из БД `post_processing_services` |
| `unitPrice` | number | Цена за единицу | Из БД `post_processing_services.price` |
| `quantity` | number | Количество единиц | Рассчитывается по `priceUnit` |
| `setupCost` | number | Стоимость настройки | Из БД `post_processing_services.setup_cost` |
| `totalCost` | number | Общая стоимость | `unitPrice × quantity + setupCost` |

### Массив `components`

| Поле | Тип | Описание | Источник |
|------|-----|----------|----------|
| `materialId` | number | ID материала | Из `result.materials` |
| `qtyPerItem` | number | Количество материала на одно изделие | `material.quantity / specifications.quantity` |

## Где формируется

1. **Фронтенд:** `frontend/src/components/calculator/ImprovedPrintingCalculatorModal.tsx` (строки 349-433)
2. **Отправка:** `frontend/src/components/optimized/hooks/useOrderHandlers.ts` (строка 63)
3. **API:** `frontend/src/api.ts` → `addOrderItem(orderId, item)`
4. **Бэкенд:** `backend/src/modules/orders/services/orderService.ts` → `addOrderItem()`

## Как сохраняется в БД

В таблице `items`:
- `type` → поле `type`
- `params` → поле `params` (JSON строка)
- `price` → поле `price`
- `quantity` → поле `quantity`
- `sides` → поле `sides`
- `sheets` → поле `sheets`
- `waste` → поле `waste`
- `clicks` → поле `clicks`

Компоненты (`components`) сохраняются в `params.components` и используются для резервирования материалов.

## Суммы в ответе API

При чтении заказа бэкенд добавляет:

- **`params.storedTotalCost`** — итог позиции при сохранении (калькулятор / `recalculate-prices`).
- **`lineTotal`** — то же для UI: `storedTotalCost` ?? `price × quantity` (см. `orderAmounts.ts`).
- На заказе: **`subtotal`**, **`discountAmount`**, **`totalAmount`**, **`debt`** — см. [order-management.md](./order-management.md).
