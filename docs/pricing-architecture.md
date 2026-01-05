# 🎯 Архитектура ценообразования - Единый источник истины

## Обзор

Система ценообразования CRM построена на принципе **единого источника истины** - все расчеты цен проходят через `UnifiedPricingService`.

## 🏗️ Архитектура

```
┌───────────────────────────────────────────┐
│      UnifiedPricingService                │ ← ЕДИНСТВЕННАЯ ТОЧКА ВХОДА
│   (Единый источник истины)                │
└───────────────┬───────────────────────────┘
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

## 📚 Сервисы

### 1. UnifiedPricingService (Главный)

**Файл:** `backend/src/modules/pricing/services/unifiedPricingService.ts`

**Назначение:** Единая точка входа для всех расчетов цен

**Методы:**
- `calculatePrice(productId, configuration, quantity)` - главный метод расчета

**Логика:**
1. Проверяет, есть ли у продукта операции
2. Если есть → использует `FlexiblePricingService`
3. Если нет → фоллбэк на legacy систему
4. Возвращает унифицированный результат

**Пример использования:**
```typescript
import { UnifiedPricingService } from './modules/pricing';

const result = await UnifiedPricingService.calculatePrice(
  productId,
  configuration,
  quantity
);

console.log(result.calculationMethod); 
// 'flexible_operations' или 'fallback_legacy'
```

### 2. FlexiblePricingService (Новая система)

**Файл:** `backend/src/modules/pricing/services/flexiblePricingService.ts`

**Назначение:** Расчет через систему операций (печать, резка, ламинация и т.п.)

**Особенности:**
- ✅ Без хардкода - все операции из БД
- ✅ Поддержка правил ценообразования
- ✅ Условия применения операций
- ✅ 6 типов единиц измерения

**Таблицы:**
- `post_processing_services` - операции
- `product_operations_link` - связь продукт→операции
- `operation_pricing_rules` - правила ценообразования

### 3. DynamicPricingService (Настройки)

**Файл:** `backend/src/modules/pricing/services/dynamicPricingService.ts`

**Назначение:** Получение настроек ценообразования из БД

**Методы:**
- `getMinimumOrderCosts()` - минимальные стоимости
- `getProductBasePrices()` - базовые цены продуктов
- `getMaterialPrices()` - цены материалов
- `getServicePrices()` - цены услуг
- `getPricingMultipliers()` - множители
- `getDiscountRules()` - правила скидок

### 4. LayoutCalculationService (Раскладка)

**Файл:** `backend/src/modules/pricing/services/layoutCalculationService.ts`

**Назначение:** Расчет раскладки изделий на листе

**Методы:**
- `findOptimalSheetSize()` - оптимальный размер листа
- `validateProductSize()` - валидация размеров

## 📊 Структура результата

```typescript
interface UnifiedPricingResult {
  productId: number;
  productName: string;
  quantity: number;
  
  // Размеры и раскладка
  productSize: { width: number; height: number };
  layout: {
    fitsOnSheet: boolean;
    itemsPerSheet: number;
    recommendedSheetSize: { width: number; height: number };
  };
  
