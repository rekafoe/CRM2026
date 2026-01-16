import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  const columns = await db.all(`PRAGMA table_info('customers')`);
  const hasBankDetails = columns.some((column: any) => column.name === 'bank_details');
  const hasAuthorizedPerson = columns.some((column: any) => column.name === 'authorized_person');

  if (!hasBankDetails) {
    await db.exec(`
      ALTER TABLE customers
      ADD COLUMN bank_details TEXT
    `);
  }

  if (!hasAuthorizedPerson) {
    await db.exec(`
      ALTER TABLE customers
      ADD COLUMN authorized_person TEXT
    `);
  }
}
