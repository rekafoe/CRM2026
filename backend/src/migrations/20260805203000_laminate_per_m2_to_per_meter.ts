import { Database } from 'sqlite';

type TableColumnInfo = { name: string };

async function tableExists(db: Database, table: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [table]
  );
  return Boolean(row?.name);
}

async function hasColumn(db: Database, table: string, column: string): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;
  const cols = (await db.all(`PRAGMA table_info(${table})`)) as TableColumnInfo[];
  return cols.some((c) => c.name === column);
}

function roundMoney(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * ШФП-ламинация: тариф за пог. м подачи, а не за м² рулона.
 *
 * Для operation_type=laminate + price_unit=per_m2:
 * - price_unit → per_meter, meter_basis=feed, consumption_mode=roll_feed
 * - ставки × (ширина_рулона_мм / 1000), чтобы чек примерно совпал
 *   (45 BYN/м² × 0.63 м ≈ 28.35 BYN/пог.м на рулоне 630 мм)
 *
 * Границы тиражей (min_quantity) не трогаем — их лучше пересмотреть вручную под пог. м.
 */
export async function up(db: Database): Promise<void> {
  if (!(await tableExists(db, 'post_processing_services'))) return;

  const hasPriceUnit = await hasColumn(db, 'post_processing_services', 'price_unit');
  const hasOpType = await hasColumn(db, 'post_processing_services', 'operation_type');
  if (!hasPriceUnit || !hasOpType) return;

  const hasMeterBasis = await hasColumn(db, 'post_processing_services', 'meter_basis');
  const hasConsumption = await hasColumn(db, 'post_processing_services', 'consumption_mode');
  const hasServiceMaterial = await hasColumn(db, 'post_processing_services', 'material_id');
  const hasVariantMaterial =
    (await tableExists(db, 'service_variants')) &&
    (await hasColumn(db, 'service_variants', 'material_id'));
  const hasVariantMeterBasis =
    hasVariantMaterial && (await hasColumn(db, 'service_variants', 'meter_basis'));
  const hasVariantConsumption =
    hasVariantMaterial && (await hasColumn(db, 'service_variants', 'consumption_mode'));

  const services = await db.all<
    Array<{ id: number; price: number | null; material_id?: number | null }>
  >(
    `SELECT id, price${hasServiceMaterial ? ', material_id' : ''}
     FROM post_processing_services
     WHERE LOWER(COALESCE(operation_type, '')) = 'laminate'
       AND LOWER(COALESCE(price_unit, '')) = 'per_m2'`
  );

  if (!services.length) return;

  const widthByMaterialId = new Map<number, number>();
  if (await tableExists(db, 'materials')) {
    const mats = await db.all<
      Array<{ id: number; sheet_width?: number | null; printable_width?: number | null }>
    >(`SELECT id, sheet_width, printable_width FROM materials`);
    for (const m of mats) {
      const w = Number(m.sheet_width ?? m.printable_width ?? 0);
      if (Number.isFinite(w) && w > 0) widthByMaterialId.set(m.id, w);
    }
  }

  for (const svc of services) {
    let serviceWidthMm: number | null = null;
    if (svc.material_id != null) {
      serviceWidthMm = widthByMaterialId.get(Number(svc.material_id)) ?? null;
    }
    if (serviceWidthMm == null && hasVariantMaterial) {
      const variantWidths = await db.all<Array<{ material_id: number | null }>>(
        `SELECT material_id FROM service_variants WHERE service_id = ? AND material_id IS NOT NULL`,
        [svc.id]
      );
      for (const v of variantWidths) {
        const w = v.material_id != null ? widthByMaterialId.get(Number(v.material_id)) : undefined;
        if (w != null) {
          serviceWidthMm = w;
          break;
        }
      }
    }

    const serviceWidthM = serviceWidthMm != null ? serviceWidthMm / 1000 : null;

    if (serviceWidthM != null && serviceWidthM > 0 && svc.price != null && Number(svc.price) > 0) {
      await db.run(`UPDATE post_processing_services SET price = ? WHERE id = ?`, [
        roundMoney(Number(svc.price) * serviceWidthM),
        svc.id,
      ]);
    }

    const sets: string[] = [`price_unit = 'per_meter'`, `unit = 'per_meter'`];
    if (hasMeterBasis) sets.push(`meter_basis = 'feed'`);
    if (hasConsumption) sets.push(`consumption_mode = 'roll_feed'`);
    await db.run(`UPDATE post_processing_services SET ${sets.join(', ')} WHERE id = ?`, [svc.id]);

    if (await tableExists(db, 'service_volume_prices')) {
      const tiers = await db.all<
        Array<{ id: number; price_per_unit: number; variant_id?: number | null }>
      >(
        `SELECT id, price_per_unit, variant_id
         FROM service_volume_prices
         WHERE service_id = ?`,
        [svc.id]
      );
      for (const t of tiers) {
        let widthM = serviceWidthM;
        if (t.variant_id != null && hasVariantMaterial) {
          const v = await db.get<{ material_id: number | null }>(
            `SELECT material_id FROM service_variants WHERE id = ?`,
            [t.variant_id]
          );
          if (v?.material_id != null) {
            const w = widthByMaterialId.get(Number(v.material_id));
            if (w != null) widthM = w / 1000;
          }
        }
        if (widthM == null || widthM <= 0) continue;
        await db.run(`UPDATE service_volume_prices SET price_per_unit = ? WHERE id = ?`, [
          roundMoney(Number(t.price_per_unit) * widthM),
          t.id,
        ]);
      }
    }

    if (!hasVariantMaterial) continue;

    const variants = await db.all<Array<{ id: number; material_id: number | null }>>(
      `SELECT id, material_id FROM service_variants WHERE service_id = ?`,
      [svc.id]
    );

    for (const v of variants) {
      const vSets: string[] = [];
      if (hasVariantMeterBasis) vSets.push(`meter_basis = 'feed'`);
      if (hasVariantConsumption) vSets.push(`consumption_mode = 'roll_feed'`);
      if (vSets.length) {
        await db.run(`UPDATE service_variants SET ${vSets.join(', ')} WHERE id = ?`, [v.id]);
      }

      const vWidthMm =
        v.material_id != null
          ? widthByMaterialId.get(Number(v.material_id)) ?? serviceWidthMm
          : serviceWidthMm;
      const vWidthM = vWidthMm != null ? vWidthMm / 1000 : null;
      if (vWidthM == null || vWidthM <= 0) continue;

      if (
        (await tableExists(db, 'service_variant_prices')) &&
        (await tableExists(db, 'service_range_boundaries'))
      ) {
        const vPrices = await db.all<Array<{ id: number; price_per_unit: number }>>(
          `SELECT svp.id, svp.price_per_unit
           FROM service_variant_prices svp
           JOIN service_range_boundaries srb ON srb.id = svp.range_id
           WHERE svp.variant_id = ? AND srb.service_id = ?`,
          [v.id, svc.id]
        );
        for (const p of vPrices) {
          await db.run(`UPDATE service_variant_prices SET price_per_unit = ? WHERE id = ?`, [
            roundMoney(Number(p.price_per_unit) * vWidthM),
            p.id,
          ]);
        }
      }
    }
  }
}

export async function down(_db: Database): Promise<void> {
  // необратимо: ставки уже пересчитаны в пог. м
}
