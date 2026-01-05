/**
 * КОНТРОЛЛЕР ПРОДУКТОВ
 * 
 * Управление продуктами и категориями:
 * - CRUD операции для продуктов
 * - CRUD операции для категорий
 * - Загрузка конфигураций
 * - Поиск и фильтрация
 */

import { Request, Response } from 'express';
import { getDb } from '../config/database';
import { logger } from '../utils/logger';
import { ProductServiceLinkService } from '../modules/products/services/serviceLinkService';

// Получить все категории продуктов
export const getProductCategories = async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    
    const categories = await db.all(`
      SELECT 
        id,
        name,
        icon,
        description,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM product_categories 
      WHERE is_active = 1
      ORDER BY sort_order, name
    `);

    logger.info('Загружены категории продуктов', { count: categories.length });
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Ошибка загрузки категорий продуктов', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки категорий продуктов'
    });
  }
};

// Получить продукты по категории
export const getProductsByCategory = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const db = await getDb();
    
    const products = await db.all(`
      SELECT 
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.icon,
        p.is_active,
        p.created_at,
        p.updated_at,
        pc.name as category_name,
        pc.icon as category_icon
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.category_id = ? AND p.is_active = 1
      ORDER BY p.name
    `, [categoryId]);

    logger.info('Загружены продукты по категории', { categoryId, count: products.length });
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    logger.error('Ошибка загрузки продуктов по категории', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки продуктов по категории'
    });
  }
};

// Получить все продукты
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    
    const products = await db.all(`
      SELECT 
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.icon,
        p.is_active,
        p.created_at,
        p.updated_at,
        pc.name as category_name,
        pc.icon as category_icon
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.is_active = 1
      ORDER BY pc.sort_order, p.name
    `);

    logger.info('Загружены все продукты', { count: products.length });
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    logger.error('Ошибка загрузки всех продуктов', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки всех продуктов'
    });
  }
};

