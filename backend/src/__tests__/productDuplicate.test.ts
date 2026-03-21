import express from 'express';
import request from 'supertest';
import { initDB, getDb } from '../config/database';
import productRoutes from '../modules/products/routes/products';
import { rateLimiter } from '../middleware/rateLimiter';

describe('POST /products/:id/duplicate', () => {
  const app = express();
  app.use(express.json());
  app.use('/products', productRoutes);

  let sourceId: number;
  let sourceProductName: string;
  const suiteKey = `dup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const simplifiedPayload = { simplified: { sizes: [{ w: 90, h: 50, label: 'Test' }], types: [] } };

  beforeAll(async () => {
    await initDB();
    const db = await getDb();

    const cat = await db.run(
      `INSERT INTO product_categories (name, description, icon, sort_order, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      `Dup test cat ${suiteKey}`,
      '',
      '🧪',
      0,
    );
    const catId = cat.lastID!;
    sourceProductName = `Source simplified product ${suiteKey}`;

    const ins = await db.run(
      `INSERT INTO products (category_id, name, description, icon, is_active, calculator_type, product_type)
       VALUES (?, ?, ?, ?, 1, 'simplified', 'multi_page')`,
      catId,
      sourceProductName,
      '',
      '📦',
    );
    sourceId = ins.lastID!;

    await db.run(
      `INSERT INTO product_template_configs (product_id, name, config_data, constraints, is_active)
       VALUES (?, 'template', ?, '{}', 1)`,
      sourceId,
      JSON.stringify(simplifiedPayload),
    );

    await db.run(
      `INSERT INTO product_parameters (product_id, name, type, label, is_required, sort_order)
       VALUES (?, 'print_technology', 'select', 'Технология', 1, 0)`,
      sourceId,
    );
  });

  afterAll(() => {
    rateLimiter.destroy();
  });

  it('отклоняет не-simplified продукт', async () => {
    const db = await getDb();
    const cat = await db.get<{ id: number }>(`SELECT id FROM product_categories ORDER BY id LIMIT 1`);
    const ins = await db.run(
      `INSERT INTO products (category_id, name, description, icon, is_active, calculator_type, product_type)
       VALUES (?, ?, ?, ?, 1, 'product', 'sheet_single')`,
      cat!.id,
      'Non simplified for dup test',
      '',
      '📦',
    );
    const id = ins.lastID!;
    const res = await request(app).post(`/products/${id}/duplicate`).send({ name: 'Should fail' });
    expect(res.status).toBe(400);
    await db.run('DELETE FROM products WHERE id = ?', [id]);
  });

  it('создаёт полную копию с новым именем и тем же config_data', async () => {
    const newName = `Copy of source ${Date.now()}`;
    const res = await request(app).post(`/products/${sourceId}/duplicate`).send({ name: newName });
    expect(res.status).toBe(201);
    expect(res.body?.data?.id).toBeDefined();
    expect(res.body?.data?.name).toBe(newName);

    const newId = res.body.data.id as number;
    const db = await getDb();
    const copy = await db.get<{ is_active: number; name: string }>(
      `SELECT is_active, name FROM products WHERE id = ?`,
      [newId],
    );
    expect(copy?.name).toBe(newName);
    expect(copy?.is_active).toBe(0);

    const cfg = await db.get<{ config_data: string }>(
      `SELECT config_data FROM product_template_configs WHERE product_id = ? AND name = 'template'`,
      [newId],
    );
    expect(cfg?.config_data).toBeTruthy();
    const parsed = JSON.parse(cfg!.config_data);
    expect(parsed.simplified.sizes[0].w).toBe(90);

    const params = await db.all(`SELECT name FROM product_parameters WHERE product_id = ?`, [newId]);
    expect(params.some((p: { name: string }) => p.name === 'print_technology')).toBe(true);

    await db.run('DELETE FROM product_template_configs WHERE product_id = ?', [newId]);
    await db.run('DELETE FROM product_parameters WHERE product_id = ?', [newId]);
    await db.run('DELETE FROM products WHERE id = ?', [newId]);
  });

  it('409 при занятом имени', async () => {
    const res = await request(app).post(`/products/${sourceId}/duplicate`).send({ name: sourceProductName });
    expect(res.status).toBe(409);
  });

  it('после дублирования выравнивает typeConfigs под types (normalizeSimplifiedTypeIds)', async () => {
    const db = await getDb();
    const messy = {
      simplified: {
        types: [{ id: 'legacy-a', name: 'Тип A', default: true }],
        typeConfigs: { 'legacy-a': { sizes: [{ id: 's1', width: 100, height: 200, label: 'Формат' }] } },
      },
    };
    await db.run(
      `UPDATE product_template_configs SET config_data = ? WHERE product_id = ? AND name = 'template'`,
      [JSON.stringify(messy), sourceId],
    );

    const newName = `Normalized copy ${Date.now()}`;
    const res = await request(app).post(`/products/${sourceId}/duplicate`).send({ name: newName });
    expect(res.status).toBe(201);
    const newId = res.body.data.id as number;

    const cfg = await db.get<{ config_data: string }>(
      `SELECT config_data FROM product_template_configs WHERE product_id = ? AND name = 'template'`,
      [newId],
    );
    const data = JSON.parse(cfg!.config_data);
    const tid = data.simplified.types[0].id;
    expect(typeof tid).toBe('number');
    expect(data.simplified.typeConfigs[String(tid)]?.sizes?.[0]?.width).toBe(100);

    await db.run('DELETE FROM product_template_configs WHERE product_id = ?', [newId]);
    await db.run('DELETE FROM product_parameters WHERE product_id = ?', [newId]);
    await db.run('DELETE FROM products WHERE id = ?', [newId]);

    await db.run(
      `UPDATE product_template_configs SET config_data = ? WHERE product_id = ? AND name = 'template'`,
      [JSON.stringify(simplifiedPayload), sourceId],
    );
  });
});
