import { useCallback, useMemo } from 'react';

export interface CalculatorValidationResult {
  errors: Record<string, string>;
  isValid: boolean;
}

type SpecsLike = {
  quantity: number;
  pages?: number;
  [key: string]: any;
};

interface UseCalculatorValidationParams {
  specs?: SpecsLike;
  backendProductSchema?: any | null;
  isCustomFormat?: boolean;
  customFormat?: { width: string; height: string };
  /** Размеры текущего типа продукта (если у продукта есть типы) */
  effectiveSizes?: Array<{ id: string; min_qty?: number; max_qty?: number; [key: string]: any }>;
  /** Варианты страниц текущего типа (для упрощённых продуктов с типами) */
  effectivePagesOptions?: number[];
  /** Разрешить значение не из списка options (с проверкой min/max/step). false — только пресеты */
  pagesAllowCustom?: boolean;
  pagesMin?: number;
  pagesMax?: number;
  pagesStep?: number;
}

function computeErrors(params: {
  specs: SpecsLike;
  schemaPagesEnum?: number[];
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
  sizeLimits?: { min?: number; max?: number };
  operationLimits?: { min?: number; max?: number };
  /** Размеры с уже подставленными effective allowed_material_ids (как в MaterialsSection) */
  effectiveSizes?: Array<{ id: string; allowed_material_ids?: number[]; [key: string]: any }>;
  backendProductSchema?: any | null;
  pagesAllowCustom?: boolean;
  pagesMin?: number;
  pagesMax?: number;
  pagesStep?: number;
}): Record<string, string> {
  const {
    specs,
    schemaPagesEnum,
    isCustomFormat,
    customFormat,
    sizeLimits,
    operationLimits,
    effectiveSizes,
    backendProductSchema,
    pagesAllowCustom,
    pagesMin,
    pagesMax,
    pagesStep,
  } = params;
  const errors: Record<string, string> = {};

  if (!specs.quantity || specs.quantity < 1) {
    errors.quantity = 'Количество должно быть больше 0';
  }

  // Упрощённый калькулятор: не даём дергать бэкенд без material_id, пока для размера заданы материалы
  // (иначе в ответе только расходники отделки — DTF и т.д., unitPrice 0, «фолбэк» в логах).
  const simplified = backendProductSchema?.template?.simplified;
  if (simplified && specs.size_id) {
    const sizes =
      Array.isArray(effectiveSizes) && effectiveSizes.length > 0
        ? effectiveSizes
        : backendProductSchema?.template?.simplified?.sizes;
    const selectedSize = Array.isArray(sizes)
      ? sizes.find((s: any) => s.id === specs.size_id)
      : undefined;
    const allowed = selectedSize?.allowed_material_ids;
    if (Array.isArray(allowed) && allowed.length > 0) {
      const mid = specs.material_id;
      if (mid == null || mid === '' || Number.isNaN(Number(mid))) {
        errors.material_id = 'Выберите тип и плотность материала';
      }
    }
  }

  const needsPages = Array.isArray(schemaPagesEnum) && schemaPagesEnum.length > 0;
  const p = specs.pages != null ? Number(specs.pages) : NaN;
  const inPresetList = needsPages && Number.isFinite(p) && schemaPagesEnum!.includes(p);
  const canCustom =
    pagesAllowCustom === true ||
    (pagesAllowCustom !== false && needsPages && (pagesMin != null || pagesMax != null || pagesStep != null));

  if (needsPages && (!specs.pages || !Number.isFinite(p) || p < 1)) {
    errors.pages = 'Укажите количество страниц';
  } else if (needsPages && Number.isFinite(p)) {
    if (!inPresetList) {
      if (!canCustom) {
        errors.pages = 'Выберите количество страниц из списка';
      } else {
        const opts = schemaPagesEnum!;
        const inferredMin = pagesMin ?? Math.min(...opts);
        const inferredMax = pagesMax ?? Math.max(...opts);
        if (p < inferredMin) {
          errors.pages = `Не менее ${inferredMin} стр.`;
        } else if (p > inferredMax) {
          errors.pages = `Не более ${inferredMax} стр.`;
        }
        const step = pagesStep;
        if (step != null && step > 0 && p % step !== 0) {
          errors.pages = `Количество страниц должно быть кратно ${step}`;
        } else if (
          step == null &&
          opts.length > 0 &&
          opts.every((x) => x % 4 === 0) &&
          p % 4 !== 0
        ) {
          errors.pages = 'Количество страниц должно быть кратно 4';
        }
      }
    }
  }

  if (sizeLimits || operationLimits) {
    const minQty = Math.max(sizeLimits?.min ?? 1, operationLimits?.min ?? 1);
    const maxCandidates = [sizeLimits?.max, operationLimits?.max].filter(
      (v): v is number => v !== undefined
    );
    const maxQty = maxCandidates.length > 0 ? Math.min(...maxCandidates) : undefined;
    if (specs.quantity < minQty) {
      errors.quantity = `Тираж должен быть не меньше ${minQty}`;
    } else if (maxQty !== undefined && specs.quantity > maxQty) {
      errors.quantity = `Тираж должен быть не больше ${maxQty}`;
    }
  }

  if (isCustomFormat) {
    const width = parseFloat(customFormat.width);
    const height = parseFloat(customFormat.height);
    if (!width || !height || width <= 0 || height <= 0) {
      errors.format = 'Введите корректные размеры формата';
    }
  }

  return errors;
}

