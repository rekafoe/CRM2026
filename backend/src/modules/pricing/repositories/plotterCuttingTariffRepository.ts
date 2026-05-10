import { Database } from 'sqlite';
import { getDb } from '../../../db';
import type {
  PlotterCuttingMeterBasis,
  PlotterCuttingModeTariffDTO,
  PlotterCuttingTariffsBundleDTO,
  PlotterVolumeTierBasis,
} from '../dtos/plotterCuttingTariff.dto';

type RawRow = {
  mode: string;
  label: string;
  price_per_meter: number;
  meter_basis: string;
  volume_tier_basis?: string | null;
  min_quantity: number | null;
  max_quantity: number | null;
  operator_percent: number | null;
  material_id: number | null;
  qty_per_item: number | null;
  weeding_price_per_item?: number | null;
  mounting_price_per_item?: number | null;
  volume_tiers_json: string | null;
  cut_level_rules_json?: string | null;
  weeding_tiers_json?: string | null;
  mounting_tiers_json?: string | null;
};

/** Мин. п.м. в тарифе: допускаются доли (0,3 м); хранение REAL, округление до 3 знаков. */
export function normalizePlotterMinPm(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(n * 1000) / 1000;
}

function parseMeterBasis(raw: string | null | undefined): PlotterCuttingMeterBasis {
  return raw === 'feed' ? 'feed' : 'knife_path';
}

function parseVolumeTierBasis(raw: string | null | undefined): PlotterVolumeTierBasis | null {
  if (raw === 'knife_m' || raw === 'feed_m' || raw === 'cut_area_m2') return raw;
  return null;
}

function parseTiersJson(raw: string | null): PlotterCuttingModeTariffDTO['volume_tiers'] {
  if (!raw || raw.trim() === '') return undefined;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return undefined;
    const out: Array<{ min_quantity: number; price_per_unit: number }> = [];
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const minQ = Number((item as any).min_quantity);
      const rate = Number((item as any).price_per_unit);
      if (!Number.isFinite(minQ) || minQ < 0 || !Number.isFinite(rate)) continue;
      out.push({ min_quantity: minQ, price_per_unit: rate });
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

function tierRateAtQty(
  rows: Array<{ min_quantity: number; price_per_unit: number }>,
  qty: number,
): number {
  const asc = [...rows].sort((a, b) => a.min_quantity - b.min_quantity);
  if (!asc.length) return 0;
  let pick = asc[0];
  for (const t of asc) if (qty >= t.min_quantity) pick = t;
  return Number(pick.price_per_unit);
}

function parseCutLevelRules(
  raw: string | null | undefined
): PlotterCuttingModeTariffDTO['cut_level_rules'] {
  if (!raw || raw.trim() === '') return undefined;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return undefined;
    const out: Array<{ max_cell_long_side_mm: number; multiplier: number }> = [];
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const maxSide = Number((item as { max_cell_long_side_mm?: unknown }).max_cell_long_side_mm);
      const mult = Number((item as { multiplier?: unknown }).multiplier);
      if (!Number.isFinite(maxSide) || maxSide <= 0 || !Number.isFinite(mult) || mult <= 0) continue;
      out.push({ max_cell_long_side_mm: maxSide, multiplier: mult });
    }
    return out.length ? out : undefined;
  } catch {
    return undefined;
  }
}

function mapRow(row: RawRow): PlotterCuttingModeTariffDTO {
  const mode = row.mode === 'sheet' ? 'sheet' : 'roll';
  const parsedWeeding = parseTiersJson(row.weeding_tiers_json ?? null);
  const parsedMounting = parseTiersJson(row.mounting_tiers_json ?? null);
  const legacyWeedingScalar =
    row.weeding_price_per_item != null && Number.isFinite(Number(row.weeding_price_per_item))
      ? Number(row.weeding_price_per_item)
      : undefined;
  const legacyMountScalar =
    row.mounting_price_per_item != null && Number.isFinite(Number(row.mounting_price_per_item))
      ? Number(row.mounting_price_per_item)
      : undefined;

  let weeding_tiers = undefined as PlotterCuttingModeTariffDTO['weeding_tiers'];
  let mounting_tiers = undefined as PlotterCuttingModeTariffDTO['mounting_tiers'];

  if (mode === 'roll') {
    if (parsedWeeding?.length) weeding_tiers = parsedWeeding;
    else if (legacyWeedingScalar !== undefined) weeding_tiers = [{ min_quantity: 1, price_per_unit: legacyWeedingScalar }];
    if (parsedMounting?.length) mounting_tiers = parsedMounting;
    else if (legacyMountScalar !== undefined) mounting_tiers = [{ min_quantity: 1, price_per_unit: legacyMountScalar }];
  }

  const weeding_price_per_item =
    mode === 'roll' && weeding_tiers?.length ? tierRateAtQty(weeding_tiers, 1) : null;
  const mounting_price_per_item =
    mode === 'roll' && mounting_tiers?.length ? tierRateAtQty(mounting_tiers, 1) : null;

  return {
    mode,
    label: row.label?.trim() || (mode === 'roll' ? 'Плоттер (рулон)' : 'Плоттер (лист)'),
    price_per_meter: Number(row.price_per_meter ?? 0),
    meter_basis: parseMeterBasis(row.meter_basis),
    volume_tier_basis: parseVolumeTierBasis(row.volume_tier_basis),
    min_quantity: normalizePlotterMinPm(row.min_quantity ?? 1),
    max_quantity: row.max_quantity != null ? Number(row.max_quantity) : null,
    operator_percent:
      row.operator_percent != null && Number.isFinite(Number(row.operator_percent))
        ? Number(row.operator_percent)
        : null,
    material_id: row.material_id != null ? Number(row.material_id) : null,
    qty_per_item: row.qty_per_item != null ? Number(row.qty_per_item) : null,
    weeding_tiers,
    mounting_tiers,
    weeding_price_per_item,
    mounting_price_per_item,
    volume_tiers: parseTiersJson(row.volume_tiers_json),
    cut_level_rules: parseCutLevelRules(row.cut_level_rules_json),
  };
}

