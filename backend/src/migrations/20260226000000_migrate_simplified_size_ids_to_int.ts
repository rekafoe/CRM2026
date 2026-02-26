import { Database } from 'sqlite';

type TemplateRow = {
  id: number;
  product_id: number;
  config_data: string | null;
};

function isStringId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && !/^\d+$/.test(id);
}

/**
 * Миграция: заменяет строковые ID размеров (sz_xxx) на целочисленные.
 * Не пересоздаёт размеры — только меняет id в config_data.
 */
export async function up(db: Database): Promise<void> {
  const tableExists = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='product_template_configs'`
  );
  if (!tableExists) return;

  const rows = await db.all<TemplateRow[]>(
    `SELECT id, product_id, config_data FROM product_template_configs WHERE config_data IS NOT NULL`
  );

  let totalUpdated = 0;
  for (const row of rows) {
    if (!row.config_data) continue;

    let config: any;
    try {
      config = typeof row.config_data === 'string' ? JSON.parse(row.config_data) : row.config_data;
    } catch {
      continue;
    }

    const simplified = config?.simplified;
    if (!simplified || typeof simplified !== 'object') continue;

    const idMap = new Map<string, number>();
    let nextId = 1000000 + row.id * 10000;

    function ensureIntId(oldId: unknown): number {
      if (typeof oldId === 'number' && Number.isFinite(oldId)) return oldId;
      const key = String(oldId);
      if (idMap.has(key)) return idMap.get(key)!;
      const newId = nextId++;
      idMap.set(key, newId);
      return newId;
    }

    let changed = false;

    // simplified.sizes
    if (Array.isArray(simplified.sizes)) {
      for (const size of simplified.sizes) {
        if (size && isStringId(size.id)) {
          const newId = ensureIntId(size.id);
          size.id = newId;
          changed = true;
        }
      }
    }

    // typeConfigs[].sizes и typeConfigs[].initial.size_id
    const typeConfigs = simplified.typeConfigs;
    if (typeConfigs && typeof typeConfigs === 'object') {
      for (const typeId of Object.keys(typeConfigs)) {
        const cfg = typeConfigs[typeId];
        if (!cfg || typeof cfg !== 'object') continue;

        if (Array.isArray(cfg.sizes)) {
          for (const size of cfg.sizes) {
            if (size && isStringId(size.id)) {
              const newId = ensureIntId(size.id);
              size.id = newId;
              changed = true;
            }
          }
        }

        if (cfg.initial && cfg.initial.size_id != null) {
          const oldSizeId = cfg.initial.size_id;
          if (isStringId(oldSizeId) || idMap.has(String(oldSizeId))) {
            const newId = idMap.get(String(oldSizeId)) ?? ensureIntId(oldSizeId);
            cfg.initial.size_id = newId;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      await db.run(
        `UPDATE product_template_configs SET config_data = ? WHERE id = ?`,
        JSON.stringify(config),
        row.id
      );
      totalUpdated++;
    }
  }

  console.log(`✅ [migrate_simplified_size_ids] Обновлено конфигов: ${totalUpdated}`);
}

export async function down(): Promise<void> {
  // Нельзя безопасно восстановить старые строковые ID
}
