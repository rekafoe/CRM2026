import { CustomerService, type Customer } from '../modules/customers/services/customerService';
import { OrderService } from '../modules/orders/services/orderService';
import { normalizeWebsiteItems } from '../modules/orders/utils/websiteOrderNormalize';
import { TelegramUserService } from './telegramUserService';
import { setLastWebsiteOrderAt } from '../utils/poolSync';
import { getDb } from '../config/database';
import {
  appendMiniappLayoutsPendingNote,
  clearMiniappLayoutsPendingNote,
} from '../utils/miniappOrderNotes';
import {
  MINIAPP_CHECKOUT_STATE_DRAFT,
  MINIAPP_CHECKOUT_STATE_FINALIZED,
} from '../utils/miniappCheckoutState';

export type MiniappCustomerBody =
  | {
      type: 'individual';
      first_name?: string;
      last_name?: string;
      middle_name?: string;
      phone?: string;
      email?: string;
      address?: string;
      notes?: string;
    }
  | {
      type: 'legal';
      company_name: string;
      legal_name?: string;
      tax_id?: string;
      bank_details?: string;
      authorized_person?: string;
      phone?: string;
      email?: string;
      address?: string;
      notes?: string;
    };

export type MiniappCheckoutBody = {
  customer: MiniappCustomerBody;
  order: {
    items: unknown[];
    prepaymentAmount?: number;
    order_notes?: string;
    /** Клиент отметил: макетов нет, нужна разработка дизайна (оценка отдельно). */
    design_help_requested?: boolean;
    /** Число позиций, для которых клиент подготовил макеты до checkout. */
    layout_item_count?: number;
  };
};

type NormalizedWebsiteItem = ReturnType<typeof normalizeWebsiteItems>[number];

async function ensureMiniappItemsProductIds(items: NormalizedWebsiteItem[]): Promise<NormalizedWebsiteItem[]> {
  if (!items.length) return items;
  const normalized: NormalizedWebsiteItem[] = [];
  const productIds = new Set<number>();

  items.forEach((it, idx) => {
    const params = (it.params && typeof it.params === 'object' && !Array.isArray(it.params))
      ? { ...it.params }
      : {};
    const fromParams = Number((params as { productId?: unknown }).productId);
    const fromType = Number(String(it.type || '').trim());
    const productId = Number.isFinite(fromParams) && fromParams > 0
      ? Math.floor(fromParams)
      : (Number.isFinite(fromType) && fromType > 0 ? Math.floor(fromType) : NaN);

    if (!Number.isFinite(productId)) {
      const err = new Error(`MINIAPP_PRODUCT_ID_REQUIRED:item=${idx + 1}`);
      (err as { code?: string }).code = 'MINIAPP_PRODUCT_ID_REQUIRED';
      throw err;
    }

    productIds.add(productId);
    normalized.push({
      ...it,
      type: String(productId),
      params: { ...params, productId },
    });
  });

  const db = await getDb();
  const ids = Array.from(productIds);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all<Array<{ id: number }>>(
    `SELECT id FROM products WHERE id IN (${placeholders})`,
    ids
  );
  const existing = new Set((Array.isArray(rows) ? rows : []).map((r) => Number(r.id)));
  const missing = ids.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    const err = new Error(`MINIAPP_PRODUCT_NOT_FOUND:${missing.join(',')}`);
    (err as { code?: string }).code = 'MINIAPP_PRODUCT_NOT_FOUND';
    throw err;
  }

  return normalized;
}

/** ФИО физ. лица из Telegram, если в запросе не переданы (миниапп: только телефон + комментарий). */
async function enrichIndividualFromTelegram(
  chatId: string,
  c: Extract<MiniappCustomerBody, { type: 'individual' }>
): Promise<Extract<MiniappCustomerBody, { type: 'individual' }>> {
  if (c.first_name?.trim() || c.last_name?.trim()) {
    return c;
  }
  const row = await TelegramUserService.getUserByChatId(chatId);
  const firstTg = (row?.first_name && String(row.first_name).trim()) || '';
  const lastTg = (row?.last_name && String(row.last_name).trim()) || '';
  if (firstTg || lastTg) {
    return { ...c, first_name: firstTg || undefined, last_name: lastTg || undefined };
  }
  const un = (row?.username && String(row.username).trim()) || '';
  if (un) {
    return { ...c, first_name: un, last_name: '' };
  }
  return { ...c, first_name: 'Клиент', last_name: '' };
}

