/**
 * Скрипт для отладки продукта ID 60
 * Проверяет размеры, шаблон и расчет раскладки
 */

import { getDb } from '../src/config/database';
import { LayoutCalculationService } from '../src/modules/pricing/services/layoutCalculationService';

async function debugProduct60() {
  const db = await getDb();

  console.log('='.repeat(80));
  console.log('ОТЛАДКА ПРОДУКТА ID 60');
  console.log('='.repeat(80));
  console.log('');

  // 1. Информация о продукте
  console.log('1. ИНФОРМАЦИЯ О ПРОДУКТЕ:');
  console.log('-'.repeat(80));
  const product = await db.get(`
    SELECT p.*, pc.name as category_name 
    FROM products p 
    JOIN product_categories pc ON p.category_id = pc.id 
    WHERE p.id = 60
  `);
  console.log(JSON.stringify(product, null, 2));
  console.log('');

  // 2. Шаблон продукта
  console.log('2. ШАБЛОН ПРОДУКТА:');
  console.log('-'.repeat(80));
  const templateConfig = await db.get(`
    SELECT config_data FROM product_template_configs 
    WHERE product_id = 60 AND name = 'template' AND is_active = 1
    ORDER BY id DESC LIMIT 1
  `);
  
  if (templateConfig?.config_data) {
    const configData = typeof templateConfig.config_data === 'string' 
      ? JSON.parse(templateConfig.config_data)
      : templateConfig.config_data;
    
    console.log('Config data:', JSON.stringify(configData, null, 2));
    
    if (configData?.trim_size) {
      console.log(`\n trim_size найден: ${configData.trim_size.width}×${configData.trim_size.height}`);
    } else {
      console.log('\n trim_size НЕ найден в шаблоне!');
    }
  } else {
    console.log('Шаблон не найден!');
  }
  console.log('');

  // 3. Расчет раскладки для размера 50×90
  console.log('3. РАСЧЕТ РАСКЛАДКИ ДЛЯ 50×90:');
  console.log('-'.repeat(80));
  
  const productSize = { width: 50, height: 90 };
  console.log(`Размер продукта: ${productSize.width}×${productSize.height} мм\n`);
  
  const layout = LayoutCalculationService.findOptimalSheetSize(productSize);
  
  console.log('Результат раскладки:');
  console.log(`  Рекомендуемый лист: ${JSON.stringify(layout.recommendedSheetSize)}`);
  console.log(`  Помещается на лист: ${layout.fitsOnSheet}`);
  console.log(`  Шт на лист: ${layout.itemsPerSheet}`);
  console.log(`  Раскладка: ${layout.layout.cols}×${layout.layout.rows}`);
  console.log(`  Резов на лист: ${layout.cutsPerSheet}`);
  console.log(`  Отходы: ${layout.wastePercentage.toFixed(2)}%`);
  console.log('');

  // 4. Расчет для 100 шт
  console.log('4. РАСЧЕТ ДЛЯ 100 ШТ:');
  console.log('-'.repeat(80));
  const quantity = 100;
  const sheetsNeeded = Math.ceil(quantity / layout.itemsPerSheet);
  console.log(`Количество: ${quantity} шт`);
  console.log(`Шт на лист: ${layout.itemsPerSheet}`);
  console.log(`Листов нужно: ${sheetsNeeded}`);
  console.log('');

  // 5. Проверка для размера 90×50 (перевернутый)
  console.log('5. ПРОВЕРКА ДЛЯ 90×50 (перевернутый):');
  console.log('-'.repeat(80));
  const productSizeRotated = { width: 90, height: 50 };
  const layoutRotated = LayoutCalculationService.findOptimalSheetSize(productSizeRotated);
  console.log(`Размер продукта: ${productSizeRotated.width}×${productSizeRotated.height} мм`);
  console.log(`  Шт на лист: ${layoutRotated.itemsPerSheet}`);
  console.log(`  Раскладка: ${layoutRotated.layout.cols}×${layoutRotated.layout.rows}`);
  console.log('');

  // 6. Детальный расчет для SRA3
  console.log('6. ДЕТАЛЬНЫЙ РАСЧЕТ ДЛЯ SRA3 (320×450):');
  console.log('-'.repeat(80));
  const sra3Size = { width: 320, height: 450 };
  const layoutSRA3 = LayoutCalculationService.calculateLayout(productSize, sra3Size);
  console.log(`Лист: SRA3 (${sra3Size.width}×${sra3Size.height} мм)`);
  console.log(`Изделие: ${productSize.width}×${productSize.height} мм`);
  console.log(`  Шт на лист: ${layoutSRA3.itemsPerSheet}`);
  console.log(`  Раскладка: ${layoutSRA3.layout.cols}×${layoutSRA3.layout.rows}`);
  console.log(`  Доступная ширина: ${sra3Size.width - 5} мм (320 - 5 gripper)`);
  console.log(`  Доступная высота: ${sra3Size.height} мм`);
  console.log(`  Колонок: ${layoutSRA3.layout.cols} (${sra3Size.width - 5} / (${productSize.width} + 2 gap) = ${Math.floor((sra3Size.width - 5) / (productSize.width + 2))})`);
  console.log(`  Рядов: ${layoutSRA3.layout.rows} (${sra3Size.height} / (${productSize.height} + 2 gap) = ${Math.floor(sra3Size.height / (productSize.height + 2))})`);
  console.log('');

  process.exit(0);
}

debugProduct60().catch(console.error);

