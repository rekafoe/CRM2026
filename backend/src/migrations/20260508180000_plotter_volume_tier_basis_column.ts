import { Database } from 'sqlite';

/** Ось объёма для тиражных ступеней плоттера (knife_m | feed_m | cut_area_m2). */
export async function up(db: Database): Promise<void> {
  try {
    await db.exec(`ALTER TABLE plotter_cutting_mode_tariffs ADD COLUMN volume_tier_basis TEXT`);
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? e ?? '');
    if (!msg.includes('duplicate column')) throw e;
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite: без пересборки таблицы колонку не удалить
}
