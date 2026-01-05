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
    bleed: 2,      // 2мм на подрезку
    gap: 2,        // 2мм между элементами
    gripper: 5     // 5мм на захват
  };

  /**
   * Проверяет, помещается ли продукт на лист
   */
  static calculateLayout(productSize: ProductSize, sheetSize: SheetSize): LayoutResult {
    const availableWidth = sheetSize.width - this.MARGINS.gripper;
    const availableHeight = sheetSize.height;

    const itemWidth = productSize.width;
    const itemHeight = productSize.height;

    const cols = Math.floor(availableWidth / (itemWidth + this.MARGINS.gap));
    const rows = Math.floor(availableHeight / (itemHeight + this.MARGINS.gap));

    const actualItemsPerSheet = cols * rows;
    const fitsOnSheet = actualItemsPerSheet > 0;

    // Расчет процента отходов
    const usedWidth = cols * (itemWidth + this.MARGINS.gap) - this.MARGINS.gap;
    const usedHeight = rows * (itemHeight + this.MARGINS.gap) - this.MARGINS.gap;
    const usedArea = usedWidth * usedHeight;
    const totalArea = availableWidth * availableHeight;
    const wastePercentage = ((totalArea - usedArea) / totalArea) * 100;

    return {
      fitsOnSheet,
      itemsPerSheet: actualItemsPerSheet,
      wastePercentage: Math.round(wastePercentage * 100) / 100,
      recommendedSheetSize: sheetSize,
      layout: {
        rows,
        cols,
        actualItemsPerSheet
      }
    };
  }

  /**
   * Находит оптимальный размер листа для продукта
   */
  static findOptimalSheetSize(productSize: ProductSize): LayoutResult {
    let bestResult: LayoutResult | null = null;
    let bestEfficiency = 0;

    for (const [sheetName, sheetSize] of Object.entries(this.SHEET_SIZES)) {
      const result = this.calculateLayout(productSize, sheetSize);
      
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
      layout: { rows: 0, cols: 0, actualItemsPerSheet: 0 }
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
