/**
 * Скрипт для добавления пресетов параметров для multi_page продуктов
 */

const { getDb } = require('../dist/src/db');

async function addMultiPagePresets() {
  const db = await getDb();
  
  console.log('Добавляем пресеты для multi_page продуктов...');
  
  try {
    await db.run(`
      INSERT OR IGNORE INTO product_parameter_presets 
      (product_type, preset_key, label, field_type, options, is_required, sort_order)
      VALUES
      ('multi_page', 'pages', 'Количество страниц', 'number', NULL, 1, 10),
      ('multi_page', 'format', 'Формат страницы', 'select', '["210x297 мм (A4)","148x210 мм (A5)","297x420 мм (A3)","custom"]', 1, 20),
      ('multi_page', 'print_method', 'Тип печати', 'select', '["Цифровая цветная","Офсетная","Лазерная черно-белая"]', 1, 30),
      ('multi_page', 'binding', 'Тип переплета', 'select', '["Без переплета","Скрепка","Клеевое скрепление","Пружина","Твердый переплет"]', 0, 40),
      ('multi_page', 'material', 'Материал', 'select', '["Бумага офисная","Бумага мелованная","Плотная дизайнерская","Картон"]', 1, 50),
      ('multi_page', 'density', 'Плотность бумаги', 'select', '["80","100","130","170","200","250","300"]', 1, 60),
      ('multi_page', 'lamination', 'Ламинирование обложки', 'checkbox', NULL, 0, 70),
      ('multi_page', 'cover', 'Отдельная обложка', 'checkbox', NULL, 0, 80),
      ('multi_page', 'color_pages', 'Цветные страницы', 'number', NULL, 0, 90),
      ('multi_page', 'black_white_pages', 'Черно-белые страницы', 'number', NULL, 0, 100),
      ('multi_page', 'proof', 'Проверка макета', 'checkbox', NULL, 0, 110)
    `);
    
    const count = await db.get('SELECT COUNT(*) as count FROM product_parameter_presets WHERE product_type = ?', ['multi_page']);
    console.log(`Добавлено пресетов для multi_page: ${count.count}`);
    
    console.log('\n Пресеты для multi_page успешно добавлены!');
  } catch (error) {
    console.error('Ошибка при добавлении пресетов:', error);
    throw error;
  }
}

// Запуск скрипта
addMultiPagePresets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

