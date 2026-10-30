import fs from 'fs'
import { getDb } from '../config/database'
import {
  legalPaymentsDir,
  resolveSafeExistingPath,
  saveBufferToLegalPayments,
} from '../config/upload'
import { CustomerService } from '../modules/customers/services/customerService'
import {
  reconciliationCalendarDate,
  type ReconciliationCredit,
} from './reconciliationStatement'

export type LegalPaymentFile = {
  id: number
  original_name: string
  mime: string | null
  size: number
}

export type LegalPayment = {
  id: number
  customer_id: number
  amount: number
  paid_at: string
  notes: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
  files: LegalPaymentFile[]
}

type PaymentFileRow = {
  id: number
  customer_id: number
  amount: number
  paid_at: string
  notes: string | null
  created_by: number | null
  created_by_name: string | null
  created_at: string
  file_id: number | null
  original_name: string | null
  mime: string | null
  size: number | null
  filename: string | null
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function displayFileName(name: string | undefined): string {
  const raw = (name || '').trim() || 'document'
  if (!/[\u0080-\u00ff]/.test(raw)) return raw
  const decoded = Buffer.from(raw, 'latin1').toString('utf8')
  return decoded.includes('\uFFFD') ? raw : decoded
}

export function parseLegalPaymentAmount(raw: unknown): number {
  const text = String(raw ?? '').trim().replace(/\s/g, '').replace(',', '.')
  const value = Number(text)
  if (!Number.isFinite(value)) throw new Error('Укажите сумму зачисления')
  const rounded = roundMoney(value)
  if (rounded <= 0) throw new Error('Сумма зачисления должна быть больше нуля')
  if (rounded > 1_000_000_000) throw new Error('Слишком большая сумма')
  return rounded
}

export function parseLegalPaymentDate(raw: unknown): string {
  const date = reconciliationCalendarDate(raw == null ? '' : String(raw))
  if (!date) throw new Error('Укажите дату зачисления')
  return date
}

async function assertLegalCustomer(customerId: number): Promise<void> {
  const customer = await CustomerService.getCustomerById(customerId)
  if (!customer) throw new Error('Клиент не найден')
  if (customer.type !== 'legal') throw new Error('Поступления ведутся только для юридических лиц')
}

async function paymentsTableExists(): Promise<boolean> {
  const db = await getDb()
  const row = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customer_legal_payments'`,
  )
  return Boolean(row?.name)
}

function groupPayments(rows: PaymentFileRow[]): LegalPayment[] {
  const byId = new Map<number, LegalPayment>()
  for (const row of rows) {
    let payment = byId.get(row.id)
    if (!payment) {
      payment = {
        id: row.id,
        customer_id: row.customer_id,
        amount: roundMoney(Number(row.amount) || 0),
        paid_at: reconciliationCalendarDate(row.paid_at),
        notes: row.notes?.trim() || null,
        created_by: row.created_by == null ? null : Number(row.created_by),
        created_by_name: row.created_by_name?.trim() || null,
        created_at: row.created_at,
        files: [],
      }
      byId.set(row.id, payment)
    }
    if (row.file_id != null) {
      payment.files.push({
        id: Number(row.file_id),
        original_name: row.original_name?.trim() || 'document',
        mime: row.mime?.trim() || null,
        size: Number(row.size) || 0,
      })
    }
  }
  return Array.from(byId.values())
}

const PAYMENT_SELECT = `
  SELECT p.id, p.customer_id, p.amount, p.paid_at, p.notes, p.created_by, p.created_at,
         u.name AS created_by_name,
         f.id AS file_id, f.original_name, f.mime, f.size, f.filename
  FROM customer_legal_payments p
  LEFT JOIN users u ON u.id = p.created_by
  LEFT JOIN customer_legal_payment_files f ON f.payment_id = p.id
`

export async function listLegalPayments(customerId: number): Promise<LegalPayment[]> {
  if (!(await paymentsTableExists())) return []
  const db = await getDb()
  const rows = (await db.all(
    `${PAYMENT_SELECT}
     WHERE p.customer_id = ?
     ORDER BY p.paid_at DESC, p.id DESC, f.id ASC`,
    [customerId],
  )) as PaymentFileRow[]
  return groupPayments(rows)
}

export function creditsFromPayments(payments: LegalPayment[]): ReconciliationCredit[] {
  return payments.map((payment) => {
    const fileName = payment.files[0]?.original_name
    const note = payment.notes?.trim()
    const document = note
      ? `Поступление: ${note.slice(0, 80)}`
      : fileName
        ? `Поступление: ${fileName.slice(0, 80)}`
        : 'Поступление'
    return {
      id: payment.id,
      date: payment.paid_at,
      amount: payment.amount,
      document,
    }
  })
}

