import { useMemo } from 'react';

export interface PriceRange {
  minQty: number;
  maxQty?: number;
  price: number;
}

/**
 * Утилиты для работы с диапазонами цен
 */
export class PriceRangeUtils {
  /**
   * Создает дефолтный диапазон
   */
  static defaultRange(): PriceRange[] {
    return [{ minQty: 1, maxQty: undefined, price: 0 }];
  }

  /**
   * Нормализует диапазоны: устанавливает maxQty на основе следующего minQty
   */
  static normalize(ranges: PriceRange[]): PriceRange[] {
    if (ranges.length === 0) return this.defaultRange();

    const sorted = [...ranges].sort((a, b) => a.minQty - b.minQty);

    // Устанавливаем maxQty для всех диапазонов кроме последнего
    for (let i = 0; i < sorted.length - 1; i++) {
      sorted[i] = { ...sorted[i], maxQty: sorted[i + 1].minQty - 1 };
    }

    // Последний диапазон без верхней границы
    if (sorted.length > 0) {
      sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], maxQty: undefined };
    }

    return sorted;
  }

  /**
   * Добавляет новую границу диапазона
   */
  static addBoundary(ranges: PriceRange[], newBoundary: number): PriceRange[] {
    if (ranges.length === 0) {
      return [
        { minQty: 1, maxQty: newBoundary - 1, price: 0 },
        { minQty: newBoundary, maxQty: undefined, price: 0 },
      ];
    }

    const sorted = [...ranges].sort((a, b) => a.minQty - b.minQty);
    
    // Проверяем, не существует ли уже такая граница
    if (sorted.some(r => r.minQty === newBoundary)) {
      return sorted;
    }

    // Находим диапазон, в который попадает новая граница
    const targetIndex = sorted.findIndex(r => {
      const max = r.maxQty !== undefined ? r.maxQty + 1 : Infinity;
      return newBoundary >= r.minQty && newBoundary < max;
    });

    if (targetIndex === -1) {
      // Добавляем в конец
      const lastRange = sorted[sorted.length - 1];
      if (lastRange.maxQty === undefined) {
        const newRanges = [...sorted];
        newRanges[newRanges.length - 1] = { ...lastRange, maxQty: newBoundary - 1 };
        newRanges.push({ minQty: newBoundary, maxQty: undefined, price: lastRange.price });
        return this.normalize(newRanges);
      }
      sorted.push({ minQty: newBoundary, maxQty: undefined, price: lastRange.price });
      return this.normalize(sorted);
    }

    const targetRange = sorted[targetIndex];

    if (newBoundary === targetRange.minQty) {
      return sorted;
    }

    // Разбиваем диапазон на два
    const newRanges = [...sorted];
    newRanges[targetIndex] = { ...targetRange, maxQty: newBoundary - 1 };
    newRanges.splice(targetIndex + 1, 0, {
      minQty: newBoundary,
      maxQty: targetRange.maxQty,
      price: targetRange.price, // Сохраняем цену из исходного диапазона
    });

    return this.normalize(newRanges);
  }

  /**
   * Редактирует границу диапазона
   */
  static editBoundary(ranges: PriceRange[], rangeIndex: number, newBoundary: number): PriceRange[] {
    const sorted = [...ranges].sort((a, b) => a.minQty - b.minQty);
    if (rangeIndex < 0 || rangeIndex >= sorted.length) return ranges;

    // Проверяем, не существует ли уже такая граница
    if (sorted.some((r, i) => i !== rangeIndex && r.minQty === newBoundary)) {
      return sorted;
    }

    const editedRange = sorted[rangeIndex];
    const newRanges = [...sorted];

    newRanges[rangeIndex] = { ...editedRange, minQty: newBoundary };

    // Обновляем предыдущий диапазон
    if (rangeIndex > 0) {
      newRanges[rangeIndex - 1] = { 
        ...newRanges[rangeIndex - 1], 
        maxQty: newBoundary - 1 
      };
    }

    return this.normalize(newRanges);
  }

  /**
   * Удаляет диапазон
   */
  static removeRange(ranges: PriceRange[], rangeIndex: number): PriceRange[] {
    const sorted = [...ranges].sort((a, b) => a.minQty - b.minQty);
    if (rangeIndex < 0 || rangeIndex >= sorted.length) return ranges;

    if (sorted.length <= 1) {
      return sorted; // Нельзя удалить последний диапазон
    }

    const newRanges = [...sorted];
    const removedRange = newRanges[rangeIndex];

    // Объединяем с предыдущим или следующим диапазоном
    if (rangeIndex > 0) {
      const prevRange = newRanges[rangeIndex - 1];
      newRanges[rangeIndex - 1] = { ...prevRange, maxQty: removedRange.maxQty };
    } else if (rangeIndex < newRanges.length - 1) {
      const nextRange = newRanges[rangeIndex + 1];
      newRanges[rangeIndex + 1] = { ...nextRange, minQty: 1 };
    }

    newRanges.splice(rangeIndex, 1);
    return this.normalize(newRanges);
  }

  /**
   * Обновляет цену для диапазона
   */
  static updatePrice(ranges: PriceRange[], minQty: number, newPrice: number): PriceRange[] {
    return ranges.map(r => 
      r.minQty === minQty ? { ...r, price: newPrice } : r
    );
  }

  /**
   * Находит общие диапазоны из нескольких наборов диапазонов
   */
  static findCommonRanges(rangeSets: PriceRange[][]): PriceRange[] {
    const allMinQtys = new Set<number>();
    
    rangeSets.forEach(ranges => {
      ranges.forEach(r => allMinQtys.add(r.minQty));
    });

    const sortedMinQtys = Array.from(allMinQtys).sort((a, b) => a - b);
    
    return sortedMinQtys.map((minQty, idx) => ({
      minQty,
      maxQty: idx < sortedMinQtys.length - 1 ? sortedMinQtys[idx + 1] - 1 : undefined,
      price: 0, // Цена будет установлена отдельно для каждого набора
    }));
  }
}

/**
 * Хук для работы с диапазонами цен
 */
export function usePriceRanges(initialRanges: PriceRange[] = []) {
  const normalizedRanges = useMemo(() => {
    return PriceRangeUtils.normalize(initialRanges);
  }, [initialRanges]);

  return {
    ranges: normalizedRanges,
    utils: PriceRangeUtils,
  };
}
