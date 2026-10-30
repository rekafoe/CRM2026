import ExcelJS from 'exceljs'
import { getDb } from '../config/database'
import { CustomerLegalDocumentService } from '../modules/customers/services/customerLegalDocumentService'
import { CustomerService } from '../modules/customers/services/customerService'
import { OrderService } from '../modules/orders/services/orderService'
import { documentSourceHash } from './issuedDocumentService'
import { hasColumn } from '../utils/tableSchemaCache'
import { listLegalPaymentCredits } from './customerLegalPaymentService'
import {
  buildReconciliationStatement,
  formatReconciliationDate,
  reconciliationBalancePhrase,
  reconciliationPeriodLabel,
  reconciliationSourceFromOrder,
  type ReconciliationSourceOrder,
  type ReconciliationStatement,
} from './reconciliationStatement'

export type ReconciliationParties = {
  sellerName: string
  sellerUnp: string
  customerName: string
  customerUnp: string
  managerName: string
}

const NOTE =
  'Дебет — сумма оформленного заказа. Кредит — деньги, уже полученные по заказу (в том числе сумма, внесённая в заказ по счёту), и поступления, которые менеджер зачислил с подтверждающим документом. Ожидающая ссылка BePaid по кассе не входит. Просчёты, отменённые и внутренние заказы в акт не попадают.'

function money(value: number): number | '' {
  return Math.abs(value) < 0.004 ? '' : value
}

export type SettlementSkip = 'cancelled' | 'waiting' | 'internal' | 'zero'

