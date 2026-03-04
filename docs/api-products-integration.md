# API для интеграции: категории, продукты, подтипы, схемы

Базовый путь: `/api/products` (префикс `/api` задаётся в приложении).

---

## 1. Категории продуктов

### GET `/api/products/categories`

Список всех категорий.

**Query-параметры:**
| Параметр    | Тип    | Описание |
|-------------|--------|----------|
| `activeOnly`| string | `"true"` — только активные категории |
| `withMinPrice` | string | `"1"` — добавить `min_price` (минимальная цена среди продуктов категории) |

**Примечание:** `image_url` и другие пути к файлам (`/api/uploads/*`) требуют API-ключ, если задан `WEBSITE_ORDER_API_KEY`. См. [Доступ к файлам](./website-orders-integration.md#доступ-к-файлам-картинки-продуктов-категорий-подтипов) в документации интеграции.

**Ответ:** массив объектов:
```json
[
  {
    "id": 1,
    "name": "Визитки",
    "icon": "📦",
    "description": "Описание категории",
    "sort_order": 0,
    "is_active": 1,
    "image_url": "/api/uploads/cat-123.png",
    "created_at": "...",
    "updated_at": "...",
    "min_price": 150
  }
]
```

---

### POST `/api/products/categories`

Создание категории.

**Body (JSON):**
```json
{
  "name": "Название категории",
  "icon": "📦",
  "description": "Описание",
  "sort_order": 0,
  "image_url": "/api/uploads/..."
}
```

**Ответ:**
```json
{
  "id": 1,
  "name": "Название категории",
  "icon": "📦",
  "description": "Описание",
  "sort_order": 0,
  "image_url": null
}
```

---

### PUT `/api/products/categories/:id`

Обновление категории.

**Body (JSON):**
```json
{
  "name": "Новое название",
  "icon": "📦",
  "description": "Описание",
  "sort_order": 0,
  "is_active": true,
  "image_url": "/api/uploads/..."
}
```

**Ответ:** `{ "success": true }`

---

### POST `/api/products/categories/upload-image`

Загрузка изображения категории.

**Content-Type:** `multipart/form-data`  
**Поле:** `image` (файл)

**Ограничения:** JPEG, PNG, WebP, GIF, SVG; макс. 5 МБ.

**Ответ:**
```json
{
  "image_url": "/api/uploads/filename.png",
  "filename": "filename.png",
  "size": 12345
}
```

---

## 2. Продукты

### GET `/api/products`

Список всех продуктов.

**Query-параметры:**
| Параметр    | Тип    | Описание |
|-------------|--------|----------|
| `activeOnly`| string | `"true"` — только активные продукты и категории |
| `search`    | string | Поиск по названию, описанию, названию категории |
| `withMinPrice` | string | `"1"` — добавить `min_price` для каждого продукта |

**Ответ:** массив объектов:
```json
[
  {
    "id": 1,
    "category_id": 1,
    "name": "Визитки стандарт",
    "description": "Описание",
    "icon": "📦",
    "image_url": "/api/uploads/...",
    "calculator_type": "simplified",
    "product_type": "sheet_item",
    "operator_percent": 0,
    "is_active": 1,
    "category_name": "Визитки",
    "category_icon": "📦",
    "created_at": "...",
    "updated_at": "...",
    "min_price": 150
  }
]
```

---

### GET `/api/products/category/:categoryId`

Продукты по категории.

**Query-параметры:**
| Параметр    | Тип    | Описание |
|-------------|--------|----------|
| `activeOnly`| string | `"true"` — только активные |

**Ответ:** массив продуктов (структура как в GET `/api/products`).

---

### GET `/api/products/:productId`

Детали продукта (параметры, услуги, материалы).

**Ответ:**
```json
{
  "id": 1,
  "category_id": 1,
  "name": "Визитки",
  "description": "...",
  "icon": "📦",
  "image_url": "/api/uploads/...",
  "calculator_type": "simplified",
  "product_type": "sheet_item",
  "parameters": [...],
  "post_processing_services": [...],
  "category_name": "Визитки",
  "category_icon": "📦"
}
```

---

### POST `/api/products`

Создание продукта.

**Body (JSON):**
```json
{
  "category_id": 1,
  "name": "Название продукта",
  "description": "Описание",
  "icon": "📦",
  "image_url": "/api/uploads/...",
  "calculator_type": "simplified",
  "product_type": "sheet_item",
  "operator_percent": 0,
  "auto_attach_operations": true
}
```

**Поля:**
- `category_id` — ID категории (опционально, подставится первая или создастся «Без категории»)
- `calculator_type` — `"product"` | `"operation"` | `"simplified"`
- `product_type` — `"sheet_single"` | `"sheet_item"` | `"multi_page"` | `"universal"`
- `product_type: "multi_page"` автоматически задаёт `calculator_type: "simplified"`

**Ответ:**
```json
{
  "id": 1,
  "category_id": 1,
  "name": "Название продукта",
  "description": "...",
  "icon": "📦",
  "calculator_type": "simplified",
  "product_type": "sheet_item",
  "operator_percent": 0
}
```

---

### PUT `/api/products/:id`

Обновление продукта.

**Body (JSON):** любые поля для обновления:
```json
{
  "category_id": 1,
  "name": "Новое название",
  "description": "...",
  "icon": "📦",
  "image_url": "/api/uploads/...",
  "is_active": true,
  "product_type": "sheet_item",
  "calculator_type": "simplified",
  "print_settings": { ... },
  "operator_percent": 10
}
```

**Ответ:** `{ "success": true, "updated": 1 }`

---

### DELETE `/api/products/:id`

Удаление продукта (каскадно удаляются материалы, параметры, операции, конфиги).

**Ответ:** `{ "success": true }`

---

### POST `/api/products/upload-image`

Загрузка изображения продукта.

**Content-Type:** `multipart/form-data`  
**Поле:** `image` (файл)

**Ответ:**
```json
{
  "image_url": "/api/uploads/filename.png",
  "filename": "filename.png",
  "size": 12345
}
```

---

## 3. Схема продукта (калькулятор + каталог)

### GET `/api/products/:productId/schema`

Полная схема продукта для калькулятора и каталога.

**Query-параметры:**
| Параметр | Тип    | Описание |
|----------|--------|----------|
| `compact`| string | `"1"` / `"true"` / `"yes"` — компактная схема без тяжёлых блоков (для каталога) |

**Ответ (полный):**
```json
{
  "data": {
    "id": 1,
    "key": "vizitki_standart",
    "name": "Визитки стандарт",
    "type": "Визитки стандарт",
    "description": "...",
    "fields": [
      {
        "name": "material_id",
        "label": "Материал",
        "type": "string",
        "required": true,
        "enum": [{"value": 1, "label": "Мелованная 300г", "price": 1.5}]
      },
      {
        "name": "format",
        "label": "Формат",
        "type": "string",
        "required": true,
        "enum": ["90×50"]
      }
    ],
    "materials": [...],
    "operations": [...],
    "template": {
      "trim_size": {"width": 90, "height": 50},
      "print_sheet": {...},
      "print_run": {...},
      "finishing": [...],
      "packaging": [...],
      "price_rules": [...],
      "simplified": {
        "use_layout": true,
        "cutting": false,
        "pages": {"options": [4, 8, 12], "default": 4},
        "sizes": [...],
        "types": [...],
        "typeConfigs": {...}
      }
    },
    "constraints": {
      "allowed_paper_types": ["coated"],
      "allowed_print_technologies": [...],
      "allowed_color_modes": [...],
      "allowed_sides": [...]
    }
  }
}
```

**Ответ (compact):**
```json
{
  "data": {
    "id": 1,
    "key": "vizitki_standart",
    "name": "Визитки стандарт",
    "type": "Визитки стандарт",
    "description": "...",
    "template": {
      "trim_size": {...},
      "print_sheet": {...},
      "print_run": {...},
      "simplified": {
        "use_layout": true,
        "cutting": false,
        "pages": {...},
        "sizes": [...],
        "types": [...],
        "typeConfigs": {...}
      }
    },
    "constraints": {...}
  },
  "meta": { "compact": true }
}
```

---

## 4. Конфигурации шаблона (подтипы и схемы)

Конфигурация хранится в `product_template_configs`. Для упрощённых продуктов используется `config_data` с полем `simplified`.

### GET `/api/products/:productId/configs`

Список конфигураций продукта.

**Ответ:** массив:
```json
[
  {
    "id": 1,
    "product_id": 1,
    "name": "template",
    "config_data": {...},
    "constraints": {...},
    "is_active": true,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

### POST `/api/products/:productId/configs`

Создание конфигурации.

**Body (JSON):**
```json
{
  "name": "template",
  "config_data": {
    "trim_size": {"width": 90, "height": 50},
    "simplified": {
      "use_layout": true,
      "cutting": false,
      "pages": {"options": [4, 8], "default": 4},
      "sizes": [...],
      "types": [...],
      "typeConfigs": {...}
    }
  },
  "constraints": {...},
  "is_active": true
}
```

**Ответ:** созданный объект конфигурации.

---

### PUT `/api/products/:productId/configs/:configId`

Обновление конфигурации.

**Body (JSON):** частичное обновление:
```json
{
  "name": "template",
  "config_data": {...},
  "constraints": {...},
  "is_active": true
}
```

**Ответ:** обновлённый объект конфигурации.

---

### DELETE `/api/products/:productId/configs/:configId`

Удаление конфигурации.

**Ответ:** `{ "success": true }`

---

## 5. Структура `simplified` (подтипы и схемы)

Объект `simplified` внутри `config_data` описывает упрощённый калькулятор.

### Корневой уровень

```typescript
{
  use_layout?: boolean;        // Использовать раскладку
  cutting?: boolean;           // Резка
  duplex_as_single_x2?: boolean;
  include_material_cost?: boolean;
  pages?: {
    options: number[];         // [4, 8, 12]
    default?: number;
  };
  sizes: SimplifiedSize[];     // Размеры (если нет подтипов)
  types?: SimplifiedType[];    // Подтипы продукта
  typeConfigs?: Record<string, SimplifiedTypeConfig>;  // Схемы по подтипам
}
```

### SimplifiedType (подтип)

```typescript
{
  id: number;                  // Уникальный ID подтипа
  name: string;                // Название (напр. "Стандарт", "Премиум")
  default?: boolean;           // Подтип по умолчанию
  briefDescription?: string;
  image_url?: string;
}
```

### SimplifiedTypeConfig (схема подтипа)

Ключ — `String(type.id)`.

```typescript
{
  sizes: SimplifiedSize[];     // Размеры для этого подтипа
  pages?: { options: number[]; default?: number };
  initial?: {
    print_technology?: string;
    print_color_mode?: string;
    material_id?: number;
    default_operation_ids?: number[];
  };
  finishing?: Array<{ service_id: number; ... }>;
}
```

### SimplifiedSize (размер)

```typescript
{
  id: number;
  label: string;               // "90×50", "А6"
  width_mm?: number;
  height_mm?: number;
  min_qty?: number;
  max_qty?: number;
  allowed_material_ids?: number[];
  print_prices?: Array<{
    print_technology?: string;
    print_color_mode?: string;
    sides?: string;
    tiers: Array<{ min_qty: number; unit_price: number }>;
  }>;
  finishing?: Array<{ service_id: number; ... }>;
}
```

---

## 6. Дополнительные эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/products/:productId/tier-prices` | Цены по диапазонам тиража (print_prices, material_prices, finishing с tiers) |
| GET | `/api/products/:productId/materials` | Материалы продукта |
| POST | `/api/products/:productId/materials` | Добавить материал |
| POST | `/api/products/:productId/materials/bulk` | Массовое добавление материалов |
| DELETE | `/api/products/:productId/materials/:materialId` | Удалить материал |
| GET | `/api/products/:productId/services` | Услуги продукта |
| POST | `/api/products/:productId/services` | Добавить услугу |
| DELETE | `/api/products/:productId/services/:serviceId` | Удалить услугу |
| GET | `/api/products/:productId/operations` | Операции продукта |
| POST | `/api/products/:productId/operations` | Добавить операцию |
| POST | `/api/products/:productId/operations/bulk` | Массовое добавление операций |
| PUT | `/api/products/:productId/operations/:linkId` | Обновить операцию |
| DELETE | `/api/products/:productId/operations/:linkId` | Удалить операцию |
| POST | `/api/products/:productId/calculate` | Расчёт цены |
| POST | `/api/products/:productId/validate-size` | Валидация размера |
| GET | `/api/products/parameter-presets` | Пресеты параметров (`?productType=...`) |

---

## 6.1. Калькулятор подтипа и расчёт цены

### Как получить калькулятор (схему) для подтипа

1. Вызовите **`GET /api/products/:productId/schema`** — возвращается полная схема продукта.
2. В ответе в `template.config_data.simplified` есть:
   - **`types`** — массив подтипов с полями `id`, `name`, `default`, `briefDescription`, `image_url`;
   - **`typeConfigs`** — объект, где ключ = `String(type.id)`, значение — конфиг подтипа.

Для каждого подтипа из `types` в `typeConfigs[String(type.id)]` лежит:
- `sizes` — размеры для этого подтипа;
- `pages` — опции страниц (если есть);
- `initial` — печать, материал по умолчанию;
- `finishing` — услуги отделки.

**Пример ответа schema:**
```json
{
  "template": {
    "config_data": {
      "simplified": {
        "types": [
          { "id": 1, "name": "Стандарт", "default": true },
          { "id": 2, "name": "Премиум" }
        ],
        "typeConfigs": {
          "1": {
            "sizes": [
              { "id": 1, "label": "90×50", "width_mm": 90, "height_mm": 50, "print_prices": [...] }
            ]
          },
          "2": {
            "sizes": [
              { "id": 10, "label": "85×55", "width_mm": 85, "height_mm": 55, "print_prices": [...] }
            ]
          }
        }
      }
    }
  }
}
```

Чтобы построить UI калькулятора для подтипа:
- возьмите `types` для списка подтипов;
- для выбранного `typeId` используйте `typeConfigs[String(typeId)].sizes` и остальные поля конфига.

---

### Как вызвать расчёт для подтипа

**`POST /api/products/:productId/calculate`**

**Body (JSON):** обязательно укажите `typeId` (или `type_id`) — ID подтипа из `types`.

```json
{
  "quantity": 100,
  "typeId": 1,
  "size_id": 1,
  "material_id": 5,
  "print_technology": "offset",
  "print_color_mode": "full_color",
  "print_sides_mode": "duplex"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `quantity` | number | Тираж (обязательно) |
| `typeId` или `type_id` | number | ID подтипа (обязательно для продуктов с подтипами) |
| `size_id` | number | ID размера из `typeConfigs[typeId].sizes` |
| `material_id` | number | ID материала |
| `print_technology` | string | Технология печати |
| `print_color_mode` | string | Режим цвета |
| `print_sides_mode` | string | `"single"` или `"duplex"` |

Бэкенд по `typeId` берёт размеры из `typeConfigs[typeId].sizes` и считает цену.

**Альтернативный эндпоинт:** `POST /api/pricing/calculate` — в body передать `productId`, `quantity` и `configuration` (включая `typeId`).

---

## 7. Типичный сценарий интеграции

### Создание упрощённого продукта с подтипами

1. **Создать категорию** (если нет):
   ```
   POST /api/products/categories
   { "name": "Визитки", "icon": "📦" }
   ```

2. **Создать продукт**:
   ```
   POST /api/products
   {
     "category_id": 1,
     "name": "Визитки",
     "calculator_type": "simplified",
     "product_type": "sheet_item"
   }
   ```

3. **Создать конфигурацию с подтипами**:
   ```
   POST /api/products/1/configs
   {
     "name": "template",
     "config_data": {
       "simplified": {
         "use_layout": true,
         "cutting": false,
         "types": [
           { "id": 1, "name": "Стандарт", "default": true },
           { "id": 2, "name": "Премиум" }
         ],
         "typeConfigs": {
           "1": {
             "sizes": [
               {
                 "id": 1,
                 "label": "90×50",
                 "width_mm": 90,
                 "height_mm": 50,
                 "allowed_material_ids": [1, 2],
                 "print_prices": [...]
               }
             ]
           },
           "2": { "sizes": [...] }
         }
       }
     }
   }
   ```

4. **Получить схему для калькулятора**:
   ```
   GET /api/products/1/schema
   ```

5. **Получить компактную схему для каталога**:
   ```
   GET /api/products/1/schema?compact=1
   ```
