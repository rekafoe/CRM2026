import { Database } from 'sqlite';

type TemplateRow = {
  id: number;
  product_id: number;
  product_type: string | null;
  config_data: string | null;
};

export async function up(db: Database): Promise<void> {
  // First check if the table exists to avoid errors
  const tableExists = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='product_template_configs'`
  );
  if (!tableExists) return;

  const rows = await db.all<TemplateRow[]>(
    `SELECT ptc.id, ptc.product_id, p.product_type, ptc.config_data
     FROM product_template_configs ptc
     JOIN products p ON p.id = ptc.product_id
     WHERE ptc.name = 'template'`
  );

  for (const row of rows) {
    if (row.product_type === 'multi_page') continue;
    if (!row.config_data) continue;

    let config: any;
    try {
      config = typeof row.config_data === 'string' ? JSON.parse(row.config_data) : row.config_data;
    } catch {
      continue;
    }

    const simplified = config?.simplified;
    if (!simplified || typeof simplified !== 'object' || !('pages' in simplified)) {
      continue;
    }

    delete simplified.pages;
    config.simplified = simplified;

    await db.run(
      `UPDATE product_template_configs SET config_data = ? WHERE id = ?`,
      JSON.stringify(config),
      row.id
    );
  }
}

export async function down(): Promise<void> {
  // no-op: cannot safely восстановить удалённые настройки страниц
}
