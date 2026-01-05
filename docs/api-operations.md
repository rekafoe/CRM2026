# API для управления операциями печати

## Обзор

API позволяет управлять операциями (печать, резка, ламинация и т.п.) и связывать их с продуктами для гибкого ценообразования.

## Endpoints

### Операции

#### GET `/api/operations`
Получить список всех операций

**Query Parameters:**
- `operation_type` (optional) - фильтр по типу операции (`print`, `cut`, `laminate`, и т.д.)
- `is_active` (optional) - фильтр по активности (`true`/`false`)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Цифровая цветная печать (SRA3)",
      "description": "Полноцветная печать CMYK на листовых материалах",
      "price": 0.15,
      "unit": "лист",
      "operation_type": "print",
      "price_unit": "per_sheet",
      "setup_cost": 0,
      "min_quantity": 1,
      "parameters": {
        "color_mode": "cmyk",
        "max_format": "SRA3",
        "sides": [1, 2]
      },
      "is_active": true
    }
  ],
  "count": 12
}
```

#### GET `/api/operations/:id`
Получить детали одной операции

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Цифровая цветная печать (SRA3)",
    "operation_type": "print",
    "price": 0.15,
    "price_unit": "per_sheet",
    "setup_cost": 0,
    "parameters": {...}
  }
}
```

#### POST `/api/operations`
Создать новую операцию

**Request Body:**
```json
{
  "name": "Фальцовка 1 сгиб",
  "description": "Фальцовка с одним сгибом",
  "price": 0.03,
  "unit": "шт",
  "operation_type": "fold",
  "price_unit": "per_item",
  "setup_cost": 5,
  "min_quantity": 50,
  "parameters": {
    "folds": 1,
    "types": ["half", "z-fold"]
  },
  "is_active": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 13,
    "name": "Фальцовка 1 сгиб",
    ...
  }
}
```

#### PUT `/api/operations/:id`
Обновить операцию

**Request Body:** (все поля опциональны)
```json
{
  "price": 0.035,
  "setup_cost": 4
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 13,
    "price": 0.035,
    ...
  }
}
```

#### DELETE `/api/operations/:id`
Удалить операцию

**Response:**
```json
{
  "success": true,
  "message": "Operation deleted successfully"
}
```

### Связь продукт→операции

#### GET `/api/products/:productId/operations`
Получить операции, связанные с продуктом

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "link_id": 1,
      "sequence": 1,
      "is_required": true,
      "is_default": true,
      "price_multiplier": 1.0,
      "conditions": null,
      "id": 1,
      "name": "Цифровая цветная печать",
      "operation_type": "print",
      "price": 0.15,
      "parameters": {...}
    },
    {
      "link_id": 2,
      "sequence": 2,
      "is_required": true,
      "is_default": true,
      "price_multiplier": 1.0,
      "conditions": null,
      "id": 3,
      "name": "Резка на гильотине",
      "operation_type": "cut",
      "price": 0.01,
      "setup_cost": 5,
      "parameters": {...}
    }
  ],
  "count": 2
}
```

#### POST `/api/products/:productId/operations`
Добавить операцию к продукту

**Request Body:**
```json
{
  "operation_id": 5,
  "sequence": 3,
  "is_required": false,
  "is_default": false,
  "price_multiplier": 1.2,
  "conditions": {
    "lamination": true
  }
}
```

**Parameters:**
- `operation_id` (required) - ID операции
- `sequence` (optional, default: 1) - порядок выполнения
- `is_required` (optional, default: true) - обязательная операция
- `is_default` (optional, default: true) - операция включена по умолчанию
- `price_multiplier` (optional, default: 1.0) - множитель цены для данного продукта
- `conditions` (optional) - JSON условия применения операции

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 3,
    "product_id": 1,
    "operation_id": 5,
    "sequence": 3,
    ...
  }
}
```

#### DELETE `/api/products/:productId/operations/:linkId`
Удалить операцию из продукта

**Response:**
```json
{
  "success": true,
  "message": "Operation removed from product successfully"
}
```

### Расчет цены

#### POST `/api/products/:productId/calculate?useFlexiblePricing=true`
Рассчитать цену продукта

**Query Parameters:**
- `useFlexiblePricing` (optional) - использовать гибкую систему операций (`true`) или старый метод (`false`, по умолчанию)

**Request Body:**
```json
{
  "quantity": 100,
  "parameters": {
    "width": 90,
    "height": 50,
    "sides": 2,
    "lamination": true,
    "corner_rounding": false
  }
}
```

