import { Database } from 'sqlite';

/**
 * Объёмные ступени за изделие для рулона: выборка и накатка (мин. порог × цена за шт.).
 */
export async function up(db: Database): Promise<void> {
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

export async function down(_db: Database): Promise<void> {}
