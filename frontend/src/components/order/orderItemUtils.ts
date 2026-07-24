import type { Item } from '../../types';

/** Метка с сайта: нет макета (не влияет на цену в CRM). */
export const itemParamsHasNoLayout = (params: Item['params'] | Record<string, unknown> | null | undefined): boolean => {
  const p = params as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== 'object') return false;
  if (p.no_layout === true) return true;
  if (p.layout_missing === true) return true;
  if (p.crmNoLayoutDeclared === true) return true;
  const specs = p.specifications;
  if (specs && typeof specs === 'object' && !Array.isArray(specs)) {
    if ((specs as Record<string, unknown>).artwork_provided === false) return true;
  }
  return false;
};

/** Внутренние / служебные ключи опций сайта — не для UI оператора. */
const HIDDEN_OPERATOR_PARAM_KEYS = new Set([
  'productionrendersource',
  'poligraffyslug',
  'poligrafyslug',
  'poligrafytypeidparam',
  'typeid',
  'pricetype',
  'ordermode',
  'productid',
  'crmproductid',
  'crmsizeid',
  'crmmaterialid',
  'crmprintcolormode',
  'crmsides',
  'crmpaperdensity',
  'crmfinishing',
  'crmpricetype',
  'designtemplateid',
  'designtemplatecode',
  'designusagefee',
  'designeditormode',
  'editordrafttoken',
  'designstate',
  'photobatch',
  'clientrenderedpages',
  'layouthumanlabel',
  'crmnolayoutdeclared',
]);

/** Дубли и шум, которые уже есть в разбивке / строке цены. */
const HIDDEN_OPERATOR_PARAM_LABELS = new Set([
  'тип печати',
  'тип бумаги',
  'тип бумаги обложки',
  'плотность обложки',
  'плотность бумаги',
  'плотность',
  'обработка',
  'дополнительная отделка',
  'формат',
  'формат печати',
  'размер',
  'тип материала',
  'материал',
  'тип продукта',
  'тираж',
  'стороны печати',
  'срок изготовления',
  'количество страниц',
  'layouthumanlabel',
]);

const stripTechKvFromDescription = (desc: string): string => {
  let text = desc;
  for (const key of HIDDEN_OPERATOR_PARAM_KEYS) {
    text = text.replace(new RegExp(`;?\\s*${key}\\s*:\\s*[^;•]+`, 'gi'), '');
  }
  return text
    .replace(/;?\s*Тип печати\s*:\s*[^;•]+/gi, '')
    .replace(/;?\s*Тип бумаги(?:\s+обложки)?\s*:\s*[^;•]+/gi, '')
    .replace(/;?\s*Плотность обложки\s*:\s*[^;•]+/gi, '')
    .replace(/;?\s*Обработка\s*:\s*[^;•]+/gi, '');
};

/** Убирает артефакты website checkout из описания позиции. */
export const sanitizeWebsiteOrderItemDescription = (desc: string): string => {
  if (!desc) return desc;
  return stripTechKvFromDescription(desc)
    .replace(/;?\s*layoutHumanLabel:\s*[^;]+/gi, '')
    .replace(/;?\s*Дополнительная отделка:\s*\[object Object\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/;\s*;/g, ';')
    .replace(/\s*;\s*$/g, '')
    .trim();
};

/** Параметр для правой колонки / чипов — только полезное оператору. */
export const isOperatorVisibleParameter = (param: {
  label?: string;
  key?: string;
  value?: unknown;
}): boolean => {
  const label = String(param.label ?? '').trim();
  const key = String(param.key ?? '').trim();
  const value = param.value == null ? '' : String(param.value).trim();
  if (!label || !value || value === '[object Object]') return false;

  const labelNorm = label.toLowerCase();
  const keyNorm = key.toLowerCase();
  if (HIDDEN_OPERATOR_PARAM_KEYS.has(labelNorm) || HIDDEN_OPERATOR_PARAM_KEYS.has(keyNorm)) {
    return false;
  }
  if (HIDDEN_OPERATOR_PARAM_LABELS.has(labelNorm)) return false;

  // Сырые ключи латиницей (camelCase / snake_case) — служебные
  if (/^[a-z][a-zA-Z0-9_]*$/.test(label) || /^[a-z][a-z0-9_]*$/.test(labelNorm)) {
    return false;
  }

  return true;
};

export const filterOperatorVisibleParameters = <T extends { label?: string; key?: string; value?: unknown }>(
  params: T[] | null | undefined
): T[] => {
  if (!Array.isArray(params)) return [];
  return params.filter(isOperatorVisibleParameter);
};

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
    d.includes('материал:') ||
    d.includes('тип печати:') ||
    d.includes('тип бумаги:') ||
    d.includes('productionrendersource:') ||
    d.includes('poligrafyslug:') ||
    d.includes('ordermode:')
  );
};

export const sanitizeOrderItemDescription = (desc: string, itemType?: string) => {
  // Чистим дубли из сохранённого описания позиции
  const cleaned = sanitizeWebsiteOrderItemDescription(desc)
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
    return item.params.parameterSummary
      .map((param: { label: string; value: string }) => `${param.label}: ${param.value}`)
      .join(', ');
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


