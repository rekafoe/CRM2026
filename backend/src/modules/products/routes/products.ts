import { Router } from 'express';
import { rateLimiter } from '../../../middleware/rateLimiter';
import { getDb } from '../../../db';
import { Product, ProductCategory, ProductConfiguration, CalculatedPrice } from '../../../types/products';
import { OperationsController } from '../controllers/operationsController';
import { asyncHandler } from '../../../middleware';
import { ProductServiceLinkService } from '../services/serviceLinkService';
import { ProductServiceLinkDTO } from '../dtos/serviceLink.dto';
import { ParameterPresetService } from '../services/parameterPresetService';
import { logger } from '../../../utils/logger';
import { getTableColumns, hasColumn } from '../../../utils/tableSchemaCache';
import { getCachedData, invalidateCache, invalidateCacheByPattern } from '../../../utils/dataCache';
import productSetupRouter from './productSetup';

type TemplateConfigRow = {
  id: number;
  product_id: number;
  name: string;
  config_data?: string | null;
  constraints?: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

const router = Router();

const toServiceLinkResponse = (link: ProductServiceLinkDTO) => ({
  link_id: link.id,
  id: link.id,
  product_id: link.productId,
  productId: link.productId,
  service_id: link.serviceId,
  serviceId: link.serviceId,
  is_required: link.isRequired,
  isRequired: link.isRequired,
  default_quantity: link.defaultQuantity,
  defaultQuantity: link.defaultQuantity,
  service_name: link.service?.name ?? null,
  serviceName: link.service?.name ?? null,
  service_type: link.service?.type ?? null,
  serviceType: link.service?.type ?? null,
  unit: link.service?.unit ?? null,
  price_per_unit: link.service?.rate ?? null,
  rate: link.service?.rate ?? null,
  is_active: link.service?.isActive ?? true,
  isActive: link.service?.isActive ?? true,
});

const mapTemplateConfig = (row: TemplateConfigRow) => ({
  id: row.id,
  product_id: row.product_id,
  name: row.name,
  config_data: row.config_data ? JSON.parse(row.config_data) : null,
  constraints: row.constraints ? JSON.parse(row.constraints) : null,
  is_active: !!row.is_active,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

async function ensureProductTemplateConfigsTable() {
  const db = await getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_template_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      config_data TEXT,
      constraints TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);
  return db;
}

async function attachOperationsFromNorms(
  db: any,
  productId: number,
  productTypeKey?: string | null
): Promise<number> {
  if (!productTypeKey) return 0;

  const normsTable = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'operation_norms'`
  );
  if (!normsTable) {
    return 0;
  }

  const norms = await db.all(
    `SELECT op.operation, op.service_id, op.formula
     FROM operation_norms op
     JOIN post_processing_services pps ON pps.id = op.service_id
     WHERE op.product_type = ? AND op.is_active = 1 AND pps.is_active = 1
     ORDER BY op.id`,
    [productTypeKey]
  );

  if (!norms?.length) {
    return 0;
  }

  const currentSequence = await db.get(
    `SELECT COALESCE(MAX(sequence), 0) as maxSequence
     FROM product_operations_link
     WHERE product_id = ?`,
    [productId]
  );

  let sequence = (currentSequence?.maxSequence ?? 0) + 1;
  let inserted = 0;

  for (const norm of norms) {
    if (!norm?.service_id) continue;

    await db.run(
      `INSERT OR IGNORE INTO product_operations_link (
         product_id,
         operation_id,
         sequence,
         sort_order,
         is_required,
         is_default,
         price_multiplier,
         default_params,
         conditions
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        norm.service_id,
        sequence,
        sequence,
        1,
        1,
        1,
        null,
        null,
      ]
    );

    sequence += 1;
    inserted += 1;
  }

  return inserted;
}

// Rate limits for public endpoints
const calculateRateLimit = rateLimiter.middleware({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many price calculations, please slow down'
});
const validateRateLimit = rateLimiter.middleware({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many size validations, please slow down'
});

