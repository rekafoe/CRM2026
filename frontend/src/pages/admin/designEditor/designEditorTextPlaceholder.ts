/** Шаблонные надписи в макетах — совпадает с publicDesignPreflight. */
const PLACEHOLDER_TEXTS = new Set([
  'текст',
  'ваш текст',
  'имя',
  'телефон',
  'email',
  'заголовок',
  'описание',
]);

export function normalizeTextForPlaceholderCheck(text: string | undefined): string {
  return String(text ?? '').replace(/\u200b/g, '').trim();
}

export function isPlaceholderTemplateText(text: string | undefined): boolean {
  const normalized = normalizeTextForPlaceholderCheck(text).toLowerCase();
  if (!normalized) return false;
  return PLACEHOLDER_TEXTS.has(normalized) || normalized.includes('placeholder');
}

/**
 * Сообщение после выхода из правки, если текст пустой или остался шаблонным.
 * null — напоминание не нужно.
 */
export function resolveTextFillHintAfterEdit(
  textBefore: string | undefined,
  textAfter: string | undefined,
): string | null {
  const before = normalizeTextForPlaceholderCheck(textBefore);
  const after = normalizeTextForPlaceholderCheck(textAfter);

  if (!after) {
    return 'Текст пустой — введите свой вариант для печати.';
  }

  if (!isPlaceholderTemplateText(after)) {
    return null;
  }

  if (after === before) {
    return 'Текст не изменён — замените шаблонную надпись на свой вариант.';
  }

  return 'Похоже на шаблонную надпись — замените текст перед заказом.';
}
