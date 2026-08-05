/**
 * Утилиты для форматирования данных услуг
 */

export const getServiceIcon = (type: string): string => {
  switch (type) {
    case 'print':
      return '🖨️';
    case 'postprint':
      return '✂️';
    case 'other':
      return '⚙️';
    default:
      return '📋';
  }
};

export const getServiceTypeLabel = (type: string): string => {
  switch (type) {
    case 'print':
      return 'Печать';
    case 'postprint':
      return 'Послепечатные';
    case 'other':
      return 'Прочее';
    case 'generic':
      return 'Общее';
    default:
      return type;
  }
};

export const getUnitLabel = (unit: string): string => {
  switch (unit) {
    case 'item':
    case 'шт':
    case 'per_item':
      return 'шт';
    case 'sheet':
    case 'лист':
    case 'per_sheet':
      return 'лист';
    case 'hour':
    case 'час':
    case 'per_hour':
      return 'час';
    case 'm2':
    case 'м2':
    case 'м²':
    case 'per_m2':
      return 'кв. метры';
    case 'click':
      return 'клик';
    case 'per_cut':
      return 'за рез';
    case 'per_meter':
      return 'пог. м';
    case 'fixed':
      return 'фикс.';
    case 'per_order':
      return 'заказ';
    default:
      return unit;
  }
};
