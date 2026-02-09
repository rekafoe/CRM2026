// Зарезервированные поля, которые не должны быть динамическими
export const RESERVED_DYNAMIC_FIELDS = new Set([
  'format',
  'quantity',
  'sides',
  'pages',
  'paperType',
  'paperDensity',
  'lamination',
  'productType',
  'priceType',
  'customerType',
  'specialServices',
  'roundCorners',
  'magnetic',
  'cutting',
  'folding',
  'urgency',
  'vipLevel',
  'materialType',
  'print_technology',
  'printTechnology',
  'print_color_mode',
  'printColorMode',
]);

// Лейблы для ламинации
export const LAMINATION_LABELS: Record<string, string> = {
  none: 'Без ламинации',
  matte: 'Матовая',
  glossy: 'Глянцевая',
};

// Лейблы для типов цен (4 варианта + стандарт)
export const PRICE_TYPE_LABELS: Record<string, string> = {
  standard: 'Стандарт',
  urgent: 'Срочно (+50%)',
  online: 'Онлайн (−15%)',
  promo: 'Промо (−30%)',
  special: 'Спец.предложение (−45%)',
};

// Лейблы для типов клиентов
export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  regular: 'Стандарт',
  vip: 'VIP',
  wholesale: 'Опт',
};

