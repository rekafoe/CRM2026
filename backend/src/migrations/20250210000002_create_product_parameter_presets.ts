import { Database } from 'sqlite';
import { getDb } from '../db';

const TABLE_NAME = 'product_parameter_presets';

export async function up(db?: Database): Promise<void> {
  const database = db || await getDb();

  await database.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_type TEXT NOT NULL,
      product_name TEXT NOT NULL DEFAULT '',
      preset_key TEXT NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'select',
      options TEXT,
      help_text TEXT,
      default_value TEXT,
      is_required INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (product_type, product_name, preset_key)
    )
  `);

  // Базовые пресеты для визиток и плакатов
  // ⚠️ ВАЖНО: Параметр 'material' удален - используйте вкладку "Материалы" для настройки материалов
  // Система автоматически создаст параметр material_id с актуальными данными из склада
  await database.run(
    `INSERT OR IGNORE INTO ${TABLE_NAME} (product_type, preset_key, label, field_type, options, is_required, sort_order)
     VALUES
      ('business_cards', 'tip', 'Тип визитки', 'select', '["Стандартные","Премиальные","Экспресс"]', 1, 10),
      ('business_cards', 'format', 'Размер визитки', 'select', '["90x50","85x55","90x45","custom"]', 1, 20),
      ('business_cards', 'duplex', 'Двусторонние', 'checkbox', NULL, 0, 30),
      ('business_cards', 'print_method', 'Печать', 'select', '["Односторонняя цветная","Двусторонняя цветная","Цифровая премиум","Офсетная"]', 1, 40),
      ('business_cards', 'lamination', 'Ламинирование', 'select', '["Нет","Матовая","Глянцевая","Софт-тач"]', 0, 50),
      ('business_cards', 'round_corners', 'Скругление углов', 'checkbox', NULL, 0, 60),
      ('business_cards', 'design', 'Разработка дизайна', 'checkbox', NULL, 0, 70),
      ('business_cards', 'card_holder', 'Визитница', 'checkbox', NULL, 0, 80),
      ('business_cards', 'stand', 'Подставка под визитки', 'checkbox', NULL, 0, 90),
      ('business_cards', 'proof', 'Проверка макета', 'checkbox', NULL, 0, 100),

      ('flyers', 'pages', 'Страниц в файлах', 'number', NULL, 1, 10),
      ('flyers', 'format', 'Формат', 'select', '["210x297 мм (A4)","148x210 мм (A5)","100x210 мм","custom"]', 1, 20),
      ('flyers', 'print_method', 'Тип печати', 'select', '["Лазерная черно-белая","Лазерная цветная","Офсетная","Широкоформатная"]', 1, 30),
      ('flyers', 'binding', 'Тип переплета', 'select', '["Без переплета","Скрепка","Клеевое скрепление"]', 0, 40),
      ('flyers', 'lamination', 'Ламинирование', 'checkbox', NULL, 0, 50),
      ('flyers', 'cutting', 'Обрезать поля', 'checkbox', NULL, 0, 60),
      ('flyers', 'double_sided', 'Двусторонняя печать', 'checkbox', NULL, 0, 70),
      ('flyers', 'proof', 'Проверка макета', 'checkbox', NULL, 0, 80),

      ('posters', 'format', 'Формат', 'select', '["A2","A1","A0","custom"]', 1, 10),
      ('posters', 'print_method', 'Тип печати', 'select', '["Профессиональная цветная","Лазерная черно-белая"]', 1, 20),
      ('posters', 'surface', 'Цвет, свойство', 'select', '["Матовое покрытие","Глянцевое покрытие","Сатин"]', 0, 30),
      ('posters', 'high_fill', 'Заполнение >10%', 'checkbox', NULL, 0, 40),
      ('posters', 'lamination', 'Ламинирование', 'checkbox', NULL, 0, 50),
      ('posters', 'cutting', 'Обрезать поля', 'checkbox', NULL, 0, 60),
      ('posters', 'tube_pack', 'Упаковка в тубус', 'checkbox', NULL, 0, 70),
      ('posters', 'proof', 'Проверка макета', 'checkbox', NULL, 0, 80),

      -- Пресеты для многостраничных продуктов (multi_page)
      ('multi_page', 'pages', 'Количество страниц', 'number', NULL, 1, 10),
      ('multi_page', 'format', 'Формат страницы', 'select', '["210x297 мм (A4)","148x210 мм (A5)","297x420 мм (A3)","custom"]', 1, 20),
      ('multi_page', 'print_method', 'Тип печати', 'select', '["Цифровая цветная","Офсетная","Лазерная черно-белая"]', 1, 30),
      ('multi_page', 'binding', 'Тип переплета', 'select', '["Без переплета","Скрепка","Клеевое скрепление","Пружина","Твердый переплет"]', 0, 40),
      ('multi_page', 'lamination', 'Ламинирование обложки', 'checkbox', NULL, 0, 50),
      ('multi_page', 'cover', 'Отдельная обложка', 'checkbox', NULL, 0, 60),
      ('multi_page', 'color_pages', 'Цветные страницы', 'number', NULL, 0, 70),
      ('multi_page', 'black_white_pages', 'Черно-белые страницы', 'number', NULL, 0, 80),
      ('multi_page', 'proof', 'Проверка макета', 'checkbox', NULL, 0, 90)
    `
  );
}

export async function down(db?: Database): Promise<void> {
  const database = db || await getDb();
  await database.exec(`DROP TABLE IF EXISTS ${TABLE_NAME}`);
}

