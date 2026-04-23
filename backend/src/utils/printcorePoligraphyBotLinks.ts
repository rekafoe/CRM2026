/**
 * Кнопки-ссылки на витрину printcore (полиграфия).
 * Слуги /services/* проверялись на 200 OK (не годится угадывать без проверки).
 */
const DEFAULT_BASE = 'https://printcore.by';

export type TelegramUrlInlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
};

function siteBase(): string {
  const raw = process.env.PRINTCORE_PUBLIC_SITE_BASE?.trim();
  if (!raw) return DEFAULT_BASE;
  return raw.replace(/\/+$/, '');
}

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['📇 Визитки', '/services/vizitki'],
  ['📄 Листовки', '/services/listovki'],
  ['📑 Буклеты', '/services/buklety'],
  ['📚 Каталоги', '/services/katalogi'],
  ['🗓 Календари', '/services/kalendari'],
  ['🪧 Флаеры', '/services/flaery'],
  ['📖 Брошюры', '/services/brosjury'],
  ['💌 Открытки', '/services/otkrytki'],
  ['🏅 Грамоты', '/services/gramoty'],
  ['🍽 Меню', '/services/menyu'],
  ['🖨️ Полиграфия', '/services/poligrafy'],
  ['📋 Все услуги', '/services'],
];

export function getPrintcorePoligraphyIntroText(): string {
  return (
    `🖨️ *Полиграфия на сайте Printcore*\n\n` +
    `Ниже — быстрые ссылки на виды продукции и на каталог. ` +
    `Оформление заказа — на сайте (как и у Mini App: это веб-интерфейс).`
  );
}

export function buildPrintcorePoligraphyUrlKeyboard(): TelegramUrlInlineKeyboard {
  const base = siteBase();
  const rows: Array<Array<{ text: string; url: string }>> = [];
  for (let i = 0; i < PAIRS.length; i += 2) {
    const row: Array<{ text: string; url: string }> = [
      { text: PAIRS[i][0], url: `${base}${PAIRS[i][1]}` },
    ];
    if (i + 1 < PAIRS.length) {
      row.push({ text: PAIRS[i + 1][0], url: `${base}${PAIRS[i + 1][1]}` });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}
