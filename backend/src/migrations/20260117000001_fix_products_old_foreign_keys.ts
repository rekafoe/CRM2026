import { Database } from 'sqlite';

type TableInfo = { name: string; sql: string | null };

const replaceProductsOldReference = (sql: string) =>
  sql.replace(/"products_old"/g, '"products"').replace(/\bproducts_old\b/g, 'products');

const replaceCreateTableName = (sql: string, tableName: string, tempName: string) => {
  const pattern = new RegExp(
    `^\\s*CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(\"?${tableName}\"?)`,
    'i'
  );
  return sql.replace(pattern, `CREATE TABLE $1"${tempName}"`);
};

export async function up(db: Database): Promise<void> {
  const tables = (await db.all(
    `SELECT name, sql
     FROM sqlite_master
     WHERE type = 'table' AND sql LIKE '%products_old%'`
  )) as TableInfo[];

  if (!tables.length) {
    return;
  }

  await db.exec('PRAGMA foreign_keys = OFF;');

  for (const table of tables) {
    if (!table.sql) continue;

    const tempName = `${table.name}__fix`;
    const fixedSql = replaceCreateTableName(
      replaceProductsOldReference(table.sql),
      table.name,
      tempName
    );

    await db.exec(`DROP TABLE IF EXISTS "${tempName}"`);
    await db.exec(fixedSql);

    const columns = await db.all<Array<{ name: string }>>(
      `PRAGMA table_info("${table.name}")`
    );
    const columnList = columns.map((col) => `"${col.name}"`).join(', ');

    if (columnList.length > 0) {
      await db.exec(
        `INSERT INTO "${tempName}" (${columnList}) SELECT ${columnList} FROM "${table.name}"`
      );
    }

    await db.exec(`DROP TABLE "${table.name}"`);
    await db.exec(`ALTER TABLE "${tempName}" RENAME TO "${table.name}"`);
  }

  await db.exec('PRAGMA foreign_keys = ON;');
}

export async function down(): Promise<void> {
  // no-op: migration is a forward-only fix for legacy references
}
