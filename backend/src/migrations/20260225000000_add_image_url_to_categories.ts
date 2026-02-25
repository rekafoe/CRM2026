import { Database } from 'sqlite';

export async function up(db: Database): Promise<void> {
  const cols = await db.all("PRAGMA table_info('product_categories')") as any[];
  if (!cols.some((c: any) => c.name === 'image_url')) {
    await db.run(`ALTER TABLE product_categories ADD COLUMN image_url TEXT`);
    console.log('  product_categories: added image_url column');
  }
}
