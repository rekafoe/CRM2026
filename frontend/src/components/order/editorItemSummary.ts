import type { Item } from '../../types';

export type EditorItemKind = 'designState' | 'photoBatch' | 'clientFiles' | 'noLayout';

export interface EditorLayoutIssue {
  id: string;
  level: 'error' | 'warning';
  message: string;
  pageIndex: number;
}

export interface EditorItemSummary {
  kind: EditorItemKind;
  label: string;
  detail: string;
  pages?: number;
  photoFiles?: number;
  photoQuantity?: number;
  layoutIncomplete?: boolean;
  layoutIssues?: EditorLayoutIssue[];
  layoutReviewPath?: string;
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
    const layoutIncomplete = params.layoutIncomplete === true;
    const layoutIssues = Array.isArray(params.layoutIssues)
      ? params.layoutIssues as EditorLayoutIssue[]
      : undefined;
    const layoutReviewPath = typeof params.layoutReviewPath === 'string'
      ? params.layoutReviewPath
      : undefined;
    return {
      kind: 'designState',
      label: 'Макет из редактора',
      detail: layoutIncomplete
        ? `${pageCount} стр. · макет неполный`
        : `${pageCount} стр. · шаблон ${params.designTemplateId ?? '—'}`,
      pages: pageCount,
      layoutIncomplete,
      layoutIssues,
      layoutReviewPath,
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