export async function listLegalPaymentCredits(customerId: number): Promise<ReconciliationCredit[]> {
  return creditsFromPayments(await listLegalPayments(customerId))
}

export async function createLegalPayment(input: {
  customerId: number
  amount: unknown
  paidAt: unknown
  notes?: unknown
  createdBy?: number | null
  files: Array<{ buffer?: Buffer; originalname?: string; mimetype?: string }>
}): Promise<LegalPayment> {
  await assertLegalCustomer(input.customerId)
  const amount = parseLegalPaymentAmount(input.amount)
  const paidAt = parseLegalPaymentDate(input.paidAt)
  const notes = String(input.notes ?? '').trim().slice(0, 500) || null
  const incoming = input.files.filter((file) => file.buffer && file.buffer.length > 0)
  if (incoming.length === 0) throw new Error('Приложите подтверждающий документ')

  const stored = incoming.map((file) => {
    const originalName = displayFileName(file.originalname)
    const saved = saveBufferToLegalPayments(file.buffer, originalName)
    if (!saved) throw new Error('Не удалось сохранить подтверждающий документ')
    return {
      ...saved,
      originalName,
      mime: file.mimetype?.trim() || null,
    }
  })

  const db = await getDb()
  const now = new Date().toISOString()
  let paymentId = 0
  try {
    const result = await db.run(
      `INSERT INTO customer_legal_payments (
        customer_id, amount, paid_at, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.customerId, amount, paidAt, notes, input.createdBy ?? null, now, now],
    )
    paymentId = Number((result as { lastID?: number }).lastID)
    if (!paymentId) throw new Error('Не удалось сохранить поступление')
    for (const file of stored) {
      await db.run(
        `INSERT INTO customer_legal_payment_files (
          payment_id, filename, original_name, mime, size, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [paymentId, file.filename, file.originalName, file.mime, file.size, now],
      )
    }
    const rows = (await db.all(
      `${PAYMENT_SELECT} WHERE p.id = ? ORDER BY f.id ASC`,
      [paymentId],
    )) as PaymentFileRow[]
    const payment = groupPayments(rows)[0]
    if (!payment) throw new Error('Не удалось сохранить поступление')
    return payment
  } catch (error) {
    if (paymentId) {
      await db.run('DELETE FROM customer_legal_payment_files WHERE payment_id = ?', [paymentId]).catch(() => undefined)
      await db.run('DELETE FROM customer_legal_payments WHERE id = ?', [paymentId]).catch(() => undefined)
    }
    for (const file of stored) {
      const path = resolveSafeExistingPath([legalPaymentsDir], file.filename)
      if (path) fs.unlinkSync(path)
    }
    throw error
  }
}

export async function deleteLegalPayment(customerId: number, paymentId: number): Promise<void> {
  await assertLegalCustomer(customerId)
  const db = await getDb()
  const files = (await db.all(
    `SELECT f.filename
     FROM customer_legal_payment_files f
     JOIN customer_legal_payments p ON p.id = f.payment_id
     WHERE p.id = ? AND p.customer_id = ?`,
    [paymentId, customerId],
  )) as Array<{ filename: string }>
  const result = await db.run(
    'DELETE FROM customer_legal_payments WHERE id = ? AND customer_id = ?',
    [paymentId, customerId],
  )
  if (Number((result as { changes?: number }).changes) === 0) throw new Error('Поступление не найдено')
  await db.run('DELETE FROM customer_legal_payment_files WHERE payment_id = ?', [paymentId])
  for (const file of files) {
    const path = resolveSafeExistingPath([legalPaymentsDir], file.filename)
    if (path) fs.unlinkSync(path)
  }
}

export async function readLegalPaymentFile(
  customerId: number,
  paymentId: number,
  fileId: number,
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  await assertLegalCustomer(customerId)
  const db = await getDb()
  const row = await db.get<{ filename: string; original_name: string; mime: string | null }>(
    `SELECT f.filename, f.original_name, f.mime
     FROM customer_legal_payment_files f
     JOIN customer_legal_payments p ON p.id = f.payment_id
     WHERE f.id = ? AND p.id = ? AND p.customer_id = ?`,
    [fileId, paymentId, customerId],
  )
  if (!row) throw new Error('Файл не найден')
  const path = resolveSafeExistingPath([legalPaymentsDir], row.filename)
  if (!path) throw new Error('Файл не найден')
  return {
    buffer: fs.readFileSync(path),
    filename: row.original_name || 'document',
    mimeType: row.mime?.trim() || 'application/octet-stream',
  }
}
