import { Router } from 'express';
import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';

const router = Router();

router.get('/:productId/materials', async (req, res) => {
  try {
    const { productId } = req.params;
    const db = await getDb();

    const materials = await db.all(`
      SELECT 
        pm.id, pm.product_id, pm.material_id, pm.qty_per_sheet, pm.is_required,
        m.name as material_name, mc.name as category_name, m.unit, m.sheet_price_single
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

router.post('/:productId/materials', async (req, res) => {
  try {
    const { productId } = req.params;
    const { material_id, qty_per_sheet, is_required } = req.body;

    if (!material_id) {
      res.status(400).json({ error: 'material_id is required' });
      return;
    }

    const db = await getDb();

    await db.run(
      `INSERT OR REPLACE INTO product_materials 
       (product_id, material_id, qty_per_sheet, is_required, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [productId, material_id, qty_per_sheet || 1.0, is_required ? 1 : 0]
    );

    logger.info('Material added to product', { productId, material_id });
    res.json({ success: true });
  } catch (error) {
    logger.error('Error adding material to product', error);
    res.status(500).json({ error: 'Failed to add material to product' });
  }
});

router.post('/:productId/materials/bulk', async (req, res) => {
  try {
    const { productId } = req.params;
    const { materials } = req.body;

    if (!Array.isArray(materials) || materials.length === 0) {
      res.status(400).json({ error: 'materials array is required and must not be empty' });
      return;
    }

    const db = await getDb();
    await db.run('BEGIN');

    try {
      const added: number[] = [];
      for (const material of materials) {
        if (!material.material_id) continue;
        await db.run(
          `INSERT OR REPLACE INTO product_materials 
           (product_id, material_id, qty_per_sheet, is_required, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [productId, material.material_id, material.qty_per_sheet || 1.0, material.is_required !== undefined ? (material.is_required ? 1 : 0) : 1]
        );
        added.push(material.material_id);
      }
      await db.run('COMMIT');
      logger.info('Materials added to product (bulk)', { productId, count: added.length });
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

router.delete('/:productId/materials/:materialId', async (req, res) => {
  try {
    const { productId, materialId } = req.params;
    const db = await getDb();

    await db.run(`DELETE FROM product_materials WHERE product_id = ? AND material_id = ?`, [productId, materialId]);
    logger.info('Material removed from product', { productId, materialId });
    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing material from product', error);
    res.status(500).json({ error: 'Failed to remove material from product' });
  }
});

export default router;
