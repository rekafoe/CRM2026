import type { DesignPage, DesignState } from '../../pages/admin/designEditor/types';
import {
  normalizeSouvenirFabricJsonToCssPx,
  resolveSouvenirFabricCoordSpace,
  type SouvenirFabricCoordSpace,
} from './souvenirFabricCoords';
import type { PrintAreaConfig } from './types';

const EMPTY_FABRIC_JSON: Record<string, unknown> = { version: '7.2.0', objects: [] };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isUsedSouvenirPage(page: DesignPage | undefined): boolean {
  const root = asRecord(page?.fabricJSON);
  return Array.isArray(root?.objects) && root.objects.length > 0;
}

export function getUsedPrintAreaIds(
  pages: DesignPage[],
  areas: PrintAreaConfig[],
): string[] {
  return areas
    .filter((area, index) => {
      const page = pages.find((candidate) => candidate.printAreaId === area.id) ?? pages[index];
      return isUsedSouvenirPage(page);
    })
    .map((area) => area.id);
}

/**
 * Старый одностраничный draft считается дизайном первой области.
 * Страницы с printAreaId имеют приоритет над индексом.
 */
export function normalizeSouvenirPages(
  rawPages: unknown,
  areas: PrintAreaConfig[],
  coordSpace: SouvenirFabricCoordSpace = 'css_px',
): DesignPage[] {
  const source = Array.isArray(rawPages)
    ? rawPages.map((page) => asRecord(page)).filter(Boolean) as Record<string, unknown>[]
    : [];
  return areas.map((area, index) => {
    const byId = source.find((page) => page.printAreaId === area.id);
    const original = byId ?? source[index];
    const fabricJSON = asRecord(original?.fabricJSON)
      ?? (original && Array.isArray(original.objects) ? original : null)
      ?? EMPTY_FABRIC_JSON;
    return {
      fabricJSON: normalizeSouvenirFabricJsonToCssPx(
        { ...fabricJSON },
        area.widthMm,
        area.heightMm,
        coordSpace,
      ),
      printAreaId: area.id,
      printAreaLabel: area.label,
      widthMm: area.widthMm,
      heightMm: area.heightMm,
    };
  });
}

export function buildSouvenirDesignState(input: {
  templateId: number;
  pages: DesignPage[];
  areas: PrintAreaConfig[];
  activePrintAreaId: string;
}): DesignState {
  const firstArea = input.areas[0];
  const usedPrintAreaIds = getUsedPrintAreaIds(input.pages, input.areas);
  return {
    templateId: input.templateId,
    pageWidth: firstArea?.widthMm ?? 90,
    pageHeight: firstArea?.heightMm ?? 55,
    pageCount: input.pages.length,
    sceneScale: 1,
    pages: input.pages,
    spread_mode: false,
    cover_pages: 0,
    editorKind: 'souvenir_3d',
    fabricCoordSpace: 'css_px',
    activePrintAreaId: input.activePrintAreaId,
    usedPrintAreaIds,
  };
}

export { resolveSouvenirFabricCoordSpace };

export function filterUsedSouvenirPages(
  state: DesignState,
): DesignPage[] {
  const used = new Set(state.usedPrintAreaIds ?? []);
  if (used.size === 0) return [];
  return state.pages.filter((page) => page.printAreaId && used.has(page.printAreaId));
}
