import type { DesignPage } from '../../pages/admin/designEditor/types';

export type PublicEditorPreflightIssueLevel = 'error' | 'warning';

export interface PublicEditorPreflightIssue {
  id: string;
  level: PublicEditorPreflightIssueLevel;
  message: string;
  pageIndex: number;
}

export interface PublicEditorPreflightField {
  id: string;
  pageIndex: number;
  label: string;
  status: 'ready' | 'missing' | 'warning';
  detail: string;
}

export interface PublicEditorPreflightSummary {
  photoFields: PublicEditorPreflightField[];
  textFields: PublicEditorPreflightField[];
  issues: PublicEditorPreflightIssue[];
  hasBlockingIssues: boolean;
  photoReady: number;
  photoTotal: number;
  textReady: number;
  textTotal: number;
}

type FabricJsonObject = Record<string, unknown>;

import { isFabricTextObjectType } from '../../pages/admin/designEditor/patchFabricTextObjects';
import {
  isPlaceholderTemplateText,
  normalizeTextForPlaceholderCheck,
} from '../../pages/admin/designEditor/designEditorTextPlaceholder';
import {
  checkTextSceneBoxOverflow,
  estimateTextSceneBox,
  type DesignPageBoundsPx,
} from '../../pages/admin/designEditor/designEditorTextBounds';

function isRecord(value: unknown): value is FabricJsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function walkFabricObjects(value: unknown, visit: (obj: FabricJsonObject) => void): void {
  if (!isRecord(value)) return;
  visit(value);
  for (const key of ['objects', '_objects']) {
    const children = value[key];
    if (Array.isArray(children)) children.forEach((child) => walkFabricObjects(child, visit));
  }
  walkFabricObjects(value.clipPath, visit);
}

function hasBlobUrl(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('blob:');
  if (Array.isArray(value)) return value.some(hasBlobUrl);
  if (!isRecord(value)) return false;
  return Object.values(value).some(hasBlobUrl);
}

function isTextObject(obj: FabricJsonObject): boolean {
  return isFabricTextObjectType(obj.type);
}

function isPlaceholderText(text: string): boolean {
  return isPlaceholderTemplateText(text);
}

export function analyzePublicDesignPages(
  pages: DesignPage[],
  saveState: string,
  pageBounds?: DesignPageBoundsPx,
): PublicEditorPreflightSummary {
  const photoFields: PublicEditorPreflightField[] = [];
  const textFields: PublicEditorPreflightField[] = [];
  const issues: PublicEditorPreflightIssue[] = [];

  pages.forEach((page, pageIndex) => {
    walkFabricObjects(page.fabricJSON, (obj) => {
      if (obj.isPhotoField === true) {
        const id = String(obj.id ?? `photo-${pageIndex + 1}-${photoFields.length + 1}`);
        const filled = obj.photoFieldFilled === true;
        const fieldWidth = Number(obj.photoFieldFw ?? obj.width ?? 0);
        const fieldHeight = Number(obj.photoFieldFh ?? obj.height ?? 0);
        const intrinsicWidth = Number(obj.photoFieldIntrinsicW ?? 0);
        const intrinsicHeight = Number(obj.photoFieldIntrinsicH ?? 0);
        const lowQuality = filled &&
          fieldWidth > 0 &&
          fieldHeight > 0 &&
          intrinsicWidth > 0 &&
          intrinsicHeight > 0 &&
          (intrinsicWidth < fieldWidth * 1.5 || intrinsicHeight < fieldHeight * 1.5);
        photoFields.push({
          id,
          pageIndex,
          label: `Фото ${photoFields.length + 1}`,
          status: filled ? lowQuality ? 'warning' : 'ready' : 'missing',
          detail: filled ? lowQuality ? 'Фото может быть низкого качества для печати' : 'Фото добавлено' : 'Нужно добавить фото',
        });
        if (!filled) {
          issues.push({
            id: `photo-${id}`,
            level: 'error',
            pageIndex,
            message: `Страница ${pageIndex + 1}: не заполнено фото-поле`,
          });
        } else if (lowQuality) {
          issues.push({
            id: `photo-quality-${id}`,
            level: 'warning',
            pageIndex,
            message: `Страница ${pageIndex + 1}: фото может быть низкого качества для печати`,
          });
        }
      }

      if (isTextObject(obj)) {
        const text = normalizeTextForPlaceholderCheck(String(obj.text ?? ''));
        const placeholder = isPlaceholderText(text);
        const empty = text.length === 0;
        const unfilled = empty || placeholder;
        textFields.push({
          id: String(obj.id ?? `text-${pageIndex + 1}-${textFields.length + 1}`),
          pageIndex,
          label: text ? text.slice(0, 32) : `Текст ${textFields.length + 1}`,
          status: unfilled ? 'missing' : 'ready',
          detail: empty
            ? 'Текст пустой'
            : placeholder
              ? 'Замените шаблонную надпись на свой текст'
              : 'Текст заполнен',
        });
        if (unfilled) {
          issues.push({
            id: `text-${pageIndex}-${textFields.length}`,
            level: 'error',
            pageIndex,
            message: `Страница ${pageIndex + 1}: ${
              empty ? 'есть пустой текст' : 'текст не изменён (осталась шаблонная надпись)'
            }`,
          });
        } else if (pageBounds) {
          const box = estimateTextSceneBox(obj);
          if (box) {
            const overflow = checkTextSceneBoxOverflow(box, pageBounds);
            const fieldId = String(obj.id ?? `text-${pageIndex}`);
            if (overflow.outsidePage) {
              textFields[textFields.length - 1] = {
                ...textFields[textFields.length - 1]!,
                status: 'warning',
                detail: 'Текст выходит за край страницы — уменьшите кегль или сократите надпись',
              };
              issues.push({
                id: `text-overflow-page-${fieldId}`,
                level: 'warning',
                pageIndex,
                message: `Страница ${pageIndex + 1}: текст выходит за край макета`,
              });
            } else if (overflow.outsideSafeZone) {
              textFields[textFields.length - 1] = {
                ...textFields[textFields.length - 1]!,
                status: 'warning',
                detail: 'Текст за пределами безопасной зоны — может обрезаться при печати',
              };
              issues.push({
                id: `text-overflow-safe-${fieldId}`,
                level: 'warning',
                pageIndex,
                message: `Страница ${pageIndex + 1}: текст за пределами безопасной зоны`,
              });
            }
          }
        }
      }
    });

    if (hasBlobUrl(page.fabricJSON)) {
      issues.push({
        id: `blob-${pageIndex}`,
        level: 'error',
        pageIndex,
        message: `Страница ${pageIndex + 1}: найден временный blob URL, сохраните файл в draft`,
      });
    }
  });

  if (saveState === 'dirty' || saveState === 'saving') {
    issues.push({
      id: 'save-state',
      level: 'warning',
      pageIndex: 0,
      message: saveState === 'saving' ? 'Идёт сохранение draft' : 'Есть несохранённые изменения',
    });
  }

  return {
    photoFields,
    textFields,
    issues,
    hasBlockingIssues: issues.some((issue) => issue.level === 'error'),
    photoReady: photoFields.filter((field) => field.status === 'ready').length,
    photoTotal: photoFields.length,
    textReady: textFields.filter((field) => field.status === 'ready').length,
    textTotal: textFields.length,
  };
}
