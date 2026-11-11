/**
 * Идемпотентное дополнение продуктов категории «Широкоформатная печать».
 * Непустые тексты подтипа не перезаписываются. Цены ступеней не меняются.
 */

export const WIDE_FORMAT_SOLVENT_CODE = 'sol_m';

export const WIDE_FORMAT_ISO_SIZES = [
  { code: 'A2', label: 'А2', width_mm: 420, height_mm: 594 },
  { code: 'A1', label: 'А1', width_mm: 594, height_mm: 841 },
  { code: 'A0', label: 'А0', width_mm: 841, height_mm: 1189 },
] as const;

const REMOVABLE_FORMATS = new Set(['A4', 'A5', 'A6']);

export type WideFormatCopy = {
  fullDescription: string;
  characteristics: string[];
  advantages: string[];
};

export type WideFormatPatchReport = {
  changed: boolean;
  textsFilled: string[];
  sizesAdded: string[];
  sizesRemoved: string[];
  materialDrivenEnabled: boolean;
  sharedMaterialsSet: number;
  technologySet: number;
};

type SizeRecord = Record<string, any>;
type TypeRecord = Record<string, any>;
type TypeConfigRecord = Record<string, any>;

const COPY_BY_PRODUCT_ID: Record<number, WideFormatCopy | Record<string, WideFormatCopy>> = {
  66: {
    fullDescription:
      'Сольвентная печать нужна, когда один макет надо вывести крупно и выбрать носитель под место. Баннер ставят на улицу и в зал, плёнку клеят на стекло и стенд, бумагу и фотобумагу берут для плаката в помещении, холст — для изображения на стену. Цвет, форматы А2, А1 и А0.',
    characteristics: [
      'Печать: сольвентная, цвет',
      'Материал: баннер, плёнка, бумага, фотобумага, холст',
      'Форматы: А2, А1, А0',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Носитель подбирается под место, а не под один тип рекламы',
      'Один цветной макет печатается на баннере, плёнке, бумаге, фотобумаге и холсте',
      'Форматы А2, А1 и А0 уже есть в карточке',
    ],
  },
  93: {
    fullDescription:
      'Самоклеящаяся плёнка закрывает задачу без каркаса и подрамника: витрина, стеклянная дверь, навигация, графика на стенде. Лист клеится на ровное стекло, пластик или металл. В карточке есть матовая, глянцевая и прозрачная плёнка, печать сольвентная, форматы А2, А1 и А0.',
    characteristics: [
      'Материал: самоклеящаяся плёнка — матовая, глянцевая, прозрачная',
      'Печать: сольвентная, цвет',
      'Форматы: А2, А1, А0',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Графика держится на поверхности, отдельная конструкция не нужна',
      'Матовая без блика, глянцевая контрастнее, прозрачная оставляет стекло видимым',
      'Один носитель работает и на витрине, и на указателе двери',
    ],
  },
  95: {
    fullDescription:
      'Печать постеров нужна, когда афишу, объявление или схему нужно прочитать с расстояния, а не с листа на столе. Форматы А3, А2, А1 и А0: А3 вешают на доску, А2 и А1 — в проходе, А0 — на стену. Носитель выбирается в карточке: фотобумага, самоклеящаяся плёнка или баннер. Печать сольвентная.',
    characteristics: [
      'Форматы: А3, А2, А1, А0',
      'Печать: сольвентная, цвет',
      'Материал: фотобумага, самоклеящаяся плёнка или баннер',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Линейка от объявления на доске до настенного листа: А3, А2, А1 и А0',
      'Бумагу ставят в раму, плёнку клеят, баннер вешают без рамы',
      'Текст и фото печатаются цветом на одном листе',
    ],
  },
  98: {
    fullDescription:
      'Репродукцию заказывают, когда картину или иллюстрацию нужно показать в интерьере, а оригинал увозить нельзя или он нужен в нескольких копиях. Печать цветная, сольвентная. Форматы А2, А1 и А0: от листа у рабочего места до изображения на стену комнаты.',
    characteristics: [
      'Назначение: репродукции картин',
      'Печать: сольвентная, цвет',
      'Форматы: А2, А1, А0',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Изображение появляется на стене без перевозки оригинала',
      'Один макет можно напечатать для нескольких помещений',
      'А2 остаётся камерным форматом, А1 и А0 читаются из комнаты',
    ],
  },
  99: {
    fullDescription:
      'Полотно Roll-up — графика для мобильного стенда на выставке, у ресепшена и на промостойке. Высота 200 см, ширина 85 или 100 см: оффер и контакты видно через проход. Печать на баннере, сольвентная. Стойка в заказ не входит.',
    characteristics: [
      'Размеры полотна: 85×200 см и 100×200 см',
      'Материал: баннер',
      'Печать: сольвентная, цвет',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Полотно рассчитано на стенд, который ставят на день и увозят',
      'Две ширины, 85 и 100 см, под разную стойку при высоте 200 см',
      'Печатается только полотно, конструкция стенда отдельно',
    ],
  },
  110: {
    fullDescription:
      'Табличка «Бессмертный полк» — портрет и подпись на одном листе, чтобы в колонне было видно, кого несут. Её берут на шествие, а не вешают как интерьерный постер. Печать цветная, сольвентная, форматы А2, А1 и А0.',
    characteristics: [
      'Назначение: табличка «Бессмертный полк»',
      'Печать: сольвентная, цвет',
      'Форматы: А2, А1, А0',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Портрет и имя стоят на одном листе, отдельно подписывать не нужно',
      'Формат читается в строю, а не только в руках',
      'Цветная печать сохраняет фотографию человека',
    ],
  },
  116: {
    fullDescription:
      'Табличка доступной среды показывает пиктограммой, где вход, санузел, лифт или парковка для людей с ограниченной подвижностью. Знак стоит у двери и заменяет объяснение на словах. Печать сольвентная, цветная, форматы А2, А1 и А0.',
    characteristics: [
      'Назначение: знаки доступной среды',
      'Печать: сольвентная, цвет',
      'Форматы: А2, А1, А0',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Посетитель находит доступный маршрут по знаку, без расспросов',
      'Пиктограмма понятнее длинной надписи на двери',
      'Размер выбирается под дверь или стенд у входа',
    ],
  },
  129: {
    fullDescription:
      'Прямоугольная табличка заменяет бумажную записку на двери: номер кабинета, фамилия или стрелка по коридору. Её хватает там, где световой короб не нужен. Печать сольвентная, цветная, форматы А2, А1 и А0.',
    characteristics: [
      'Назначение: прямоугольные таблички и указатели',
      'Печать: сольвентная, цвет',
      'Форматы: А2, А1, А0',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'На одном прямоугольнике помещаются номер, название и направление',
      'Форма садится на дверь и на стену у поворота',
      'Постоянный отпечаток вместо листа, который отклеивается',
    ],
  },
  137: {
    stretcher: {
      fullDescription:
        'Холст на подрамнике — фотография или картина, которую можно сразу вешать: полотно уже натянуто, крепление — металлический трос. Берут для портрета, семейного снимка и стены, где изображение должно висеть, а не ждать раму.',
      characteristics: [
        'Стандартный подрамник',
        'Трос металлический',
        'Семь готовых размеров',
      ],
      advantages: [
        'Не нужно отдельно заказывать натяжку и раму',
        'Подрамник держит холст, трос рассчитан на подвес',
        'Готовый предмет для стены, а не рулон в багетную мастерскую',
      ],
    },
    'На подрамнике': {
      fullDescription:
        'Холст на подрамнике — фотография или картина, которую можно сразу вешать: полотно уже натянуто, крепление — металлический трос. Берут для портрета, семейного снимка и стены, где изображение должно висеть, а не ждать раму.',
      characteristics: [
        'Стандартный подрамник',
        'Трос металлический',
        'Семь готовых размеров',
      ],
      advantages: [
        'Не нужно отдельно заказывать натяжку и раму',
        'Подрамник держит холст, трос рассчитан на подвес',
        'Готовый предмет для стены, а не рулон в багетную мастерскую',
      ],
    },
    roll: {
      fullDescription:
        'Холст в рулоне — та же печать, но без натяжки: полотно сдают свёрнутым. Его выбирают, если раму делают отдельно или картину проще везти рулоном, чем готовым подрамником.',
      characteristics: ['Без подрамника', 'Семь готовых размеров'],
      advantages: [
        'Компактнее натянутого подрамника при перевозке',
        'Натяжку и багет можно заказать отдельно и позже',
        'Подходит, когда размер рамы ещё не выбран',
      ],
    },
    'В рулоне': {
      fullDescription:
        'Холст в рулоне — та же печать, но без натяжки: полотно сдают свёрнутым. Его выбирают, если раму делают отдельно или картину проще везти рулоном, чем готовым подрамником.',
      characteristics: ['Без подрамника', 'Семь готовых размеров'],
      advantages: [
        'Компактнее натянутого подрамника при перевозке',
        'Натяжку и багет можно заказать отдельно и позже',
        'Подходит, когда размер рамы ещё не выбран',
      ],
    },
  },
  138: {
    fullDescription:
      'Фотообои — крупное изображение для стены: фото, рисунок или брендированная поверхность в комнате, детской и кафе. Лист не прячут в раму, им закрывают стену или её часть. Печать сольвентная, цветная, форматы А2, А1 и А0.',
    characteristics: [
      'Назначение: фотообои',
      'Печать: сольвентная, цвет',
      'Форматы: А2, А1, А0',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Изображение работает как часть стены, а не как постер в раме',
      'Один сюжет закрывает акцент в комнате или стену в зале',
      'Цветная печать по готовому макету в форматах А2, А1 и А0',
    ],
  },
  139: {
    fullDescription:
      'X-баннер — полотно для крестообразной стойки у входа, на промо и на дегустации. Его ставят на смену и забирают вместе со стойкой. На листе читаются акция и контакты. Печатается только полотно, стойка в заказ не входит. Сольвентная цветная печать, форматы А2, А1 и А0.',
    characteristics: [
      'Назначение: полотно X-баннера',
      'Печать: сольвентная, цвет',
      'Форматы: А2, А1, А0',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Графика для выездной стойки, а не для постоянного щита',
      'Вертикальный лист читается стоя, у входа и у стола',
      'В заказе только полотно: конструкцию карточка не включает',
    ],
  },
};

