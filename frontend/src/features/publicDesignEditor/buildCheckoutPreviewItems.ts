import type { StripItem } from '../../pages/admin/designEditor/spreadUtils';

/** Элемент превью в модалке «Перед заказом» — совпадает с полосой страниц редактора. */
export type CheckoutPreviewItem = StripItem & { key: string };

export function buildCheckoutPreviewItems(stripItems: StripItem[]): CheckoutPreviewItem[] {
  return stripItems.map((item, index) => ({
    ...item,
    key: `${item.label}-${item.pages.join('-')}-${index}`,
  }));
}

export function checkoutPreviewHasSpreads(items: CheckoutPreviewItem[]): boolean {
  return items.some((item) => item.pages.length === 2);
}
