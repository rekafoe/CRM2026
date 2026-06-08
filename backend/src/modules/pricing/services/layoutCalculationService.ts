// Сервис для расчета раскладки и проверки размеров

export interface SheetSize {
  width: number;  // мм
  height: number; // мм
}

export interface ProductSize {
  width: number;  // мм
  height: number; // мм
}

export interface LayoutResult {
  fitsOnSheet: boolean;
  itemsPerSheet: number;
  wastePercentage: number;
  recommendedSheetSize: SheetSize;
  layout: {
    rows: number;
    cols: number;
    actualItemsPerSheet: number;
  };
  cutsPerSheet: number; // 🔪 Количество резов на лист
}

export class LayoutCalculationService {
  // Стандартные размеры листов
  private static readonly SHEET_SIZES: Record<string, SheetSize> = {
    'SRA3': { width: 320, height: 450 },
    'A3': { width: 297, height: 420 },
    'A4': { width: 210, height: 297 },
  };

  // Отступы и технологические поля
  private static readonly MARGINS = {
    printerMargins: 5,  // 5мм с каждой стороны - принтер не печатает ближе к краю
    layoutGap: 2        // 2мм между элементами при раскладке
  };

  /** Обрез совпадает с листом материала (с допуском), с учётом поворота */
  static trimMatchesSheetSize(trimSize: ProductSize, sheetSize: SheetSize, toleranceMm = 1): boolean {
    const tw = trimSize.width;
    const th = trimSize.height;
    const sw = sheetSize.width;
    const sh = sheetSize.height;
    return (
      (Math.abs(tw - sw) <= toleranceMm && Math.abs(th - sh) <= toleranceMm) ||
      (Math.abs(tw - sh) <= toleranceMm && Math.abs(th - sw) <= toleranceMm)
    );
  }

  /**
   * Проверяет, помещается ли продукт на лист
   * @param trimSize — обрезной формат изделия (мм)
   * @param customMarginMm — отступ с каждой стороны (мм). По умолчанию 5 мм. Для плоттерной резки — 15 мм.
   * @param customGapMm — зазор между стикерами (мм). По умолчанию 2 мм.
   * @param bleedMm — дозаливка с каждой стороны от обреза (мм); габарит ячейки = trim + 2×bleed по ширине и высоте.
   */
  static calculateLayout(
    trimSize: ProductSize,
    sheetSize: SheetSize,
    customMarginMm?: number,
    customGapMm?: number,
    bleedMm?: number
  ): LayoutResult {
    const margin = (customMarginMm != null && customMarginMm > 0) ? customMarginMm : this.MARGINS.printerMargins;
    const gap = (customGapMm != null && customGapMm >= 0) ? customGapMm : this.MARGINS.layoutGap;
    const bleed = Math.max(0, Number(bleedMm) || 0);

    // Готовая заготовка = лист материала: одно изделие на лист, без nesting с полями принтера
    if (this.trimMatchesSheetSize(trimSize, sheetSize)) {
      return {
        fitsOnSheet: true,
        itemsPerSheet: 1,
        wastePercentage: 0,
        recommendedSheetSize: sheetSize,
        layout: { rows: 1, cols: 1, actualItemsPerSheet: 1 },
        cutsPerSheet: 4,
      };
    }

    const cellW = trimSize.width + 2 * bleed;
    const cellH = trimSize.height + 2 * bleed;
    const availableWidth = sheetSize.width - (margin * 2);
    const availableHeight = sheetSize.height - (margin * 2);

    // Вариант 1: без поворота
    const variant1 = this.calculateSingleLayout(
      cellW,
      cellH,
      availableWidth,
      availableHeight,
      sheetSize,
      gap
    );

    // Вариант 2: с поворотом на 90°
    const variant2 = this.calculateSingleLayout(
      cellH,
      cellW,
      availableWidth,
      availableHeight,
      sheetSize,
      gap
    );

    // Выбираем вариант с меньшими отходами
    const selected = variant1.wastePercentage <= variant2.wastePercentage ? variant1 : variant2;

    // Специальное правило для визиток 55×85: всегда поворот для 21 шт на лист (по обрезу)
    if (trimSize.width === 55 && trimSize.height === 85) {
      return variant2; // 85×55 дает 3×7 = 21 шт
    }

    return selected;
  }