async function enrichCustomerForMiniapp(
  chatId: string,
  c: MiniappCustomerBody
): Promise<MiniappCustomerBody> {
  if (c.type === 'individual') {
    return enrichIndividualFromTelegram(chatId, c);
  }
  return c;
}

function orderContactFromCustomer(c: Customer): {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
} {
  if (c.type === 'legal') {
    return {
      customerName: c.company_name || c.legal_name || 'Юр. лицо',
      customerPhone: c.phone,
      customerEmail: c.email,
    };
  }
  const parts = [c.last_name, c.first_name, c.middle_name].filter(Boolean) as string[];
  const name = parts.length > 0 ? parts.join(' ').trim() : (c.first_name || c.last_name || 'Клиент');
  return {
    customerName: name,
    customerPhone: c.phone,
    customerEmail: c.email,
  };
}

async function ensureCustomerForChat(
  chatId: string,
  c: MiniappCustomerBody
): Promise<Customer> {
  let phone = String(c.phone || '').trim();
  if (!phone) {
    const crmId = await TelegramUserService.getCrmCustomerIdByChatId(chatId);
    if (crmId) {
      const cust = await CustomerService.getCustomerById(crmId);
      if (cust?.phone) phone = String(cust.phone).trim();
    }
  }
  if (!phone) {
    const err = new Error('MINIAPP_PHONE_REQUIRED');
    (err as any).code = 'MINIAPP_PHONE_REQUIRED';
    throw err;
  }
  const cWithPhone = { ...c, phone } as MiniappCustomerBody;

  let existingId = await TelegramUserService.getCrmCustomerIdByChatId(chatId);
  if (cWithPhone.type === 'individual') {
    if (!cWithPhone.first_name?.trim() && !cWithPhone.last_name?.trim()) {
      const err = new Error('MINIAPP_NAME_REQUIRED');
      (err as any).code = 'MINIAPP_NAME_REQUIRED';
      throw err;
    }
  }
  if (cWithPhone.type === 'legal' && !cWithPhone.company_name?.trim()) {
    const err = new Error('MINIAPP_COMPANY_REQUIRED');
    (err as any).code = 'MINIAPP_COMPANY_REQUIRED';
    throw err;
  }

  if (existingId) {
    const ex = await CustomerService.getCustomerById(existingId);
    if (ex) {
      await CustomerService.updateCustomer(existingId, {
        type: cWithPhone.type,
        ...(cWithPhone.type === 'individual'
          ? {
              first_name: cWithPhone.first_name,
              last_name: cWithPhone.last_name,
              middle_name: cWithPhone.middle_name,
            }
          : {
              company_name: cWithPhone.company_name,
              legal_name: cWithPhone.legal_name,
              tax_id: cWithPhone.tax_id,
              bank_details: cWithPhone.bank_details,
              authorized_person: cWithPhone.authorized_person,
            }),
        phone: cWithPhone.phone,
        email: cWithPhone.email,
        address: cWithPhone.address,
        notes: cWithPhone.notes,
      });
      const updated = await CustomerService.getCustomerById(existingId);
      if (updated) return updated;
    }
    await TelegramUserService.setCrmCustomerIdByChatId(chatId, null);
    existingId = null;
  }

  if (cWithPhone.type === 'individual') {
    const created = await CustomerService.createCustomer({
      type: 'individual',
      first_name: cWithPhone.first_name,
      last_name: cWithPhone.last_name,
      middle_name: cWithPhone.middle_name,
      phone: cWithPhone.phone,
      email: cWithPhone.email,
      address: cWithPhone.address,
      notes: cWithPhone.notes,
      source: 'mini_app',
    });
    await TelegramUserService.setCrmCustomerIdByChatId(chatId, created.id);
    return created;
  }

  const created = await CustomerService.createCustomer({
    type: 'legal',
    company_name: cWithPhone.company_name,
    legal_name: cWithPhone.legal_name,
    tax_id: cWithPhone.tax_id,
    bank_details: cWithPhone.bank_details,
    authorized_person: cWithPhone.authorized_person,
    phone: cWithPhone.phone,
    email: cWithPhone.email,
    address: cWithPhone.address,
    notes: cWithPhone.notes,
    source: 'mini_app',
  });
  await TelegramUserService.setCrmCustomerIdByChatId(chatId, created.id);
  return created;
}

