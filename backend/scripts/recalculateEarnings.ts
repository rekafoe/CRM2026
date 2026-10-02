/**
 * Скрипт пересчёта ЗП (order_item_earnings) по всем датам заказов.
 * Использует текущие operator_percent из products и post_processing_services.
 * Произвольный калькулятор получает текущий процент из настроек CRM, даже если в позиции сохранён старый снимок.
 *
 * Использование:
 *   npx ts-node -r dotenv/config scripts/recalculateEarnings.ts
 *   npx ts-node -r dotenv/config scripts/recalculateEarnings.ts --from 2025-01-01 --to 2025-12-31
 *   npx ts-node -r dotenv/config scripts/recalculateEarnings.ts --dry-run
 */

import { initDB, getDb } from '../src/config/database';
import { EarningsService } from '../src/services/earningsService';

function parseArgs(): { from?: string; to?: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let from: string | undefined;
  let to: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      from = args[++i];
    } else if (args[i] === '--to' && args[i + 1]) {
      to = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { from, to, dryRun };
}

async function main() {
  const { from, to, dryRun } = parseArgs();

  console.log('🔄 Пересчёт ЗП (order_item_earnings)');
  if (dryRun) console.log('   Режим: --dry-run (без изменений в БД)');
  if (from) console.log('   От:', from);
  if (to) console.log('   До:', to);
  console.log('');

  await initDB();

  const db = await getDb();

  const rows = (await db.all(
    `SELECT DISTINCT substr(COALESCE(createdAt, created_at), 1, 10) as d
     FROM orders
     WHERE COALESCE(createdAt, created_at) IS NOT NULL
       AND substr(COALESCE(createdAt, created_at), 1, 10) != ''
     ORDER BY d`
  )) as Array<{ d: string }>;

  let dates = (rows || []).map((r) => r.d).filter(Boolean);
  if (from) dates = dates.filter((d) => d >= from);
  if (to) dates = dates.filter((d) => d <= to);

  console.log(`📅 Найдено дат для пересчёта: ${dates.length}`);
  if (dates.length === 0) {
    console.log('   Нет заказов в указанном диапазоне.');
    process.exit(0);
    return;
  }

  const start = Date.now();
  let errors = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    try {
      if (!dryRun) {
        await EarningsService.recalculateForDate(date);
      }
      const pct = Math.round(((i + 1) / dates.length) * 100);
      process.stdout.write(`\r   ${date} (${i + 1}/${dates.length} ${pct}%)`);
    } catch (err) {
      errors++;
      console.error(`\n❌ Ошибка для ${date}:`, (err as Error).message);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n');
  console.log(`✅ Готово за ${elapsed} с`);
  if (errors > 0) {
    console.log(`⚠️ Ошибок: ${errors}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
});
