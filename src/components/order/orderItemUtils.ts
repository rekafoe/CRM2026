import { Item } from '../types';

// Определяем, что описание сгенерировано автоматически калькулятором
export const isAutoDescription = (desc: string | undefined | null): boolean => {
  if (!desc) return false;
  const d = desc.toLowerCase();
  return (
    d.includes('тип продукта:') ||
    d.includes('формат:') ||
    d.includes('тираж:') ||
    d.includes('стороны печати:') ||
    d.includes('тип материала:') ||
    d.includes('материал:')
  );
};

export const sanitizeOrderItemDescription = (desc: string, itemType?: string) => {
  // Чистим дубли из сохранённого описания позиции
  const cleaned = desc
    .replace(/\s*•\s*Печать:\s*[^•]+/g, '')
    .replace(/\s*Печать:\s*[^•]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const type = (itemType || '').trim();
  if (!type) return cleaned;

  // Убираем ведущий дублирующийся тип
  const leadingTypePattern = new RegExp(
    `^${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(•|—|–|-)\\s*`,
    'i'
  );
  const withoutLeadingType = cleaned.replace(leadingTypePattern, '').trim();

  // Если описание стало равно типу (или пустое) — возвращаем пусто, чтобы не дублировать "Штуки — Штуки"
  if (!withoutLeadingType || withoutLeadingType.toLowerCase() === type.toLowerCase()) return '';
  return withoutLeadingType;
};

// Функция для получения названия типа продукта
export const getProductTypeName = (productType: string): string => {
  const typeNames: Record<string, string> = {
    flyers: 'Листовки',
    business_cards: 'Визитки',
    booklets: 'Буклеты',
    posters: 'Плакаты',
    brochures: 'Брошюры',
  };
  return typeNames[productType] || productType;
};

// Функция для генерации детального описания товара
export const generateItemDescription = (item: Item): string => {
  // ПРИОРИТЕТ 1: Используем item.type как основное название (содержит новое информативное название)
  if (item.type && item.type !== 'Товар из калькулятора' && !item.type.includes('Товар из калькулятора')) {
    return item.type;
  }

  // ПРИОРИТЕТ 2: Если есть готовое описание и оно не стандартное, используем его
  if (
    item.params.description &&
    item.params.description !== 'Описание товара' &&
    item.params.description !== 'Товар из калькулятора'
  ) {
    return item.params.description;
  }

  if (Array.isArray(item.params.parameterSummary) && item.params.parameterSummary.length > 0) {
    return item.params.parameterSummary.map((param) => `${param.label}: ${param.value}`).join(', ');
  }

  // ПРИОРИТЕТ 3: Если есть спецификации, генерируем описание
  if (item.params.specifications) {
    const specs = item.params.specifications as any;
    const parts: string[] = [];

    // Тип продукта
    if (specs.productType) {
      parts.push(getProductTypeName(specs.productType));
    }

    // Формат
    if (specs.format) {
      parts.push(specs.format);
    }

    // Стороны
    if (specs.sides) {
      parts.push(specs.sides === 2 ? 'двусторонние' : 'односторонние');
    }

    // Бумага
    if (specs.paperType && specs.paperDensity) {
      parts.push(`${specs.paperType} ${specs.paperDensity}г/м²`);
    }

    // Ламинация
    if (specs.lamination && specs.lamination !== 'none') {
      parts.push(`ламинация ${specs.lamination}`);
    }

    return parts.join(', ');
  }

  // Fallback на название или тип
  return (item as any).name || item.type || 'Товар из калькулятора';
};

// Даты создания и готовности
export const getDefaultCreatedDate = () => {
  const now = new Date();
  return now.toISOString().split('T')[0];
};

export const getDefaultReadyDate = (createdDate?: string) => {
  const date = createdDate ? new Date(createdDate + 'T00:00:00') : new Date();
  date.setHours(date.getHours() + 1);
  // Формат для datetime-local: YYYY-MM-DDTHH:mm
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Нормализация формата даты для datetime-local
export const normalizeDateTimeLocal = (dateStr: string | undefined | null): string | null => {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return null;
  }
};

// Форматирование даты в формат ДД/ММ/ГГГГ
export const formatDateDDMMYYYY = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '';
  }
};

// Форматирование даты и времени в формат ДД/ММ/ГГГГ ЧЧ:ММ
export const formatDateTimeDDMMYYYY = (dateTimeStr: string): string => {
  if (!dateTimeStr) return '';
  try {
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return '';
  }
};


