import { Router } from 'express';
import { asyncHandler, AuthenticatedRequest } from '../middleware';
import { getDb } from '../config/database';
import { authenticate } from '../middleware/auth';

const router = Router();

function requireAdmin(req: AuthenticatedRequest, res: any): boolean {
  const user = req.user;
  if (!user) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ message: 'Только администратор может управлять организациями' });
    return false;
  }
  return true;
}

/** GET /api/organizations — список организаций (для выбора при создании заказа) */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const db = await getDb();
  const rows = await db.all<any>(
    `SELECT id, name, unp, legal_address, phone, email, bank_details, logo_url, is_default, sort_order, created_at, updated_at
     FROM organizations
     ORDER BY is_default DESC, sort_order ASC, name ASC`
  );
  res.json(rows);
}));

/** GET /api/organizations/:id — одна организация */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const db = await getDb();
  const row = await db.get<any>('SELECT * FROM organizations WHERE id = ?', id);
  if (!row) {
    res.status(404).json({ message: 'Организация не найдена' });
    return;
  }
  res.json(row);
}));

/** POST /api/organizations — создать организацию (admin) */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return;
  const { name, unp, legal_address, phone, email, bank_details, logo_url, work_schedule, is_default, sort_order } = req.body;
  const db = await getDb();
  if (is_default) {
    await db.run('UPDATE organizations SET is_default = 0');
  }
  const hasWorkSchedule = (await db.all("PRAGMA table_info('organizations')") as Array<{ name: string }>).some((c) => c.name === 'work_schedule');
  const wsCol = hasWorkSchedule ? ', work_schedule' : '';
  const wsVal = hasWorkSchedule ? ', ?' : '';
  const result = await db.run(
    `INSERT INTO organizations (name, unp, legal_address, phone, email, bank_details, logo_url${wsCol}, is_default, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?${wsVal}, ?, ?, datetime('now'))`,
    ...(hasWorkSchedule ? [name || '', unp || null, legal_address || null, phone || null, email || null, bank_details || null, logo_url || null, work_schedule || null, is_default ? 1 : 0, sort_order != null ? Number(sort_order) : 0] : [name || '', unp || null, legal_address || null, phone || null, email || null, bank_details || null, logo_url || null, is_default ? 1 : 0, sort_order != null ? Number(sort_order) : 0])
  );
  const row = await db.get<any>('SELECT * FROM organizations WHERE id = ?', result.lastID);
  res.status(201).json(row);
}));

/** PUT /api/organizations/:id — обновить организацию (admin) */
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return;
  const id = Number(req.params.id);
  const { name, unp, legal_address, phone, email, bank_details, logo_url, work_schedule, is_default, sort_order } = req.body;
  const db = await getDb();
  if (is_default) {
    await db.run('UPDATE organizations SET is_default = 0 WHERE id != ?', id);
  }
  const hasWorkSchedule = (await db.all("PRAGMA table_info('organizations')") as Array<{ name: string }>).some((c) => c.name === 'work_schedule');
  const wsSet = hasWorkSchedule ? ', work_schedule = ?' : '';
  await db.run(
    `UPDATE organizations SET
      name = ?, unp = ?, legal_address = ?, phone = ?, email = ?, bank_details = ?, logo_url = ?${wsSet},
      is_default = ?, sort_order = ?, updated_at = datetime('now')
     WHERE id = ?`,
    ...(hasWorkSchedule ? [name ?? '', unp ?? null, legal_address ?? null, phone ?? null, email ?? null, bank_details ?? null, logo_url ?? null, work_schedule ?? null, is_default ? 1 : 0, sort_order != null ? Number(sort_order) : 0, id] : [name ?? '', unp ?? null, legal_address ?? null, phone ?? null, email ?? null, bank_details ?? null, logo_url ?? null, is_default ? 1 : 0, sort_order != null ? Number(sort_order) : 0, id])
  );
  const row = await db.get<any>('SELECT * FROM organizations WHERE id = ?', id);
  if (!row) {
    res.status(404).json({ message: 'Организация не найдена' });
    return;
  }
  res.json(row);
}));

/** DELETE /api/organizations/:id — удалить организацию (admin) */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return;
  const id = Number(req.params.id);
  const db = await getDb();
  const result = await db.run('DELETE FROM organizations WHERE id = ?', id);
  if (result.changes === 0) {
    res.status(404).json({ message: 'Организация не найдена' });
    return;
  }
  res.json({ message: 'Организация удалена' });
}));

/** GET /api/organizations/:id/receipt-template — шаблон товарного чека (пустой, если ещё не создан) */
router.get('/:id/receipt-template', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const db = await getDb();
  const org = await db.get('SELECT id FROM organizations WHERE id = ?', id);
  if (!org) {
    res.status(404).json({ message: 'Организация не найдена' });
    return;
  }
  const row = await db.get<any>('SELECT html_content FROM receipt_templates WHERE organization_id = ?', id);
  res.json({ organization_id: id, html_content: row?.html_content || '' });
}));

/** PUT /api/organizations/:id/receipt-template — сохранить шаблон товарного чека (admin) */
router.put('/:id/receipt-template', authenticate, asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return;
  const id = Number(req.params.id);
  const { html_content } = req.body;
  const db = await getDb();
  const org = await db.get('SELECT id FROM organizations WHERE id = ?', id);
  if (!org) {
    res.status(404).json({ message: 'Организация не найдена' });
    return;
  }
  const existing = await db.get('SELECT id FROM receipt_templates WHERE organization_id = ?', id);
  if (existing) {
    await db.run('UPDATE receipt_templates SET html_content = ?, updated_at = datetime("now") WHERE organization_id = ?', html_content || '', id);
  } else {
    await db.run('INSERT INTO receipt_templates (organization_id, html_content) VALUES (?, ?)', id, html_content || '');
  }
  const row = await db.get<any>('SELECT html_content FROM receipt_templates WHERE organization_id = ?', id);
  res.json({ organization_id: id, html_content: row?.html_content || '' });
}));

/** GET /api/organizations/:id/order-blank-template — шаблон бланка заказа (пустой, если ещё не создан) */
router.get('/:id/order-blank-template', authenticate, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const db = await getDb();
  const org = await db.get('SELECT id FROM organizations WHERE id = ?', id);
  if (!org) {
    res.status(404).json({ message: 'Организация не найдена' });
    return;
  }
  const row = await db.get<any>('SELECT html_content FROM order_blank_templates WHERE organization_id = ?', id);
  res.json({ organization_id: id, html_content: row?.html_content || '' });
}));

/** PUT /api/organizations/:id/order-blank-template — сохранить шаблон бланка заказа (admin) */
router.put('/:id/order-blank-template', authenticate, asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return;
  const id = Number(req.params.id);
  const { html_content } = req.body;
  const db = await getDb();
  const org = await db.get('SELECT id FROM organizations WHERE id = ?', id);
  if (!org) {
    res.status(404).json({ message: 'Организация не найдена' });
    return;
  }
  const existing = await db.get('SELECT id FROM order_blank_templates WHERE organization_id = ?', id);
  if (existing) {
    await db.run('UPDATE order_blank_templates SET html_content = ?, updated_at = datetime("now") WHERE organization_id = ?', html_content || '', id);
  } else {
    await db.run('INSERT INTO order_blank_templates (organization_id, html_content) VALUES (?, ?)', id, html_content || '');
  }
  const row = await db.get<any>('SELECT html_content FROM order_blank_templates WHERE organization_id = ?', id);
  res.json({ organization_id: id, html_content: row?.html_content || '' });
}));

export default router;
