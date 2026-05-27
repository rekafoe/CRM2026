/** Элемент полосы страниц (один элемент = обложка или разворот) */
export interface StripItem {
  /** Отображаемое название */
  label: string;
  /** Индексы страниц, входящих в этот элемент (1 для одиночной, 2 для разворота) */
  pages: number[];
  /** Страница, на которую переходим при клике */
  goToPage: number;
}

/**
 * Строит список элементов полосы для текущего набора страниц.
 * @param pageCount   - кол-во страниц
 * @param spreadMode  - true = режим разворотов
 * @param coverPages  - кол-во одиночных страниц в начале (обложка, форзац...)
 */
export function buildStripItems(
  pageCount: number,
  spreadMode: boolean,
  coverPages = 1,
): StripItem[] {
  if (!spreadMode) {
    return Array.from({ length: pageCount }, (_, i) => {
      let label: string;
      if (i === 0) label = 'Обложка';
      else if (i === pageCount - 1 && pageCount > 1) label = 'Задняя обложка';
      else label = `Стр. ${i + 1}`;
      return { label, pages: [i], goToPage: i };
    });
  }

  const items: StripItem[] = [];
  let pageIdx = 0;

  // Одиночные страницы в начале (обложка, etc.)
  const covers = Math.min(coverPages, pageCount);
  const coverLabels = ['Обложка', 'Форзац', 'Стр. 3'];
  for (let c = 0; c < covers; c++, pageIdx++) {
    items.push({
      label: coverLabels[c] ?? `Стр. ${pageIdx + 1}`,
      pages: [pageIdx],
      goToPage: pageIdx,
    });
  }

  // Последняя страница — задняя обложка (фотокнига: лицевая + развороты + задняя)
  const lastPageIdx = pageCount - 1;
  const hasBackCover = pageCount > covers;
  const innerEnd = hasBackCover ? lastPageIdx : pageCount;

  // Развороты (внутренние страницы)
  let spreadNum = 1;
  while (pageIdx < innerEnd) {
    if (pageIdx + 1 < innerEnd) {
      items.push({
        label: `Разворот ${spreadNum}`,
        pages: [pageIdx, pageIdx + 1],
        goToPage: pageIdx,
      });
      pageIdx += 2;
    } else {
      items.push({
        label: `Разворот ${spreadNum}`,
        pages: [pageIdx],
        goToPage: pageIdx,
      });
      pageIdx++;
    }
    spreadNum++;
  }

  // Задняя обложка (последняя одиночная страница)
  if (hasBackCover && pageIdx === lastPageIdx) {
    items.push({
      label: 'Задняя обложка',
      pages: [lastPageIdx],
      goToPage: lastPageIdx,
    });
  }

  return items;
}

/**
 * Находит элемент полосы, содержащий указанную страницу.
 */
export function findStripItemForPage(
  items: StripItem[],
  pageIndex: number,
): number {
  return items.findIndex((item) => item.pages.includes(pageIndex));
}

/** Индекс вставки нового разворота: перед задней обложкой, если она есть. */
export function getSpreadInsertIndex(pageCount: number, coverPages = 1): number {
  const covers = Math.min(coverPages, pageCount);
  return pageCount > covers ? pageCount - 1 : pageCount;
}

/** Число внутренних страниц между обложками (без лицевой и задней). */
export function countInnerSpreadPages(pageCount: number, coverPages = 1): number {
  const covers = Math.min(coverPages, pageCount);
  if (pageCount <= covers + 1) return 0;
  return pageCount - covers - 1;
}

/**
 * В режиме разворотов между обложками должно быть чётное число страниц.
 * Иначе в полосе появляется «разворот» из одной страницы, а «Добавить разворот» даёт +1, а не +2.
 */
export function ensureEvenInnerSpreadPages<T>(
  pages: T[],
  pageCount: number,
  coverPages: number,
  createEmptyPage: () => T,
): { pages: T[]; pageCount: number } {
  const covers = Math.min(coverPages, pageCount);
  const normalized = Array.from({ length: pageCount }, (_, index) => pages[index] ?? createEmptyPage());
  if (pageCount <= covers + 1) {
    return { pages: normalized, pageCount };
  }
  const innerCount = pageCount - covers - 1;
  if (innerCount % 2 === 0) {
    return { pages: normalized, pageCount };
  }
  const insertAt = pageCount - 1;
  return {
    pages: [
      ...normalized.slice(0, insertAt),
      createEmptyPage(),
      ...normalized.slice(insertAt),
    ],
    pageCount: pageCount + 1,
  };
}

/** Вставка нового разворота: всегда 2 страницы перед задней обложкой. */
export function buildSpreadPageInsert(
  pageCount: number,
  coverPages: number,
): { insertAt: number; addCount: 2 } {
  return {
    insertAt: getSpreadInsertIndex(pageCount, coverPages),
    addCount: 2,
  };
}

export function needsInnerSpreadPadding(pageCount: number, coverPages = 1): boolean {
  return countInnerSpreadPages(pageCount, coverPages) % 2 === 1;
}

/**
 * Подготовка макета и вставка разворота (+2 стр.) перед задней обложкой.
 * Сначала выравнивает нечётное число внутренних страниц (если нужно), затем добавляет пару.
 */
export function appendSpreadPages<T>(
  pages: T[],
  pageCount: number,
  coverPages: number,
  createEmptyPage: () => T,
): { pages: T[]; pageCount: number; insertAt: number } {
  const even = ensureEvenInnerSpreadPages(pages, pageCount, coverPages, createEmptyPage);
  const { insertAt, addCount } = buildSpreadPageInsert(even.pageCount, coverPages);
  return {
    pages: [
      ...even.pages.slice(0, insertAt),
      createEmptyPage(),
      createEmptyPage(),
      ...even.pages.slice(insertAt),
    ],
    pageCount: even.pageCount + addCount,
    insertAt,
  };
}

/** Последний внутренний блок (разворот или одиночная) перед задней обложкой — для удаления. */
export function getLastInnerSpreadRange(
  pageCount: number,
  coverPages = 1,
): { start: number; length: number } | null {
  const covers = Math.min(coverPages, pageCount);
  if (pageCount <= covers) return null;

  const innerEnd = pageCount - 1;
  let pageIdx = covers;
  let last: { start: number; length: number } | null = null;

  while (pageIdx < innerEnd) {
    if (pageIdx + 1 < innerEnd) {
      last = { start: pageIdx, length: 2 };
      pageIdx += 2;
    } else {
      last = { start: pageIdx, length: 1 };
      pageIdx += 1;
    }
  }

  if (!last || pageCount - last.length < covers + 1) return null;
  return last;
}

/** Индекс страницы для перехода по полосе (разворот → левая страница пары). */
export function resolveStripGoToPage(stripItems: StripItem[], pageIndex: number): number {
  const item = stripItems.find((entry) => entry.pages.includes(pageIndex));
  return item?.goToPage ?? pageIndex;
}
