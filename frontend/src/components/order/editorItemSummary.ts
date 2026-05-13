import type { Item } from '../../types';

export type EditorItemKind = 'designState' | 'photoBatch' | 'clientFiles' | 'noLayout';

export interface EditorItemSummary {
  kind: EditorItemKind;
  label: string;
  detail: string;
  pages?: number;
  photoFiles?: number;
  photoQuantity?: number;
}

export function getEditorItemSummary(item: Item): EditorItemSummary {
  const params = item.params ?? {};
  const photoBatch = params.photoBatch;
  const designState = params.designState;

  if (photoBatch) {
    const photoFiles = Number(photoBatch.totalFiles) || 0;
    const photoQuantity = Number(photoBatch.totalQuantity) || 0;
    return {
      kind: 'photoBatch',
      label: 'Photo batch',
      detail: `${photoFiles} файлов · ${photoQuantity} отпечатков`,
      photoFiles,
      photoQuantity,
    };
  }

  if (designState) {
    const pageCount = Number((designState as { pageCount?: unknown }).pageCount) || 1;
    return {
      kind: 'designState',
      label: 'Макет из редактора',
      detail: `${pageCount} стр. · шаблон ${params.designTemplateId ?? '—'}`,
      pages: pageCount,
    };
  }

  if ((params as { no_layout?: unknown }).no_layout === true) {
    return {
      kind: 'noLayout',
      label: 'Без макета',
      detail: 'Нужна разработка или согласование макета',
    };
  }

  return {
    kind: 'clientFiles',
    label: 'Файлы клиента',
    detail: 'Обычный заказ без editor draft',
  };
}
