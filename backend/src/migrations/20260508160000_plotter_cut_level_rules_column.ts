import { Database } from 'sqlite';

/**
 * Уровни резки рулона: JSON с порогами по длинной стороне ячейки (мм) и множителем к ставке за п.м.
 */
export async function up(db: Database): Promise<void> {
  try {
    await db.exec(
      `ALTER TABLE plotter_cutting_mode_tariffs ADD COLUMN cut_level_rules_json TEXT`
    );
  } catch (e: any) {
    const msg = String(e?.message || e || '')
    if (!msg.includes('duplicate column')) throw e
  }
}

export async function down(db: Database): Promise<void> {
  // SQLite: нельзя DROP COLUMN без пересборки таблицы — оставляем колонку
}
