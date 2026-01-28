import { getDb } from '../src/config/database';
import * as fs from 'fs';
import * as path from 'path';

async function deleteOldActTemplates() {
  const db = await getDb();
  
  // Получаем все шаблоны типа "act"
  const templatesRaw = await db.all<{
    id: number;
    name: string;
    file_path: string;
    is_default: number;
    created_at: string;
  }>(
    'SELECT id, name, file_path, is_default, created_at FROM document_templates WHERE type = ? ORDER BY id DESC',
    'act'
  );
  
  const templates = Array.isArray(templatesRaw) ? templatesRaw : [];
  
  console.log(`Найдено шаблонов типа "act": ${templates.length}`);
  
  if (templates.length === 0) {
    console.log('Нет шаблонов для удаления');
    return;
  }
  
  // Показываем все шаблоны
  templates.forEach((t, index) => {
    console.log(`${index + 1}. ID ${t.id}, имя "${t.name}", is_default=${t.is_default}, создан ${t.created_at}, путь: ${t.file_path}`);
  });
  
  // Определяем, какие шаблоны удалять
  // Оставляем только шаблон по умолчанию или самый новый (если нет шаблона по умолчанию)
  const defaultTemplate = templates.find(t => t.is_default === 1);
  const templateToKeep = defaultTemplate || templates[0];
  
  console.log(`\nОставляем шаблон: ID ${templateToKeep.id}, имя "${templateToKeep.name}"`);
  
  // Удаляем все остальные
  let deletedCount = 0;
  for (const template of templates) {
    if (template.id === templateToKeep.id) {
      console.log(`Пропускаем шаблон ID ${template.id} (оставляем)`);
      continue;
    }
    
    console.log(`Удаляем шаблон ID ${template.id} "${template.name}"...`);
    
    // Удаляем файл
    if (fs.existsSync(template.file_path)) {
      try {
        fs.unlinkSync(template.file_path);
        console.log(`  ✓ Файл удален: ${template.file_path}`);
      } catch (error: any) {
        console.error(`  ✗ Ошибка удаления файла: ${error.message}`);
      }
    } else {
      console.log(`  ⚠ Файл не найден: ${template.file_path}`);
    }
    
    // Удаляем запись из БД
    try {
      await db.run('DELETE FROM document_templates WHERE id = ?', template.id);
      console.log(`  ✓ Запись удалена из БД`);
      deletedCount++;
    } catch (error: any) {
      console.error(`  ✗ Ошибка удаления из БД: ${error.message}`);
    }
  }
  
  console.log(`\nГотово! Удалено шаблонов: ${deletedCount}`);
  console.log(`Остался шаблон: ID ${templateToKeep.id}, имя "${templateToKeep.name}"`);
  
  // Также проверяем файлы в директории templates и удаляем те, которые не связаны с записями в БД
  const templatesDir = path.resolve(__dirname, '../src/templates');
  if (fs.existsSync(templatesDir)) {
    console.log('\nПроверяем файлы в директории templates...');
    const files = fs.readdirSync(templatesDir);
    const actFiles = files.filter(f => f.startsWith('act-') && f.endsWith('.xlsx'));
    
    console.log(`Найдено файлов шаблонов актов: ${actFiles.length}`);
    
    // Получаем все пути к шаблонам из БД
    const allTemplates = await db.all<{ file_path: string }>(
      'SELECT file_path FROM document_templates WHERE type = ?',
      'act'
    );
    const validPaths = new Set(
      (Array.isArray(allTemplates) ? allTemplates : []).map(t => path.basename(t.file_path))
    );
    
    let deletedFilesCount = 0;
    for (const file of actFiles) {
      if (!validPaths.has(file)) {
        const filePath = path.join(templatesDir, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`  ✓ Удален файл без записи в БД: ${file}`);
          deletedFilesCount++;
        } catch (error: any) {
          console.error(`  ✗ Ошибка удаления файла ${file}: ${error.message}`);
        }
      } else {
        console.log(`  ✓ Файл связан с записью в БД: ${file}`);
      }
    }
    
    if (deletedFilesCount > 0) {
      console.log(`\nУдалено файлов без записей в БД: ${deletedFilesCount}`);
    }
  }
}

// Запускаем скрипт
deleteOldActTemplates()
  .then(() => {
    console.log('Скрипт завершен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Ошибка выполнения скрипта:', error);
    process.exit(1);
  });
