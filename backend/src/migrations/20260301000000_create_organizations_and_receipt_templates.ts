import { Database } from 'sqlite';

/**
 * Организации (реквизиты для товарного чека) и шаблоны чека.
 * Каждая организация может иметь свой уникальный HTML-шаблон товарного чека.
 */
export async function up(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unp TEXT,
      legal_address TEXT,
      phone TEXT,
      email TEXT,
      bank_details TEXT,
      logo_url TEXT,
      is_default INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS receipt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      html_content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_receipt_templates_org ON receipt_templates(organization_id)`);

  // organization_id в orders
  const orderCols = (await db.all(`PRAGMA table_info('orders')`)) as Array<{ name: string }>;
  const orderNames = orderCols.map((c) => c.name);
  if (!orderNames.includes('organization_id')) {
    await db.exec(`ALTER TABLE orders ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL`);
  }

  // Создаём организацию по умолчанию из env (если таблица пустая)
  const count = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM organizations');
  if (count && count.c === 0) {
    const companyName = process.env.COMPANY_NAME || 'ООО "Светлан Эстетикс"';
    const unp = process.env.COMPANY_UNP || '193679900';
    const result = await db.run(
      `INSERT INTO organizations (name, unp, is_default, sort_order) VALUES (?, ?, 1, 0)`,
      companyName,
      unp
    );
    const orgId = result.lastID;
    if (orgId) {
      const defaultTemplate = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Товарный чек {{receiptNumber}}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 16px; line-height: 1.35; }
    .header { margin-bottom: 10px; }
    .title { font-size: 13px; font-weight: bold; margin-bottom: 6px; }
    .org { margin-bottom: 2px; }
    .unp { margin-bottom: 8px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #333; padding: 4px 6px; text-align: left; }
    th { background: #eee; font-weight: bold; }
    td:nth-child(1) { width: 28px; text-align: center; }
    td:nth-child(3) { width: 80px; text-align: right; }
    td:nth-child(4), td:nth-child(5) { text-align: right; width: 70px; }
    .total { font-weight: bold; margin: 6px 0; }
    .summary { margin: 8px 0; }
    .manager { margin-top: 12px; }
    .sign { margin-top: 24px; font-size: 10px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Товарный чек № {{receiptNumber}} к заказу № {{orderNumber}} от {{orderDate}}</div>
    <div class="org">Организация {{companyName}}</div>
    <div class="unp">УНП {{unp}}</div>
  </div>
  <table>
    <thead>
      <tr><th>№</th><th>Товар</th><th>Количество</th><th>Цена</th><th>Сумма</th></tr>
    </thead>
    <tbody>{{itemsTable}}</tbody>
  </table>
  <div class="total">Итого: {{totalStr}}</div>
  <div class="summary">{{summaryLine}}</div>
  <div class="manager">{{manager}}</div>
  <div class="sign">(подпись)</div>
</body>
</html>`;
      await db.run(
        `INSERT INTO receipt_templates (organization_id, html_content) VALUES (?, ?)`,
        orgId,
        defaultTemplate
      );
    }
  }
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_receipt_templates_org');
  await db.exec('DROP TABLE IF EXISTS receipt_templates');
  await db.exec('DROP TABLE IF EXISTS organizations');
  // SQLite не поддерживает DROP COLUMN — organization_id остаётся в orders
}
