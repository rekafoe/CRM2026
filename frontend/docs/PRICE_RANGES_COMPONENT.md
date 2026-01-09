# Компонент PriceRangesTable

## Описание

`PriceRangesTable` - переиспользуемый компонент для отображения и управления таблицами цен на диапазоны количеств. Компонент решает проблемы со сложной логикой работы с диапазонами, которая была разбросана по разным файлам.

## Преимущества

1. **Переиспользуемость** - можно использовать в любом месте приложения
2. **Простота** - вся логика работы с диапазонами в одном месте
3. **Тестируемость** - легко тестировать изолированно
4. **Поддерживаемость** - изменения в одном месте

## Использование

### Базовый пример

```tsx
import { PriceRangesTable } from '@/components/common';
import { PriceRange } from '@/hooks/usePriceRanges';

const MyComponent = () => {
  const rangeSets: PriceRange[][] = [
    [
      { minQty: 1, maxQty: 99, price: 10.0 },
      { minQty: 100, maxQty: undefined, price: 8.0 },
    ],
    [
      { minQty: 1, maxQty: 99, price: 12.0 },
      { minQty: 100, maxQty: undefined, price: 10.0 },
    ],
  ];

  return (
    <PriceRangesTable
      rangeSets={rangeSets}
      rangeSetLabels={['Вариант 1', 'Вариант 2']}
      onPriceChange={(setIndex, minQty, newPrice) => {
        console.log(`Изменена цена для варианта ${setIndex}, диапазон ${minQty}: ${newPrice}`);
      }}
      editable={true}
      unit="шт."
    />
  );
};
```

### С обработчиками событий

```tsx
const handlePriceChange = async (rangeSetIndex: number, minQty: number, newPrice: number) => {
  // Обновление на сервере
  await updatePrice(rangeSetIndex, minQty, newPrice);
};

const handleAddBoundary = async (boundary: number) => {
  // Добавление новой границы диапазона
  await addBoundary(boundary);
};

<PriceRangesTable
  rangeSets={rangeSets}
  onPriceChange={handlePriceChange}
  onAddBoundary={handleAddBoundary}
  onEditBoundary={handleEditBoundary}
  onRemoveRange={handleRemoveRange}
/>
```

## API

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `rangeSets` | `PriceRange[][]` | ✅ | Массив наборов диапазонов |
| `rangeSetLabels` | `string[]` | ❌ | Названия для колонок |
| `onPriceChange` | `(setIndex, minQty, newPrice) => void` | ❌ | Callback при изменении цены |
| `onAddBoundary` | `(boundary) => void` | ❌ | Callback при добавлении границы |
| `onEditBoundary` | `(rangeIndex, newBoundary) => void` | ❌ | Callback при редактировании границы |
| `onRemoveRange` | `(rangeIndex) => void` | ❌ | Callback при удалении диапазона |
| `editable` | `boolean` | ❌ | Разрешить редактирование (по умолчанию: `true`) |
| `unit` | `string` | ❌ | Единица измерения (по умолчанию: `'шт.'`) |

### PriceRange

```typescript
interface PriceRange {
  minQty: number;      // Минимальное количество
  maxQty?: number;     // Максимальное количество (undefined = без ограничения)
  price: number;       // Цена за единицу
}
```

## Утилиты

Компонент использует класс `PriceRangeUtils` из `hooks/usePriceRanges.ts`:

- `normalize()` - нормализует диапазоны
- `addBoundary()` - добавляет границу диапазона
- `editBoundary()` - редактирует границу
- `removeRange()` - удаляет диапазон
- `updatePrice()` - обновляет цену
- `findCommonRanges()` - находит общие диапазоны

## Миграция из ServiceVariantsTable

Вместо сложной логики с множеством утилитарных функций:

```tsx
// ❌ Старый подход
const normalizeTiers = (tiers) => { /* сложная логика */ };
const addRangeBoundary = (tiers, boundary) => { /* сложная логика */ };
// ... еще 10 функций
```

Используйте компонент:

```tsx
// ✅ Новый подход
<PriceRangesTable
  rangeSets={rangeSets}
  onPriceChange={handlePriceChange}
  onAddBoundary={handleAddBoundary}
/>
```

## Примеры использования

См. файл `PriceRangesTableExample.tsx` для полного примера интеграции с ServiceVariantsTable.
