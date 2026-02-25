import { Router } from 'express';
import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';
import { getTableColumns } from '../../../utils/tableSchemaCache';
import {
  normalizeConfigDataForPersistence,
  normalizeSimplifiedTypeIds,
  compactSimplifiedForSite,
  parseParameterOptions,
  loadPrintTechnologies,
  DEFAULT_COLOR_MODE_OPTIONS,
} from './helpers';

const router = Router();

/**
 * @swagger
 * /api/products/{productId}/schema:
 *   get:
 *     summary: Схема продукта (калькулятор + каталог для сайта)
 *     tags: [Products, Website Catalog]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: compact
 *         required: false
 *         schema:
 *           type: boolean
 *         description: Компактная схема без тяжёлых блоков (для каталога)
 */
router.get('/:productId/schema', async (req, res) => {
  try {
    const { productId } = req.params;
    const compactMode = String(req.query.compact || '').toLowerCase();
    const isCompact = compactMode === '1' || compactMode === 'true' || compactMode === 'yes';

    logger.info('[GET /products/:id/schema] Эндпоинт вызван', { productId });
    const db = await getDb();

    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let productPrintSettings: any = null;
    try {
      const raw = (product as any)?.print_settings;
      if (raw) productPrintSettings = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { productPrintSettings = null; }

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
        if (templateConfig.constraints) {
          templateConstraints = typeof templateConfig.constraints === 'string'
            ? JSON.parse(templateConfig.constraints)
            : templateConfig.constraints;

          const rawAllowedPaperTypes = templateConstraints?.overrides?.allowed_paper_types;
          if (Array.isArray(rawAllowedPaperTypes) && rawAllowedPaperTypes.length === 0) {
            allowedPaperTypes = null;
          } else if (rawAllowedPaperTypes) {
            allowedPaperTypes = rawAllowedPaperTypes;
          }
        }

        if (templateConfig.config_data) {
          templateConfigData = typeof templateConfig.config_data === 'string'
            ? JSON.parse(templateConfig.config_data)
            : templateConfig.config_data;
          templateConfigData = normalizeConfigDataForPersistence(templateConfigData);
        }
      }
    } catch (error) {
      logger.warn('Failed to load template config', error);
    }

    let productMaterialsQuery = `
      SELECT 
        m.id, m.name, m.sheet_price_single as price, m.unit, m.paper_type_id, m.density,
        pt.name as paper_type_name, pm.is_required
      FROM product_materials pm
      JOIN materials m ON m.id = pm.material_id
      LEFT JOIN paper_types pt ON pt.id = m.paper_type_id
      WHERE pm.product_id = ?
    `;
    const queryParams: any[] = [productId];

    if (allowedPaperTypes && allowedPaperTypes.length > 0) {
      const paperTypeIdsResult = await db.all(`
        SELECT id FROM paper_types WHERE name IN (${allowedPaperTypes.map(() => '?').join(',')})
      `, allowedPaperTypes) as any[];

      const paperTypeIds = Array.isArray(paperTypeIdsResult) ? paperTypeIdsResult : [];

      if (paperTypeIds.length > 0) {
        const ids = paperTypeIds.map((pt: { id: number }) => pt.id);
        productMaterialsQuery += ` AND m.paper_type_id IN (${ids.map(() => '?').join(',')})`;
        queryParams.push(...ids);
      } else {
        productMaterialsQuery += ` AND 1=0`;
      }
    }
    productMaterialsQuery += ` ORDER BY m.name`;

    const productMaterials = await db.all(productMaterialsQuery, queryParams);

    const parameters = await db.all(`
      SELECT * FROM product_parameters WHERE product_id = ? ORDER BY sort_order
    `, [productId]);

    const printTechEnum = await loadPrintTechnologies(db);

    const fields = parameters.map((p: any) => {
      let parsedOptions = parseParameterOptions(p.options);
      if (p.type === 'select' && p.name === 'print_technology') {
        parsedOptions = printTechEnum || parsedOptions || [];
      }
      if (p.type === 'select' && p.name === 'print_color_mode') {
        parsedOptions = parsedOptions || DEFAULT_COLOR_MODE_OPTIONS;
      }

      const field: any = {
        name: p.name,
        label: p.label || p.name,
        type: p.type === 'select' ? 'string' : p.type === 'checkbox' ? 'boolean' : p.type,
        required: !!p.is_required,
      };
      if (p.type === 'select' && parsedOptions) field.enum = parsedOptions;
      if (p.type === 'number') {
        if (p.min_value !== null) field.min = p.min_value;
        if (p.max_value !== null) field.max = p.max_value;
      }
      return field;
    });

    if (productMaterials.length > 0) {
      const hasMaterialParam = fields.some((f: any) => f.name === 'material_id');
      if (!hasMaterialParam) {
        fields.unshift({
          name: 'material_id',
          label: 'Материал',
          type: 'string',
          required: productMaterials.some((m: any) => m.is_required),
          enum: productMaterials.map((m: any) => ({
            value: m.id,
            label: `${m.name} (${m.price} ${m.unit})`,
            price: m.price,
          })),
        });
      }
    }

    if (templateConfigData?.trim_size?.width && templateConfigData?.trim_size?.height) {
      const formatValue = `${templateConfigData.trim_size.width}×${templateConfigData.trim_size.height}`;
      const formatField = fields.find((f: any) => f.name === 'format');
      if (formatField) {
        if (Array.isArray(formatField.enum)) {
          if (!formatField.enum.includes(formatValue)) formatField.enum.unshift(formatValue);
        } else {
          formatField.enum = [formatValue];
        }
      } else {
        fields.unshift({ name: 'format', label: 'Формат', type: 'string', required: true, enum: [formatValue] });
      }
    }

    const simplifiedCutting = templateConfigData?.simplified?.cutting;
    if (simplifiedCutting === true) {
      if (!fields.some((f: any) => f.name === 'cutting')) {
        fields.push({ name: 'cutting', label: 'Резка', type: 'boolean', required: false });
      }
    }

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
        const pagesField = fields.find((f: any) => f.name === 'pages');
        if (pagesField) {
          pagesField.type = pagesField.type || 'number';
          pagesField.enum = orderedOptions;
        } else {
          fields.push({ name: 'pages', label: 'Страницы', type: 'number', required: true, enum: orderedOptions });
        }
      }
    }

    let productOperations: any[] = [];
    try {
      const cols = await getTableColumns('product_operations_link');
      const hasIsOptional = cols.has('is_optional');
      const hasLinkedParam = cols.has('linked_parameter_name');

      const selectFields = [
        'pol.id as link_id', 'pol.sequence', 'pol.sort_order',
        'pol.is_required', 'pol.is_default',
        hasIsOptional ? 'pol.is_optional' : '0 as is_optional',
        hasLinkedParam ? 'pol.linked_parameter_name' : 'NULL as linked_parameter_name',
        'pol.price_multiplier', 'pol.conditions', 'pol.default_params',
        'pps.id as operation_id', 'pps.name as operation_name', 'pps.description as operation_description',
        'pps.price', 'pps.unit', 'pps.operation_type', 'pps.price_unit',
        'pps.setup_cost', 'pps.min_quantity', 'pps.max_quantity', 'pps.parameters',
      ];

      productOperations = await db.all(`
        SELECT ${selectFields.join(', ')}
        FROM product_operations_link pol
        JOIN post_processing_services pps ON pol.operation_id = pps.id
        WHERE pol.product_id = ? AND pps.is_active = 1
        ORDER BY pol.sequence, pol.sort_order
      `, [productId]);

      productOperations = productOperations.map((op: any) => {
        const parsed: any = { ...op };
        try { if (op.parameters) parsed.parameters = typeof op.parameters === 'string' ? JSON.parse(op.parameters) : op.parameters; } catch { parsed.parameters = null; }
        try { if (op.conditions) parsed.conditions = typeof op.conditions === 'string' ? JSON.parse(op.conditions) : op.conditions; } catch { parsed.conditions = null; }
        try { if (op.default_params) parsed.default_params = typeof op.default_params === 'string' ? JSON.parse(op.default_params) : op.default_params; } catch { parsed.default_params = null; }
        return parsed;
      });
    } catch (error) {
      logger.warn('Failed to load product operations', { productId, error });
    }

    const normalizedSimplified = normalizeSimplifiedTypeIds(templateConfigData?.simplified);

    const schema = {
      id: Number(productId),
      key: product.name.toLowerCase().replace(/\s+/g, '_'),
      name: product.name,
      type: product.name,
      description: product.description || '',
      fields,
      materials: productMaterials,
      operations: productOperations || [],
      template: {
        trim_size: templateConfigData?.trim_size || null,
        print_sheet: templateConstraints?.print_sheet || null,
        print_run: templateConfigData?.print_run || null,
        finishing: templateConfigData?.finishing || null,
        packaging: templateConfigData?.packaging || null,
        price_rules: templateConfigData?.price_rules || null,
        simplified: normalizedSimplified,
      },
      constraints: {
        allowed_paper_types: allowedPaperTypes || null,
        print_sheet: templateConstraints?.print_sheet || null,
        allowed_print_technologies: Array.isArray(productPrintSettings?.allowedTechnologies) ? productPrintSettings.allowedTechnologies : null,
        allowed_color_modes: Array.isArray(productPrintSettings?.allowedColorModes) ? productPrintSettings.allowedColorModes : null,
        allowed_sides: Array.isArray(productPrintSettings?.allowedSides) ? productPrintSettings.allowedSides : null,
      },
    };

    if (isCompact) {
      const compactSchema = {
        id: schema.id, key: schema.key, name: schema.name, type: schema.type, description: schema.description,
        template: {
          trim_size: schema.template.trim_size,
          print_sheet: schema.template.print_sheet,
          print_run: schema.template.print_run,
          simplified: compactSimplifiedForSite(schema.template.simplified),
        },
        constraints: schema.constraints,
      };
      return res.json({ data: compactSchema, meta: { compact: true } });
    }

    res.json({ data: schema });
  } catch (error) {
    logger.error('Error fetching product schema', error);
    res.status(500).json({ error: 'Failed to fetch product schema' });
  }
});

export default router;