export class PlotterCuttingTariffRepository {
  private static async conn(): Promise<Database> {
    return getDb();
  }

  static async ensureTable(db: Database): Promise<void> {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS plotter_cutting_mode_tariffs (
        mode TEXT PRIMARY KEY CHECK (mode IN ('roll', 'sheet')),
        label TEXT NOT NULL DEFAULT '',
        price_per_meter REAL NOT NULL DEFAULT 0,
        meter_basis TEXT NOT NULL DEFAULT 'knife_path' CHECK (meter_basis IN ('knife_path', 'feed')),
        volume_tier_basis TEXT,
        min_quantity REAL NOT NULL DEFAULT 1,
        max_quantity INTEGER,
        operator_percent REAL,
        material_id INTEGER,
        qty_per_item REAL,
        weeding_price_per_item REAL,
        mounting_price_per_item REAL,
        volume_tiers_json TEXT,
        cut_level_rules_json TEXT,
        weeding_tiers_json TEXT,
        mounting_tiers_json TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    try {
      await db.exec(`ALTER TABLE plotter_cutting_mode_tariffs ADD COLUMN weeding_price_per_item REAL`);
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? e ?? '');
      if (!msg.includes('duplicate column')) throw e;
    }
    try {
      await db.exec(`ALTER TABLE plotter_cutting_mode_tariffs ADD COLUMN mounting_price_per_item REAL`);
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? e ?? '');
      if (!msg.includes('duplicate column')) throw e;
    }
    try {
      await db.exec(`ALTER TABLE plotter_cutting_mode_tariffs ADD COLUMN weeding_tiers_json TEXT`);
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? e ?? '');
      if (!msg.includes('duplicate column')) throw e;
    }
    try {
      await db.exec(`ALTER TABLE plotter_cutting_mode_tariffs ADD COLUMN mounting_tiers_json TEXT`);
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? e ?? '');
      if (!msg.includes('duplicate column')) throw e;
    }
  }

  static async getBundle(): Promise<PlotterCuttingTariffsBundleDTO> {
    const db = await this.conn();
    await this.ensureTable(db);
    const rows = (await db.all(`SELECT * FROM plotter_cutting_mode_tariffs WHERE mode IN ('roll','sheet')`)) as RawRow[];
    const byMode = new Map(rows.map((r) => [r.mode, r]));
    const roll = byMode.get('roll');
    const sheet = byMode.get('sheet');
    const defaultRoll: PlotterCuttingModeTariffDTO = {
      mode: 'roll',
      label: 'Плоттерная резка (рулон)',
      price_per_meter: 0,
      meter_basis: 'knife_path',
      volume_tier_basis: null,
      min_quantity: 1,
      max_quantity: null,
      operator_percent: null,
      material_id: null,
      qty_per_item: null,
      weeding_price_per_item: null,
      mounting_price_per_item: null,
      weeding_tiers: undefined,
      mounting_tiers: undefined,
      volume_tiers: undefined,
      cut_level_rules: undefined,
    };
    const defaultSheet: PlotterCuttingModeTariffDTO = {
      ...defaultRoll,
      mode: 'sheet',
      label: 'Плоттерная резка (лист)',
    };
    return {
      roll: roll ? mapRow(roll) : defaultRoll,
      sheet: sheet ? mapRow(sheet) : defaultSheet,
    };
  }

  static async replaceBundle(bundle: PlotterCuttingTariffsBundleDTO): Promise<PlotterCuttingTariffsBundleDTO> {
    const db = await this.conn();
    await this.ensureTable(db);
    const saveOne = async (dto: PlotterCuttingModeTariffDTO) => {
      const tiersJson =
        dto.volume_tiers && dto.volume_tiers.length > 0
          ? JSON.stringify(
              dto.volume_tiers.map((t) => ({
                min_quantity: t.min_quantity,
                price_per_unit: t.price_per_unit,
              }))
            )
          : null;
      const cutLevelJson =
        dto.mode === 'roll' && dto.cut_level_rules && dto.cut_level_rules.length > 0
          ? JSON.stringify(
              dto.cut_level_rules.map((r) => ({
                max_cell_long_side_mm: r.max_cell_long_side_mm,
                multiplier: r.multiplier,
              }))
            )
          : null;
      const volBasis =
        dto.volume_tier_basis === 'knife_m' ||
        dto.volume_tier_basis === 'feed_m' ||
        dto.volume_tier_basis === 'cut_area_m2'
          ? dto.volume_tier_basis
          : null;
      const weedingTiersJson =
        dto.mode === 'roll' && dto.weeding_tiers && dto.weeding_tiers.length > 0
          ? JSON.stringify(
              dto.weeding_tiers.map((t) => ({
                min_quantity: t.min_quantity,
                price_per_unit: t.price_per_unit,
              })),
            )
          : null;
      const mountingTiersJson =
        dto.mode === 'roll' && dto.mounting_tiers && dto.mounting_tiers.length > 0
          ? JSON.stringify(
              dto.mounting_tiers.map((t) => ({
                min_quantity: t.min_quantity,
                price_per_unit: t.price_per_unit,
              })),
            )
          : null;
      const weedingScalar =
        dto.mode === 'roll' && dto.weeding_tiers && dto.weeding_tiers.length > 0
          ? tierRateAtQty(dto.weeding_tiers, 1)
          : dto.mode === 'roll' &&
              dto.weeding_price_per_item != null &&
              Number.isFinite(Number(dto.weeding_price_per_item))
            ? Number(dto.weeding_price_per_item)
            : null;
      const mountingScalar =
        dto.mode === 'roll' && dto.mounting_tiers && dto.mounting_tiers.length > 0
          ? tierRateAtQty(dto.mounting_tiers, 1)
          : dto.mode === 'roll' &&
              dto.mounting_price_per_item != null &&
              Number.isFinite(Number(dto.mounting_price_per_item))
            ? Number(dto.mounting_price_per_item)
            : null;
      await db.run(
        `INSERT INTO plotter_cutting_mode_tariffs (
          mode, label, price_per_meter, meter_basis, volume_tier_basis, min_quantity, max_quantity,
          operator_percent, material_id, qty_per_item, volume_tiers_json, cut_level_rules_json,
          updated_at, weeding_price_per_item, mounting_price_per_item, weeding_tiers_json, mounting_tiers_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)
        ON CONFLICT(mode) DO UPDATE SET
          label = excluded.label,
          price_per_meter = excluded.price_per_meter,
          meter_basis = excluded.meter_basis,
          volume_tier_basis = excluded.volume_tier_basis,
          min_quantity = excluded.min_quantity,
          max_quantity = excluded.max_quantity,
          operator_percent = excluded.operator_percent,
          material_id = excluded.material_id,
          qty_per_item = excluded.qty_per_item,
          volume_tiers_json = excluded.volume_tiers_json,
          cut_level_rules_json = excluded.cut_level_rules_json,
          weeding_price_per_item = excluded.weeding_price_per_item,
          mounting_price_per_item = excluded.mounting_price_per_item,
          weeding_tiers_json = excluded.weeding_tiers_json,
          mounting_tiers_json = excluded.mounting_tiers_json,
          updated_at = datetime('now')`,
        dto.mode,
        dto.label?.trim() || (dto.mode === 'roll' ? 'Плоттерная резка (рулон)' : 'Плоттерная резка (лист)'),
        Number(dto.price_per_meter ?? 0),
        dto.meter_basis === 'feed' ? 'feed' : 'knife_path',
        volBasis,
        normalizePlotterMinPm(dto.min_quantity ?? 1),
        dto.max_quantity != null && Number.isFinite(Number(dto.max_quantity)) ? Number(dto.max_quantity) : null,
        dto.operator_percent != null && Number.isFinite(Number(dto.operator_percent))
          ? Number(dto.operator_percent)
          : null,
        dto.material_id != null && Number.isFinite(Number(dto.material_id)) ? Number(dto.material_id) : null,
        dto.qty_per_item != null && Number.isFinite(Number(dto.qty_per_item)) ? Number(dto.qty_per_item) : null,
        tiersJson,
        cutLevelJson,
        weedingScalar,
        mountingScalar,
        weedingTiersJson,
        mountingTiersJson
      );
    };
    await db.exec('BEGIN');
    try {
      await saveOne(bundle.roll);
      await saveOne(bundle.sheet);
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
    return this.getBundle();
  }
}
