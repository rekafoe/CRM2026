/** Общие метаданные интерактивных полей макета (импорт SVG и ручное добавление). */

export type DesignFieldKind = 'photo' | 'text';

type AnyObj = Record<string, unknown>;

/** Поле для фото, добавленное клиентом через «Фото/поля». */
export function isClientAddedPhotoField(o: AnyObj): boolean {
  if (o.photoFieldClientAdded === true) return true;
  return /^field-\d{10,}$/.test(String(o.id ?? '').trim());
}

/** Текстовое поле, добавленное клиентом (не из шаблона). */
export function isClientAddedTextField(o: AnyObj): boolean {
  return o.textFieldClientAdded === true;
}

/** Шаблонное photo_* из SVG-импорта. */
export function isTemplatePhotoField(o: AnyObj): boolean {
  return o.isPhotoField === true && !isClientAddedPhotoField(o);
}

export function isDesignPhotoField(o: AnyObj): boolean {
  return o.isPhotoField === true;
}
