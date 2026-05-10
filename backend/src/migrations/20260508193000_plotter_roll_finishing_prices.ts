import { Database } from 'sqlite';

/**
 * Два вложенных тарифа рулонной плоттерной резки:
 * - выборка за изделие
 * - накатка за изделие
 */
export async function up(db: Database): Promise<void> {
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
}

export async function down(_db: Database): Promise<void> {
  // SQLite: без пересборки таблицы колонку не удалить
}

