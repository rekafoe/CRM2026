import { Database } from 'sqlite';
import { getDb } from '../db';

/**
 * Удаляет захардкоженные пресеты параметра "material"
 * 
 * Причина: Нарушение правила "НЕ ИСПОЛЬЗОВАТЬ ХАРДКОД"
 * 
 * Решение: Материалы должны загружаться динамически из вкладки "Материалы" продукта.
 * Система автоматически создаст параметр material_id с актуальными данными из склада.
 */

export async function up(db?: Database): Promise<void> {
  const database = db || await getDb();

  console.log('Удаляем захардкоженные пресеты параметра "material"...');
  
  // Удаляем все пресеты с ключом "material"
  const result = await database.run(
    `DELETE FROM product_parameter_presets WHERE preset_key = 'material'`
  );

  console.log(`Удалено ${result.changes} захардкоженных пресетов "material"`);
  
  // Также удаляем устаревший параметр density, так как он теперь включен в material_id
  // (опционально - можно оставить для обратной совместимости)
  console.log('Параметр "density" оставлен для обратной совместимости');
  
  console.log('');
  console.log('Инструкция:');
  console.log('1. Перейдите на страницу шаблона продукта');
  console.log('2. Откройте вкладку "Материалы"');
  console.log('3. Добавьте материалы из склада с нужными типами бумаги');
  console.log('4. Система автоматически создаст параметр material_id в калькуляторе');
  console.log('');
}

export async function down(db?: Database): Promise<void> {
  const database = db || await getDb();
  
  console.log('Откат миграции: восстанавливаем хардкоженные пресеты...');
  
  // Восстанавливаем пресеты (для отката)
  await database.run(
    `INSERT OR IGNORE INTO product_parameter_presets (product_type, preset_key, label, field_type, options, is_required, sort_order)
     VALUES
      ('business_cards', 'material', 'Материал', 'select', '["Мелованная глянцевая","Мелованная матовая","Плотная дизайнерская","Льняная","Крафт"]', 1, 50),
      ('flyers', 'material', 'Материал', 'select', '["Бумага офисная","Бумага мелованная","Плотная дизайнерская"]', 1, 50),
      ('posters', 'material', 'Материал', 'select', '["Фотобумага","Бумага постерная","Баннер"]', 1, 30),
      ('multi_page', 'material', 'Материал', 'select', '["Бумага офисная","Бумага мелованная","Плотная дизайнерская","Картон"]', 1, 50)
    `
  );
  
  console.log('Хардкоженные пресеты восстановлены (не рекомендуется!)');
}