function ensureMiniappCheckoutBody(body: MiniappCheckoutBody): void {
  if (!body?.order?.items || !Array.isArray(body.order.items) || body.order.items.length === 0) {
    const err = new Error('MINIAPP_ITEMS_REQUIRED');
    (err as { code?: string }).code = 'MINIAPP_ITEMS_REQUIRED';
    throw err;
  }
  if (!body.customer || typeof body.customer !== 'object') {
    const err = new Error('MINIAPP_CUSTOMER_REQUIRED');
    (err as { code?: string }).code = 'MINIAPP_CUSTOMER_REQUIRED';
    throw err;
  }
}

function buildMiniappOrderNotes(
  orderNotesRaw: string | undefined,
  designHelpRequested: boolean,
  itemCount: number
): string {
  let orderNotes = String(orderNotesRaw || '').trim();
  if (designHelpRequested) {
    const mark =
      '[Mini App] Клиент: нет макета, требуется помощь с разработкой дизайна. Указанная сумма — печать; стоимость дизайна согласуется отдельно.';
    return orderNotes ? orderNotes + '\n\n' + mark : mark;
  }
  return appendMiniappLayoutsPendingNote(orderNotes, itemCount);
}

async function prepareMiniappCheckoutContext(telegramChatId: string, body: MiniappCheckoutBody) {
  ensureMiniappCheckoutBody(body);
  const normalizedRaw = normalizeWebsiteItems(body.order.items);
  const normalized = await ensureMiniappItemsProductIds(normalizedRaw);
  const customerPayload = await enrichCustomerForMiniapp(telegramChatId, body.customer);
  const customer = await ensureCustomerForChat(telegramChatId, customerPayload);
  const { customerName, customerPhone, customerEmail } = orderContactFromCustomer(customer);
  const prepayment =
    body.order.prepaymentAmount != null && Number.isFinite(Number(body.order.prepaymentAmount))
      ? Number(body.order.prepaymentAmount)
      : undefined;
  const designHelpRequested = !!body.order.design_help_requested;
  return {
    normalized,
    customer,
    customerName,
    customerPhone,
    customerEmail,
    prepayment,
    designHelpRequested,
    orderNotes: buildMiniappOrderNotes(body.order.order_notes, designHelpRequested, normalized.length),
  };
}

async function getOwnedMiniappOrderRow(telegramChatId: string, orderId: number) {
  const db = await getDb();
  return db.get<{
    id: number;
    number: string;
    notes?: string | null;
    miniapp_checkout_state?: string | null;
    miniapp_design_help_requested?: number | null;
  }>(
    `SELECT id, number, notes, miniapp_checkout_state, miniapp_design_help_requested
     FROM orders
     WHERE id = ? AND telegram_chat_id = ?`,
    [orderId, telegramChatId]
  );
}

export async function createMiniappDraft(telegramChatId: string, body: MiniappCheckoutBody) {
  const prepared = await prepareMiniappCheckoutContext(telegramChatId, body);
  const result = await OrderService.createOrderWithItems({
    customerName: prepared.customerName,
    customerPhone: prepared.customerPhone,
    customerEmail: prepared.customerEmail,
    prepaymentAmount: prepared.prepayment,
    userId: undefined,
    customer_id: prepared.customer.id,
    source: 'mini_app',
    telegramChatId,
    miniappCheckoutState: MINIAPP_CHECKOUT_STATE_DRAFT,
    miniappDesignHelpRequested: prepared.designHelpRequested,
    items: prepared.normalized,
  });

  if (prepared.orderNotes) {
    await OrderService.updateOrderNotes(result.order.id, prepared.orderNotes, undefined);
  }

  setLastWebsiteOrderAt(Date.now());
  return result;
}

