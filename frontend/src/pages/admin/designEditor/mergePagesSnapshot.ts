import type { DesignPage } from './types';

/** Результат saveCurrentPage без импорта из canvas (совместимая форма) */
export type PageSaveSnapshot =
  | { kind: 'single'; json: Record<string, unknown> }
  | { kind: 'spread'; left: Record<string, unknown>; right: Record<string, unknown> };

export function mergePagesWithSavedSnapshot(
  pages: DesignPage[],
  saved: PageSaveSnapshot,
  ctx: { currentPage: number; leftPageIdx: number; rightPageIdx: number },
): DesignPage[] {
  if (saved.kind === 'spread') {
    return pages.map((p, i) => {
      if (i === ctx.leftPageIdx) return { fabricJSON: saved.left };
      if (i === ctx.rightPageIdx) return { fabricJSON: saved.right };
      return p;
    });
  }
  return pages.map((p, i) => (i === ctx.currentPage ? { fabricJSON: saved.json } : p));
}