// Тестовый endpoint для проверки данных
router.get('/debug', async (req, res) => {
  try {
    const db = await getDb();
    
    // Проверяем таблицы
    const tables = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name LIKE '%product%'
    `);
    
    // Проверяем категории
    const categories = await db.all(`SELECT * FROM product_categories`);
    
    // Проверяем продукты
    const products = await db.all(`SELECT * FROM products`);
    
    res.json({
      tables: tables.map(t => t.name),
      categories: categories,
      products: products,
      categoriesCount: categories.length,
      productsCount: products.length
    });
  } catch (error) {
    logger.error('Debug error', { error });
    res.status(500).json({ error: (error as any).message });
  }
});

router.get('/parameter-presets', asyncHandler(async (req, res) => {
  const { productType, productName } = req.query;

  if (!productType || typeof productType !== 'string') {
    res.status(400).json({ error: 'productType query parameter is required' });
    return;
  }

  const presets = await ParameterPresetService.getPresets(
    productType,
    typeof productName === 'string' ? productName : undefined
  );

  res.json(presets);
}));

/**
 * @swagger
 * /api/products/categories:
 *   get:
 *     summary: Список категорий продуктов
 *     description: |
 *       Возвращает категории продуктов. Для каталога на сайте (printcore.by) используйте activeOnly=true.
 *       Категории — верхний уровень каталога (Визитки, Брошюры, Подарочные сертификаты и т.д.).
 *     tags: [Products, Website Catalog]
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Только активные категории (для сайта — true)
 *     responses:
 *       200:
 *         description: Массив категорий продуктов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer, example: 1 }
 *                   name: { type: string, example: "Визитки" }
 *                   sort_order: { type: integer }
 *                   is_active: { type: integer }
 *                   icon: { type: string, nullable: true }
 */
// Получить все категории продуктов (для админки - показываем все)
router.get('/categories', async (req, res) => {
  try {
    logger.debug('Fetching product categories');
    const db = await getDb();
    const { activeOnly } = req.query;
    const cacheKey = `product_categories_${activeOnly === 'true' ? 'active' : 'all'}`;
    
    const categories = await getCachedData(
      cacheKey,
      async () => {
        const whereClause = activeOnly === 'true' ? 'WHERE is_active = 1' : 'WHERE 1=1';
        return await db.all(`
          SELECT * FROM product_categories 
          ${whereClause}
          ORDER BY sort_order, name
        `);
      },
      10 * 60 * 1000 // 10 минут для категорий
    );
    
    logger.debug('Found categories', { count: categories.length });
    res.json(categories);
  } catch (error) {
    logger.error('Error fetching product categories', { error });
    res.status(500).json({ error: 'Failed to fetch product categories' });
  }
});

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Список продуктов
 *     description: |
 *       Возвращает все продукты (или только активные при activeOnly=true).
 *       Для каталога на сайте printcore.by — используйте activeOnly=true.
 *       Продукты — абстрактные категории (Визитки, Брошюры, Подарочные сертификаты).
 *       Подтипы с описаниями — в GET /api/products/{id}/schema.
 *     tags: [Products, Website Catalog]
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Только активные продукты (для сайта — true)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Поиск по названию и описанию
 *     responses:
 *       200:
 *         description: Массив продуктов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer, example: 58 }
 *                   name: { type: string, example: "Визитки" }
 *                   category_id: { type: integer }
 *                   category_name: { type: string }
 *                   description: { type: string, nullable: true }
 *                   icon: { type: string, nullable: true }
 *                   is_active: { type: integer }
 */
// Получить все продукты (для админки - показываем все, для калькулятора - фильтруем)
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { activeOnly, search } = req.query;
    const searchValue = typeof search === 'string' ? search.trim() : '';
    
    // Для админки показываем все продукты, для калькулятора - только активные
    const conditions: string[] = [];
    const params: any[] = [];
    if (activeOnly === 'true') {
      conditions.push('p.is_active = 1');
      // При поиске не блокируем продукты из неактивных категорий
      if (!searchValue) {
        conditions.push('pc.is_active = 1');
      }
    }
    if (searchValue) {
      // Поиск по названию, описанию и категории. SQLite LOWER() не всегда работает с кириллицей на Windows,
      // поэтому используем несколько вариантов регистра: "чер" и "Чер".
      const lowerSearch = searchValue.toLowerCase();
      const cappedSearch = lowerSearch.charAt(0).toUpperCase() + lowerSearch.slice(1);
      const patternLower = `%${lowerSearch}%`;
      const patternCapped = `%${cappedSearch}%`;
      conditions.push(`(
        p.name LIKE ? OR p.name LIKE ? OR
        COALESCE(p.description, '') LIKE ? OR COALESCE(p.description, '') LIKE ? OR
        COALESCE(pc.name, '') LIKE ? OR COALESCE(pc.name, '') LIKE ?
      )`);
      params.push(patternLower, patternCapped, patternLower, patternCapped, patternLower, patternCapped);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : 'WHERE 1=1';
    
    const products = await db.all(`
      SELECT p.*, pc.name as category_name, pc.icon as category_icon
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      ${whereClause}
      ORDER BY pc.sort_order, p.name
    `, params);
    res.json(products);
  } catch (error) {
    logger.error('Error fetching products', { error });
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * @swagger
 * /api/products/category/{categoryId}:
 *   get:
 *     summary: Продукты по категории
 *     description: |
 *       Возвращает продукты выбранной категории.
 *       Для сайта — после выбора категории из GET /api/products/categories.
 *     tags: [Products, Website Catalog]
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Только активные продукты (для сайта — true)
 *     responses:
 *       200:
 *         description: Массив продуктов категории
 *       500:
 *         description: Ошибка сервера
 */
// Получить продукты по категории
router.get('/category/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { activeOnly } = req.query;
    const db = await getDb();
    
    // Для админки показываем все продукты, для калькулятора - только активные
    const whereClause = activeOnly === 'true'
      ? 'AND p.is_active = 1 AND pc.is_active = 1'
      : '';
    
    const products = await db.all(`
      SELECT p.*, pc.name as category_name, pc.icon as category_icon
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.category_id = ? ${whereClause}
      ORDER BY p.name
    `, [categoryId]);
    res.json(products);
  } catch (error) {
    logger.error('Error fetching products by category', error);
    res.status(500).json({ error: 'Failed to fetch products by category' });
  }
});

/**
 * @swagger
 * /api/products/{productId}/schema:
 *   get:
 *     summary: Схема продукта (калькулятор + каталог для сайта)
 *     description: |
 *       Возвращает полную схему продукта — поля калькулятора, ограничения, цены.
 *       Для каталога на сайте (printcore.by) — в data.template.simplified содержатся:
 *       - types — подтипы продукта (ProductTypeSubtype) с briefDescription, fullDescription, characteristics, advantages
 *       - typeConfigs — размеры, цены, материалы по каждому подтипу
 *     tags: [Products, Website Catalog]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *           example: 58
 *     responses:
 *       200:
 *         description: Схема продукта с подтипами и контентом для сайта
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     template:
 *                       type: object
 *                       properties:
 *                         simplified:
 *                           type: object
 *                           properties:
 *                             types:
 *                               type: array
 *                               description: Подтипы продукта (карточки на сайте)
 *                               items:
 *                                 $ref: '#/components/schemas/ProductTypeSubtype'
 *                             typeConfigs:
 *                               type: object
 *                               additionalProperties: true
 *                               description: Конфиг по typeId — размеры, цены, материалы
 *       404:
 *         description: Продукт не найден
 */
// Получить детальную информацию о продукте с параметрами
// Новый эндпоинт для получения schema продукта (для калькулятора)
router.get('/:productId/schema', async (req, res) => {
  try {
    const { productId } = req.params;
    // 🆕 Явное логирование для диагностики
    console.log('🚀 [GET /products/:id/schema] Эндпоинт вызван', { productId, url: req.url, path: req.path });
    logger.info('[GET /products/:id/schema] 🚀 Эндпоинт вызван', { productId, url: req.url, path: req.path });
    const db = await getDb();
    
    // Получаем продукт
    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // 🖨️ Настройки печати продукта (products.print_settings)
    // Хранятся как JSON:
    // { allowedTechnologies: string[], allowedColorModes: ('bw'|'color')[], allowedSides: (1|2)[] }
    let productPrintSettings: any = null;
    try {
      const raw = (product as any)?.print_settings;
      if (raw) {
        productPrintSettings = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch {
      productPrintSettings = null;
    }
    
    // Получаем template config (constraints и config_data) для полной информации о шаблоне
    let allowedPaperTypes: string[] | null = null;
    let templateConfigData: any = null;
    let templateConstraints: any = null;
    
    try {
      const templateConfig = await db.get(`
        SELECT constraints, config_data FROM product_template_configs 
        WHERE product_id = ? AND name = 'template' AND is_active = 1
        ORDER BY id DESC LIMIT 1
      `, [productId]);
      
      if (templateConfig) {
        // Парсим constraints
        if (templateConfig.constraints) {
          templateConstraints = typeof templateConfig.constraints === 'string' 
            ? JSON.parse(templateConfig.constraints)
            : templateConfig.constraints;
          
          const rawAllowedPaperTypes = templateConstraints?.overrides?.allowed_paper_types;
          // Если это пустой массив или null/undefined - возвращаем null (показываем все типы)
          if (Array.isArray(rawAllowedPaperTypes) && rawAllowedPaperTypes.length === 0) {
            allowedPaperTypes = null;
          } else if (rawAllowedPaperTypes) {
            allowedPaperTypes = rawAllowedPaperTypes;
          } else {
            allowedPaperTypes = null;
          }
        }
        
        // Парсим config_data
        if (templateConfig.config_data) {
          templateConfigData = typeof templateConfig.config_data === 'string'
            ? JSON.parse(templateConfig.config_data)
            : templateConfig.config_data;
        }
        
        logger.debug('[GET /products/:id/schema] Template config загружен', {
          hasConstraints: !!templateConstraints,
          hasConfigData: !!templateConfigData,
          allowedPaperTypes,
          trimSize: templateConfigData?.trim_size,
          printRun: templateConfigData?.print_run,
          priceRules: templateConfigData?.price_rules?.length || 0
        });
      } else {
        logger.debug('[GET /products/:id/schema] Template config не найден');
      }
    } catch (error) {
      logger.warn('Failed to load template config', error);
    }
    
    // 📦 Получаем материалы продукта из product_materials
    // Фильтруем по разрешенным типам бумаги, если они заданы
    let productMaterialsQuery = `
      SELECT 
        m.id,
        m.name,
        m.sheet_price_single as price,
        m.unit,
        m.paper_type_id,
        m.density,
        pt.name as paper_type_name,
        pm.is_required
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      LEFT JOIN paper_types pt ON pt.id = m.paper_type_id
      WHERE pm.product_id = ?
    `;
    
    const queryParams: any[] = [productId];
    
    // Если есть ограничения по типам бумаги - фильтруем материалы
    if (allowedPaperTypes && allowedPaperTypes.length > 0) {
      logger.debug('Фильтруем материалы по разрешенным типам бумаги', { allowedPaperTypes });
      
      // Получаем ID типов бумаги по их именам
      const paperTypeIdsResult = await db.all<{ id: number }>(`
        SELECT id FROM paper_types WHERE name IN (${allowedPaperTypes.map(() => '?').join(',')})
      `, allowedPaperTypes);
      
      const paperTypeIds = Array.isArray(paperTypeIdsResult) ? paperTypeIdsResult : [];
      logger.debug('Найдено ID типов бумаги', { paperTypeIds });
      
      if (paperTypeIds.length > 0) {
        const ids = paperTypeIds.map((pt: { id: number }) => pt.id);
        // Показываем ТОЛЬКО материалы, которые связаны с разрешенными типами бумаги
        productMaterialsQuery += ` AND m.paper_type_id IN (${ids.map(() => '?').join(',')})`;
        queryParams.push(...ids);
        logger.debug('Фильтруем материалы по paper_type_id', { ids });
      } else {
        // Если типы бумаги не найдены - не показываем материалы
        productMaterialsQuery += ` AND 1=0`; // Всегда false - не показываем материалы
        logger.warn('Типы бумаги не найдены, материалы не будут показаны');
      }
    } else {
      logger.debug('Ограничений по типам бумаги нет, показываем все материалы');
    }
    
    productMaterialsQuery += ` ORDER BY m.name`;
    
    const productMaterials = await db.all(productMaterialsQuery, queryParams);
    
    // Получаем параметры продукта
    const parameters = await db.all(`
      SELECT * FROM product_parameters
      WHERE product_id = ?
      ORDER BY sort_order
    `, [productId]);

    // Динамические справочники для параметров печати
    let printTechEnum: Array<{ value: string; label: string }> | null = null;
    try {
      const hasPrintTechTable = await db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='print_technologies'"
      );
      if (hasPrintTechTable) {
        const techRows = await db.all<any>(
          `SELECT code, name FROM print_technologies WHERE is_active = 1 ORDER BY name`
        );
        printTechEnum = (techRows || []).map((t: any) => ({ value: String(t.code), label: String(t.name) }));
      }
    } catch {
      printTechEnum = null;
    }
    
    // Преобразуем параметры в schema fields
    const fields = parameters.map((p: any) => {
      let parsedOptions = null;
      if (p.options) {
        try {
          parsedOptions = JSON.parse(p.options);
        } catch {
          if (typeof p.options === 'string') {
            parsedOptions = p.options.split(';').map((opt: string) => opt.trim()).filter(Boolean);
          }
        }
      }

      // 🆕 Параметры печати: options подтягиваем динамически из справочников
      if (p.type === 'select' && p.name === 'print_technology') {
        parsedOptions = printTechEnum || parsedOptions || [];
      }
      if (p.type === 'select' && p.name === 'print_color_mode') {
        parsedOptions = parsedOptions || [
          { value: 'bw', label: 'Ч/Б' },
          { value: 'color', label: 'Цвет' },
        ];
      }
      
      const field: any = {
        name: p.name,
        label: p.label || p.name,
        type: p.type === 'select' ? 'string' : p.type === 'checkbox' ? 'boolean' : p.type,
        required: !!p.is_required
      };
      
      if (p.type === 'select' && parsedOptions) {
        field.enum = parsedOptions;
      }
      
      if (p.type === 'number') {
        if (p.min_value !== null) field.min = p.min_value;
        if (p.max_value !== null) field.max = p.max_value;
      }
      
      return field;
    });
    
    // 🎯 Автоматически добавляем поле material_id, если есть материалы
    if (productMaterials.length > 0) {
      const materialField = {
        name: 'material_id',
        label: 'Материал',
        type: 'string',
        required: productMaterials.some(m => m.is_required),
        enum: productMaterials.map(m => ({
          value: m.id,
          label: `${m.name} (${m.price} ${m.unit})`,
          price: m.price
        }))
      };
      
      // Добавляем в начало, если еще нет параметра material_id
      const hasMaterialParam = fields.some(f => f.name === 'material_id');
      if (!hasMaterialParam) {
        fields.unshift(materialField);
      }
    }
    
    // 📐 Добавляем/обновляем поле format из trim_size, если оно есть в шаблоне
    if (templateConfigData?.trim_size?.width && templateConfigData?.trim_size?.height) {
      const formatValue = `${templateConfigData.trim_size.width}×${templateConfigData.trim_size.height}`;
      const formatField = fields.find(f => f.name === 'format');
      
      if (formatField) {
        // Обновляем существующее поле format
        if (Array.isArray(formatField.enum)) {
          // Добавляем формат из шаблона, если его еще нет
          if (!formatField.enum.includes(formatValue)) {
            formatField.enum.unshift(formatValue); // Добавляем в начало как приоритетный
          }
        } else {
          // Если enum нет, создаем его
          formatField.enum = [formatValue];
        }
      } else {
        // Если поля format нет - создаем его с форматом из шаблона
        fields.unshift({
          name: 'format',
          label: 'Формат',
          type: 'string',
          required: true,
          enum: [formatValue]
        });
      }
    }

    // 📄 Добавляем поле pages из simplified-конфига, если задано
    const simplifiedPages = templateConfigData?.simplified?.pages;
    if (Array.isArray(simplifiedPages?.options) && simplifiedPages.options.length > 0) {
      const rawOptions = simplifiedPages.options
        .map((value: any) => Number(value))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      const uniqueOptions = (Array.from(new Set(rawOptions)) as number[]).sort((a: number, b: number) => a - b);
      if (uniqueOptions.length > 0) {
        const defaultPage = Number(simplifiedPages.default);
        const orderedOptions =
          Number.isFinite(defaultPage) && uniqueOptions.includes(defaultPage)
            ? [defaultPage, ...uniqueOptions.filter((opt) => opt !== defaultPage)]
            : uniqueOptions;
        const pagesField = fields.find((f) => f.name === 'pages');
        if (pagesField) {
          pagesField.type = pagesField.type || 'number';
          pagesField.enum = orderedOptions;
        } else {
          fields.push({
            name: 'pages',
            label: 'Страницы',
            type: 'number',
            required: true,
            enum: orderedOptions,
          });
        }
      }
    }
    
    // 🔧 Получаем операции продукта из product_operations_link
    let productOperations: any[] = [];
    try {
      const cols = await getTableColumns('product_operations_link');
      const hasIsOptional = cols.has('is_optional');
      const hasLinkedParam = cols.has('linked_parameter_name');

      const selectFields = [
        'pol.id as link_id',
        'pol.sequence',
        'pol.sort_order',
        'pol.is_required',
        'pol.is_default',
        hasIsOptional ? 'pol.is_optional' : '0 as is_optional',
        hasLinkedParam ? 'pol.linked_parameter_name' : 'NULL as linked_parameter_name',
        'pol.price_multiplier',
        'pol.conditions',
        'pol.default_params',
        'pps.id as operation_id',
        'pps.name as operation_name',
        'pps.description as operation_description',
        'pps.price',
        'pps.unit',
        'pps.operation_type',
        'pps.price_unit',
        'pps.setup_cost',
        'pps.min_quantity',
        'pps.max_quantity',
        'pps.parameters'
      ];
      
      // 🆕 Проверяем, есть ли записи в product_operations_link для этого продукта
      const allLinks = await db.all(`
        SELECT pol.id, pol.product_id, pol.operation_id, pps.name as operation_name, pps.is_active as service_is_active
        FROM product_operations_link pol
        LEFT JOIN post_processing_services pps ON pol.operation_id = pps.id
        WHERE pol.product_id = ?
      `, [productId]);
      
      // 🆕 Явное логирование для диагностики
      console.log('🔍 [GET /products/:id/schema] Все связи операций для продукта', {
        productId,
        totalLinks: allLinks.length,
        links: allLinks
      });
      
      logger.info('[GET /products/:id/schema] Все связи операций для продукта', {
        productId,
        totalLinks: allLinks.length,
        links: allLinks.map((link: any) => ({
          linkId: link.id,
          operationId: link.operation_id,
          operationName: link.operation_name,
          serviceIsActive: link.service_is_active
        }))
      });
      
      productOperations = await db.all(`
        SELECT ${selectFields.join(', ')}
        FROM product_operations_link pol
        JOIN post_processing_services pps ON pol.operation_id = pps.id
        WHERE pol.product_id = ? AND pps.is_active = 1
        ORDER BY pol.sequence, pol.sort_order
      `, [productId]);
      
      // 🆕 Явное логирование для диагностики
      console.log('🔍 [GET /products/:id/schema] Операции после фильтрации is_active', {
        productId,
        operationsCount: productOperations.length,
        operations: productOperations
      });
      
      logger.info('[GET /products/:id/schema] Операции после фильтрации is_active', {
        productId,
        operationsCount: productOperations.length,
        operations: productOperations.map((op: any) => ({
          operationId: op.operation_id,
          operationName: op.operation_name,
          isRequired: op.is_required,
          isOptional: op.is_optional
        }))
      });
      
      // Парсим JSON поля
      productOperations = productOperations.map(op => {
        const parsed: any = { ...op };
        if (op.parameters) {
          try {
            parsed.parameters = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters;
          } catch {
            parsed.parameters = null;
          }
        }
        if (op.conditions) {
          try {
            parsed.conditions = typeof op.conditions === 'string' ? JSON.parse(op.conditions) : op.conditions;
          } catch {
            parsed.conditions = null;
          }
        }
        if (op.default_params) {
          try {
            parsed.default_params = typeof op.default_params === 'string' ? JSON.parse(op.default_params) : op.default_params;
          } catch {
            parsed.default_params = null;
          }
        }
        return parsed;
      });
      
      logger.debug('[GET /products/:id/schema] Загружено операций', { count: productOperations.length });
    } catch (error) {
      logger.warn('Failed to load product operations', { productId, error });
    }
    
    // Собираем полную schema с данными из шаблона
    const schema = {
      id: Number(productId),
      key: product.name.toLowerCase().replace(/\s+/g, '_'),
      name: product.name,
      type: product.name,
      description: product.description || '',
      fields,
      materials: productMaterials, // 📦 Список материалов
      operations: productOperations || [], // 🔧 Список операций (гарантируем массив)
      template: {
        // 📐 Данные из шаблона продукта
        trim_size: templateConfigData?.trim_size || null, // Формат (ширина × высота)
        print_sheet: templateConstraints?.print_sheet || null, // Печатный лист (preset или размеры)
        print_run: templateConfigData?.print_run || null, // Ограничения тиража (enabled, min, max)
        finishing: templateConfigData?.finishing || null, // Отделка
        packaging: templateConfigData?.packaging || null, // Упаковка
        price_rules: templateConfigData?.price_rules || null, // Правила ценообразования
        simplified: templateConfigData?.simplified || null, // 🆕 Упрощённый калькулятор (конфиг по размерам)
      },
      constraints: {
        allowed_paper_types: allowedPaperTypes || null, // Разрешенные типы бумаги
        print_sheet: templateConstraints?.print_sheet || null, // Печатный лист из constraints
        // 🖨️ Ограничения печати из products.print_settings (используются в ImprovedPrinting для фильтрации)
        allowed_print_technologies: Array.isArray(productPrintSettings?.allowedTechnologies)
          ? productPrintSettings.allowedTechnologies
          : null,
        allowed_color_modes: Array.isArray(productPrintSettings?.allowedColorModes)
          ? productPrintSettings.allowedColorModes
          : null,
        allowed_sides: Array.isArray(productPrintSettings?.allowedSides)
          ? productPrintSettings.allowedSides
          : null,
      }
    };
    
    logger.debug('[GET /products/:id/schema] Возвращаем schema', {
      productId,
      fieldsCount: fields.length,
      materialsCount: productMaterials.length,
      operationsCount: productOperations.length,
      hasTemplate: !!templateConfigData,
      templateFields: templateConfigData ? Object.keys(templateConfigData) : [],
      constraints: {
        allowed_paper_types: allowedPaperTypes,
        print_sheet: templateConstraints?.print_sheet
      }
    });
    
    // 🆕 Явное логирование перед отправкой ответа
    console.log('🔍 [GET /products/:id/schema] Отправляем ответ клиенту', {
      productId,
      schemaOperationsCount: schema.operations?.length || 0,
      schemaOperations: schema.operations,
      productOperationsCount: productOperations.length,
      productOperations: productOperations.map((op: any) => ({
        id: op.operation_id,
        name: op.operation_name,
        isRequired: op.is_required,
        isOptional: op.is_optional
      }))
    });
    
    logger.info('[GET /products/:id/schema] Отправляем ответ клиенту', {
      productId,
      schemaOperationsCount: schema.operations?.length || 0,
      productOperationsCount: productOperations.length
    });
    
    res.json({ data: schema });
  } catch (error) {
    logger.error('Error fetching product schema', error);
    res.status(500).json({ error: 'Failed to fetch product schema' });
  }
});

/**
 * @swagger
 * /api/products/{productId}:
 *   get:
 *     summary: Продукт по ID
 *     description: Возвращает продукт с параметрами, постобработкой и скидками. Полная информация для админки и внешних систем.
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Объект продукта (id, name, parameters, post_processing_services и т.д.)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Продукт не найден
 */
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const db = await getDb();
    
    // Получаем продукт (без фильтра по активности для админки)
    const product = await db.get(`
      SELECT p.*, pc.name as category_name, pc.icon as category_icon
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.id = ?
    `, [productId]);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Получаем параметры продукта
    const parameters = await db.all(`
      SELECT * FROM product_parameters
      WHERE product_id = ?
      ORDER BY sort_order
    `, [productId]);
    let postProcessingServices = (await ProductServiceLinkService.list(Number(productId))).map(toServiceLinkResponse);

    if (!postProcessingServices.length) {
      try {
        const legacyServices = await db.all(`
          SELECT pps.* FROM post_processing_services pps
          JOIN product_post_processing ppp ON pps.id = ppp.service_id
          WHERE ppp.product_id = ? AND pps.is_active = 1
          ORDER BY pps.name
        `, [productId]);
        postProcessingServices = legacyServices.map((svc: any) =>
          toServiceLinkResponse({
            id: svc.id,
            productId: Number(productId),
            serviceId: svc.id,
            isRequired: false,
            defaultQuantity: svc.min_quantity ?? null,
            service: {
              name: svc.name ?? '',
              type: svc.operation_type ?? 'generic',
              unit: svc.unit ?? svc.price_unit ?? '',
              rate: Number(svc.price ?? 0),
              isActive: svc.is_active !== undefined ? !!svc.is_active : true,
            },
          }),
        );
      } catch (legacyError: any) {
        if (legacyError?.code === 'SQLITE_ERROR') {
          postProcessingServices = [];
        } else {
          throw legacyError;
        }
      }
    }
 
    // Получаем тиражные скидки
    // Динамические options для параметров печати (для формы админки / деталей продукта)
    let printTechOptions: Array<{ value: string; label: string }> | null = null;
    try {
      const hasPrintTechTable = await db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='print_technologies'"
      );
      if (hasPrintTechTable) {
        const techRows = await db.all<any>(
          `SELECT code, name FROM print_technologies WHERE is_active = 1 ORDER BY name`
        );
        printTechOptions = (techRows || []).map((t: any) => ({ value: String(t.code), label: String(t.name) }));
      }
    } catch {
      printTechOptions = null;
    }

    const parsedParameters = parameters.map((p: any) => {
      let parsedOptions = null;
      if (p.options) {
        try {
          // Если уже JSON - парсим
          parsedOptions = JSON.parse(p.options);
        } catch (parseError) {
          // Если строка - разбиваем по ;
          if (typeof p.options === 'string') {
            parsedOptions = p.options.split(';').map((opt: string) => opt.trim()).filter(Boolean);
          } else {
            parsedOptions = p.options;
          }
        }
      }
      // 🆕 Динамические options для печати
      if (p.type === 'select' && p.name === 'print_technology') {
        parsedOptions = printTechOptions || parsedOptions || [];
      }
      if (p.type === 'select' && p.name === 'print_color_mode') {
        parsedOptions = parsedOptions || [
          { value: 'bw', label: 'Ч/Б' },
          { value: 'color', label: 'Цвет' },
        ];
      }
      return {
        ...p,
        options: parsedOptions
      };
    });

    const response = {
      ...product,
      parameters: parsedParameters,
      post_processing_services: postProcessingServices,
      quantity_discounts: []
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error fetching product details', { error, stack: (error as Error).stack });
    res.status(500).json({ error: 'Failed to fetch product details', details: (error as Error).message });
  }
});

router.get('/:productId/configs', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const db = await ensureProductTemplateConfigsTable();
  const rows = await db.all<TemplateConfigRow[]>(
    `SELECT * FROM product_template_configs WHERE product_id = ? ORDER BY id`,
    Number(productId)
  );
  res.json(rows.map(mapTemplateConfig));
}));

// 🆕 Функция для синхронизации операций из simplified.finishing в product_operations_link
async function syncSimplifiedOperations(db: any, productId: number, configData: any): Promise<void> {
  if (!configData?.simplified?.sizes || !Array.isArray(configData.simplified.sizes)) {
    return;
  }
  
  try {
    const simplified = configData.simplified;
    
    // Собираем все уникальные service_id из finishing всех размеров
    const serviceIds = new Set<number>();
    simplified.sizes.forEach((size: any) => {
      if (Array.isArray(size.finishing)) {
        size.finishing.forEach((finish: any) => {
          if (finish.service_id && Number.isFinite(Number(finish.service_id))) {
            serviceIds.add(Number(finish.service_id));
          }
        });
      }
    });
    
    const serviceIdList = Array.from(serviceIds);
    logger.info('[syncSimplifiedOperations] Синхронизация операций для упрощённого продукта', {
      productId,
      serviceIdsCount: serviceIds.size
    });
    
    // Получаем существующие операции продукта
    const existingLinks = await db.all(
      `SELECT id, operation_id FROM product_operations_link WHERE product_id = ?`,
      [productId]
    );
    const existingOperationIds = new Set(existingLinks.map((link: any) => Number(link.operation_id)));

    const cols = await getTableColumns('product_operations_link');
    const hasIsOptional = cols.has('is_optional');
    const hasLinkedParam = cols.has('linked_parameter_name');

    // Загружаем активные операции одним запросом
    const activeServices = serviceIdList.length > 0
      ? await db.all(
          `SELECT id, name FROM post_processing_services WHERE id IN (${serviceIdList.map(() => '?').join(', ')}) AND is_active = 1`,
          serviceIdList
        )
      : [];
    const activeServiceMap = new Map<number, { id: number; name: string }>(
      activeServices.map((svc: any) => [Number(svc.id), { id: Number(svc.id), name: svc.name }])
    );
    
    // Добавляем новые операции
    let sequence = 1;
    let insertedCount = 0;
    let skippedInactiveCount = 0;
    for (const serviceId of serviceIdList) {
      if (!existingOperationIds.has(serviceId)) {
        const service = activeServiceMap.get(serviceId);
        if (service) {
          const insertFields = ['product_id', 'operation_id', 'sequence', 'sort_order', 'is_required', 'is_default', 'price_multiplier'];
          const insertValues: any[] = [
            productId,
            serviceId,
            sequence++,
            sequence - 1,
            0, // is_required = false (операции из finishing не обязательны)
            0, // is_default = false
            1.0 // price_multiplier = 1.0
          ];
          
          if (hasIsOptional) {
            insertFields.push('is_optional');
            insertValues.push(1); // is_optional = true (операции из finishing опциональны)
          }
          
          if (hasLinkedParam) {
            insertFields.push('linked_parameter_name');
            insertValues.push(null);
          }
          
          await db.run(
            `INSERT INTO product_operations_link (${insertFields.join(', ')})
             VALUES (${insertFields.map(() => '?').join(', ')})`,
            insertValues
          );
          insertedCount += 1;
        } else {
          skippedInactiveCount += 1;
        }
      }
    }
    
    // Удаляем операции, которых больше нет в finishing
    const linksToDelete = existingLinks.filter((link: any) => !serviceIds.has(Number(link.operation_id)));
    if (linksToDelete.length > 0) {
      const deleteIds = linksToDelete.map((link: any) => link.id);
      const chunkSize = 200;
      for (let i = 0; i < deleteIds.length; i += chunkSize) {
        const chunk = deleteIds.slice(i, i + chunkSize);
        await db.run(
          `DELETE FROM product_operations_link WHERE product_id = ? AND id IN (${chunk.map(() => '?').join(', ')})`,
          [productId, ...chunk]
        );
      }
    }
    
    logger.info('[syncSimplifiedOperations] Синхронизация завершена', {
      productId,
      insertedCount,
      deletedCount: linksToDelete.length,
      skippedInactiveCount
    });
  } catch (error) {
    logger.warn('[syncSimplifiedOperations] Ошибка синхронизации операций', {
      productId,
      error: (error as Error).message
    });
    throw error; // Пробрасываем ошибку, чтобы вызывающий код мог её обработать
  }
}

router.post('/:productId/configs', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { name, config_data, constraints, is_active } = req.body || {};
  const db = await ensureProductTemplateConfigsTable();
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO product_template_configs (product_id, name, config_data, constraints, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    Number(productId),
    name || 'template',
    config_data ? JSON.stringify(config_data) : null,
    constraints ? JSON.stringify(constraints) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : 1,
    now,
    now
  );
  const created = await db.get<TemplateConfigRow>(
    `SELECT * FROM product_template_configs WHERE id = ?`,
    result.lastID
  );
  
  // 🆕 Синхронизация операций для упрощённых продуктов
  if (config_data?.simplified) {
    try {
      await syncSimplifiedOperations(db, Number(productId), config_data);
    } catch (error) {
      logger.warn('[POST /products/:id/configs] Ошибка синхронизации операций при создании конфига', {
        productId,
        error: (error as Error).message
      });
      // Не прерываем создание конфига, только логируем ошибку
    }
  }
  
  res.status(201).json(created ? mapTemplateConfig(created) : null);
}));

router.put('/:productId/configs/:configId', asyncHandler(async (req, res) => {
  const { productId, configId } = req.params;
  const { name, config_data, constraints, is_active } = req.body || {};
  const db = await ensureProductTemplateConfigsTable();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE product_template_configs
     SET name = COALESCE(?, name),
         config_data = COALESCE(?, config_data),
         constraints = COALESCE(?, constraints),
         is_active = COALESCE(?, is_active),
         updated_at = ?
     WHERE id = ? AND product_id = ?`,
    name ?? null,
    config_data !== undefined ? JSON.stringify(config_data) : null,
    constraints !== undefined ? JSON.stringify(constraints) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    now,
    Number(configId),
    Number(productId)
  );
  const updated = await db.get<TemplateConfigRow>(
    `SELECT * FROM product_template_configs WHERE id = ? AND product_id = ?`,
    Number(configId),
    Number(productId)
  );
  if (!updated) {
    res.status(404).json({ error: 'Config not found' });
    return;
  }
  
  // 🆕 Синхронизация операций для упрощённых продуктов
  if (config_data?.simplified) {
    try {
      const parsedConfigData = typeof config_data === 'string' ? JSON.parse(config_data) : config_data;
      await syncSimplifiedOperations(db, Number(productId), parsedConfigData);
    } catch (error) {
      logger.warn('[PUT /products/:id/configs/:configId] Ошибка синхронизации операций при обновлении конфига', {
        productId,
        error: (error as Error).message
      });
      // Не прерываем сохранение конфига, только логируем ошибку
    }
  }
  
  res.json(mapTemplateConfig(updated));
}));

