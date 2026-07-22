/**
 * Контракт сувенирного 3D-редактора (майка/кружка).
 * Источник истины для печати — мм; 3D только превью.
 */

export type SouvenirEditorKind = 'flat' | 'souvenir_3d';

export type PrintAreaUvRect = {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
};

/** Зона печати продукта: мм + привязка к GLB mesh/UV. */
export type PrintAreaConfig = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  /** URL GLB (CDN / uploads). Пусто — процедурная заглушка. */
  modelUrl?: string;
  /** Имя mesh в GLB, куда клеится CanvasTexture (например print_front). */
  meshName: string;
  /** Подмножество UV, если print не на весь mesh. */
  uvRect?: PrintAreaUvRect;
  /** Тип процедурной заглушки при отсутствии modelUrl. */
  procedural?: 'tshirt' | 'mug';
};

export type SouvenirProductMeta = {
  printAreas: PrintAreaConfig[];
  /** Активная зона по умолчанию. */
  defaultPrintAreaId?: string;
};

/** Расширение draft payload / order params. */
export type SouvenirDraftMeta = {
  editorKind: 'souvenir_3d';
  activePrintAreaId?: string;
};

export const DEFAULT_PRINT_AREA_TSHIRT: PrintAreaConfig = {
  id: 'front',
  label: 'Грудь',
  widthMm: 300,
  heightMm: 400,
  meshName: 'print_front',
  procedural: 'tshirt',
};

export const DEFAULT_PRINT_AREA_MUG: PrintAreaConfig = {
  id: 'wrap',
  label: 'Обхват кружки',
  widthMm: 210,
  heightMm: 95,
  meshName: 'print_wrap',
  procedural: 'mug',
};

export function parsePrintAreas(raw: unknown): PrintAreaConfig[] {
  if (!Array.isArray(raw)) return [];
  const areas: PrintAreaConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const widthMm = Number(row.widthMm);
    const heightMm = Number(row.heightMm);
    const meshName = typeof row.meshName === 'string' ? row.meshName.trim() : '';
    if (!id || !meshName || !(widthMm > 0) || !(heightMm > 0)) continue;
    const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : id;
    const modelUrl = typeof row.modelUrl === 'string' && row.modelUrl.trim() ? row.modelUrl.trim() : undefined;
    const procedural =
      row.procedural === 'mug' || row.procedural === 'tshirt' ? row.procedural : undefined;
    let uvRect: PrintAreaUvRect | undefined;
    if (row.uvRect && typeof row.uvRect === 'object') {
      const uv = row.uvRect as Record<string, unknown>;
      const u0 = Number(uv.u0);
      const v0 = Number(uv.v0);
      const u1 = Number(uv.u1);
      const v1 = Number(uv.v1);
      if ([u0, v0, u1, v1].every((n) => Number.isFinite(n))) {
        uvRect = { u0, v0, u1, v1 };
      }
    }
    areas.push({ id, label, widthMm, heightMm, meshName, modelUrl, uvRect, procedural });
  }
  return areas;
}

export function isTshirtBackPrintArea(area: Pick<PrintAreaConfig, 'id' | 'meshName' | 'label'>): boolean {
  const key = `${area.id} ${area.meshName} ${area.label}`.toLowerCase();
  return /(?:^|[^a-z])back(?:[^a-z]|$)|rear|print_back|спин|задн/.test(key);
}

export function resolveActivePrintArea(
  areas: PrintAreaConfig[],
  preferredId?: string | null,
): PrintAreaConfig | null {
  if (areas.length === 0) return null;
  if (preferredId) {
    const found = areas.find((a) => a.id === preferredId);
    if (found) return found;
  }
  return areas[0] ?? null;
}
