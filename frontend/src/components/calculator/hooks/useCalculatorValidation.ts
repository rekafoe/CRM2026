import { useMemo } from 'react';

interface UseCalculatorValidationParams {
  specs: {
    productType: string;
    quantity: number;
    pages?: number;
  };
  backendProductSchema: any | null;
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
}

export const useCalculatorValidation = ({
  specs,
  backendProductSchema,
  isCustomFormat,
  customFormat
}: UseCalculatorValidationParams) => {
  const schemaPagesEnum = useMemo(() => {
    return backendProductSchema?.fields?.find((f: any) => f.name === 'pages')?.enum as number[] | undefined;
  }, [backendProductSchema]);

  const validationErrors = useMemo(() => {
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

    if (isCustomFormat) {
      const width = parseFloat(customFormat.width);
      const height = parseFloat(customFormat.height);
      if (!width || !height || width <= 0 || height <= 0) {
        errors.format = 'Введите корректные размеры формата';
      }
    }

    return errors;
  }, [specs, schemaPagesEnum, isCustomFormat, customFormat]);

  const isValid = useMemo(() => Object.keys(validationErrors).length === 0, [validationErrors]);

  return { validationErrors, isValid } as const;
};