  // Стоимость
  materials: Array<{
    materialId: number;
    materialName: string;
    quantity: number;
    unitPrice: number;
    totalCost: number;
  }>;
  operations: Array<{
    operationId: number;
    operationName: string;
    operationType: string;
    priceUnit: string;
    unitPrice: number;
    quantity: number;
    setupCost: number;
    totalCost: number;
    appliedRules?: string[];
  }>;
  
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

## 🔄 Поток данных

### 1. Расчет цены

```
Клиент → API Endpoint → UnifiedPricingService
                             ↓
                    Проверка операций
                             ↓
                ┌────────────┴────────────┐
                ▼                         ▼
        FlexiblePricing            Legacy System
                ↓                         ↓
            Операции                   Старые цены
                ↓                         ↓
        DynamicPricing              DynamicPricing
                ↓                         ↓
                └────────────┬────────────┘
                             ▼
                    Итоговая цена
```

### 2. API Endpoint

```typescript
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

**Контроллер:**
```typescript
// backend/src/modules/products/routes/products.ts
const { UnifiedPricingService } = await import('../../pricing/services/unifiedPricingService');

const result = await UnifiedPricingService.calculatePrice(
  parseInt(productId),
  configuration,
  configuration.quantity
);
```

## 🗂️ Файловая структура

```
backend/src/modules/pricing/
├── services/
│   ├── unifiedPricingService.ts      ← ГЛАВНЫЙ СЕРВИС
│   ├── flexiblePricingService.ts     ← Новая система (операции)
│   ├── dynamicPricingService.ts      ← Настройки из БД
│   ├── layoutCalculationService.ts   ← Раскладка
│   ├── priceHistoryService.ts        ← История цен
│   └── costCalculationService.ts     ← Расчет себестоимости
├── controllers/
│   ├── pricingController.ts          ← API контроллер
│   ├── dynamicPricingController.ts   ← Управление настройками
│   └── priceManagementController.ts  ← Управление ценами
├── routes/
│   ├── pricing.ts                    ← Роуты для расчета
│   ├── dynamicPricing.ts             ← Роуты для настроек
│   └── pricingManagement.ts          ← Роуты для управления
└── index.ts                          ← Экспорты модуля
```

## ✅ Лучшие практики

### ✅ ПРАВИЛЬНО:

```typescript
// Используем единый сервис
import { UnifiedPricingService } from './modules/pricing';

const result = await UnifiedPricingService.calculatePrice(
  productId,
  configuration,
  quantity
);
```

### ❌ НЕПРАВИЛЬНО:

```typescript
// НЕ ИСПОЛЬЗУЙТЕ напрямую!
import { FlexiblePricingService } from './modules/pricing';
import { RealPricingService } from './modules/pricing'; // DELETED!

// Эти сервисы для внутреннего использования
const result = await FlexiblePricingService.calculatePrice(...);
```

## 🔧 Добавление новой операции

### 1. Через API:

```bash
POST /api/operations
{
  "name": "Скругление углов 2мм",
  "operation_type": "cut",
  "price": 0.015,
  "price_unit": "per_item",
  "setup_cost": 3,
  "min_quantity": 50,
  "parameters": {
    "radius": "2mm"
  }
}
```

### 2. Связать с продуктом:

```bash
POST /api/products/1/operations
{
  "operation_id": 13,
  "sequence": 4,
  "is_required": false,
  "price_multiplier": 1.0
}
```

### 3. Автоматически используется:

Теперь при расчете цены продукта #1 операция будет автоматически учтена!

## 📈 Миграция

### Удалены (deprecated):
- ❌ `PricingService` - старый хардкоженный сервис
- ❌ `RealPricingService` - промежуточный сервис

### Активные:
- ✅ `UnifiedPricingService` - главный
- ✅ `FlexiblePricingService` - новая система
- ✅ `DynamicPricingService` - настройки
- ✅ `LayoutCalculationService` - раскладка
- ✅ `PriceHistoryService` - история
- ✅ `CostCalculationService` - себестоимость

## 🎯 Преимущества

1. **Единая точка входа** - все расчеты через один сервис
2. **Без хардкода** - все данные из БД
3. **Гибкость** - легко добавлять новые операции
4. **Обратная совместимость** - фоллбэк на старую систему
5. **Прозрачность** - `calculationMethod` показывает, какой метод использовался
6. **Масштабируемость** - легко расширять функциональность

## 🚀 Дальнейшее развитие

- [ ] Админка для управления операциями и правилами
- [ ] AI-оптимизация цен на основе истории
- [ ] Интеграция с внешними системами
- [ ] Сезонные цены и акции
- [ ] Персонализация цен для клиентов

## 📝 См. также

- [API операций](./api-operations.md)
- [Гибкая система калькулятора](./flexible-calculator-system.md)
- [Управление ценами](./pricing-operations-guide.md)
- [Единый источник истины](./unified-pricing-guide.md)

---

**Статус:** ✅ Реализовано и работает  
**Дата:** 2025-02-02  
**Принцип:** Единый источник истины для ценообразования


