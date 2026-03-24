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

  /**
   * Проверяет, помещается ли продукт на лист
   * Проверяет оба варианта: обычный и с поворотом на 90°
   * @param customMarginMm — отступ с каждой стороны (мм). По умолчанию 5 мм. Для плоттерной резки — 15 мм.
   */
  static calculateLayout(productSize: ProductSize, sheetSize: SheetSize, customMarginMm?: number): LayoutResult {
    const margin = customMarginMm ?? this.MARGINS.printerMargins;
    const availableWidth = sheetSize.width - (margin * 2);
    const availableHeight = sheetSize.height - (margin * 2);

    // Вариант 1: без поворота
    const variant1 = this.calculateSingleLayout(
      productSize.width,
      productSize.height,
      availableWidth,
      availableHeight,
      sheetSize
    );

    // Вариант 2: с поворотом на 90°
    const variant2 = this.calculateSingleLayout(
      productSize.height,  // поворот: высота становится шириной
      productSize.width,   // поворот: ширина становится высотой
      availableWidth,
      availableHeight,
      sheetSize
    );

    // Выбираем вариант с меньшими отходами (более эффективное использование листа)
    const selected = variant1.wastePercentage <= variant2.wastePercentage ? variant1 : variant2;

    // Специальное правило для визиток 55×85: всегда поворот для 21 шт на лист
    if (productSize.width === 55 && productSize.height === 85) {
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
    sheetSize: SheetSize
  ): LayoutResult {
    // Отступ для раскладки: ширина + 2мм, высота + 2мм
    const cols = Math.floor(availableWidth / (itemWidth + this.MARGINS.layoutGap));
    const rows = Math.floor(availableHeight / (itemHeight + this.MARGINS.layoutGap));

    // console.log(`🧮 Расчет раскладки ${itemWidth}×${itemHeight} на листе ${sheetSize.width}×${sheetSize.height}`);
    // console.log(`   Доступный размер: ${availableWidth}×${availableHeight} (принтер: ${this.MARGINS.printerMargins}мм с каждой стороны)`);
    // console.log(`   Колонки: floor(${availableWidth} / (${itemWidth} + ${this.MARGINS.layoutGap})) = ${cols}`);
    // console.log(`   Ряды: floor(${availableHeight} / (${itemHeight} + ${this.MARGINS.layoutGap})) = ${rows}`);

    const actualItemsPerSheet = cols * rows;
    const fitsOnSheet = actualItemsPerSheet > 0;

    // Расчет процента отходов
    const usedWidth = cols * (itemWidth + this.MARGINS.layoutGap) - this.MARGINS.layoutGap;
    const usedHeight = rows * (itemHeight + this.MARGINS.layoutGap) - this.MARGINS.layoutGap;
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
   */
  static findOptimalSheetSize(productSize: ProductSize, customMarginMm?: number): LayoutResult {
    let bestResult: LayoutResult | null = null;
    let bestEfficiency = 0;

    for (const [sheetName, sheetSize] of Object.entries(this.SHEET_SIZES)) {
      const result = this.calculateLayout(productSize, sheetSize, customMarginMm);
      
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
