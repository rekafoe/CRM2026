import { getDb } from '../config/database';
import { hasColumn } from '../utils/tableSchemaCache';
import { OrderRepository } from '../repositories/orderRepository';
import type { Item } from '../models/Item';
import { saveBufferToOrderFiles } from '../config/upload';
import { OrderService } from '../modules/orders/services/orderService';
import { clearMiniappLayoutsPendingNote } from '../utils/miniappOrderNotes';
import { MINIAPP_CHECKOUT_STATE_DRAFT } from '../utils/miniappCheckoutState';

export type MiniappOrderListRow = {
  id: number;
  number: string;
  status: number;
  status_name: string | null;
  created_at: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  source: string | null;
  prepaymentAmount: number | null;
  notes: string | null;
  items_count: number;
};

/**
 * Список заказов, оформленных из Mini App (по колонке orders.telegram_chat_id).
 */
export async function listMiniappOrders(
  telegramChatId: string,
  options?: { limit?: number }
): Promise<{ orders: MiniappOrderListRow[]; available: boolean }> {
  if (!(await hasColumn('orders', 'telegram_chat_id'))) {
    return { orders: [], available: false };
  }
  const limit = Math.min(Math.max(1, options?.limit ?? 50), 200);
  const db = await getDb();
  const hasCheckoutState = await hasColumn('orders', 'miniapp_checkout_state');
  const finalizedWhere = hasCheckoutState
    ? ` AND COALESCE(o.miniapp_checkout_state, '') != '${MINIAPP_CHECKOUT_STATE_DRAFT}'`
    : '';

  const rows = (await db.all(
    `SELECT
       o.id,
       o.number,
       o.status,
       COALESCE(o.createdAt, o.created_at) AS created_at,
       o.customerName,
       o.customerPhone,
       o.customerEmail,
       o.source,
       o.prepaymentAmount,
       o.notes,
       (SELECT COUNT(*) FROM items i WHERE i.orderId = o.id) AS items_count
     FROM orders o
     WHERE o.telegram_chat_id = ?
     ${finalizedWhere}
     ORDER BY datetime(COALESCE(o.createdAt, o.created_at)) DESC, o.id DESC
     LIMIT ?`,
    [telegramChatId, limit]
  )) as any[];

  const statusIds = [
    ...new Set((Array.isArray(rows) ? rows : []).map((r: { status?: number }) => Number(r.status)).filter((n) => n > 0)),
  ];
  const statusNameById = new Map<number, string>();
  if (statusIds.length > 0) {
    try {
      const ph = statusIds.map(() => '?').join(',');
      const st = (await db.all(
        `SELECT id, name FROM order_statuses WHERE id IN (${ph})`,
        statusIds
      )) as Array<{ id: number; name: string }>;
      for (const s of Array.isArray(st) ? st : []) {
        statusNameById.set(s.id, s.name);
      }
    } catch {
      // order_statuses может отсутствовать
    }
  }

  return {
    available: true,
    orders: (Array.isArray(rows) ? rows : []).map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      status_name: statusNameById.get(Number(r.status)) ?? null,
      created_at: r.created_at != null ? String(r.created_at) : null,
      customerName: r.customerName ?? null,
      customerPhone: r.customerPhone ?? null,
      customerEmail: r.customerEmail ?? null,
      source: r.source ?? null,
      prepaymentAmount: r.prepaymentAmount != null ? Number(r.prepaymentAmount) : null,
      notes: r.notes != null ? String(r.notes) : null,
      items_count: Number(r.items_count) || 0,
    })),
  };
}

export type MiniappOrderFileRow = {
  id: number;
  orderId: number;
  orderItemId: number | null;
  filename: string;
  originalName: string | null;
  mime: string | null;
  size: number | null;
  uploadedAt: string | null;
};

export async function getMiniappOrderDetail(
  telegramChatId: string,
  orderId: number
): Promise<{
  order: MiniappOrderListRow;
  items: Item[];
  files: MiniappOrderFileRow[];
} | null> {
  if (!Number.isFinite(orderId) || orderId < 1) {
    return null;
  }
  if (!(await hasColumn('orders', 'telegram_chat_id'))) {
    return null;
  }
  const db = await getDb();
  const hasCheckoutState = await hasColumn('orders', 'miniapp_checkout_state');
  const finalizedWhere = hasCheckoutState
    ? ` AND COALESCE(o.miniapp_checkout_state, '') != '${MINIAPP_CHECKOUT_STATE_DRAFT}'`
    : '';

  const o = (await db.get(
    `SELECT
       o.id,
       o.number,
       o.status,
       COALESCE(o.createdAt, o.created_at) AS created_at,
       o.customerName,
       o.customerPhone,
       o.customerEmail,
       o.source,
       o.prepaymentAmount,
       o.notes,
       (SELECT COUNT(*) FROM items i WHERE i.orderId = o.id) AS items_count
     FROM orders o
     WHERE o.id = ? AND o.telegram_chat_id = ?${finalizedWhere}`,
    [orderId, telegramChatId]
  )) as any;

  if (!o) {
    return null;
  }

  let statusName: string | null = null;
  try {
    const st = (await db.get('SELECT name FROM order_statuses WHERE id = ?', [o.status])) as { name?: string } | undefined;
    statusName = st?.name != null ? String(st.name) : null;
  } catch {
    statusName = null;
  }

  const listRow: MiniappOrderListRow = {
    id: o.id,
    number: o.number,
    status: o.status,
    status_name: statusName,
    created_at: o.created_at != null ? String(o.created_at) : null,
    customerName: o.customerName ?? null,
    customerPhone: o.customerPhone ?? null,
    customerEmail: o.customerEmail ?? null,
    source: o.source ?? null,
    prepaymentAmount: o.prepaymentAmount != null ? Number(o.prepaymentAmount) : null,
    notes: o.notes != null ? String(o.notes) : null,
    items_count: Number(o.items_count) || 0,
  };

  const items = await OrderRepository.getItemsByOrderId(orderId);
  const fileRows = (await db.all(
    `SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt
     FROM order_files
     WHERE orderId = ?
     ORDER BY (orderItemId IS NULL), orderItemId, id`,
    [orderId]
  )) as any[];

  const files = (Array.isArray(fileRows) ? fileRows : []).map((f) => ({
    id: f.id,
    orderId: f.orderId,
    orderItemId: f.orderItemId != null ? Number(f.orderItemId) : null,
    filename: f.filename,
    originalName: f.originalName ?? null,
    mime: f.mime ?? null,
    size: f.size != null ? Number(f.size) : null,
    uploadedAt: f.uploadedAt != null ? String(f.uploadedAt) : null,
  }));

  return { order: listRow, items, files };
}

