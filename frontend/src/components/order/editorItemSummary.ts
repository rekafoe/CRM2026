import type { Item } from '../../types';
import { formatBynAmount } from '../../pages/admin/designTemplates/designTemplateCatalogUtils';

export type EditorItemKind = 'designState' | 'photoBatch' | 'clientFiles' | 'noLayout' | 'souvenir3d';

export type DesignTemplateRoyaltyInfo = {
  authorName?: string | null;
  authorPayoutPerUnit?: number | null;
};

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
  /** Зона печати сувенирки для бланка оператора. */
  printAreaLabel?: string;
  printAreaMm?: string;
}

function isSouvenirMode(params: Item['params']): boolean {
  const mode = params.editorDraftMode;
  if (mode === 'souvenir_3d') return true;
  const kind = (params as { editorKind?: unknown }).editorKind;
  return kind === 'souvenir_3d';
}

export function getEditorItemSummary(
  item: Item,
  designRoyalty?: DesignTemplateRoyaltyInfo | null,
): EditorItemSummary {
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
    const royaltySuffix = designRoyalty?.authorName && designRoyalty.authorPayoutPerUnit != null
      ? ` · автор ${designRoyalty.authorName} · ${formatBynAmount(designRoyalty.authorPayoutPerUnit)}/ед. (внутр.)`
      : '';
    const printAreas = (params as { printAreas?: unknown }).printAreas;
    const firstArea = Array.isArray(printAreas) && printAreas[0] && typeof printAreas[0] === 'object'
      ? printAreas[0] as { label?: string; widthMm?: number; heightMm?: number }
      : null;
    const souvenir = isSouvenirMode(params);
    return {
      kind: souvenir ? 'souvenir3d' : 'designState',
      label: souvenir ? 'Сувенирный макет' : 'Макет из редактора',
      detail: layoutIncomplete
        ? `${pageCount} стр. · макет неполный${royaltySuffix}`
        : souvenir
          ? `${pageCount} стр. · зона печати${royaltySuffix}`
          : `${pageCount} стр. · шаблон ${params.designTemplateId ?? '—'}${royaltySuffix}`,
      pages: pageCount,
      layoutIncomplete,
      layoutIssues,
      layoutReviewPath,
      printAreaLabel: typeof firstArea?.label === 'string' ? firstArea.label : undefined,
      printAreaMm:
        firstArea && Number(firstArea.widthMm) > 0 && Number(firstArea.heightMm) > 0
          ? `${firstArea.widthMm}×${firstArea.heightMm} мм`
          : designState
            ? `${(designState as { pageWidth?: number }).pageWidth}×${(designState as { pageHeight?: number }).pageHeight} мм`
            : undefined,
    };
  }

  const noLayoutDeclared =
    (params as { no_layout?: unknown }).no_layout === true ||
    (params as { crmNoLayoutDeclared?: unknown }).crmNoLayoutDeclared === true ||
    (params as { specifications?: { artwork_provided?: unknown } }).specifications?.artwork_provided === false;

  if (noLayoutDeclared) {
    const layoutHumanLabel = (params as unknown as { layoutHumanLabel?: unknown }).layoutHumanLabel;
    const layoutLabel = typeof layoutHumanLabel === 'string' ? layoutHumanLabel.trim() : '';
    return {
      kind: 'noLayout',
      label: 'Без макета',
      detail: layoutLabel || 'Нужна разработка или согласование макета',
    };
  }

  return {
    kind: 'clientFiles',
    label: 'Файлы клиента',
    detail: 'Обычный заказ без editor draft',
  };
}
