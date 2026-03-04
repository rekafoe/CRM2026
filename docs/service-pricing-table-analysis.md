# Анализ ServicePricingTable — таблица сложных операций (отделка)

## Где используется

- **FinishingCard** → **ServicePricingTable** — настройка отделки для размера продукта (упрощённый калькулятор)
- Файл: `frontend/src/features/productTemplate/components/ServicePricingTable.tsx` (~560 строк)

## Текущая структура

### 1. Простые услуги (резка, биговка, фальцовка)
- Чекбокс: включить/выключить
- Колонки: цены по диапазонам тиража (1–10, 11–50, …)
- Цены только для чтения (берутся из services-management)

### 2. Сложные услуги (ламинация)
- Чекбокс + **два селектора**:
  - **1. Тип**: Рулонная / Пакетная (из `variantName`)
  - **2. Подтип с плотностью**: Глянец 32 мк, Матовая 64 мк (из `parameters.type` + `parameters.density`)
- Колонки: те же диапазоны
- Определение «сложности»: `operation_type === 'laminate'` или имя содержит «ламинация»

## Выявленные проблемы

### 1. Загрузка вариантов — лишние перезагрузки
```ts
useEffect(() => {
  // ...
  setServiceVariants(prev => new Map(prev).set(service.id, variants))
  // ...
}, [services, serviceVariants])  // ⚠️ serviceVariants в deps — при каждом setState эффект перезапускается
```
**Проблема**: `serviceVariants` в зависимостях приводит к повторным вызовам эффекта после обновления состояния.

### 2. Несогласованность данных при смене типа
В `handleTypeChange`:
- Берётся `firstVariant` из `variantsOfNewType[0]`
- `density` берётся из `firstVariant?.parameters?.density`
- Но `subtype` — из `firstSubtype` (строка типа "Глянец 32 мк")

Если у первого варианта нет density или type, `subtype` и `density` могут не совпадать с выбранным вариантом.

### 3. Дублирование подтипов по label
В `handleSubtypeChange`:
```ts
const selectedSubtypeData = subtypes.find(st => st.value === newSubtypeValue)
```
Если у разных вариантов одинаковый `value` (type + density), всегда берётся первый — `variant_id` может быть неверным.

### 4. Цены не привязаны к варианту
- Используется `getServiceVolumeTiers(service.id)` — tiers по **услуге**, а не по **варианту**
- Для ламинации цены различаются по вариантам (Рулонная/Пакетная, Глянец/Матовая)
- Должен вызываться `getServiceVariantTiers(serviceId, variantId)` при выбранном варианте

### 5. Автовыбор при добавлении услуги
```ts
...(needsVariants && uniqueTypes.length > 0 ? {
  variant_id: uniqueTypes[0]?.id,      // ⚠️ id типа (level 0), а не подтипа (level 1)
  variant_name: uniqueTypes[0]?.variantName,
  subtype: subtypes[0]?.value,         // subtypes могут быть пустыми для этого типа
  density: subtypes[0]?.density
} : {}),
```
`uniqueTypes[0]?.id` — это id варианта уровня 0 (тип). Для ламинации нужен id конкретного подтипа (уровень 1), у которого есть type и density.

### 6. Смешение логики tiers и вариантов
- Модалка «+ Диапазон» редактирует `commonRanges` — общие границы для всех услуг
- Для вариантов tiers хранятся в `service_variant_tiers` (per variant)
- Таблица показывает tiers из `getServiceVolumeTiers`, не учитывая выбранный вариант

### 7. Жёсткая привязка к ламинации
```ts
const needsVariants = opType === 'laminate' || service.name?.toLowerCase().includes('ламинация')
```
Другие сложные услуги с вариантами не поддерживаются.

## Рекомендации по упрощению

### Вариант A: Один плоский селектор вариантов ✅ РЕАЛИЗОВАН
Вместо «Тип → Подтип» — один выпадающий список всех вариантов:
- «Рулонная, Глянец 32 мк»
- «Рулонная, Матовая 64 мк»
- «Пакетная, Глянец 32 мк»
- и т.д.

Плюсы: проще код, меньше состояний, однозначный `variant_id`.

### Вариант B: Разделить простые и сложные
- **Простые услуги**: текущая таблица (чекбокс + колонки цен)
- **Сложные услуги**: отдельный блок/компонент с плоским списком вариантов

### Вариант C: Использовать структуру ServiceVariantsTable
В `ServiceVariantsTable` уже есть `groupVariantsByType`, `getVariantLevel`. Можно вынести общую логику в хук `useServiceVariantsForProduct` и переиспользовать.

### Критичные исправления (минимальный набор)
1. Убрать `serviceVariants` из deps в useEffect загрузки вариантов
2. Загружать tiers по `getServiceVariantTiers(serviceId, variantId)` при выбранном варианте
3. При добавлении услуги с вариантами подставлять id первого **листового** варианта (с type/density), а не уровня 0
4. В `handleSubtypeChange` искать по `variantId`, а не по строковому label