export async function finalizeMiniappDraft(telegramChatId: string, orderId: number) {
  if (!Number.isFinite(orderId) || orderId < 1) {
    const err = new Error('Заказ не найден');
    (err as { code?: string }).code = 'MINIAPP_ORDER_NOT_FOUND';
    throw err;
  }
  const draftOrder = await getOwnedMiniappOrderRow(telegramChatId, orderId);
  if (!draftOrder) {
    const err = new Error('Заказ не найден');
    (err as { code?: string }).code = 'MINIAPP_ORDER_NOT_FOUND';
    throw err;
  }
  if (
    draftOrder.miniapp_checkout_state &&
    String(draftOrder.miniapp_checkout_state) !== MINIAPP_CHECKOUT_STATE_DRAFT
  ) {
    const err = new Error('Этот заказ уже оформлен');
    (err as { code?: string }).code = 'MINIAPP_ORDER_NOT_DRAFT';
    throw err;
  }

  const db = await getDb();
  const itemCountRow = await db.get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM items WHERE orderId = ?',
    [orderId]
  );
  const itemCount = Number(itemCountRow?.count) || 0;
  const designHelpRequested = Number(draftOrder.miniapp_design_help_requested) === 1;
  if (!designHelpRequested) {
    const fileCountRow = await db.get<{ count: number }>(
      `SELECT COUNT(DISTINCT orderItemId) AS count
       FROM order_files
       WHERE orderId = ? AND orderItemId IS NOT NULL`,
      [orderId]
    );
    const uploadedForItems = Number(fileCountRow?.count) || 0;
    if (uploadedForItems < itemCount) {
      const err = new Error('Для каждой позиции нужен макет или включите помощь с разработкой дизайна');
      (err as { code?: string }).code = 'MINIAPP_LAYOUT_FILES_REQUIRED';
      throw err;
    }
  }

  try {
    await db.run('BEGIN');
    const deductionResult = await OrderService.deductMaterialsForExistingOrder(orderId, undefined);
    if (!deductionResult.success) {
      const err = new Error(`Ошибка автоматического списания: ${deductionResult.errors.join(', ')}`);
      (err as { code?: string }).code = 'ORDER_AUTO_DEDUCTION_FAILED';
      throw err;
    }
    await db.run(
      'UPDATE orders SET miniapp_checkout_state = ? WHERE id = ?',
      [MINIAPP_CHECKOUT_STATE_FINALIZED, orderId]
    );
    const nextNotes = designHelpRequested
      ? String(draftOrder.notes || '').trim() || null
      : clearMiniappLayoutsPendingNote(draftOrder.notes ?? null) || null;
    await OrderService.updateOrderNotes(orderId, nextNotes, undefined);
    await db.run('COMMIT');

    const order = await db.get<{ id: number; number: string }>(
      'SELECT id, number FROM orders WHERE id = ?',
      [orderId]
    );
    return {
      order,
      deductionResult,
    };
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
}

export function mapMiniappCheckoutErrorToHttp(
  e: unknown
): { status: number; body: { error: string; message?: string } } | null {
  if (!(e instanceof Error)) return null;
  const c = (e as { code?: string }).code;
  if (c === 'ORDER_AUTO_DEDUCTION_FAILED') {
    return { status: 400, body: { error: e.message, message: e.message } };
  }
  const msg = e.message || '';
  if (
    msg.startsWith('Ошибка автоматического списания') ||
    msg.includes('Недостаточно материала') ||
    msg.includes('Материал с ID') && msg.includes('не найден')
  ) {
    return { status: 400, body: { error: e.message, message: e.message } };
  }
  if (msg.includes('Колонка notes')) {
    return { status: 400, body: { error: e.message, message: e.message } };
  }
  switch (c) {
    case 'MINIAPP_ORDER_NOT_FOUND':
      return { status: 404, body: { error: e.message, message: e.message } };
    case 'MINIAPP_PHONE_REQUIRED':
    case 'MINIAPP_NAME_REQUIRED':
    case 'MINIAPP_COMPANY_REQUIRED':
    case 'MINIAPP_ITEMS_REQUIRED':
    case 'MINIAPP_ITEM_TYPE_REQUIRED':
    case 'MINIAPP_CUSTOMER_REQUIRED':
    case 'MINIAPP_PRODUCT_ID_REQUIRED':
    case 'MINIAPP_PRODUCT_NOT_FOUND':
    case 'MINIAPP_LAYOUT_FILES_REQUIRED':
    case 'MINIAPP_ORDER_NOT_DRAFT':
      return { status: 400, body: { error: e.message, message: e.message } };
    default:
      return null;
  }
}
