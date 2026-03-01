# Пример запроса к POST /api/pricing/calculate

Запрос формируется в `ImprovedPrintingCalculatorModal` → `useCalculatorPricingActions` → `calculatePrice` (services/pricing).

## Эндпоинт

```
POST /api/pricing/calculate
Content-Type: application/json
```

## Тело запроса (упрощённый продукт)

```json
{
  "productId": 58,
  "quantity": 96,
  "pricingType": "online",
  "configuration": {
    "productType": "flyers",
    "format": "105×148",
    "quantity": 96,
    "sides": 1,
    "paperType": "semi-matte",
    "paperDensity": 130,
    "lamination": "none",
    "priceType": "standard",
    "customerType": "regular",
    "urgency": "standard",
    "size_id": 1,
    "material_id": 5,
    "print_technology": "digital_toner",
    "printTechnology": "digital_toner",
    "print_color_mode": "color",
    "printColorMode": "color",
    "selectedOperations": [
      {
        "operationId": 7,
        "variantId": 2,
        "quantity": 1
      }
    ],
    "finishing": [
      {
        "service_id": 7,
        "price_unit": "per_item",
        "units_per_item": 1,
        "variant_id": 2
      }
    ]
  }
}
```

## Ключевые поля для simplified-продуктов

| Поле | Тип | Описание |
|------|-----|----------|
| `productId` | number | ID продукта |
| `quantity` | number | Тираж |
| `configuration.size_id` | number \| string | ID размера из simplified.sizes |
| `configuration.material_id` | number | ID материала |
| `configuration.base_material_id` | number | ID материала-основы (заготовка), опционально |
| `configuration.print_technology` | string | Код технологии |
| `configuration.print_color_mode` | "color" \| "bw" | Режим цвета |
| `configuration.finishing` | array | `[{ service_id, price_unit?, units_per_item?, variant_id? }]` |
| `configuration.typeId` | number | ID типа продукта (если есть types), опционально |
| `configuration.pages` | number | Страниц (multi_page), опционально |
| `configuration.cutting` | boolean | Резка по раскладке, опционально |

## Пример ответа

```json
{
  "success": true,
  "data": {
    "productId": 58,
    "productName": "Листовки A6",
    "quantity": 96,
    "finalPrice": 26.72,
    "pricePerUnit": 0.28,
    "materials": [
      {
        "materialId": 5,
        "material": "Мелованная 130",
        "quantity": 1,
        "unitPrice": 0.12,
        "total": 0.12
      }
    ],
    "operations": [
      {
        "operationId": 1,
        "operationName": "Печать",
        "quantity": 96,
        "unitPrice": 0.15,
        "totalCost": 14.4
      },
      {
        "operationId": 7,
        "operationName": "Ламинация мат 32 мк",
        "quantity": 1,
        "unitPrice": 12,
        "totalCost": 12
      }
    ],
    "layout": {
      "fitsOnSheet": true,
      "itemsPerSheet": 8,
      "sheetsNeeded": 12,
      "wastePercentage": 0.05
    }
  }
}
```

## Цепочка вызовов (frontend)

1. `ImprovedPrintingCalculatorModal` → `useCalculatorPricingActions.calculateCost()`
2. `calculatePriceViaBackend(productId, configuration, quantity)`
3. `unifiedCalculatePrice({ product_id, quantity, params: configuration, channel: 'online' })`
4. `api.post('/pricing/calculate', { productId, configuration, quantity, pricingType })`
