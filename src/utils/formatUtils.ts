/**
 * Утилиты для работы с форматами (format) и размерами (trim_size)
 * Унифицирует работу между строковым форматом и объектом trim_size
 */

/**
 * Парсит строку формата в объект trim_size
 * Поддерживает форматы: "210×148", "210x148", "A4", "210 148"
 */
export function parseFormatToTrimSize(format: string): { width: number; height: number } | null {
  if (!format || typeof format !== 'string') {
    return null;
  }

  // Стандартные форматы
  const standardFormats: Record<string, { width: number; height: number }> = {
    'A6': { width: 105, height: 148 },
    'A5': { width: 148, height: 210 },
    'A4': { width: 210, height: 297 },
    'A3': { width: 297, height: 420 },
    'DL': { width: 99, height: 210 },
  };

  // Проверяем стандартные форматы
  const upperFormat = format.trim().toUpperCase();
  if (standardFormats[upperFormat]) {
    return standardFormats[upperFormat];
  }

  // Парсим числовой формат: "210×148", "210x148", "210 148", "210*148"
  const normalized = format
    .toLowerCase()
    .replace(/[×х*]/g, 'x')
    .replace(/\s+/g, '')
    .split('x');

  if (normalized.length === 2) {
    const width = parseFloat(normalized[0]);
    const height = parseFloat(normalized[1]);
    
    if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }

  return null;
}

/**
 * Преобразует объект trim_size в строку формата
 */
export function formatTrimSizeToString(trimSize: { width: number | string; height: number | string }): string {
  const width = Number(trimSize.width);
  const height = Number(trimSize.height);
  
  if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
    return '';
  }

  return `${width}×${height}`;
}

/**
 * Проверяет, является ли формат стандартным (A4, A5, etc.)
 */
export function isStandardFormat(format: string): boolean {
  const standardFormats = ['A6', 'A5', 'A4', 'A3', 'DL'];
  return standardFormats.includes(format.trim().toUpperCase());
}

/**
 * Получает стандартное название формата по размерам
 */
export function getStandardFormatName(width: number, height: number): string | null {
  const formats: Record<string, { width: number; height: number }> = {
    'A6': { width: 105, height: 148 },
    'A5': { width: 148, height: 210 },
    'A4': { width: 210, height: 297 },
    'A3': { width: 297, height: 420 },
    'DL': { width: 99, height: 210 },
  };

  for (const [name, size] of Object.entries(formats)) {
    if (Math.abs(size.width - width) < 1 && Math.abs(size.height - height) < 1) {
      return name;
    }
  }

  return null;
}

