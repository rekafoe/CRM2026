import { Router } from 'express';
import { getDb } from '../../../db';
import { logger } from '../../../utils/logger';
import { parseParameterOptions } from './helpers';

const router = Router();

router.post('/:productId/parameters', async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order, linked_operation_id } = req.body;
    const db = await getDb();

    const result = await db.run(`
      INSERT INTO product_parameters (product_id, name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order, linked_operation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [productId, name, type, label, options, min_value, max_value, step, default_value, is_required, sort_order || 0, linked_operation_id || null]);

    const created = await db.get('SELECT * FROM product_parameters WHERE id = ?', [result.lastID]);

    res.json({ ...created, options: parseParameterOptions(created.options) });
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

    const updated = await db.get('SELECT * FROM product_parameters WHERE id = ?', [id]);

    res.json({ success: true, data: { ...updated, options: parseParameterOptions(updated.options) } });
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

export default router;
