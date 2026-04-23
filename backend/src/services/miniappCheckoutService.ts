import { CustomerService, type Customer } from '../modules/customers/services/customerService';
import { OrderService } from '../modules/orders/services/orderService';
import { normalizeWebsiteItems } from '../modules/orders/utils/websiteOrderNormalize';
import { TelegramUserService } from './telegramUserService';
import { setLastWebsiteOrderAt } from '../utils/poolSync';

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
  };
};

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
  });
  await TelegramUserService.setCrmCustomerIdByChatId(chatId, created.id);
  return created;
}

/**
 * Создание заказа из Mini App: клиент (ФЛ/ЮЛ) + позиции, source=mini_app.
 */
export async function submitMiniappCheckout(telegramChatId: string, body: MiniappCheckoutBody) {
  if (!body?.order?.items || !Array.isArray(body.order.items) || body.order.items.length === 0) {
    const err = new Error('MINIAPP_ITEMS_REQUIRED');
    (err as any).code = 'MINIAPP_ITEMS_REQUIRED';
    throw err;
  }
  if (!body.customer || typeof body.customer !== 'object') {
    const err = new Error('MINIAPP_CUSTOMER_REQUIRED');
    (err as any).code = 'MINIAPP_CUSTOMER_REQUIRED';
    throw err;
  }

  const normalized = normalizeWebsiteItems(body.order.items);
  for (const it of normalized) {
    if (!String(it.type || '').trim()) {
      const err = new Error('MINIAPP_ITEM_TYPE_REQUIRED');
      (err as any).code = 'MINIAPP_ITEM_TYPE_REQUIRED';
      throw err;
    }
  }

  const customerPayload = await enrichCustomerForMiniapp(telegramChatId, body.customer);
  const customer = await ensureCustomerForChat(telegramChatId, customerPayload);
  const { customerName, customerPhone, customerEmail } = orderContactFromCustomer(customer);

  const prepayment =
    body.order.prepaymentAmount != null && Number.isFinite(Number(body.order.prepaymentAmount))
      ? Number(body.order.prepaymentAmount)
      : undefined;

  const result = await OrderService.createOrderWithAutoDeduction({
    customerName,
    customerPhone,
    customerEmail,
    prepaymentAmount: prepayment,
    userId: undefined,
    customer_id: customer.id,
    source: 'mini_app',
    telegramChatId: telegramChatId,
    items: normalized,
  });

  const orderNotes = String(body.order.order_notes || '').trim();
  if (orderNotes) {
    await OrderService.updateOrderNotes(result.order.id, orderNotes, undefined);
  }

  setLastWebsiteOrderAt(Date.now());
  return result;
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
    case 'MINIAPP_PHONE_REQUIRED':
    case 'MINIAPP_NAME_REQUIRED':
    case 'MINIAPP_COMPANY_REQUIRED':
    case 'MINIAPP_ITEMS_REQUIRED':
    case 'MINIAPP_ITEM_TYPE_REQUIRED':
    case 'MINIAPP_CUSTOMER_REQUIRED':
      return { status: 400, body: { error: e.message, message: e.message } };
    default:
      return null;
  }
}