**Response (гибкая система):**
```json
{
  "productId": 1,
  "productName": "Визитки 90x50",
  "quantity": 100,
  "productSize": {
    "width": 90,
    "height": 50
  },
  "layout": {
    "fitsOnSheet": true,
    "itemsPerSheet": 10,
    "recommendedSheetSize": {
      "width": 320,
      "height": 450
    }
  },
  "materials": [
    {
      "materialId": 1,
      "materialName": "Бумага мелованная 350г",
      "quantity": 10,
      "unitPrice": 0.40,
      "totalCost": 4.00
    }
  ],
  "operations": [
    {
      "operationId": 1,
      "operationName": "Цифровая цветная печать",
      "operationType": "print",
      "priceUnit": "per_sheet",
      "unitPrice": 0.15,
      "quantity": 10,
      "setupCost": 0,
      "totalCost": 1.50
    },
    {
      "operationId": 3,
      "operationName": "Резка на гильотине",
      "operationType": "cut",
      "priceUnit": "per_sheet",
      "unitPrice": 0.01,
      "quantity": 10,
      "setupCost": 5,
      "totalCost": 5.10
    },
    {
      "operationId": 5,
      "operationName": "Ламинация глянцевая",
      "operationType": "laminate",
      "priceUnit": "per_sheet",
      "unitPrice": 0.25,
      "quantity": 10,
      "setupCost": 10,
      "totalCost": 12.50
    }
  ],
  "materialCost": 4.00,
  "operationsCost": 19.10,
  "setupCosts": 15.00,
  "subtotal": 23.10,
  "markup": 2.2,
  "discountPercent": 0,
  "discountAmount": 0,
  "finalPrice": 50.82,
  "pricePerUnit": 0.51
}
```

## Типы операций

| `operation_type` | Описание | Рекомендуемый `price_unit` |
|------------------|----------|---------------------------|
| `print` | Печать (цифровая, офсет) | `per_sheet` |
| `cut` | Резка (гильотина, скругление) | `per_sheet`, `per_item` |
| `fold` | Фальцовка | `per_item` |
| `score` | Биговка | `per_item` |
| `laminate` | Ламинация | `per_sheet` |
| `bind` | Переплет | `per_item` |
| `perforate` | Перфорация | `per_item` |
| `emboss` | Тиснение | `per_item` |
| `foil` | Фольгирование | `per_item` |
| `varnish` | Лакирование | `per_sheet`, `per_m2` |
| `package` | Упаковка | `per_order`, `fixed` |
| `design` | Дизайн | `fixed` |
| `delivery` | Доставка | `fixed`, `per_order` |
| `other` | Прочее | любой |

## Единицы измерения (`price_unit`)

| Значение | Описание | Использование |
|----------|----------|---------------|
| `per_sheet` | За лист | Печать, ламинация, резка листов |
| `per_item` | За изделие | Резка изделий, фальцовка, биговка |
| `per_m2` | За м² | Широкоформатная печать |
| `per_hour` | За час работы | Сложные операции |
| `fixed` | Фиксированная стоимость | Дизайн, проверка макета |
| `per_order` | За заказ | Упаковка, доставка |

## Примеры использования

### 1. Создать визитку с печатью и резкой

```bash
# 1. Создать продукт "Визитки 90x50"
POST /api/products
{
  "category_id": 1,
  "name": "Визитки 90x50",
  "description": "Стандартные визитки"
}

# 2. Добавить операцию печати
POST /api/products/1/operations
{
  "operation_id": 1,  # Цифровая печать
  "sequence": 1,
  "is_required": true
}

# 3. Добавить операцию резки
POST /api/products/1/operations
{
  "operation_id": 3,  # Резка
  "sequence": 2,
  "is_required": true
}

# 4. Рассчитать цену
POST /api/products/1/calculate?useFlexiblePricing=true
{
  "quantity": 100,
  "parameters": {
    "width": 90,
    "height": 50,
    "sides": 2
  }
}
```

### 2. Добавить условную операцию (ламинация)

```bash
POST /api/products/1/operations
{
  "operation_id": 5,  # Ламинация
  "sequence": 3,
  "is_required": false,
  "is_default": false,
  "conditions": {
    "lamination": true
  }
}
```

Теперь ламинация применится только если в конфигурации указано `"lamination": true`.

## Миграции

Для применения гибкой системы операций выполните:

```bash
cd backend
npm run migrate
```

Миграция `20250202000001_add_flexible_operations.ts`:
- Расширяет `post_processing_services`
- Создает `product_operations_link`
- Создает `operation_pricing_rules`
- Добавляет seed базовых операций

## См. также

- [Документация гибкой системы](./flexible-calculator-system.md)
- [Краткий обзор](../FLEXIBLE_CALCULATOR_SUMMARY.md)


