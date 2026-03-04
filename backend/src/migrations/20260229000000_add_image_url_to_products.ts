import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  const cols = (await db.all("PRAGMA table_info('products')")) as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'image_url')) {
    await db.run(`ALTER TABLE products ADD COLUMN image_url TEXT`);
    console.log('  products: added image_url column');
  }
}
