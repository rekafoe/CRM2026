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

const PLACEHOLDER_TEXTS = new Set(['текст', 'ваш текст', 'имя', 'телефон', 'email', 'заголовок', 'описание']);

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
  const type = String(obj.type ?? '').toLowerCase();
  return type === 'i-text' || type === 'textbox' || type === 'text';
}

function isPlaceholderText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return PLACEHOLDER_TEXTS.has(normalized) || normalized.includes('placeholder');
}

export function analyzePublicDesignPages(pages: DesignPage[], saveState: string): PublicEditorPreflightSummary {
  const photoFields: PublicEditorPreflightField[] = [];
  const textFields: PublicEditorPreflightField[] = [];
  const issues: PublicEditorPreflightIssue[] = [];

  pages.forEach((page, pageIndex) => {
    walkFabricObjects(page.fabricJSON, (obj) => {
      if (obj.isPhotoField === true) {
        const id = String(obj.id ?? `photo-${pageIndex + 1}-${photoFields.length + 1}`);
        const filled = obj.photoFieldFilled === true;
        photoFields.push({
          id,
          pageIndex,
          label: `Фото ${photoFields.length + 1}`,
          status: filled ? 'ready' : 'missing',
          detail: filled ? 'Фото добавлено' : 'Нужно добавить фото',
        });
        if (!filled) {
          issues.push({
            id: `photo-${id}`,
            level: 'error',
            pageIndex,
            message: `Страница ${pageIndex + 1}: не заполнено фото-поле`,
          });
        }
      }

      if (isTextObject(obj)) {
        const text = String(obj.text ?? '').trim();
        const placeholder = isPlaceholderText(text);
        const empty = text.length === 0;
        textFields.push({
          id: String(obj.id ?? `text-${pageIndex + 1}-${textFields.length + 1}`),
          pageIndex,
          label: text ? text.slice(0, 32) : `Текст ${textFields.length + 1}`,
          status: empty ? 'missing' : placeholder ? 'warning' : 'ready',
          detail: empty ? 'Текст пустой' : placeholder ? 'Похоже на плейсхолдер' : 'Текст заполнен',
        });
        if (empty || placeholder) {
          issues.push({
            id: `text-${pageIndex}-${textFields.length}`,
            level: empty ? 'error' : 'warning',
            pageIndex,
            message: `Страница ${pageIndex + 1}: ${empty ? 'есть пустой текст' : 'текст похож на плейсхолдер'}`,
          });
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