// Получить детальную информацию о продукте
export const getProductDetails = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const db = await getDb();
    
    // Получаем продукт
    const product = await db.get(`
      SELECT 
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.icon,
        p.is_active,
        p.created_at,
        p.updated_at,
        pc.name as category_name,
        pc.icon as category_icon
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.id = ? AND p.is_active = 1
    `, [productId]);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Продукт не найден'
      });
    }

    // Получаем параметры продукта
    const parameters = await db.all(`
      SELECT 
        id,
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
        sort_order,
        created_at
      FROM product_parameters
      WHERE product_id = ?
      ORDER BY sort_order
    `, [productId]);
    
    // Получаем послепечатные услуги (таблицы могут отсутствовать в текущей схеме)
    let postProcessingServices: any[] = [];
    try {
      const links = await ProductServiceLinkService.list(Number(productId));
      postProcessingServices = links.map(link => ({
        link_id: link.id,
        product_id: link.productId,
        service_id: link.serviceId,
        is_required: link.isRequired,
        default_quantity: link.defaultQuantity ?? undefined,
        service_name: link.service?.name ?? '',
        service_type: link.service?.type ?? 'generic',
        unit: link.service?.unit ?? '',
        price_per_unit: link.service?.rate ?? 0,
        is_active: link.service?.isActive ?? true,
      }));

      if (!postProcessingServices.length) {
        try {
          const legacyServices = await db.all(`
            SELECT 
              pps.id,
              pps.name,
              pps.description,
              pps.price,
              pps.unit,
              pps.is_active,
              pps.operation_type,
              pps.price_unit,
              pps.setup_cost,
              pps.min_quantity
            FROM post_processing_services pps
            JOIN product_post_processing ppp ON pps.id = ppp.service_id
            WHERE ppp.product_id = ? AND pps.is_active = 1
            ORDER BY pps.name
          `, [productId]);
          postProcessingServices = legacyServices.map((svc: any) => ({
            link_id: svc.id,
            product_id: productId,
            service_id: svc.id,
            is_required: false,
            default_quantity: svc.min_quantity ?? undefined,
            service_name: svc.name ?? '',
            service_type: svc.operation_type ?? 'generic',
            unit: svc.unit ?? svc.price_unit ?? '',
            price_per_unit: Number(svc.price ?? 0),
            is_active: svc.is_active !== undefined ? !!svc.is_active : true,
          }));
        } catch (legacyError: any) {
          if (legacyError?.code === 'SQLITE_ERROR') {
            logger.warn('Таблицы post_processing_services/product_post_processing отсутствуют, возвращаем пустой список');
            postProcessingServices = [];
          } else {
            throw legacyError;
          }
        }
      }
    } catch (e: any) {
      logger.warn('Не удалось загрузить product_service_links через сервис', e);
      postProcessingServices = [];
    }
    
    postProcessingServices = postProcessingServices.map((svc: any) => ({
      ...svc,
      link_id: svc.link_id ?? svc.id ?? null,
      service_id: svc.service_id ?? svc.id,
      service_name: svc.service_name ?? svc.name ?? '',
      service_type: svc.service_type ?? svc.operation_type ?? 'generic',
      unit: svc.unit ?? svc.price_unit ?? '',
      price_per_unit: Number(svc.price_per_unit ?? svc.price ?? 0),
      is_active: svc.is_active !== undefined ? !!svc.is_active : true,
      is_required: svc.is_required !== undefined ? !!svc.is_required : undefined,
      default_quantity: svc.default_quantity ?? svc.min_quantity ?? undefined
    }));

    // Получаем скидки по тиражам (таблица может отсутствовать)
    let quantityDiscounts: any[] = [];
    try {
      quantityDiscounts = await db.all(`
      SELECT 
        id,
        product_id,
        min_quantity,
        max_quantity,
        discount_percent,
        discount_name,
        is_active,
        created_at
      FROM quantity_discounts
      WHERE product_id = ?
      ORDER BY min_quantity
    `, [productId]);
    } catch (e: any) {
      if (e?.code === 'SQLITE_ERROR') {
        logger.warn('Таблица quantity_discounts отсутствует, возвращаем пустой список');
        quantityDiscounts = [];
      } else {
        throw e;
      }
    }
    
    const response = {
      ...product,
      parameters: parameters.map(p => {
        let parsedOptions: any = null;
        if (p.options) {
          try {
            parsedOptions = JSON.parse(p.options);
          } catch {
            parsedOptions = p.options; // отдаем как есть, чтобы не падать
          }
        }
        return { ...p, options: parsedOptions };
      }),
      post_processing_services: postProcessingServices,
      quantity_discounts: quantityDiscounts
    };
    
    logger.info('Загружены детали продукта', { productId, parametersCount: parameters.length });
    
    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Ошибка загрузки деталей продукта', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки деталей продукта'
    });
  }
};

// Получить конфигурации продукта
export const getProductConfigs = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const db = await getDb();
    
    const configs = await db.all(`
      SELECT 
        id,
        product_id,
        name,
        description,
        config_data,
        constraints,
        is_active,
        created_at,
        updated_at
      FROM product_configs
      WHERE product_id = ? AND is_active = 1
      ORDER BY name
    `, [productId]);
    
    const response = configs.map(config => ({
      ...config,
      config_data: config.config_data ? JSON.parse(config.config_data) : null,
      constraints: config.constraints ? JSON.parse(config.constraints) : null
    }));
    
    logger.info('Загружены конфигурации продукта', { productId, count: configs.length });
    
    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Ошибка загрузки конфигураций продукта', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки конфигураций продукта'
    });
  }
};

// Создать конфигурацию продукта
export const createProductConfig = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { name, description, config_data, constraints, is_active } = req.body || {};
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO product_configs (product_id, name, description, config_data, constraints, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [productId, name || 'template', description || null, JSON.stringify(config_data || {}), constraints ? JSON.stringify(constraints) : null, is_active ? 1 : 1]
    );
    res.json({ success: true, data: { id: result.lastID } });
  } catch (error) {
    logger.error('Ошибка создания конфигурации продукта', error);
    res.status(500).json({ success: false, error: 'Ошибка создания конфигурации продукта' });
  }
};