/**
 * Загрузка макета к заказу Mini App: только если orders.telegram_chat_id совпадает.
 * orderItemId — id строки items (позиция), иначе null = общий файл по заказу.
 */
export async function attachFileToMiniappOrder(
  telegramChatId: string,
  orderId: number,
  file: { buffer: Buffer | undefined; originalName: string; mimetype?: string | null },
  orderItemId?: number | string | null
): Promise<{ ok: true; row: MiniappOrderFileRow } | { ok: false; status: number; message: string }> {
  if (!(await hasColumn('orders', 'telegram_chat_id'))) {
    return { ok: false, status: 503, message: 'telegram_chat_id column missing; run migrations' };
  }
  const buf = file.buffer;
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
    return { ok: false, status: 400, message: 'Файл пустой (0 байт)' };
  }

  const db = await getDb();
  const order = (await db.get(
    'SELECT id, telegram_chat_id FROM orders WHERE id = ?',
    [orderId]
  )) as { id: number; telegram_chat_id?: string | null } | undefined;

  if (!order) {
    return { ok: false, status: 404, message: 'Заказ не найден' };
  }
  if (String(order.telegram_chat_id || '') !== String(telegramChatId)) {
    return { ok: false, status: 403, message: 'Нет доступа к этому заказу' };
  }

  let itemFk: number | null = null;
  if (orderItemId != null && String(orderItemId).trim() !== '') {
    const idNum = Number(orderItemId);
    const id = Math.floor(idNum);
    if (!Number.isFinite(idNum) || idNum < 1 || id !== idNum) {
      return { ok: false, status: 400, message: 'Некорректный orderItemId' };
    }
    const item = (await db.get<{ id: number }>(
      'SELECT id FROM items WHERE id = ? AND orderId = ?',
      [id, orderId]
    )) as { id: number } | undefined;
    if (!item) {
      return { ok: false, status: 400, message: 'Указанная позиция не относится к этому заказу' };
    }
    itemFk = id;
  }

  const saved = saveBufferToOrderFiles(buf, file.originalName);
  if (!saved) {
    return { ok: false, status: 400, message: 'Не удалось сохранить файл' };
  }

  await db.run(
    'INSERT INTO order_files (orderId, orderItemId, filename, originalName, mime, size) VALUES (?, ?, ?, ?, ?, ?)',
    [orderId, itemFk, saved.filename, saved.originalName, file.mimetype || null, saved.size]
  );

  const row = (await db.get(
    `SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt
     FROM order_files WHERE orderId = ? ORDER BY id DESC LIMIT 1`,
    [orderId]
  )) as any;

  const out: MiniappOrderFileRow = {
    id: row.id,
    orderId: row.orderId,
    orderItemId: row.orderItemId != null ? Number(row.orderItemId) : null,
    filename: row.filename,
    originalName: row.originalName ?? null,
    mime: row.mime ?? null,
    size: row.size != null ? Number(row.size) : null,
    uploadedAt: row.uploadedAt != null ? String(row.uploadedAt) : null,
  };

  if (itemFk != null) {
    try {
      const [orderRow, itemCountRow, fileCountRow] = await Promise.all([
        db.get<{ notes?: string | null }>('SELECT notes FROM orders WHERE id = ?', [orderId]),
        db.get<{ count: number }>('SELECT COUNT(*) AS count FROM items WHERE orderId = ?', [orderId]),
        db.get<{ count: number }>(
          'SELECT COUNT(DISTINCT orderItemId) AS count FROM order_files WHERE orderId = ? AND orderItemId IS NOT NULL',
          [orderId]
        ),
      ]);
      const expectedCount = Number(itemCountRow?.count) || 0;
      const uploadedForItems = Number(fileCountRow?.count) || 0;
      if (expectedCount > 0 && uploadedForItems >= expectedCount) {
        const nextNotes = clearMiniappLayoutsPendingNote(orderRow?.notes ?? null);
        await OrderService.updateOrderNotes(orderId, nextNotes || null, undefined);
      }
    } catch {
      // Не ломаем загрузку файла, если не удалось синхронизировать служебную пометку в notes.
    }
  }

  return { ok: true, row: out };
}

