import { getDb } from '../config/database';
import { hasColumn } from '../utils/tableSchemaCache';
import { TelegramUserService } from './telegramUserService';
import { MINIAPP_CHECKOUT_STATE_DRAFT } from '../utils/miniappCheckoutState';

export type TelegramActiveOrderRow = {
  id: number;
  number: string | null;
  status: number;
  status_name: string | null;
  created_at: string | null;
  source: string | null;
};

function formatOrderSource(source: string | null): string {
  if (source === 'mini_app') return 'Mini App';
  if (source === 'website') return 'Сайт';
  if (source === 'telegram') return 'Telegram';
  return 'CRM';
}

function formatOrderDate(value: string | null): string {
  if (!value) return 'без даты';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU');
}

async function getCompletedOrderStatusIds(): Promise<number[]> {
  const db = await getDb();
  try {
    const rows = (await db.all(
      `SELECT id
       FROM order_statuses
       WHERE lower(trim(name)) IN ('завершён', 'завершен')`
    )) as Array<{ id: number }>;
    return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
  } catch {
    return [];
  }
}

async function getStatusNameByIdMap(statusIds: number[]): Promise<Map<number, string>> {
  if (statusIds.length === 0) return new Map();
  const db = await getDb();
  try {
    const placeholders = statusIds.map(() => '?').join(',');
    const rows = (await db.all(
      `SELECT id, name FROM order_statuses WHERE id IN (${placeholders})`,
      statusIds
    )) as Array<{ id: number; name: string }>;
    return new Map(rows.map((row) => [Number(row.id), String(row.name)]));
  } catch {
    return new Map();
  }
}

export async function listTelegramActiveOrders(
  chatId: string,
  options?: { limit?: number }
): Promise<TelegramActiveOrderRow[]> {
  const db = await getDb();
  const limit = options?.limit != null ? Math.min(Math.max(1, options.limit), 100) : null;
  const crmCustomerId = await TelegramUserService.getCrmCustomerIdByChatId(chatId);
  const hasTelegramChatId = await hasColumn('orders', 'telegram_chat_id');
  const hasCustomerId = await hasColumn('orders', 'customer_id');
  const hasIsCancelled = await hasColumn('orders', 'is_cancelled');
  const hasCheckoutState = await hasColumn('orders', 'miniapp_checkout_state');
  const completedStatusIds = await getCompletedOrderStatusIds();

  const ownershipClauses: string[] = [];
  const params: Array<string | number> = [];
  if (hasTelegramChatId) {
    ownershipClauses.push('o.telegram_chat_id = ?');
    params.push(chatId);
  }
  if (crmCustomerId != null && hasCustomerId) {
    ownershipClauses.push('o.customer_id = ?');
    params.push(crmCustomerId);
  }
  if (ownershipClauses.length === 0) return [];

  const completedClause =
    completedStatusIds.length > 0
      ? ` AND o.status NOT IN (${completedStatusIds.map(() => '?').join(',')})`
      : ' AND o.status != 6';
  const checkoutStateClause = hasCheckoutState
    ? ` AND COALESCE(o.miniapp_checkout_state, '') != ?`
    : '';

  const rows = (await db.all(
    `SELECT DISTINCT
       o.id,
       o.number,
       o.status,
       COALESCE(o.createdAt, o.created_at) AS created_at,
       o.source
     FROM orders o
     WHERE (${ownershipClauses.join(' OR ')})
       AND o.status != 0
       ${hasIsCancelled ? 'AND COALESCE(o.is_cancelled, 0) = 0' : ''}
       ${completedClause}
       ${checkoutStateClause}
     ORDER BY datetime(COALESCE(o.createdAt, o.created_at)) DESC, o.id DESC
     ${limit != null ? 'LIMIT ?' : ''}`,
    [
      ...params,
      ...completedStatusIds,
      ...(hasCheckoutState ? [MINIAPP_CHECKOUT_STATE_DRAFT] : []),
      ...(limit != null ? [limit] : []),
    ]
  )) as Array<{
    id: number;
    number: string | null;
    status: number;
    created_at: string | null;
    source: string | null;
  }>;

  const statusMap = await getStatusNameByIdMap(
    [...new Set(rows.map((row) => Number(row.status)).filter((status) => Number.isFinite(status)))]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    number: row.number != null ? String(row.number) : null,
    status: Number(row.status) || 0,
    status_name: statusMap.get(Number(row.status)) ?? null,
    created_at: row.created_at != null ? String(row.created_at) : null,
    source: row.source != null ? String(row.source) : null,
  }));
}

export async function buildTelegramActiveOrdersText(chatId: string): Promise<string | null> {
  const orders = await listTelegramActiveOrders(chatId);
  if (orders.length === 0) return null;
  const lines = orders.map((order) => {
    const number = order.number || `#${order.id}`;
    const statusName = order.status_name || `Статус ${order.status}`;
    return `• ${number} — ${statusName} — ${formatOrderDate(order.created_at)} — ${formatOrderSource(order.source)}`;
  });
  return `📋 Активные заказы:\n${lines.join('\n')}`;
}

