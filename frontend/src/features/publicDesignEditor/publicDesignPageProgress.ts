import type { PageStripStatus } from '../../pages/admin/designEditor/PageStrip';
import type { PublicEditorPreflightSummary } from './publicDesignPreflight';

export function buildPublicDesignPageStatuses(
  pageCount: number,
  preflight: PublicEditorPreflightSummary,
): Record<number, PageStripStatus> {
  const statuses: Record<number, PageStripStatus> = {};

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const issues = preflight.issues.filter((issue) => issue.pageIndex === pageIndex);
    const photoFields = preflight.photoFields.filter((field) => field.pageIndex === pageIndex);
    const textFields = preflight.textFields.filter((field) => field.pageIndex === pageIndex);
    const errors = issues.filter((issue) => issue.level === 'error').length;
    const warnings = issues.length - errors;
    const missingPhotos = photoFields.filter((field) => field.status === 'missing').length;
    const textWarnings = textFields.filter((field) => field.status !== 'ready').length;

    if (errors > 0 || missingPhotos > 0) {
      statuses[pageIndex] = {
        tone: 'error',
        label: missingPhotos > 0 ? `Нужно фото: ${missingPhotos}` : `Нужно проверить: ${errors}`,
      };
      continue;
    }

    if (warnings > 0 || textWarnings > 0) {
      statuses[pageIndex] = {
        tone: 'warning',
        label: textWarnings > 0 ? `Нужен текст: ${textWarnings}` : `Проверьте: ${warnings}`,
      };
      continue;
    }

    statuses[pageIndex] = {
      tone: 'ready',
      label: 'Готово',
    };
  }

  return statuses;
}