export function isWideFormatCategoryName(name: unknown): boolean {
  return /широкоформат/i.test(normalizeRussian(name));
}

export function wideFormatSheetCode(label: unknown): 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | null {
  const raw = String(label ?? '').trim().replace(/[аА]/g, 'A');
  const match = raw.match(/^A\s*([0-6])(?!\d)/i);
  if (!match) return null;
  return `A${match[1]}`.toUpperCase() as 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
}

function normalizeRussian(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function isBlankText(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

function isBlankList(value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  return !value.some((item) => typeof item === 'string' && item.trim() !== '');
}

function isDirectCopy(value: WideFormatCopy | Record<string, WideFormatCopy>): value is WideFormatCopy {
  return typeof (value as WideFormatCopy).fullDescription === 'string';
}

function fallbackCopy(productName: string): WideFormatCopy {
  const name = String(productName || 'Широкоформатная печать').trim();
  return {
    fullDescription: `${name}. Сольвентная цветная печать, форматы А2, А1 и А0.`,
    characteristics: [
      `Назначение: ${name}`,
      'Печать: сольвентная, цвет',
      'Форматы: А2, А1, А0',
      'Срок изготовления: 1–3 рабочих дня',
    ],
    advantages: [
      'Цветная сольвентная печать',
      'Готовые форматы А2, А1 и А0',
    ],
  };
}

export function wideFormatCopyFor(
  product: { id: number; name: string },
  type: { key?: unknown; name?: unknown },
): WideFormatCopy {
  const entry = COPY_BY_PRODUCT_ID[Number(product.id)];
  if (entry && isDirectCopy(entry)) return entry;
  if (entry) {
    const key = typeof type.key === 'string' ? type.key.trim() : '';
    const name = typeof type.name === 'string' ? type.name.trim() : '';
    if (key && entry[key] && isDirectCopy(entry[key])) return entry[key];
    if (name && entry[name] && isDirectCopy(entry[name])) return entry[name];
  }
  return fallbackCopy(product.name);
}

function positiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const item of value) {
    const id = Number(item);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function effectiveMaterialIds(size: SizeRecord, common: number[]): number[] {
  const own = positiveIds(size.allowed_material_ids);
  if (size.use_own_materials === true) return own;
  if (size.use_own_materials === false) return common;
  if (common.length > 0) return common;
  return own;
}

function rememberId(used: Set<number>, value: unknown) {
  const id = Number(value);
  if (Number.isInteger(id) && id > 0) used.add(id);
}

function collectUsedIds(simplified: Record<string, any>): Set<number> {
  const used = new Set<number>();
  for (const size of simplified.sizes || []) rememberId(used, size?.id);
  for (const type of simplified.types || []) rememberId(used, type?.id);
  const configs = simplified.typeConfigs && typeof simplified.typeConfigs === 'object' ? simplified.typeConfigs : {};
  for (const cfg of Object.values(configs) as TypeConfigRecord[]) {
    for (const size of cfg?.sizes || []) rememberId(used, size?.id);
  }
  return used;
}

function takeId(used: Set<number>, productId: number, salt: number): number {
  let id = Math.abs(Math.trunc(productId)) * 100 + salt;
  if (id < 1) id = salt || 1;
  while (used.has(id)) id += 100;
  used.add(id);
  return id;
}

function blankPrintRow(technologyCode: string) {
  return {
    technology_code: technologyCode,
    color_mode: 'color',
    sides_mode: 'single',
    tiers: [],
  };
}

function applyTechnology(size: SizeRecord, technologyCode: string): boolean {
  const rows = Array.isArray(size.print_prices) ? size.print_prices : [];
  const current = size.default_print && typeof size.default_print === 'object' ? size.default_print : null;
  const already =
    current?.technology_code === technologyCode &&
    rows.length > 0 &&
    rows.every((row: SizeRecord) => row?.technology_code === technologyCode);
  if (already) return false;

  const prev = current || {};
  size.default_print = {
    ...prev,
    technology_code: technologyCode,
    color_mode: prev.color_mode || 'color',
    sides_mode: prev.sides_mode || 'single',
  };
  size.print_prices = rows.length
    ? rows.map((row: SizeRecord) => ({ ...row, technology_code: technologyCode }))
    : [blankPrintRow(technologyCode)];
  return true;
}

function applySharedMaterials(size: SizeRecord): boolean {
  if (size.use_own_materials === false) return false;
  size.use_own_materials = false;
  return true;
}

function isLegacySmallFormatList(sizes: SizeRecord[]): boolean {
  return sizes.length > 0 && sizes.every((size) => {
    const code = wideFormatSheetCode(size?.label);
    return !!code && REMOVABLE_FORMATS.has(code);
  });
}

function patchSizeList(
  sizes: SizeRecord[],
  technologyCode: string,
  used: Set<number>,
  productId: number,
  listLabel: string,
  report: WideFormatPatchReport,
  addMissing = true,
): SizeRecord[] {
  const kept = sizes.filter((size) => {
    const code = wideFormatSheetCode(size?.label);
    if (code && REMOVABLE_FORMATS.has(code)) {
      report.sizesRemoved.push(`${listLabel}: ${size.label}`);
      return false;
    }
    return true;
  });

  if (!addMissing) return kept;

  const present = new Set(kept.map((size) => wideFormatSheetCode(size?.label)).filter(Boolean));
  for (const format of WIDE_FORMAT_ISO_SIZES) {
    if (present.has(format.code)) continue;
    const id = takeId(used, productId, Number(format.code.slice(1)));
    kept.push({
      id,
      label: format.label,
      width_mm: format.width_mm,
      height_mm: format.height_mm,
      min_qty: 1,
      use_own_materials: false,
      use_own_finishing: false,
      allowed_material_ids: [],
      material_prices: [],
      finishing: [],
      default_print: {
        technology_code: technologyCode,
        color_mode: 'color',
        sides_mode: 'single',
      },
      print_prices: [blankPrintRow(technologyCode)],
    });
    report.sizesAdded.push(`${listLabel}: ${format.label}`);
  }

  for (const size of kept) {
    if (applySharedMaterials(size)) report.sharedMaterialsSet += 1;
    if (applyTechnology(size, technologyCode)) report.technologySet += 1;
  }
  return kept;
}

function fillEmptyCopyFields(
  type: TypeRecord,
  copy: WideFormatCopy,
  report: WideFormatPatchReport,
) {
  const label = String(type.name || type.key || type.id);
  if (isBlankText(type.fullDescription)) {
    type.fullDescription = copy.fullDescription;
    report.textsFilled.push(`${label}: полное описание`);
  }
  if (isBlankList(type.characteristics)) {
    type.characteristics = copy.characteristics.slice();
    report.textsFilled.push(`${label}: характеристики`);
  }
  if (isBlankList(type.advantages)) {
    type.advantages = copy.advantages.slice();
    report.textsFilled.push(`${label}: преимущества`);
  }
}

function ensurePrintTechnology(initial: unknown, technologyCode: string): Record<string, any> | unknown {
  if (!initial || typeof initial !== 'object' || Array.isArray(initial)) {
    return { print_technology: technologyCode };
  }
  const current = initial as Record<string, any>;
  if (current.print_technology === technologyCode) return current;
  return { ...current, print_technology: technologyCode };
}

function mergeCommonMaterials(cfg: TypeConfigRecord, sizesBefore: SizeRecord[]) {
  const existing = positiveIds(cfg.common_allowed_material_ids);
  const effective: number[] = [];
  for (const size of sizesBefore) {
    for (const id of effectiveMaterialIds(size, existing)) {
      if (!effective.includes(id)) effective.push(id);
    }
  }
  const missing = effective.filter((id) => !existing.includes(id));
  if (missing.length === 0) return;
  cfg.common_allowed_material_ids = [...existing, ...missing];
}

export function patchWideFormatProductConfig(
  config: Record<string, any> | null | undefined,
  product: { id: number; name: string },
  technologyCode = WIDE_FORMAT_SOLVENT_CODE,
): { config: Record<string, any>; report: WideFormatPatchReport } {
  const next: Record<string, any> =
    config && typeof config === 'object' && !Array.isArray(config)
      ? JSON.parse(JSON.stringify(config))
      : {};
  const before = JSON.stringify(next);
  const report: WideFormatPatchReport = {
    changed: false,
    textsFilled: [],
    sizesAdded: [],
    sizesRemoved: [],
    materialDrivenEnabled: false,
    sharedMaterialsSet: 0,
    technologySet: 0,
  };

  if (!next.simplified || typeof next.simplified !== 'object' || Array.isArray(next.simplified)) {
    next.simplified = {};
  }
  const simplified = next.simplified as Record<string, any>;
  if (simplified.material_driven_printing !== true) {
    simplified.material_driven_printing = true;
    report.materialDrivenEnabled = true;
  }

  const used = collectUsedIds(simplified);
  const productId = Number(product.id) || 0;

  if (!Array.isArray(simplified.types) || simplified.types.length === 0) {
    const rootSizes = Array.isArray(simplified.sizes) ? simplified.sizes : [];
    const commonSeed = positiveIds(
      rootSizes.flatMap((size: SizeRecord) => effectiveMaterialIds(size, [])),
    );
    simplified.sizes = patchSizeList(rootSizes, technologyCode, used, productId, 'размеры', report);
    const typeId = takeId(used, productId, 50);
    const type: TypeRecord = { id: typeId, name: 'Основной', default: true };
    fillEmptyCopyFields(type, wideFormatCopyFor(product, type), report);
    simplified.types = [type];
    simplified.typeConfigs = {
      ...(simplified.typeConfigs && typeof simplified.typeConfigs === 'object' ? simplified.typeConfigs : {}),
      [String(typeId)]: {
        sizes: JSON.parse(JSON.stringify(simplified.sizes)),
        ...(commonSeed.length ? { common_allowed_material_ids: commonSeed } : {}),
        initial: { print_technology: technologyCode },
      },
    };
  } else {
    // Корневой список из одних A4–A6 при живых подтипах — старый шаблон.
    // Его убираем, а A0–A2 добавляем в размеры подтипа, без второго каталога.
    if (Array.isArray(simplified.sizes) && simplified.sizes.length > 0) {
      const legacyOnly = isLegacySmallFormatList(simplified.sizes);
      simplified.sizes = patchSizeList(
        simplified.sizes,
        technologyCode,
        used,
        productId,
        'размеры',
        report,
        !legacyOnly,
      );
    }
    if (!simplified.typeConfigs || typeof simplified.typeConfigs !== 'object') {
      simplified.typeConfigs = {};
    }
    for (const type of simplified.types as TypeRecord[]) {
      fillEmptyCopyFields(type, wideFormatCopyFor(product, type), report);
      const key = String(type.id);
      const cfg: TypeConfigRecord =
        simplified.typeConfigs[key] && typeof simplified.typeConfigs[key] === 'object'
          ? simplified.typeConfigs[key]
          : {};
      const sizesBefore = Array.isArray(cfg.sizes) ? cfg.sizes : [];
      mergeCommonMaterials(cfg, sizesBefore);
      cfg.sizes = patchSizeList(
        sizesBefore,
        technologyCode,
        used,
        productId,
        String(type.name || type.key || key),
        report,
      );
      cfg.initial = ensurePrintTechnology(cfg.initial, technologyCode);
      simplified.typeConfigs[key] = cfg;
    }
  }

  if (simplified.initial && typeof simplified.initial === 'object') {
    simplified.initial = ensurePrintTechnology(simplified.initial, technologyCode);
  }

  report.changed = JSON.stringify(next) !== before;
  return { config: next, report };
}
