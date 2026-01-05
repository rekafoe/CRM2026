// Конфигурация калькулятора типографии
export interface ProductConfig {
  name: string;
  formats: string[];
  paperDensities: number[];
  paperTypes?: string[]; // Типы бумаги из складского сервиса
  laminations: string[];
  sides: number[];
  pages?: number[];
  magnetic?: boolean;
  cutting?: boolean;
  folding?: boolean;
  roundCorners?: boolean;
  description?: string;
}

// Функции для работы с конфигурацией
export const updateProductConfig = (productKey: string, config: ProductConfig) => {
  const updatedConfigs = { ...productConfigs };
  updatedConfigs[productKey] = config;
  localStorage.setItem('calculator-product-configs', JSON.stringify(updatedConfigs));
  return updatedConfigs;
};

export const deleteProductConfig = (productKey: string) => {
  const updatedConfigs = { ...productConfigs };
  delete updatedConfigs[productKey];
  localStorage.setItem('calculator-product-configs', JSON.stringify(updatedConfigs));
  return updatedConfigs;
};


// Конфигурация продуктов
export const productConfigs: Record<string, ProductConfig> = {
  flyers: {
    name: 'Листовки',
    formats: ['A6', 'A5', 'A4'],
    paperDensities: [90, 130, 150, 200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  business_cards: {
    name: 'Визитки',
    formats: ['стандартные'], // 9×5 см, 24 шт на SRA3
    paperDensities: [200, 250, 300, 350],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    magnetic: true
  },
  booklets: {
    name: 'Буклеты',
    formats: ['A4', 'A5'],
    paperDensities: [130, 150, 200, 250],
    laminations: ['none', 'matte', 'glossy'],
    sides: [2],
    pages: [4, 8, 12, 16, 20, 24, 28, 32],
    folding: true
  },
  posters: {
    name: 'Постеры',
    formats: ['A3', 'A2', 'A1', 'A0'],
    paperDensities: [130, 150, 200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    cutting: true
  },
  brochures: {
    name: 'Брошюры',
    formats: ['A4', 'A5'],
    paperDensities: [130, 150, 200, 250],
    laminations: ['none', 'matte', 'glossy'],
    sides: [2],
    pages: [8, 12, 16, 20, 24, 28, 32],
    folding: true
  },
  // Новые продукты из Karandash
  stickers: {
    name: 'Наклейки',
    description: 'Самоклеящиеся наклейки различных размеров',
    formats: ['40x25', '58x30', '58x40', '58x60', '100x70', '100x150', 'произвольный'],
    paperDensities: [80, 90, 130, 150, 200],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1],
    cutting: true
  },
  labels: {
    name: 'Этикетки',
    description: 'Этикетки для товаров и упаковки',
    formats: ['40x25', '58x30', '58x40', '58x60', '100x70', '100x150', 'произвольный'],
    paperDensities: [80, 90, 130, 150, 200],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1],
    cutting: true
  },
  badges: {
    name: 'Бейджи',
    description: 'Именные бейджи для мероприятий',
    formats: ['90x50', '85x55'],
    paperDensities: [200, 250, 300, 350],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    cutting: true
  },
  calendars: {
    name: 'Календари',
    description: 'Настенные и настольные календари',
    formats: ['A4', 'A3', 'A2'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    cutting: true
  },
  forms: {
    name: 'Бланки',
    description: 'Бланки документов и форм',
    formats: ['A4', 'A5'],
    paperDensities: [80, 100, 120],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  envelopes: {
    name: 'Конверты',
    description: 'Конверты различных размеров',
    formats: ['C4', 'C5', 'C6', 'DL'],
    paperDensities: [80, 90, 130, 150, 200],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  magnetic_cards: {
    name: 'Магнитные визитки',
    description: 'Визитки с магнитной основой',
    formats: ['90x50'],
    paperDensities: [200, 250, 300, 350],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    magnetic: true,
    cutting: true
  },
  posters_large: {
    name: 'Афиши',
    description: 'Большие афиши и постеры',
    formats: ['A3', 'A2', 'A1', 'A0'],
    paperDensities: [150, 200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    cutting: true
  },
  // Дополнительные специализированные продукты
  perforated_cards: {
    name: 'Перфокарты',
    description: 'Карточки с перфорацией',
    formats: ['A4', 'A5'],
    paperDensities: [80, 100, 120],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    cutting: true
  },
  business_forms: {
    name: 'Бизнес-формы',
    description: 'Формы для бизнес-документов',
    formats: ['A4', 'A5'],
    paperDensities: [80, 100, 120],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  // Дополнительные календари
  wall_calendars: {
    name: 'Настенные календари',
    description: 'Календари для размещения на стене',
    formats: ['A4', 'A3', 'A2'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    cutting: true
  },
  // Дополнительные постеры
  table_calendars: {
    name: 'Настольные календари',
    description: 'Календари для размещения на столе',
    formats: ['A4', 'A3', '210x100'],
    paperDensities: [300, 160],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    cutting: true
  },
  // Дополнительные продукты из прайса "Карандаш"
  notebooks: {
    name: 'Блокноты',
    description: 'Блокноты с различным количеством страниц',
    formats: ['A6', 'A5', 'A4'],
    paperDensities: [80, 90, 120, 150],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    pages: [20, 40, 60, 80, 100]
  },
  folders: {
    name: 'Папки',
    formats: ['A4', 'A5'],
    paperDensities: [200, 250, 300, 350],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  menus: {
    name: 'Меню',
    formats: ['A4', 'A5', 'A6'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    folding: true
  },
  invitations: {
    name: 'Приглашения',
    formats: ['A6', 'A5', 'A4'],
    paperDensities: [200, 250, 300, 350],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    folding: true
  },
  certificates: {
    name: 'Дипломы, грамоты, сертификаты',
    formats: ['A4', 'A3'],
    paperDensities: [200, 250, 300, 350],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  banners: {
    name: 'Баннеры',
    formats: ['600x2000', '1000x2000', 'произвольный'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    cutting: true
  },
  stands: {
    name: 'Стенды',
    formats: ['600x450', '900x600', '1000x2000'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    cutting: true
  },
  t_shirts: {
    name: 'Майки',
    formats: ['до А6', 'до А5', 'до А4', 'до А3', 'больше А3'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  bags: {
    name: 'Сумки',
    formats: ['до А6', 'до А5', 'до А4', 'до А3'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  pens: {
    name: 'Ручки с логотипом',
    formats: ['стандартные'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  mugs: {
    name: 'Кружки',
    formats: ['стандартные'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  keychains: {
    name: 'Брелоки',
    formats: ['стандартные'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  coasters: {
    name: 'Подставки под кружки',
    formats: ['90x90', '100x100'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  mouse_pads: {
    name: 'Коврики для мыши',
    formats: ['200x250', '250x300'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  puzzles: {
    name: 'Пазлы',
    formats: ['A4', 'A3', 'A2'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  photo_albums: {
    name: 'Фотоальбомы',
    formats: ['A4', 'A5', 'A6'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  photo_cards: {
    name: 'Фотокарточки',
    formats: ['10x15', '15x20', '20x30'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  photo_wallpaper: {
    name: 'Фотообои',
    formats: ['произвольный'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  flags: {
    name: 'Флажки',
    formats: ['A4', 'A3', 'A2'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  table_tents: {
    name: 'Тейбл-тенты',
    formats: ['A4', 'A5', 'A6'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  placemats: {
    name: 'Плейсметы',
    formats: ['A4', 'A3'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  table_numbers: {
    name: 'Номера столов',
    formats: ['A6', 'A5'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  seating_cards: {
    name: 'Карточки рассадки',
    formats: ['A6', 'A5'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  wedding_invitations: {
    name: 'Свадебные приглашения',
    formats: ['A6', 'A5', 'A4'],
    paperDensities: [200, 250, 300, 350],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2],
    folding: true
  },
  wedding_place_cards: {
    name: 'Карточки рассадки для свадьбы',
    formats: ['A6', 'A5'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  wedding_labels: {
    name: 'Наклейки для свадьбы',
    formats: ['40x25', '58x30', '58x40'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  wedding_scrolls: {
    name: 'Свитки для свадьбы',
    formats: ['305x500', 'произвольный'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  wedding_boxes: {
    name: 'Коробки для свадьбы',
    formats: ['стандартные'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  wedding_disc_labels: {
    name: 'Наклейки на диски для свадьбы',
    formats: ['стандартные'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  },
  wedding_disc_boxes: {
    name: 'Коробки для дисков для свадьбы',
    formats: ['стандартные'],
    paperDensities: [200, 250, 300],
    laminations: ['none', 'matte', 'glossy'],
    sides: [1, 2]
  }
};


// Множители срочности
export const urgencyMultipliers = {
  standard: 1.0,    // Стандартный срок
  urgent: 1.5,      // Срочно
  superUrgent: 2.0, // Суперсрочно
  online: 1.0,      // Онлайн заказ
  promo: 0.7,       // Промо акция
  rush: 1.5,        // Срочно (альтернативное название)
  express: 1.8      // Экспресс
};

// Скидки для VIP
export const vipDiscounts = {
  bronze: 0.05,    // 5%
  silver: 0.10,    // 10%
  gold: 0.15,      // 15%
  platinum: 0.20   // 20%
};

// Скидки по объему
export const volumeDiscounts = {
  '100-499': 0.05,    // 5%
  '500-999': 0.10,    // 10%
  '1000-1999': 0.15,  // 15%
  '2000-4999': 0.20,  // 20%
  '5000+': 0.25       // 25%
};

// Дополнительные услуги и их цены - обновлено на основе прайса "Карандаш"
export const additionalServices = {
  lamination: {
    matte_80: 5.50, // BYN за м²
    glossy_80: 5.50, // BYN за м²
    matte_125: 6.20, // BYN за м²
    glossy_125: 6.20, // BYN за м²
    matte_250: 8.90, // BYN за м²
    glossy_250: 8.90, // BYN за м²
    matte_350: 12.50, // BYN за м²
    glossy_350: 12.50 // BYN за м²
  },
  folding: {
    manual_a4: 0.60, // BYN за лист (1-9 шт)
    manual_a4_bulk: 0.13, // BYN за лист (500+ шт)
    machine_a4: 0.60, // BYN за лист (1-9 шт)
    machine_a4_bulk: 0.13, // BYN за лист (500+ шт)
    manual_a3: 1.20, // BYN за лист (1-9 шт)
    manual_a3_bulk: 0.26, // BYN за лист (500+ шт)
    machine_a3: 1.20, // BYN за лист (1-9 шт)
    machine_a3_bulk: 0.26 // BYN за лист (500+ шт)
  },
  cutting: {
    manual: 2.50, // BYN за рез (1-9 шт)
    manual_bulk: 0.30, // BYN за рез (500+ шт)
    machine: 1.50, // BYN за рез (1-9 шт)
    machine_bulk: 0.20 // BYN за рез (500+ шт)
  },
  perforation: {
    basic: 0.80, // BYN за штуку (1-9 шт)
    bulk: 0.26, // BYN за штуку (500+ шт)
    machine: 0.50, // BYN за штуку (1-9 шт)
    machine_bulk: 0.15 // BYN за штуку (500+ шт)
  },
  drilling: {
    basic: 1.50, // BYN за отверстие (1-9 шт)
    bulk: 0.87, // BYN за отверстие (500+ шт)
    machine: 1.00, // BYN за отверстие (1-9 шт)
    machine_bulk: 0.50 // BYN за отверстие (500+ шт)
  },
  magnetic: 2.50, // BYN за визитку
  roundCorners: 0.80, // BYN за угол
  binding: {
    spiral: 15.00, // BYN за штуку
    staple: 2.00, // BYN за штуку
    perfect: 25.00, // BYN за штуку
    hardcover: 50.00 // BYN за штуку
  },
  embossing: {
    basic: 5.00, // BYN за штуку
    premium: 8.00 // BYN за штуку
  },
  foil_stamping: {
    basic: 3.00, // BYN за штуку
    premium: 5.00 // BYN за штуку
  },
  uv_coating: {
    basic: 2.00, // BYN за м²
    premium: 3.50 // BYN за м²
  },
  die_cutting: {
    basic: 1.50, // BYN за штуку
    premium: 2.50 // BYN за штуку
  },
  creasing: {
    basic: 0.30, // BYN за лист
    premium: 0.50 // BYN за лист
  },
  scoring: {
    basic: 0.20, // BYN за лист
    premium: 0.35 // BYN за лист
  },
  numbering: {
    basic: 0.10, // BYN за штуку
    premium: 0.15 // BYN за штуку
  },
  personalization: {
    basic: 0.50, // BYN за штуку
    premium: 1.00 // BYN за штуку
  }
};

// Функция для добавления нового продукта
export function addProduct(key: string, config: ProductConfig) {
  productConfigs[key] = config;
}