router.delete('/:productId/configs/:configId', asyncHandler(async (req, res) => {
  const { productId, configId } = req.params;
  const db = await ensureProductTemplateConfigsTable();
  const result = await db.run(
    `DELETE FROM product_template_configs WHERE id = ? AND product_id = ?`,
    Number(configId),
    Number(productId)
  );
  if ((result?.changes || 0) === 0) {
    res.status(404).json({ error: 'Config not found' });
    return;
  }
  res.json({ success: true });
}));

// Рассчитать цену продукта (ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ)
router.post('/:productId/calculate', calculateRateLimit, async (req, res) => {
  try {
    const { productId } = req.params;
    const configuration: ProductConfiguration = req.body;
    
    logger.debug('Calculating price for product', { productId, configuration });
    
    // 🎯 ИСПОЛЬЗУЕМ ЕДИНЫЙ СЕРВИС ЦЕНООБРАЗОВАНИЯ
    const { UnifiedPricingService } = await import('../../pricing/services/unifiedPricingService');
    const result = await UnifiedPricingService.calculatePrice(
      parseInt(productId),
      configuration,
      configuration.quantity
    );
    
    logger.info('Price calculated', { finalPrice: result.finalPrice, method: result.calculationMethod });
    res.json(result);
  } catch (error) {
    logger.error('Error calculating product price', error);
    res.status(500).json({ error: 'Failed to calculate product price' });
  }
});

