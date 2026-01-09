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
      return 'шт';
    case 'sheet':
      return 'лист';
    case 'hour':
      return 'час';
    case 'm2':
      return 'м²';
    case 'click':
      return 'клик';
    default:
      return unit;
  }
};
