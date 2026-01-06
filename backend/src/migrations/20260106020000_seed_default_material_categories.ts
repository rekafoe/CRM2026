import { Database } from 'sqlite'

/**
 * Если в БД нет категорий материалов (или есть только "Ламинация"),
 * добавляем базовый набор, чтобы форма создания материала не была "пустой".
 * Это не хардкод в UI: данные всё равно идут из БД через API.
 */
export async function up(db: Database) {
  const row = await db.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM material_categories`)
  const count = Number(row?.cnt ?? 0)

  // Если категорий уже достаточно — ничего не делаем
  if (count >= 2) return

  // Если одна категория — проверим, что это именно "Ламинация"
  if (count === 1) {
    const only = await db.get<{ name: string }>(`SELECT name FROM material_categories LIMIT 1`)
    if ((only?.name ?? '').trim() !== 'Ламинация') return
  }

  await db.exec(`
    INSERT OR IGNORE INTO material_categories (name, description, color, sort_order)
    VALUES
      ('Бумага', 'Бумага и листовые материалы', '#6c757d', 10),
      ('Картон', 'Картон и плотные листовые материалы', '#495057', 20),
      ('Плёнки', 'Плёнки, винил и прочие материалы', '#868e96', 30),
      ('Краски / Тонер', 'Расходники для печати', '#343a40', 40),
      ('Ламинация', 'Пленки и расходники для ламинации', '#4f46e5', 50),
      ('Прочее', 'Прочие материалы', '#adb5bd', 99);
  `)
}

export async function down(db: Database) {
  // Удаляем только те категории, которые мы подсидили, чтобы не снести пользовательские данные
  await db.exec(`
    DELETE FROM material_categories
    WHERE name IN ('Бумага', 'Картон', 'Плёнки', 'Краски / Тонер', 'Прочее');
  `)
}


