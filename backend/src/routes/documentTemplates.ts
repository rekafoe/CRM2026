import { Router, Request, Response } from 'express';
import { DocumentTemplateService, TemplateData } from '../services/documentTemplateService';
import { PdfReportService } from '../services/pdfReportService';
import { OrderRepository } from '../repositories/orderRepository';
import { CustomerService } from '../modules/customers/services/customerService';
import { getDb } from '../config/database';
import { upload } from '../config/upload';
import path from 'path';
import fs from 'fs';
import { asyncHandler } from '../middleware';

const router = Router();

function formatDateForDocument(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

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
 * Генерация акта или счёта по списку заказов: данные и расчёт строк только на бэкенде.
 * POST /document-templates/generate/:type/from-orders
 * Body: { orderIds: number[] }
 */
router.post('/generate/:type/from-orders', asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.params;
  if (!['act', 'invoice'].includes(type)) {
    res.status(400).json({ message: 'Тип должен быть act или invoice' });
    return;
  }
  const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0) : [];
  if (orderIds.length === 0) {
    res.status(400).json({ message: 'Укажите orderIds (массив id заказов)' });
    return;
  }

  try {
    const template = await DocumentTemplateService.getDefaultTemplate(type as 'act' | 'invoice');
    if (!template) {
      res.status(404).json({ message: `Шаблон для типа "${type}" не найден. Загрузите шаблон в разделе "Шаблоны документов".` });
      return;
    }
    const resolvedPath = DocumentTemplateService.resolveTemplateFilePath(template);
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ message: `Файл шаблона "${template.name}" не найден.` });
      return;
    }

    const db = await getDb();
    const placeholders = orderIds.map(() => '?').join(',');
    const orderRows = await db.all<{ id: number; number: string; created_at: string; status: number; customer_id: number; discount_percent: number }>(
      `SELECT id, number, created_at, status, customer_id, COALESCE(discount_percent, 0) as discount_percent FROM orders WHERE id IN (${placeholders})`,
      ...orderIds
    );
    const orderMap = new Map(orderRows.map((r) => [r.id, r]));
    const orders = orderIds.map((id) => orderMap.get(id)).filter(Boolean) as typeof orderRows;
    if (orders.length === 0) {
      res.status(404).json({ message: 'Заказы не найдены' });
      return;
    }

    const itemsMap = await OrderRepository.getItemsByOrderIds(orders.map((o) => o.id));
    const flatItems: Array<{ orderId: number; price: number; quantity: number; params: any; name?: string; type?: string }> = [];
    for (const o of orders) {
      const list = itemsMap.get(o.id) ?? [];
      for (const it of list) {
        flatItems.push({
          orderId: it.orderId,
          price: it.price,
          quantity: it.quantity,
          params: it.params,
          name: (it as any).name,
          type: it.type,
        });
      }
    }

    const getDiscountPercent = (orderId: number) => orderMap.get(orderId)?.discount_percent ?? 0;
    const { orderItems, totalAmount, totalQuantity } = PdfReportService.buildDocumentRowsFromItems(flatItems, getDiscountPercent);

    const orderAmounts = new Map<number, number>();
    for (const o of orders) {
      const list = itemsMap.get(o.id) ?? [];
      const discountPct = getDiscountPercent(o.id) / 100;
      let sum = 0;
      for (const it of list) {
        const qty = Math.max(1, Number(it.quantity) || 1);
        sum += Math.round((Number(it.price) || 0) * qty * (1 - discountPct) * 100) / 100;
      }
      orderAmounts.set(o.id, sum);
    }

    const customerId = orders[0].customer_id;
    const customer = await CustomerService.getCustomerById(customerId);
    const customerName = customer
      ? (customer.company_name || customer.legal_name || CustomerService.getCustomerDisplayName(customer))
      : '—';
    const templateData: TemplateData = {
      customerName,
      companyName: customer?.company_name ?? '',
      legalName: customer?.legal_name ?? '',
      legalAddress: customer?.address ?? '—',
      taxId: customer?.tax_id ?? '—',
      bankDetails: customer?.bank_details ?? '—',
      authorizedPerson: customer?.authorized_person ?? '—',
      orders: orders.map((o) => ({
        number: o.number || `#${o.id}`,
        date: formatDateForDocument(o.created_at),
        amount: orderAmounts.get(o.id) ?? 0,
        status: String(o.status ?? '—'),
      })),
      orderItems,
      totalAmount,
      totalQuantity,
    };

    const buffer = await DocumentTemplateService.generateDocumentWithMapping(template.id, templateData);
    const ext = path.extname(template.file_path);
    const contentType = ext === '.docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const filename = DocumentTemplateService.generateDocumentFilename(template, templateData);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error(`[DocumentTemplate] generate from-orders (${type}):`, error);
    res.status(500).json({ message: error?.message || 'Ошибка генерации документа' });
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