// Валидация размеров продукта
router.post('/:productId/validate-size', validateRateLimit, async (req, res) => {
  try {
    const { productId } = req.params;
    const { width, height } = req.body;
    
    logger.debug('Validating size for product', { productId, size: `${width}x${height}mm` });
    
    // Импортируем сервисы
    const { LayoutCalculationService } = await import('../../pricing/services/layoutCalculationService');
    
    const db = await getDb();
    
    // Получаем категорию продукта
    const product = await db.get(`
      SELECT p.*, pc.name as category_name
      FROM products p
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.id = ?
    `, [productId]);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const productSize = { width: Number(width), height: Number(height) };
    
    // Валидируем размер
    const validation = LayoutCalculationService.validateProductSize(
      (product as any).category_name, 
      productSize
    );
    
    if (!validation.isValid) {
      return res.json({
        isValid: false,
        message: validation.message,
        recommendedSize: validation.recommendedSize
      });
    }
    
    // Проверяем раскладку
    const layout = LayoutCalculationService.findOptimalSheetSize(productSize);
    
    res.json({
      isValid: true,
      layout: {
        fitsOnSheet: layout.fitsOnSheet,
        itemsPerSheet: layout.itemsPerSheet,
        wastePercentage: layout.wastePercentage,
        sheetSize: layout.recommendedSheetSize,
        layout: layout.layout
      }
    });
  } catch (error) {
    logger.error('Error validating product size', error);
    res.status(500).json({ error: 'Failed to validate product size' });
  }
});

