import type { PublicDesignDocumentMode } from './useDesignDocumentNavigation';
import type {
  PublicEditorPreflightField,
  PublicEditorPreflightIssue,
  PublicEditorPreflightSummary,
} from './publicDesignPreflight';

export interface PublicDesignFragmentSummary {
  label: string;
  detail: string;
  pageIndexes: number[];
  issueCount: number;
}

export function buildPublicDesignFragmentSummary(input: {
  documentMode: PublicDesignDocumentMode;
  pageCount: number;
  currentPage: number;
  fragmentPages: number[];
  spreadMode: boolean;
  coverPages: number;
  preflight: PublicEditorPreflightSummary;
}): PublicDesignFragmentSummary {
  const pageIndexes = input.fragmentPages.length > 0 ? input.fragmentPages : [input.currentPage];
  const issueCount = input.preflight.issues.filter((issue) => pageIndexes.includes(issue.pageIndex)).length;

  if (input.documentMode !== 'multipage') {
    const isTwoSided = input.pageCount === 2;
    return {
      label: isTwoSided ? `Сторона ${input.currentPage + 1}` : 'Страница',
      detail: isTwoSided ? 'Двухсторонний макет' : `${input.pageCount} стр.`,
      pageIndexes,
      issueCount,
    };
  }

  const firstPage = pageIndexes[0] ?? input.currentPage;
  const lastPage = pageIndexes[pageIndexes.length - 1] ?? firstPage;
  const coverPages = Math.max(0, input.coverPages);
  const isCover = firstPage < coverPages || lastPage >= input.pageCount - coverPages;
  const label = isCover
    ? resolveCoverLabel(firstPage, input.pageCount, coverPages)
    : pageIndexes.length === 2 && input.spreadMode
      ? `Разворот ${firstPage + 1}-${lastPage + 1}`
      : `Страница ${firstPage + 1}`;

  return {
    label,
    detail: `${input.pageCount} стр. в макете`,
    pageIndexes,
    issueCount,
  };
}

export function filterPublicDesignPreflightByPages(
  preflight: PublicEditorPreflightSummary,
  pageIndexes: number[],
): PublicEditorPreflightSummary {
  const pageSet = new Set(pageIndexes);
  const photoFields = preflight.photoFields.filter((field) => pageSet.has(field.pageIndex));
  const textFields = preflight.textFields.filter((field) => pageSet.has(field.pageIndex));
  const issues = preflight.issues.filter((issue) => pageSet.has(issue.pageIndex));

  return {
    photoFields,
    textFields,
    issues,
    hasBlockingIssues: issues.some((issue) => issue.level === 'error'),
    photoReady: countReady(photoFields),
    photoTotal: photoFields.length,
    textReady: countReady(textFields),
    textTotal: textFields.length,
  };
}

function countReady(fields: PublicEditorPreflightField[]): number {
  return fields.filter((field) => field.status === 'ready').length;
}

function resolveCoverLabel(pageIndex: number, pageCount: number, coverPages: number): string {
  if (pageIndex === 0) return 'Обложка';
  if (coverPages > 1 && pageIndex < coverPages) return `Обложка ${pageIndex + 1}`;
  if (pageIndex === pageCount - 1) return 'Задняя обложка';
  return `Обложка ${pageIndex + 1}`;
}
