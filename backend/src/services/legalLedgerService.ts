import { getDb } from '../config/database'
import { CustomerService } from '../modules/customers/services/customerService'
import {
  loadCustomerSettlementOrders,
  type SettlementOrderRow,
  type SettlementSkip,
} from './reconciliationActService'
import { creditsFromPayments, listLegalPayments, type LegalPayment } from './customerLegalPaymentService'
import { buildReconciliationStatement } from './reconciliationStatement'

export type LegalLedgerLastDocument = {
  title: string
  document_kind: string | null
  number: string | null
  order_id: number | null
  order_number: string | null
  issued_at: string
}

export type LegalLedgerOrder = {
  included: boolean
  debit: number
  /** Уже зачтённая оплата этого заказа (предоплата / платёжка по счёту). */
  collected: number
  skip: SettlementSkip | 'not_found' | null
}

export type LegalLedger = {
  manager_name: string | null
  balance: number
  debit_total: number
  credit_total: number
  order: LegalLedgerOrder | null
  last_document: LegalLedgerLastDocument | null
  payments: LegalPayment[]
}

function orderState(row: SettlementOrderRow | undefined, collected: number): LegalLedgerOrder {
  if (!row) return { included: false, debit: 0, collected: 0, skip: 'not_found' }
  return {
    included: row.included,
    debit: row.total,
    collected,
    skip: row.skip,
  }
}

async function lastIssuedDocument(customerId: number): Promise<LegalLedgerLastDocument | null> {
  const db = await getDb()
  let row: {
    title: string | null
    document_kind: string | null
    issued_at: string | null
    order_id: number | null
    issued_number: string | null
    order_number: string | null
  } | undefined
  try {
    row = await db.get(
      `SELECT d.title, d.document_kind, d.issued_at, d.order_id,
              i.number AS issued_number,
              o.number AS order_number
       FROM customer_legal_documents d
       LEFT JOIN orders o ON o.id = d.order_id
       LEFT JOIN issued_documents i ON i.id = d.issued_document_id
       WHERE d.customer_id = ?
       ORDER BY datetime(d.issued_at) DESC, d.id DESC
       LIMIT 1`,
      [customerId],
    )
  } catch {
    return null
  }
  if (!row?.issued_at) return null
  return {
    title: row.title?.trim() || 'Документ',
    document_kind: row.document_kind?.trim() || null,
    number: row.issued_number?.trim() || null,
    order_id: row.order_id == null ? null : Number(row.order_id),
    order_number: row.order_number?.trim() || null,
    issued_at: row.issued_at,
  }
}

export async function getLegalLedger(customerId: number, orderId?: number | null): Promise<LegalLedger> {
  const customer = await CustomerService.getCustomerById(customerId)
  if (!customer) throw new Error('Клиент не найден')
  if (customer.type !== 'legal') throw new Error('Баланс ведётся только для юридических лиц')

  const settlement = await loadCustomerSettlementOrders(customerId)
  const payments = await listLegalPayments(customerId)
  const statement = buildReconciliationStatement(settlement.sources, {}, creditsFromPayments(payments))
  const focusedId = orderId != null && orderId > 0 ? orderId : null
  const focused = focusedId
    ? orderState(
        settlement.orders.find((order) => order.id === focusedId),
        settlement.sources.find((source) => source.id === focusedId)?.collected ?? 0,
      )
    : null

  return {
    manager_name: customer.manager_name?.trim() || null,
    balance: statement.closingBalance,
    debit_total: statement.debitTurnover,
    credit_total: statement.creditTurnover,
    order: focused,
    last_document: await lastIssuedDocument(customerId),
    payments,
  }
}