// Админские функции для управления продуктами
router.post('/categories', async (req, res) => {
  try {
    const { name, icon, description, sort_order } = req.body;
    const db = await getDb();
    
    const result = await db.run(`
      INSERT INTO product_categories (name, icon, description, sort_order)
      VALUES (?, ?, ?, ?)
    `, [name, icon, description, sort_order || 0]);
    
    invalidateCacheByPattern('product_categories')
    res.json({ id: result.lastID, name, icon, description, sort_order });
  } catch (error) {
    logger.error('Error creating product category', error);
    res.status(500).json({ error: 'Failed to create product category' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, description, sort_order, is_active } = req.body;
    const db = await getDb();
    
    await db.run(`
      UPDATE product_categories 
      SET name = ?, icon = ?, description = ?, sort_order = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [name, icon, description, sort_order, is_active, id]);
    
    invalidateCacheByPattern('product_categories')
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating product category', error);
    res.status(500).json({ error: 'Failed to update product category' });
  }
});

router.post('/setup', asyncHandler(async (req, res) => {
  const db = await getDb();
  const {
    product: productPayload,
    operations = [],
    autoOperationType,
    materials = [],
    parameters = [],
    template = {}
  } = req.body || {};

  if (!productPayload || !productPayload.name) {
    res.status(400).json({ error: 'Product payload with name is required' });
    return;
  }

  await db.exec('BEGIN TRANSACTION');
  try {
    const productInsert = await db.run(
      `INSERT INTO products (category_id, name, description, icon, calculator_type, product_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        productPayload.category_id ?? null,
        productPayload.name,
        productPayload.description ?? null,
        productPayload.icon ?? null,
        productPayload.calculator_type ?? 'product',
        productPayload.product_type ?? null,
      ]
    );

    const productId = productInsert.lastID as number;

    const cols = await getTableColumns('product_operations_link');
    const hasIsOptional = cols.has('is_optional');
    const hasLinkedParam = cols.has('linked_parameter_name');

    let sequenceCounter = 1;
    for (const op of Array.isArray(operations) ? operations : []) {
      if (!op || !op.operation_id) continue;
      const sequence = op.sequence ?? sequenceCounter;
      
      const insertFields = ['product_id', 'operation_id', 'sequence', 'sort_order', 'is_required', 'is_default', 'price_multiplier', 'default_params', 'conditions'];
      const insertValues: any[] = [
        productId,
        op.operation_id,
        sequence,
        sequence,
        op.is_required === false ? 0 : 1,
        op.is_default === false ? 0 : 1,
        op.price_multiplier ?? 1,
        op.default_params ? JSON.stringify(op.default_params) : null,
        op.conditions ? JSON.stringify(op.conditions) : null
      ];

      if (hasIsOptional) {
        insertFields.push('is_optional');
        insertValues.push(0);
      }
      
      if (hasLinkedParam) {
        insertFields.push('linked_parameter_name');
        insertValues.push(null);
      }

      await db.run(
        `INSERT INTO product_operations_link (${insertFields.join(', ')})
         VALUES (${insertFields.map(() => '?').join(', ')})`,
        insertValues
      );
      sequenceCounter = Math.max(sequenceCounter, sequence + 1);
    }

    if (!operations.length && autoOperationType) {
      await attachOperationsFromNorms(db, productId, autoOperationType);
    }

    for (const [index, param] of (Array.isArray(parameters) ? parameters : []).entries()) {
      if (!param?.name || !param?.type) continue;
      const optionsValue = param.options === undefined || param.options === null
        ? null
        : typeof param.options === 'string'
          ? param.options
          : JSON.stringify(param.options);

      await db.run(
        `INSERT INTO product_parameters (
           product_id,
           name,
           type,
           label,
           options,
           min_value,
           max_value,
           step,
           default_value,
           is_required,
           sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          param.name,
          param.type,
          param.label ?? param.name,
          optionsValue,
          param.min_value ?? null,
          param.max_value ?? null,
          param.step ?? null,
          param.default_value ?? null,
          param.is_required ? 1 : 0,
          param.sort_order ?? index,
        ]
      );
    }

    const materialIncludeIds = Array.isArray(materials)
      ? materials
          .map((material: any) => material?.material_id || material?.id)
          .filter((id: any) => Number.isFinite(Number(id)))
          .map((id: any) => Number(id))
      : [];

    const configData = template.config_data ?? {
      trim_size: template.trim_size ?? {},
      finishing: template.finishing ?? [],
      packaging: template.packaging ?? [],
      print_run: {
        enabled: template.print_run?.enabled ?? false,
        min: template.print_run?.min ?? null,
        max: template.print_run?.max ?? null,
      },
      price_rules: template.price_rules ?? [],
    };

    const printSheet = template.print_sheet ?? {};
    const constraints = template.constraints ?? {
      print_sheet: printSheet.preset
        ? printSheet.preset
        : printSheet.width || printSheet.height
          ? {
              width: printSheet.width,
              height: printSheet.height,
            }
          : null,
      overrides: {
        include_ids: template.material_include_ids ?? template?.overrides?.includeIds ?? materialIncludeIds,
      },
    };

    const normalizedConstraints = {
      ...constraints,
      overrides: {
        include_ids: (constraints?.overrides?.include_ids ?? materialIncludeIds) || [],
      },
    };

    await db.run(
      `INSERT INTO product_template_configs (
         product_id,
         name,
         config_data,
         constraints,
         is_active
       ) VALUES (?, ?, ?, ?, 1)`,
      [
        productId,
        'template',
        JSON.stringify(configData),
        JSON.stringify(normalizedConstraints),
      ]
    );

    await db.exec('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        id: productId,
        name: productPayload.name,
      },
    });
  } catch (error: any) {
    await db.exec('ROLLBACK');
    logger.error('Error in product setup', error);
    res.status(500).json({ error: error?.message || 'Failed to create product setup' });
  }
}));

router.post('/', async (req, res) => {
  try {
    const { category_id, name, description, icon, calculator_type, product_type, operator_percent } = req.body;
    const resolvedCalculatorType = product_type === 'multi_page' ? 'simplified' : calculator_type;
    const db = await getDb();

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'Поле name обязательно' });
      return;
    }

    // category_id обязателен (NOT NULL + FK). Если категорий нет — создаём системную дефолтную.
    let resolvedCategoryId: number | null = typeof category_id === 'number' ? category_id : null;

    if (resolvedCategoryId !== null) {
      const exists = await db.get(`SELECT id FROM product_categories WHERE id = ?`, [resolvedCategoryId]);
      if (!exists) {
        res.status(400).json({ error: 'Категория не найдена' });
        return;
      }
    } else {
      const first = await db.get<{ id: number }>(`SELECT id FROM product_categories ORDER BY sort_order, id LIMIT 1`);
      if (first?.id) {
        resolvedCategoryId = first.id;
      } else {
        const insert = await db.run(
          `
          INSERT INTO product_categories (name, icon, description, sort_order, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 0, 1, datetime('now'), datetime('now'))
        `,
          ['Без категории', '📦', 'Системная категория по умолчанию']
        );
        resolvedCategoryId = insert.lastID ?? null;
        invalidateCacheByPattern('product_categories')
      }
    }

    if (resolvedCategoryId === null) {
      res.status(500).json({ error: 'Не удалось определить категорию продукта' });
      return;
    }

    const normalizedOperatorPercent = Number.isFinite(Number(operator_percent)) ? Number(operator_percent) : 0;
    const hasOperatorPercent = await hasColumn('products', 'operator_percent');
    const insertColumns = ['category_id', 'name', 'description', 'icon', 'calculator_type', 'product_type'];
    const insertValues: any[] = [
      resolvedCategoryId,
      name.trim(),
      description ?? null,
      icon ?? null,
      resolvedCalculatorType || 'product',
      product_type || 'sheet_single',
    ];

    if (hasOperatorPercent) {
      insertColumns.push('operator_percent');
      insertValues.push(normalizedOperatorPercent);
    }

    const placeholders = insertColumns.map(() => '?').join(', ');
    const result = await db.run(
      `INSERT INTO products (${insertColumns.join(', ')}) VALUES (${placeholders})`,
      insertValues
    );

    // Автоматически создаем операции только при явном запросе
    if (product_type && req.body?.auto_attach_operations) {
      const operationsAdded = await attachOperationsFromNorms(db, result.lastID!, product_type);
      logger.info('✅ Operations auto-attached to new product', { productId: result.lastID, operationsAdded });
    }

    res.json({
      id: result.lastID,
      category_id: resolvedCategoryId,
      name: name.trim(),
      description,
      icon,
      calculator_type: resolvedCalculatorType || 'product',
      product_type: product_type || 'sheet_single',
      operator_percent: normalizedOperatorPercent,
    });
  } catch (error: any) {
    logger.error('Error creating product', {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      stack: error?.stack,
      sql: error?.sql,
      params: error?.params,
    });
    res.status(500).json({ error: error?.message || 'Failed to create product' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (updates?.product_type === 'multi_page') {
      updates.calculator_type = 'simplified';
    }
    const db = await getDb();

    const hasOperatorPercent = await hasColumn('products', 'operator_percent');
    // Динамически формируем SET часть запроса только для переданных полей
    const allowedFields = [
      'category_id',
      'name',
      'description',
      'icon',
      'is_active',
      'product_type',
      'calculator_type',
      'setup_status',
      'print_settings',
      ...(hasOperatorPercent ? ['operator_percent'] : []),
    ];
    const setFields: string[] = [];
    const values: any[] = [];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setFields.push(`${field} = ?`);
        // Для print_settings сериализуем JSON
        if (field === 'print_settings' && typeof updates[field] === 'object') {
          values.push(JSON.stringify(updates[field]));
        } else {
          values.push(updates[field]);
        }
      }
    }
    
    if (setFields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    
    setFields.push(`updated_at = datetime('now')`);
    values.push(id);
    
    await db.run(`
      UPDATE products 
      SET ${setFields.join(', ')}
      WHERE id = ?
    `, values);
    
    logger.info('Product updated', { productId: id, fields: Object.keys(updates) });
    
    res.json({ success: true, updated: 1 });
  } catch (error) {
    logger.error('Error updating product', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Удаление продукта
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  
  try {
    // Проверяем существование продукта
    const product = await db.get('SELECT id, name FROM products WHERE id = ?', [id]);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    
    // Удаляем связанные данные
    await db.run('DELETE FROM product_materials WHERE product_id = ?', [id]);
    await db.run('DELETE FROM product_parameters WHERE product_id = ?', [id]);
    await db.run('DELETE FROM product_operations_link WHERE product_id = ?', [id]);
    await db.run('DELETE FROM product_template_configs WHERE product_id = ?', [id]);
    
    // Удаляем сам продукт
    await db.run('DELETE FROM products WHERE id = ?', [id]);
    
    logger.info('✅ Product deleted', { productId: id, productName: product.name });
    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error deleting product', { productId: id, error });
    res.status(500).json({ error: 'Failed to delete product' });
  }
}));

router.post('/:productId/parameters', async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order, linked_operation_id } = req.body;
    const db = await getDb();
    
    const result = await db.run(`
      INSERT INTO product_parameters (product_id, name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order, linked_operation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [productId, name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order || 0, linked_operation_id || null]);
    
    // Получаем созданный параметр
    const created = await db.get('SELECT * FROM product_parameters WHERE id = ?', [result.lastID]);
    
    // Парсим options
    let parsedOptions = null;
    if (created.options) {
      try {
        parsedOptions = JSON.parse(created.options);
      } catch {
        if (typeof created.options === 'string') {
          parsedOptions = created.options.split(';').map((opt: string) => opt.trim()).filter(Boolean);
        }
      }
    }
    
    res.json({ ...created, options: parsedOptions });
  } catch (error) {
    logger.error('Error creating product parameter', error);
    res.status(500).json({ error: 'Failed to create product parameter' });
  }
});

router.put('/:productId/parameters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order, linked_operation_id } = req.body;
    const db = await getDb();
    
    await db.run(`
      UPDATE product_parameters 
      SET name = ?, type = ?, label = ?, options = ?, min_value = ?, max_value = ?, step = ?, default_value = ?, is_required = ?, sort_order = ?, linked_operation_id = ?
      WHERE id = ?
    `, [name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order, linked_operation_id || null, id]);
    
    // Получаем обновленный параметр
    const updated = await db.get('SELECT * FROM product_parameters WHERE id = ?', [id]);
    
    // Парсим options
    let parsedOptions = null;
    if (updated.options) {
      try {
        parsedOptions = JSON.parse(updated.options);
      } catch {
        if (typeof updated.options === 'string') {
          parsedOptions = updated.options.split(';').map((opt: string) => opt.trim()).filter(Boolean);
        }
      }
    }
    
    res.json({ success: true, data: { ...updated, options: parsedOptions } });
  } catch (error) {
    logger.error('Error updating product parameter', error);
    res.status(500).json({ error: 'Failed to update product parameter' });
  }
});

router.delete('/:productId/parameters/:id', async (req, res) => {
  try {
    const { id, productId } = req.params;
    const db = await getDb();
    
    await db.run('DELETE FROM product_parameters WHERE id = ? AND product_id = ?', [id, productId]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting product parameter', error);
    res.status(500).json({ error: 'Failed to delete product parameter' });
  }
});

// Получить материалы продукта
router.get('/:productId/materials', async (req, res) => {
  try {
    const { productId } = req.params;
    const db = await getDb();
    
    // Получаем реальные материалы продукта из product_materials
    const materials = await db.all(`
      SELECT 
        pm.id,
        pm.product_id,
        pm.material_id,
        pm.qty_per_sheet,
        pm.is_required,
        m.name as material_name,
        mc.name as category_name,
        m.unit,
        m.sheet_price_single
      FROM product_materials pm
      JOIN materials m ON pm.material_id = m.id
      LEFT JOIN material_categories mc ON m.category_id = mc.id
      WHERE pm.product_id = ?
      ORDER BY pm.id
    `, [productId]);
    
    res.json(materials);
  } catch (error) {
    logger.error('Error fetching product materials', error);
    res.status(500).json({ error: 'Failed to fetch product materials' });
  }
});

// Добавить материал к продукту
router.post('/:productId/materials', async (req, res) => {
  try {
    const { productId } = req.params;
    const { material_id, qty_per_sheet, is_required } = req.body;
    
    if (!material_id) {
      res.status(400).json({ error: 'material_id is required' });
      return;
    }
    
    const db = await getDb();
    
    // Сохраняем материал в таблицу product_materials
    await db.run(
      `INSERT OR REPLACE INTO product_materials 
       (product_id, material_id, qty_per_sheet, is_required, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [productId, material_id, qty_per_sheet || 1.0, is_required ? 1 : 0]
    );
    
    logger.info('✅ Material added to product', { productId, material_id });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error adding material to product', error);
    res.status(500).json({ error: 'Failed to add material to product' });
  }
});

// Массовое добавление материалов к продукту
router.post('/:productId/materials/bulk', async (req, res) => {
  try {
    const { productId } = req.params;
    const { materials } = req.body; // Array<{ material_id: number; qty_per_sheet?: number; is_required?: boolean }>
    
    if (!Array.isArray(materials) || materials.length === 0) {
      res.status(400).json({ error: 'materials array is required and must not be empty' });
      return;
    }
    
    const db = await getDb();
    
    await db.run('BEGIN');
    
    try {
      const added: number[] = [];
      
      for (const material of materials) {
        if (!material.material_id) {
          continue; // Пропускаем некорректные записи
        }
        
        await db.run(
          `INSERT OR REPLACE INTO product_materials 
           (product_id, material_id, qty_per_sheet, is_required, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            productId,
            material.material_id,
            material.qty_per_sheet || 1.0,
            material.is_required !== undefined ? (material.is_required ? 1 : 0) : 1
          ]
        );
        
        added.push(material.material_id);
      }
      
      await db.run('COMMIT');
      
      logger.info('✅ Materials added to product (bulk)', { productId, count: added.length });
      
      res.json({ success: true, added: added.length, materials: added });
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error('Error bulk adding materials to product', error);
    res.status(500).json({ error: 'Failed to add materials to product' });
  }
});

// Удалить материал из продукта
router.delete('/:productId/materials/:materialId', async (req, res) => {
  try {
    const { productId, materialId } = req.params;
    const db = await getDb();
    
    // Удаляем материал из таблицы product_materials
    await db.run(
      `DELETE FROM product_materials WHERE product_id = ? AND material_id = ?`,
      [productId, materialId]
    );
    
    logger.info('✅ Material removed from product', { productId, materialId });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing material from product', error);
    res.status(500).json({ error: 'Failed to remove material from product' });
  }
});

// --- Управление услугами продукта ---
router.get('/:productId/services', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const links = await ProductServiceLinkService.list(Number(productId));
  res.json(links.map(toServiceLinkResponse));
}));

