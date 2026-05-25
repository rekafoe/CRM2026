import { logger } from '../utils/logger';

type WebsiteOrderStatus = 'pending' | 'processing' | 'ready' | 'completed' | 'issued' | 'cancelled';

type DbLike = {
  get<T = any>(sql: string, ...params: any[]): Promise<T | undefined>;
};

function normalizeStatusName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е');
}

export function mapCrmStatusToWebsiteStatus(statusId: number, statusName?: string | null): WebsiteOrderStatus {
  const name = normalizeStatusName(statusName);

  if (name.includes('отмен') || name.includes('cancel')) return 'cancelled';
  if (name.includes('принят') || name.includes('работ')) return 'processing';
  if (name.includes('передан') || name.includes('пвз')) return 'ready';
  if (name.includes('получен') || name.includes('заверш')) return 'issued';
  if (name.includes('выполн') || name.includes('готов')) return 'completed';
  if (name.includes('ожида') || name.includes('нов')) return 'pending';
  if (name.includes('оформ')) return 'processing';

  switch (Number(statusId)) {
    case 2:
      return 'processing';
    case 3:
      return 'completed';
    case 4:
    case 5:
      return 'ready';
    case 6:
    case 7:
      return 'issued';
    case 0:
    case 1:
    default:
      return 'pending';
  }
}

function statusSyncEndpoint(): string | null {
  const direct = process.env.WEBSITE_ORDER_STATUS_SYNC_URL?.trim();
  if (direct) return direct;

  const base =
    process.env.PRINTCORE_BACKEND_URL?.trim() ||
    process.env.WEBSITE_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!base) return null;

  const normalizedBase = base.replace(/\/+$/, '');
  const apiBase = normalizedBase.endsWith('/api') ? normalizedBase : `${normalizedBase}/api`;
  return `${apiBase}/orders/crm-status-sync`;
}

function statusSyncApiKey(): string | null {
  return (
    process.env.WEBSITE_ORDER_STATUS_SYNC_API_KEY?.trim() ||
    process.env.WEBSITE_ORDER_API_KEY?.trim() ||
    null
  );
}

export async function trySyncWebsiteOrderStatusFromCrm(db: DbLike, orderId: number): Promise<void> {
  const endpoint = statusSyncEndpoint();
  const apiKey = statusSyncApiKey();
  if (!endpoint || !apiKey) {
    logger.warn('Website order status sync skipped: endpoint or API key is not configured', {
      orderId,
      hasEndpoint: Boolean(endpoint),
      hasApiKey: Boolean(apiKey),
    });
    return;
  }

  try {
    const row = await db.get<{
      id: number;
      number?: string | null;
      source?: string | null;
      status?: number | null;
      statusName?: string | null;
    }>(
      `SELECT o.id, o.number, o.source, o.status, os.name as statusName
       FROM orders o
       LEFT JOIN order_statuses os ON os.id = o.status
       WHERE o.id = ?`,
      [orderId]
    );

    if (!row || row.source !== 'website') return;

    const crmStatusId = Number(row.status ?? 0);
    const status = mapCrmStatusToWebsiteStatus(crmStatusId, row.statusName);
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        crmOrderId: row.id,
        crmOrderNumber: row.number || undefined,
        crmStatusId,
        crmStatusName: row.statusName || undefined,
        status,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.warn('Website order status sync failed', {
        orderId,
        status: response.status,
        body: body.slice(0, 500),
      });
    }
  } catch (error: any) {
    logger.warn('Website order status sync error', {
      orderId,
      error: error?.message || String(error),
    });
  }
}
