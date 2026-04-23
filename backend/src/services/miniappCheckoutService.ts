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
  const phone = String(c.phone || '').trim();
  if (!phone) {
    const err = new Error('MINIAPP_PHONE_REQUIRED');
    (err as any).code = 'MINIAPP_PHONE_REQUIRED';
    throw err;
  }

  let existingId = await TelegramUserService.getCrmCustomerIdByChatId(chatId);
  if (c.type === 'individual') {
    if (!c.first_name?.trim() && !c.last_name?.trim()) {
      const err = new Error('MINIAPP_NAME_REQUIRED');
      (err as any).code = 'MINIAPP_NAME_REQUIRED';
      throw err;
    }
  }
  if (c.type === 'legal' && !c.company_name?.trim()) {
    const err = new Error('MINIAPP_COMPANY_REQUIRED');
    (err as any).code = 'MINIAPP_COMPANY_REQUIRED';
    throw err;
  }

  if (existingId) {
    const ex = await CustomerService.getCustomerById(existingId);
    if (ex) {
      await CustomerService.updateCustomer(existingId, {
        type: c.type,
        ...(c.type === 'individual'
          ? {
              first_name: c.first_name,
              last_name: c.last_name,
              middle_name: c.middle_name,
            }
          : {
              company_name: c.company_name,
              legal_name: c.legal_name,
              tax_id: c.tax_id,
              bank_details: c.bank_details,
              authorized_person: c.authorized_person,
            }),
        phone: c.phone,
        email: c.email,
        address: c.address,
        notes: c.notes,
      });
      const updated = await CustomerService.getCustomerById(existingId);
      if (updated) return updated;
    }
    await TelegramUserService.setCrmCustomerIdByChatId(chatId, null);
    existingId = null;
  }

  if (c.type === 'individual') {
    const created = await CustomerService.createCustomer({
      type: 'individual',
      first_name: c.first_name,
      last_name: c.last_name,
      middle_name: c.middle_name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
    });
    await TelegramUserService.setCrmCustomerIdByChatId(chatId, created.id);
    return created;
  }

  const created = await CustomerService.createCustomer({
    type: 'legal',
    company_name: c.company_name,
    legal_name: c.legal_name,
    tax_id: c.tax_id,
    bank_details: c.bank_details,
    authorized_person: c.authorized_person,
    phone: c.phone,
    email: c.email,
    address: c.address,
    notes: c.notes,
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

  const customer = await ensureCustomerForChat(telegramChatId, body.customer);
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
  const code = (e as { code?: string }).code || e.message;
  switch (code) {
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