export const useCalculatorValidation = (params: UseCalculatorValidationParams = {}) => {
  const {
    specs,
    backendProductSchema = null,
    isCustomFormat = false,
    customFormat = { width: '', height: '' },
    effectiveSizes,
    effectivePagesOptions,
    pagesAllowCustom,
    pagesMin,
    pagesMax,
    pagesStep,
  } = params;

  const schemaPagesEnum = useMemo(() => {
    if (Array.isArray(effectivePagesOptions) && effectivePagesOptions.length > 0) {
      return effectivePagesOptions;
    }
    return backendProductSchema?.fields?.find((f: any) => f.name === 'pages')?.enum as number[] | undefined;
  }, [backendProductSchema, effectivePagesOptions]);

  const getSizeLimits = useCallback((sizeId?: string) => {
    if (!sizeId) return undefined;
    const sizes = Array.isArray(effectiveSizes) ? effectiveSizes : backendProductSchema?.template?.simplified?.sizes;
    if (!Array.isArray(sizes)) return undefined;
    const selectedSize = sizes.find((s: any) => s.id === sizeId);
    if (!selectedSize) return undefined;
    const minFromTiers = selectedSize.print_prices?.[0]?.tiers?.[0]?.min_qty;
    return {
      min: selectedSize.min_qty ?? (minFromTiers != null ? minFromTiers : 1),
      max: selectedSize.max_qty ?? undefined,
    };
  }, [backendProductSchema, effectiveSizes]);

  const getOperationLimits = useCallback((selectedOps?: Array<{ operationId?: number | string }>) => {
    if (!Array.isArray(selectedOps) || selectedOps.length === 0) return undefined;
    const operations = backendProductSchema?.operations;
    if (!Array.isArray(operations)) return undefined;
    let minRequired = 1;
    let maxAllowed: number | undefined = undefined;
    selectedOps.forEach((sel) => {
      const opId = Number(sel.operationId);
      if (!Number.isFinite(opId)) return;
      const op = operations.find((o: any) => Number(o.operation_id ?? o.id) === opId);
      if (!op) return;
      const minQty = Number(op.min_quantity ?? 1);
      if (Number.isFinite(minQty) && minQty > minRequired) {
        minRequired = minQty;
      }
      const maxQtyValue = op.max_quantity !== undefined && op.max_quantity !== null ? Number(op.max_quantity) : NaN;
      if (Number.isFinite(maxQtyValue)) {
        if (maxAllowed === undefined) {
          maxAllowed = maxQtyValue;
        } else {
          maxAllowed = Math.min(maxAllowed, maxQtyValue);
        }
      }
    });
    return { min: minRequired, max: maxAllowed };
  }, [backendProductSchema]);

  const validateSpecs = useCallback(
    (nextSpecs: SpecsLike): CalculatorValidationResult => {
      const errors = computeErrors({
        specs: nextSpecs,
        schemaPagesEnum,
        isCustomFormat,
        customFormat,
        sizeLimits: getSizeLimits(nextSpecs.size_id),
        operationLimits: getOperationLimits(nextSpecs.selectedOperations),
        effectiveSizes,
        backendProductSchema,
        pagesAllowCustom,
        pagesMin,
        pagesMax,
        pagesStep,
      });
      return { errors, isValid: Object.keys(errors).length === 0 };
    },
    [
      schemaPagesEnum,
      isCustomFormat,
      customFormat,
      getSizeLimits,
      getOperationLimits,
      effectiveSizes,
      backendProductSchema,
      pagesAllowCustom,
      pagesMin,
      pagesMax,
      pagesStep,
    ],
  );

  const validationErrors = useMemo(() => {
    if (!specs) return {};
    return validateSpecs(specs).errors;
  }, [specs, validateSpecs]);

  const isValid = useMemo(() => {
    if (!specs) return false;
    return Object.keys(validationErrors).length === 0;
  }, [specs, validationErrors]);

  return { validationErrors, isValid, validateSpecs } as const;
};