router.post('/:productId/services', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { service_id, serviceId, is_required, isRequired, default_quantity, defaultQuantity } = req.body || {};
  const targetServiceId = Number(service_id ?? serviceId);
  if (!targetServiceId) {
    res.status(400).json({ error: 'service_id is required' });
    return;
  }
  try {
    const { link, alreadyLinked } = await ProductServiceLinkService.create(Number(productId), {
      serviceId: targetServiceId,
      isRequired: is_required !== undefined ? !!is_required : isRequired,
      defaultQuantity: default_quantity ?? defaultQuantity,
    });

    if (alreadyLinked) {
      res.status(200).json({ alreadyLinked: true, data: toServiceLinkResponse(link) });
      return;
    }

    res.status(201).json(toServiceLinkResponse(link));
  } catch (error: any) {
    if (error?.code === 'SERVICE_NOT_FOUND') {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    throw error;
  }
}));

router.delete('/:productId/services/:serviceId', asyncHandler(async (req, res) => {
  const { productId, serviceId } = req.params;
  const removed = await ProductServiceLinkService.delete(Number(productId), Number(serviceId));
  res.json({ success: true, removed });
}));

// Операции продукта (связь продукт→операции)
router.get('/:productId/operations', asyncHandler((req, res) => OperationsController.getProductOperations(req, res)));
// Массовое добавление операций (должно быть ПЕРЕД параметризованным роутом)
router.post('/:productId/operations/bulk', asyncHandler((req, res) => OperationsController.bulkAddOperationsToProduct(req, res)));
router.post('/:productId/operations', asyncHandler((req, res) => OperationsController.addOperationToProduct(req, res)));
router.put('/:productId/operations/:linkId', asyncHandler((req, res) => OperationsController.updateProductOperation(req, res)));
router.delete('/:productId/operations/:linkId', asyncHandler((req, res) => OperationsController.removeOperationFromProduct(req, res)));

// Setup продукта (пошаговая настройка)
router.use(productSetupRouter);

export default router;
