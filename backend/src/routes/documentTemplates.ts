import { Router, Request, Response } from 'express';
import { DocumentTemplateService, TemplateData } from '../services/documentTemplateService';
import { upload } from '../config/upload';
import path from 'path';
import fs from 'fs';
import { asyncHandler } from '../middleware';

const router = Router();

/**
 * Получить все шаблоны
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const templates = await DocumentTemplateService.getAllTemplates();
  res.json(templates);
}));

/**
 * Получить шаблоны по типу
 */
router.get('/type/:type', asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.params;
  if (!['contract', 'act', 'invoice'].includes(type)) {
    res.status(400).json({ message: 'Неверный тип шаблона' });
    return;
  }
  const templates = await DocumentTemplateService.getTemplatesByType(type as any);
  res.json(templates);
}));

/**
 * Получить шаблон по ID
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID шаблона' });
    return;
  }
  const template = await DocumentTemplateService.getTemplate(id);
  res.json(template);
}));

/**
 * Загрузить новый шаблон
 */
router.post('/', upload.single('template'), asyncHandler(async (req: Request, res: Response) => {
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ message: 'Файл шаблона не загружен' });
    return;
  }
  
  const { name, type, isDefault } = req.body;
  
  if (!name || !type) {
    // Удаляем загруженный файл, если данные неверны
    fs.unlinkSync(file.path);
    res.status(400).json({ message: 'Не указаны имя и тип шаблона' });
    return;
  }
  
  if (!['contract', 'act', 'invoice'].includes(type)) {
    fs.unlinkSync(file.path);
    res.status(400).json({ message: 'Неверный тип шаблона' });
    return;
  }
  
  // Проверяем расширение файла
  const ext = path.extname(file.originalname).toLowerCase();
  if (type === 'contract' && ext !== '.docx') {
    fs.unlinkSync(file.path);
    res.status(400).json({ message: 'Шаблон договора должен быть в формате .docx' });
    return;
  }
  if ((type === 'act' || type === 'invoice') && !['.xlsx', '.xls'].includes(ext)) {
    fs.unlinkSync(file.path);
    res.status(400).json({ message: 'Шаблон акта/счета должен быть в формате .xlsx или .xls' });
    return;
  }
  
  // Директория шаблонов: DOCUMENT_TEMPLATES_DIR на проде (volume), иначе рядом с приложением (теряется при редеплое)
  const templatesDir = process.env.DOCUMENT_TEMPLATES_DIR
    ? path.resolve(process.env.DOCUMENT_TEMPLATES_DIR)
    : path.resolve(__dirname, '../templates');
  if (!process.env.DOCUMENT_TEMPLATES_DIR) {
    console.warn('[DocumentTemplate] DOCUMENT_TEMPLATES_DIR не задан — шаблон сохраняется во временную папку и будет потерян при следующем редеплое. Настройте volume и переменную окружения на Railway.');
  }
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  
  const finalPath = path.join(templatesDir, `${type}-${Date.now()}${ext}`);
  // Копируем и удаляем исходник: rename() даёт EXDEV при переносе между разными FS (uploads → volume /data)
  fs.copyFileSync(file.path, finalPath);
  try {
    fs.unlinkSync(file.path);
  } catch (unlinkErr: any) {
    console.warn('[DocumentTemplate] Не удалось удалить временный файл после копирования:', unlinkErr?.message);
  }
  console.log(`[DocumentTemplate] Файл шаблона сохранён: ${file.path} -> ${finalPath}`);
  console.log(`[DocumentTemplate] Абсолютный путь к шаблону: ${path.resolve(finalPath)}`);
  
  const template = await DocumentTemplateService.saveTemplate(
    name,
    type as any,
    finalPath,
    isDefault === 'true' || isDefault === true
  );
  
  console.log(`[DocumentTemplate] Шаблон успешно загружен: ID=${template.id}, имя="${template.name}", тип="${template.type}"`);
  
  res.status(201).json(template);
}));

/**
 * Установить шаблон как шаблон по умолчанию
 */
router.patch('/:id/set-default', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID шаблона' });
    return;
  }
  await DocumentTemplateService.setDefaultTemplate(id);
  const template = await DocumentTemplateService.getTemplate(id);
  res.json(template);
}));

/**
 * Скачать шаблон
 */