export type SettlementOrderRow = {
  id: number
  number: string
  total: number
  included: boolean
  skip: SettlementSkip | null
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Заказы клиента в том же составе, что и акт сверки. Просчёт в дебет не входит. */
export async function loadCustomerSettlementOrders(customerId: number): Promise<{
  sources: ReconciliationSourceOrder[]
  orders: SettlementOrderRow[]
  organizationId: number | null
}> {
  const db = await getDb()
  const orders = await OrderService.getOrdersByCustomerId(customerId)
  const statusRows = (await db.all(
    `SELECT id, name, code FROM order_statuses`,
  )) as Array<{ id: number; name?: string | null; code?: string | null }>
  const waitingIds = new Set<number>([0])
  const cancelledIds = new Set<number>()
  for (const row of statusRows) {
    const code = String(row.code || '').trim()
    const name = String(row.name || '').trim()
    if (code === 'waiting' || name === 'Ожидает') waitingIds.add(Number(row.id))
    if (code === 'cancelled' || name === 'Отменён') cancelledIds.add(Number(row.id))
  }

  const settlement: SettlementOrderRow[] = []
  const included = orders.filter((order) => {
    const cancelled = Number((order as { is_cancelled?: number }).is_cancelled) === 1
      || cancelledIds.has(Number(order.status))
    const waiting = waitingIds.has(Number(order.status))
    const internal = String((order as { payment_channel?: string }).payment_channel || '').toLowerCase() === 'internal'
    const total = roundMoney(Number(order.totalAmount) || 0)
    const skip: SettlementSkip | null = cancelled
      ? 'cancelled'
      : waiting
        ? 'waiting'
        : internal
          ? 'internal'
          : total <= 0
            ? 'zero'
            : null
    settlement.push({
      id: order.id,
      number: order.number?.trim() || `#${order.id}`,
      total,
      included: skip == null,
      skip,
    })
    return !cancelled && !waiting && !internal
  })

  const ids = included.map((order) => order.id)
  const extra = new Map<number, { prepaymentUpdatedAt?: string | null; organization_id?: number | null }>()
  if (ids.length > 0) {
    const hasUpdated = await hasColumn('orders', 'prepaymentUpdatedAt').catch(() => false)
    const hasOrg = await hasColumn('orders', 'organization_id').catch(() => false)
    const columns = [
      'id',
      hasUpdated ? 'prepaymentUpdatedAt' : 'NULL as prepaymentUpdatedAt',
      hasOrg ? 'organization_id' : 'NULL as organization_id',
    ]
    const rows = (await db.all(
      `SELECT ${columns.join(', ')} FROM orders WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    )) as Array<{ id: number; prepaymentUpdatedAt?: string | null; organization_id?: number | null }>
    for (const row of rows) extra.set(Number(row.id), row)
  }

  const sources = included.map((order) => {
    const more = extra.get(order.id)
    return reconciliationSourceFromOrder({
      id: order.id,
      number: order.number,
      created_at: order.created_at,
      totalAmount: order.totalAmount,
      prepaymentAmount: order.prepaymentAmount,
      prepaymentStatus: order.prepaymentStatus,
      paymentMethod: order.paymentMethod,
      paymentChannel: (order as { payment_channel?: string | null }).payment_channel,
      prepaymentUpdatedAt: more?.prepaymentUpdatedAt,
    })
  })

  const orgCounts = new Map<number, number>()
  for (const order of included) {
    const orgId = Number(extra.get(order.id)?.organization_id)
    if (orgId > 0) orgCounts.set(orgId, (orgCounts.get(orgId) || 0) + 1)
  }
  let organizationId: number | null = null
  let best = 0
  for (const [id, count] of orgCounts) {
    if (count > best) {
      organizationId = id
      best = count
    }
  }

  return { sources, orders: settlement, organizationId }
}

export async function loadCustomerReconciliation(
  customerId: number,
  period: { from?: string | null; to?: string | null },
): Promise<{
  statement: ReconciliationStatement
  parties: ReconciliationParties
  organizationId: number | null
  customerType: string
}> {
  const customer = await CustomerService.getCustomerById(customerId)
  if (!customer) throw new Error('Клиент не найден')

  const db = await getDb()
  const settlement = await loadCustomerSettlementOrders(customerId)
  const credits = await listLegalPaymentCredits(customerId)
  const { organizationId } = settlement
  const seller = await db.get<{ name?: string | null; unp?: string | null }>(
    organizationId
      ? `SELECT name, unp FROM organizations WHERE id = ?`
      : `SELECT name, unp FROM organizations ORDER BY is_default DESC, id ASC LIMIT 1`,
    ...(organizationId ? [organizationId] : []),
  )

  return {
    statement: buildReconciliationStatement(settlement.sources, period, credits),
    organizationId,
    customerType: customer.type,
    parties: {
      sellerName: seller?.name?.trim() || '',
      sellerUnp: seller?.unp?.trim() || '',
      customerName: customer.legal_name || customer.company_name || CustomerService.getCustomerDisplayName(customer),
      customerUnp: customer.tax_id?.trim() || '',
      managerName: customer.manager_name?.trim() || '',
    },
  }
}

function asStoredBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  throw new Error('Файл акта сверки повреждён')
}

async function nextReconciliationNumber(): Promise<string> {
  const db = await getDb()
  await db.run(
    `INSERT INTO document_number_counters (kind, last_value) VALUES ('reconciliation', 1)
     ON CONFLICT(kind) DO UPDATE SET last_value = last_value + 1`,
  )
  const row = await db.get<{ last_value: number }>(
    `SELECT last_value FROM document_number_counters WHERE kind = 'reconciliation'`,
  )
  return `СВ-${String(Number(row?.last_value || 1)).padStart(5, '0')}`
}

async function rememberReconciliation(args: {
  customerId: number
  customerType: string
  organizationId: number | null
  statement: ReconciliationStatement
  parties: ReconciliationParties
  buffer: Buffer
}): Promise<{ number: string; filename: string; buffer: Buffer }> {
  const db = await getDb()
  const orderKey = `c${args.customerId}:${args.statement.periodFrom || '-'}:${args.statement.periodTo || '-'}`
  const sourceHash = documentSourceHash({
    customerId: args.customerId,
    periodFrom: args.statement.periodFrom,
    periodTo: args.statement.periodTo,
    openingBalance: args.statement.openingBalance,
    closingBalance: args.statement.closingBalance,
    lines: args.statement.lines,
    sellerUnp: args.parties.sellerUnp,
    customerUnp: args.parties.customerUnp,
  })
  const existing = await db.get<{
    id: number
    number: string
    filename: string
    file_blob: unknown
    issued_at: string
  }>(
    `SELECT id, number, filename, file_blob, issued_at
     FROM issued_documents
     WHERE kind = 'reconciliation' AND order_key = ? AND source_hash = ?`,
    [orderKey, sourceHash],
  )
  if (existing) {
    await linkReconciliationJournal({
      issuedId: existing.id,
      number: existing.number,
      customerId: args.customerId,
      customerType: args.customerType,
      issuedAt: existing.issued_at,
      balance: args.statement.closingBalance,
    })
    return {
      number: existing.number,
      filename: existing.filename,
      buffer: asStoredBuffer(existing.file_blob),
    }
  }

  const issuedAt = new Date().toISOString()
  const number = await nextReconciliationNumber()
  const storedName = `Акт-сверки-${number}.xlsx`
  try {
    const result = await db.run(
      `INSERT INTO issued_documents (
        kind, number, customer_id, organization_id, order_key, source_hash,
        total_amount, filename, mime_type, file_blob, issued_at
      ) VALUES ('reconciliation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        number,
        args.customerId,
        args.organizationId,
        orderKey,
        sourceHash,
        args.statement.closingBalance,
        storedName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        args.buffer,
        issuedAt,
      ],
    )
    await linkReconciliationJournal({
      issuedId: Number(result.lastID),
      number,
      customerId: args.customerId,
      customerType: args.customerType,
      issuedAt,
      balance: args.statement.closingBalance,
    })
    return { number, filename: storedName, buffer: args.buffer }
  } catch (error: any) {
    if (!/UNIQUE/i.test(String(error?.message || ''))) throw error
    const raced = await db.get<{ id: number; number: string; filename: string; file_blob: unknown; issued_at: string }>(
      `SELECT id, number, filename, file_blob, issued_at
       FROM issued_documents
       WHERE kind = 'reconciliation' AND order_key = ? AND source_hash = ?`,
      [orderKey, sourceHash],
    )
    if (!raced) throw error
    return { number: raced.number, filename: raced.filename, buffer: asStoredBuffer(raced.file_blob) }
  }
}

async function linkReconciliationJournal(args: {
  issuedId: number
  number: string
  customerId: number
  customerType: string
  issuedAt: string
  balance: number
}): Promise<void> {
  if (args.customerType !== 'legal') return
  const db = await getDb()
  const existing = await db.get(
    'SELECT id FROM customer_legal_documents WHERE issued_document_id = ?',
    [args.issuedId],
  )
  if (existing) return
  await CustomerLegalDocumentService.create(args.customerId, {
    title: `Акт сверки ${args.number}`,
    document_kind: 'reconciliation',
    issued_at: args.issuedAt,
    returned_at: null,
    notes: reconciliationBalancePhrase(args.balance),
    order_id: null,
    issued_document_id: args.issuedId,
  })
}

export async function issueCustomerReconciliation(
  customerId: number,
  period: { from?: string | null; to?: string | null },
): Promise<{ buffer: Buffer; filename: string; number: string }> {
  const loaded = await loadCustomerReconciliation(customerId, period)
  const buffer = await buildReconciliationWorkbook(loaded.statement, loaded.parties)
  return rememberReconciliation({
    customerId,
    customerType: loaded.customerType,
    organizationId: loaded.organizationId,
    statement: loaded.statement,
    parties: loaded.parties,
    buffer,
  })
}

function writeSheetRow(
  sheet: {
    getRow(rowNumber: number): {
      height?: number
      getCell(column: number): {
        value: unknown
        font?: { bold?: boolean; size?: number }
        numFmt?: string
        alignment?: { wrapText?: boolean }
      }
    }
  },
  rowNumber: number,
  values: Array<string | number>,
  options?: { bold?: boolean; amountColumns?: number[]; height?: number },
): void {
  const row = sheet.getRow(rowNumber)
  if (options?.height) row.height = options.height
  values.forEach((value, index) => {
    const cell = row.getCell(index + 1)
    cell.value = value
    if (options?.bold) cell.font = { ...(cell.font || {}), bold: true }
    if (options?.amountColumns?.includes(index + 1) && typeof value === 'number') {
      cell.numFmt = '#,##0.00'
    }
  })
}

export async function buildReconciliationWorkbook(
  statement: ReconciliationStatement,
  parties: ReconciliationParties,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Акт сверки')
  sheet.columns = [
    { width: 16 },
    { width: 42 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ]
  writeSheetRow(sheet, 1, ['Акт сверки взаимных расчётов'], { bold: true })
  sheet.getRow(1).getCell(1).font = { bold: true, size: 14 }
  sheet.mergeCells('A1:E1')
  const sellerLine = [parties.sellerName, parties.sellerUnp ? `УНП ${parties.sellerUnp}` : ''].filter(Boolean).join(', ')
  const customerLine = [parties.customerName, parties.customerUnp ? `УНП ${parties.customerUnp}` : ''].filter(Boolean).join(', ')
  writeSheetRow(sheet, 3, [`Исполнитель: ${sellerLine || '—'}`])
  writeSheetRow(sheet, 4, [`Заказчик: ${customerLine || '—'}`])
  writeSheetRow(sheet, 5, [`Период: ${reconciliationPeriodLabel(statement.periodFrom, statement.periodTo)}`])
  writeSheetRow(sheet, 7, ['Дата', 'Документ', 'Дебет', 'Кредит', 'Сальдо'], { bold: true })
  writeSheetRow(
    sheet,
    8,
    [
      statement.periodFrom ? formatReconciliationDate(statement.periodFrom) : '',
      'Сальдо на начало',
      '',
      '',
      statement.openingBalance,
    ],
    { amountColumns: [5] },
  )

  statement.lines.forEach((line, index) => {
    writeSheetRow(
      sheet,
      9 + index,
      [
        formatReconciliationDate(line.date),
        line.document,
        money(line.debit),
        money(line.credit),
        line.balance,
      ],
      { amountColumns: [3, 4, 5] },
    )
  })

  const turnoverRow = 9 + statement.lines.length
  writeSheetRow(
    sheet,
    turnoverRow,
    ['', 'Оборот за период', money(statement.debitTurnover), money(statement.creditTurnover), ''],
    { bold: true, amountColumns: [3, 4] },
  )
  writeSheetRow(
    sheet,
    turnoverRow + 1,
    ['', 'Сальдо на конец', '', '', statement.closingBalance],
    { bold: true, amountColumns: [5] },
  )
  const phraseRow = turnoverRow + 3
  writeSheetRow(sheet, phraseRow, [reconciliationBalancePhrase(statement.closingBalance)], { bold: true })
  sheet.mergeCells(`A${phraseRow}:E${phraseRow}`)
  const noteRow = phraseRow + 1
  writeSheetRow(sheet, noteRow, [NOTE], { height: 48 })
  sheet.getRow(noteRow).getCell(1).alignment = { wrapText: true }
  sheet.mergeCells(`A${noteRow}:E${noteRow}`)
  const ourSigner = parties.managerName ? `Исполнитель: ${parties.managerName}` : 'Исполнитель'
  writeSheetRow(sheet, noteRow + 2, [`${ourSigner} _______________`, '', '', 'Заказчик _______________'])

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
