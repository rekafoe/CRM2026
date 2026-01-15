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
}

function computeErrors(params: {
  specs: SpecsLike;
  schemaPagesEnum?: number[];
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
  sizeLimits?: { min?: number; max?: number };
}): Record<string, string> {
  const { specs, schemaPagesEnum, isCustomFormat, customFormat, sizeLimits } = params;
  const errors: Record<string, string> = {};

  if (!specs.quantity || specs.quantity < 1) {
    errors.quantity = 'Количество должно быть больше 0';
  }

  const needsPages = Array.isArray(schemaPagesEnum) && schemaPagesEnum.length > 0;
  if (needsPages && (!specs.pages || specs.pages < 4)) {
    errors.pages = 'Количество страниц должно быть не менее 4';
  }
  if (needsPages && specs.pages && specs.pages % 4 !== 0) {
    errors.pages = 'Количество страниц должно быть кратно 4';
  }

  if (sizeLimits) {
    const minQty = sizeLimits.min ?? 1;
    const maxQty = sizeLimits.max;
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
  } = params;

  const schemaPagesEnum = useMemo(() => {
    return backendProductSchema?.fields?.find((f: any) => f.name === 'pages')?.enum as number[] | undefined;
  }, [backendProductSchema]);

  const getSizeLimits = useCallback((sizeId?: string) => {
    if (!sizeId) return undefined;
    const sizes = backendProductSchema?.template?.simplified?.sizes;
    if (!Array.isArray(sizes)) return undefined;
    const selectedSize = sizes.find((s: any) => s.id === sizeId);
    if (!selectedSize) return undefined;
    return {
      min: selectedSize.min_qty ?? 1,
      max: selectedSize.max_qty ?? undefined,
    };
  }, [backendProductSchema]);

  const validateSpecs = useCallback(
    (nextSpecs: SpecsLike): CalculatorValidationResult => {
      const errors = computeErrors({
        specs: nextSpecs,
        schemaPagesEnum,
        isCustomFormat,
        customFormat,
        sizeLimits: getSizeLimits(nextSpecs.size_id),
      });
      return { errors, isValid: Object.keys(errors).length === 0 };
    },
    [schemaPagesEnum, isCustomFormat, customFormat, getSizeLimits],
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