// Обновить конфигурацию продукта
export const updateProductConfig = async (req: Request, res: Response) => {
  try {
    const { productId, configId } = req.params as any;
    const { name, description, config_data, constraints, is_active } = req.body || {};
    const db = await getDb();
    const fields: string[] = [];
    const values: any[] = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (config_data !== undefined) { fields.push('config_data = ?'); values.push(JSON.stringify(config_data)); }
    if (constraints !== undefined) { fields.push('constraints = ?'); values.push(constraints ? JSON.stringify(constraints) : null); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    fields.push("updated_at = datetime('now')");
    values.push(productId, configId);
    const sql = `UPDATE product_configs SET ${fields.join(', ')} WHERE product_id = ? AND id = ?`;
    const result = await db.run(sql, values);
    res.json({ success: true, data: { updated: result.changes } });
  } catch (error) {
    logger.error('Ошибка обновления конфигурации продукта', error);
    res.status(500).json({ success: false, error: 'Ошибка обновления конфигурации продукта' });
  }
};

// Поиск продуктов
export const searchProducts = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    const db = await getDb();
    
    if (!q || typeof q !== 'string') {
      return res.json({
        success: true,
        data: []
      });
    }
    
    const searchQuery = `%${q.toLowerCase()}%`;
    
    const products = await db.all(`
      SELECT 
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.icon,
        p.is_active,
        p.created_at,
        p.updated_at,
        pc.name as category_name,
        pc.icon as category_icon
      FROM products p
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.is_active = 1 
        AND (LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ?)
      ORDER BY p.name
    `, [searchQuery, searchQuery]);

    logger.info('Выполнен поиск продуктов', { query: q, count: products.length });
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    logger.error('Ошибка поиска продуктов', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка поиска продуктов'
    });
  }
};

// Создать категорию продукта
export const createProductCategory = async (req: Request, res: Response) => {
  try {
    const { name, icon, description, sort_order } = req.body;
    const db = await getDb();
    
    const result = await db.run(`
      INSERT INTO product_categories (name, icon, description, sort_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `, [name, icon, description, sort_order || 0]);
    
    logger.info('Создана категория продукта', { id: result.lastID, name });
    
    res.json({
      success: true,
      data: { id: result.lastID, name }
    });
  } catch (error) {
    logger.error('Ошибка создания категории продукта', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка создания категории продукта'
    });
  }
};

// Создать продукт
export const createProduct = async (req: Request, res: Response) => {
  try {
    const { category_id, name, description, icon, calculator_type, product_type } = req.body;
    const db = await getDb();

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Поле name обязательно' });
    }

    // Подбираем дефолтную категорию (если они вообще есть в БД), иначе используем 0
    let resolvedCategoryId = category_id ?? null;
    if (resolvedCategoryId === null || resolvedCategoryId === undefined) {
      const row = await db.get(`SELECT id FROM product_categories ORDER BY sort_order, id LIMIT 1`);
      resolvedCategoryId = row?.id ?? 0; // cхема требует NOT NULL, подставим 0 если категорий нет
    }

    // Валидация calculator_type
    const validCalculatorTypes = ['product', 'operation'];
    const resolvedCalculatorType = calculator_type && validCalculatorTypes.includes(calculator_type) 
      ? calculator_type 
      : 'product';

    // Валидация product_type
    const validProductTypes = ['sheet_single', 'multi_page', 'universal', 'sheet_item', 'multi_page_item'];
    const resolvedProductType = product_type && validProductTypes.includes(product_type) 
      ? product_type 
      : null;

    const result = await db.run(`
      INSERT INTO products (category_id, name, description, icon, calculator_type, product_type, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `, [resolvedCategoryId, name, description ?? null, icon ?? null, resolvedCalculatorType, resolvedProductType]);

    logger.info('Создан продукт', { id: result.lastID, name, calculator_type: resolvedCalculatorType, product_type: resolvedProductType });

    res.json({
      success: true,
      data: {
        id: result.lastID,
        category_id: resolvedCategoryId,
        name,
        description,
        icon,
        calculator_type: resolvedCalculatorType,
        product_type: resolvedProductType,
      },
    });
  } catch (error) {
    logger.error('Ошибка создания продукта', error);
    res.status(500).json({ success: false, error: 'Ошибка создания продукта' });
  }
};