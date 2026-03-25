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

  // Последняя страница резервируется под заднюю обложку, если общее
  // число страниц чётное относительно разворотов (т.е. останется одна)
  const lastPageIdx = pageCount - 1;
  const remainingAfterCovers = pageCount - covers;
  // Задняя обложка — одиночная, если оставшихся страниц нечётное кол-во
  const hasBackCover = remainingAfterCovers % 2 !== 0;
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