router.get('/:id/download', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID шаблона' });
    return;
  }
  
  const template = await DocumentTemplateService.getTemplate(id);
  
  // Проверяем, что файл существует
  const filePath = path.resolve(template.file_path);
  if (!fs.existsSync(filePath)) {
    console.error(`[DocumentTemplate] Файл шаблона не найден: ${filePath}`);
    res.status(404).json({ message: `Файл шаблона "${template.name}" не найден` });
    return;
  }
  
  try {
    // Читаем файл в буфер
    const fileBuffer = fs.readFileSync(filePath);
    
    const ext = path.extname(template.file_path);
    const contentType = ext === '.docx' 
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : ext === '.xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.ms-excel';
    
    // Генерируем имя файла для скачивания
    const downloadFilename = `${template.name}${ext}`;
    
    console.log(`[DocumentTemplate] Скачивание шаблона ID ${id}: ${filePath}, размер: ${fileBuffer.length} байт`);
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
    res.send(fileBuffer);
  } catch (error: any) {
    console.error(`[DocumentTemplate] Ошибка чтения файла шаблона: ${filePath}`, error);
    res.status(500).json({ message: `Ошибка чтения файла: ${error.message}` });
  }
}));

/**
 * Удалить шаблон
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID шаблона' });
    return;
  }
  await DocumentTemplateService.deleteTemplate(id);
  res.status(204).send();
}));

/**
 * Генерация документа из шаблона
 */
router.post('/:id/generate', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID шаблона' });
    return;
  }
  
  const data: TemplateData = req.body;
  const template = await DocumentTemplateService.getTemplate(id);
  const buffer = await DocumentTemplateService.generateDocumentWithMapping(id, data);
  
  const ext = path.extname(template.file_path);
  const contentType = ext === '.docx' 
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  
  // Генерируем осмысленное имя файла
  const filename = DocumentTemplateService.generateDocumentFilename(template, data);
  
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
}));

/**
 * Генерация документа по типу (использует шаблон по умолчанию или первый доступный)
 */
router.post('/generate/:type', asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.params;
  if (!['contract', 'act', 'invoice'].includes(type)) {
    res.status(400).json({ message: 'Неверный тип шаблона' });
    return;
  }
  
  try {
    const template = await DocumentTemplateService.getDefaultTemplate(type as any);
    if (!template) {
      res.status(404).json({ message: `Шаблон для типа "${type}" не найден. Загрузите шаблон в разделе "Шаблоны документов"` });
      return;
    }
    
    // Путь с учётом DOCUMENT_TEMPLATES_DIR (на проде — volume с шаблонами)
    const resolvedPath = DocumentTemplateService.resolveTemplateFilePath(template);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`[DocumentTemplate] Файл шаблона не найден: ${resolvedPath} (в БД: ${template.file_path})`);
      res.status(404).json({ message: `Файл шаблона "${template.name}" не найден. На проде задайте DOCUMENT_TEMPLATES_DIR и положите туда файл ${path.basename(template.file_path)} или загрузите шаблон заново.` });
      return;
    }
    
    console.log(`[DocumentTemplate] Генерация документа типа "${type}" с шаблоном ID ${template.id}: ${template.name}, путь: ${resolvedPath}`);
    
    const data: TemplateData = req.body;
    
    console.log(`[DocumentTemplate] Получены данные из запроса:`, {
      orderItemsCount: data.orderItems?.length || 0,
      totalAmount: data.totalAmount,
      totalQuantity: data.totalQuantity,
      customerName: data.customerName,
      orderItemsType: typeof data.orderItems,
      orderItemsIsArray: Array.isArray(data.orderItems),
      firstOrderItem: data.orderItems?.[0]
    });
    
    const buffer = await DocumentTemplateService.generateDocumentWithMapping(template.id, data);
    
    const ext = path.extname(template.file_path);
    const contentType = ext === '.docx' 
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    
    // Генерируем осмысленное имя файла
    const filename = DocumentTemplateService.generateDocumentFilename(template, data);
    
    console.log(`[DocumentTemplate] Документ успешно сгенерирован: ${filename}`);
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error(`[DocumentTemplate] Ошибка генерации документа типа "${type}":`, error);
    res.status(500).json({ 
      message: `Ошибка генерации документа: ${error.message || 'Неизвестная ошибка'}` 
    });
    return;
  }
}));

/**
 * Анализ шаблона - извлечение плейсхолдеров
 */
router.get('/:id/analyze', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID шаблона' });
    return;
  }
  
  try {
    const analysis = await DocumentTemplateService.analyzeTemplate(id);
    res.json(analysis);
  } catch (error: any) {
    console.error('Ошибка анализа шаблона:', error);
    res.status(500).json({ 
      message: 'Ошибка анализа шаблона', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

/**
 * Получить маппинг полей для шаблона
 */
router.get('/:id/mapping', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID шаблона' });
    return;
  }
  
  const mapping = await DocumentTemplateService.getFieldMapping(id);
  res.json(mapping);
}));

/**
 * Сохранить маппинг полей для шаблона
 */
router.post('/:id/mapping', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID шаблона' });
    return;
  }
  
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    res.status(400).json({ message: 'mappings должен быть массивом' });
    return;
  }
  
  await DocumentTemplateService.saveFieldMapping(id, mappings);
  const savedMapping = await DocumentTemplateService.getFieldMapping(id);
  res.json(savedMapping);
}));

export default router;
