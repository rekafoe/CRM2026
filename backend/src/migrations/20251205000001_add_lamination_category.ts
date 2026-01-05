import { Database } from 'sqlite'

/**
 * Добавляем категорию "Ламинация" в список категорий материалов склада.
 * Это нужно, чтобы расходники для ламинации (пленки) были отдельной категорией
 * и подтягивались в формах без хардкода.
 */
export async function up(db: Database): Promise<void> {
  await db.run(
    `
      INSERT OR IGNORE INTO material_categories (name, description, color, sort_order)
      VALUES ('Ламинация', 'Пленки и расходники для ламинации', '#4f46e5', 50);
    `
  );
}

export async function down(db: Database): Promise<void> {
  await db.run(
    `
      DELETE FROM material_categories
      WHERE name = 'Ламинация';
    `
  );
}