  /**
   * Расчет раскладки для одного варианта ориентации
   */
  private static calculateSingleLayout(
    itemWidth: number,
    itemHeight: number,
    availableWidth: number,
    availableHeight: number,
    sheetSize: SheetSize,
    gap?: number
  ): LayoutResult {
    const layoutGap = gap ?? this.MARGINS.layoutGap;
    const cols = Math.floor(availableWidth / (itemWidth + layoutGap));
    const rows = Math.floor(availableHeight / (itemHeight + layoutGap));

    // console.log(`🧮 Расчет раскладки ${itemWidth}×${itemHeight} на листе ${sheetSize.width}×${sheetSize.height}`);
    // console.log(`   Доступный размер: ${availableWidth}×${availableHeight} (принтер: ${this.MARGINS.printerMargins}мм с каждой стороны)`);
    // console.log(`   Колонки: floor(${availableWidth} / (${itemWidth} + ${this.MARGINS.layoutGap})) = ${cols}`);
    // console.log(`   Ряды: floor(${availableHeight} / (${itemHeight} + ${this.MARGINS.layoutGap})) = ${rows}`);

    const actualItemsPerSheet = cols * rows;
    const fitsOnSheet = actualItemsPerSheet > 0;

    // Расчет процента отходов
    const usedWidth = cols * (itemWidth + layoutGap) - layoutGap;
    const usedHeight = rows * (itemHeight + layoutGap) - layoutGap;
    const usedArea = usedWidth * usedHeight;
    const totalArea = availableWidth * availableHeight;
    const wastePercentage = ((totalArea - usedArea) / totalArea) * 100;

    // 🔪 Расчет количества резов для гильотины
    // Для раскладки 2×3: 3 вертикальных + 4 горизонтальных = 7 резов
    // Формула: (cols + 1) + (rows + 1) = cols + rows + 2
    const cutsPerSheet = actualItemsPerSheet > 0 ? (cols + rows + 2) : 0;

    return {
      fitsOnSheet,
      itemsPerSheet: actualItemsPerSheet,
      wastePercentage: Math.round(wastePercentage * 100) / 100,
      recommendedSheetSize: sheetSize,
      layout: {
        rows,
        cols,
        actualItemsPerSheet
      },
      cutsPerSheet
    };
  }

  /**
   * Находит оптимальный размер листа для продукта
   * @param customMarginMm — отступ с каждой стороны (мм). По умолчанию 5 мм.
   * @param customGapMm — зазор между стикерами (мм). По умолчанию 2 мм.
   */
  static findOptimalSheetSize(
    productSize: ProductSize,
    customMarginMm?: number,
    customGapMm?: number,
    bleedMm?: number
  ): LayoutResult {
    let bestResult: LayoutResult | null = null;
    let bestEfficiency = 0;

    for (const [sheetName, sheetSize] of Object.entries(this.SHEET_SIZES)) {
      const result = this.calculateLayout(productSize, sheetSize, customMarginMm, customGapMm, bleedMm);
      
      if (result.fitsOnSheet) {
        const efficiency = result.itemsPerSheet / (result.wastePercentage + 1);
        if (efficiency > bestEfficiency) {
          bestEfficiency = efficiency;
          bestResult = result;
        }
      }
    }

    return bestResult || {
      fitsOnSheet: false,
      itemsPerSheet: 0,
      wastePercentage: 100,
      recommendedSheetSize: this.SHEET_SIZES.SRA3,
      layout: { rows: 0, cols: 0, actualItemsPerSheet: 0 },
      cutsPerSheet: 0
    };
  }

  /**
   * Проверяет, подходит ли размер для конкретного продукта
   */
  static validateProductSize(productType: string, size: ProductSize): {
    isValid: boolean;
    message?: string;
    recommendedSize?: ProductSize;
  } {
    // Ограничения по типам продуктов
    const constraints = {
      'business_cards': {
        minWidth: 85, maxWidth: 95,
        minHeight: 45, maxHeight: 55,
        recommended: { width: 90, height: 50 }
      },
      'flyers': {
        minWidth: 100, maxWidth: 210,
        minHeight: 140, maxHeight: 297,
        recommended: { width: 105, height: 148 } // A6
      },
      'posters': {
        minWidth: 200, maxWidth: 1000,
        minHeight: 300, maxHeight: 1500,
        recommended: { width: 297, height: 420 } // A3
      }
    };

    const constraint = constraints[productType as keyof typeof constraints];
    if (!constraint) {
      return { isValid: true }; // Нет ограничений
    }

    const isValid = 
      size.width >= constraint.minWidth && size.width <= constraint.maxWidth &&
      size.height >= constraint.minHeight && size.height <= constraint.maxHeight;

    if (!isValid) {
      return {
        isValid: false,
        message: `Размер должен быть от ${constraint.minWidth}x${constraint.minHeight} до ${constraint.maxWidth}x${constraint.maxHeight} мм`,
        recommendedSize: constraint.recommended
      };
    }

    return { isValid: true };
  }
}
