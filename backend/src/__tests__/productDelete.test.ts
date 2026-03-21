import express from 'express';
import request from 'supertest';
import { initDB, getDb } from '../config/database';
import productRoutes from '../modules/products/routes/products';
import { rateLimiter } from '../middleware/rateLimiter';

describe('DELETE /products/:id', () => {
  const app = express();
  app.use(express.json());
  app.use('/products', productRoutes);

  const suiteKey = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  afterAll(() => {
    rateLimiter.destroy();
  });

  it('удаляет product_service_links и product_setup_checklist вместе с продуктом', async () => {
    await initDB();
    const db = await getDb();

    const cat = await db.run(
      `INSERT INTO product_categories (name, description, icon, sort_order, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      `Del test cat ${suiteKey}`,
      '',
      '🧪',
      0,
    );
    const catId = cat.lastID!;

    const ins = await db.run(
      `INSERT INTO products (category_id, name, description, icon, is_active, calculator_type, product_type)
       VALUES (?, ?, ?, ?, 1, 'simplified', 'multi_page')`,
      catId,
      `To delete ${suiteKey}`,
      '',
      '📦',
    );
    const pid = ins.lastID!;

    await db.run(
      `INSERT INTO product_template_configs (product_id, name, config_data, constraints, is_active)
       VALUES (?, 'template', '{}', '{}', 1)`,
      pid,
    );

    if (await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='product_setup_checklist'`)) {
      await db.run(
        `INSERT OR REPLACE INTO product_setup_checklist (product_id, step, is_completed) VALUES (?, ?, 0)`,
        pid,
        `step_${suiteKey}`,
      );
    }

    let serviceId: number | null = null;
    if (await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='product_service_links'`)) {
      const svc = await db.get<{ id: number }>(`SELECT id FROM service_prices WHERE is_active = 1 LIMIT 1`);
      if (svc?.id) {
        serviceId = svc.id;
        await db.run(
          `INSERT OR IGNORE INTO product_service_links (product_id, service_id, is_required, default_quantity)
           VALUES (?, ?, 0, 1)`,
          pid,
          serviceId,
        );
      }
    }

    const delRes = await request(app).delete(`/products/${pid}`);
    expect(delRes.status).toBe(200);

    const stillProduct = await db.get(`SELECT id FROM products WHERE id = ?`, [pid]);
    expect(stillProduct).toBeUndefined();

    const cfgLeft = await db.get(`SELECT id FROM product_template_configs WHERE product_id = ?`, [pid]);
    expect(cfgLeft).toBeUndefined();

    if (serviceId != null) {
      const linkLeft = await db.get(
        `SELECT id FROM product_service_links WHERE product_id = ? AND service_id = ?`,
        [pid, serviceId],
      );
      expect(linkLeft).toBeUndefined();
    }

    if (await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='product_setup_checklist'`)) {
      const cl = await db.get(`SELECT id FROM product_setup_checklist WHERE product_id = ?`, [pid]);
      expect(cl).toBeUndefined();
    }

    await db.run('DELETE FROM products WHERE id = ?', [pid]).catch(() => undefined);
    await db.run('DELETE FROM product_categories WHERE id = ?', [catId]).catch(() => undefined);
  });
});
