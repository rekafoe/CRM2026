import fs from 'fs'
import express from 'express'
import request from 'supertest'
import { initDB, getDb } from '../config/database'
import { legalPaymentsDir, resolveSafeExistingPath, uploadMemory } from '../config/upload'
import { errorHandler } from '../middleware/errorHandler'
import customerRoutes from '../modules/customers/routes/customers'
import { CustomerService } from '../modules/customers/services/customerService'
import { deleteLegalPayment } from '../services/customerLegalPaymentService'

const RTF = Buffer.from('{\\rtf1\\ansi\\deff0 {\\f0 Платёжное поручение 120,50}}', 'utf8')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'utf8')
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
const DOCX = Buffer.from('PK\u0003\u0004docx-placeholder', 'utf8')
const XLSX = Buffer.from('PK\u0003\u0004xlsx-placeholder', 'utf8')

function app() {
  const server = express()
  server.use('/api/customers', customerRoutes)
  server.use(errorHandler)
  return server
}

async function latestFile(customerId: number): Promise<{
  payment_id: number
  filename: string
  original_name: string
  mime: string | null
}> {
  const db = await getDb()
  const row = await db.get<{
    payment_id: number
    filename: string
    original_name: string
    mime: string | null
  }>(
    `SELECT f.payment_id, f.filename, f.original_name, f.mime
     FROM customer_legal_payment_files f
     JOIN customer_legal_payments p ON p.id = f.payment_id
     WHERE p.customer_id = ?
     ORDER BY f.id DESC
     LIMIT 1`,
    [customerId],
  )
  if (!row) throw new Error('файл поступления не записан')
  return row
}

describe('POST /api/customers/:id/legal-payments RTF', () => {
  const stamp = `ZZRTF${Date.now()}`
  let customerId = 0

  beforeAll(async () => {
    await initDB()
    const created = await CustomerService.createCustomer({
      type: 'legal',
      company_name: `ООО ${stamp}`,
    })
    customerId = created.id
  })

  afterAll(async () => {
    if (!customerId) return
    const db = await getDb()
    const payments = (await db.all(
      'SELECT id FROM customer_legal_payments WHERE customer_id = ?',
      [customerId],
    )) as Array<{ id: number }>
    for (const payment of payments) {
      await deleteLegalPayment(customerId, payment.id).catch(() => undefined)
    }
    await CustomerService.deleteCustomer(customerId).catch(() => undefined)
  })

  async function upload(
    filename: string,
    contentType: string,
    body: Buffer = RTF,
    fields: Record<string, string> = {},
  ) {
    const req = request(app())
      .post(`/api/customers/${customerId}/legal-payments`)
      .field('amount', fields.amount || '120,50')
      .field('paid_at', fields.paid_at || '2026-11-11')
    return req.attach('files', body, { filename, contentType })
  }

  it('принимает RTF-платёжку и сохраняет байты', async () => {
    const res = await upload('Платёжка.rtf', 'application/rtf')
    expect(res.status).toBe(201)
    expect(res.body.payments[0].amount).toBe(120.5)
    expect(res.body.payments[0].files[0].original_name).toBe('Платёжка.rtf')

    const stored = await latestFile(customerId)
    expect(stored.filename.endsWith('.rtf')).toBe(true)
    expect(stored.mime).toBe('application/rtf')
    const path = resolveSafeExistingPath([legalPaymentsDir], stored.filename)
    expect(path).toBeTruthy()
    expect(fs.readFileSync(path as string).equals(RTF)).toBe(true)

    const downloaded = await request(app()).get(
      `/api/customers/${customerId}/legal-payments/${stored.payment_id}/files/${res.body.payments[0].files[0].id}`,
    )
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers['content-type']).toMatch(/application\/rtf/)
  })

  it.each([
    ['text/rtf', 'platezhka.rtf'],
    ['application/octet-stream', 'platezhka.rtf'],
    ['application/msword', 'platezhka.rtf'],
    ['application/rtf', 'PLATEZHKA.RTF'],
    ['text/rtf', 'platezhka.rtf '],
  ])('принимает RTF с MIME %s и именем %j', async (contentType, filename) => {
    const res = await upload(filename, contentType)
    expect(res.status).toBe(201)
    const stored = await latestFile(customerId)
    expect(stored.filename.endsWith('.rtf')).toBe(true)
    const path = resolveSafeExistingPath([legalPaymentsDir], stored.filename)
    expect(fs.readFileSync(path as string).equals(RTF)).toBe(true)
  })

  it('дописывает .rtf, если банк-клиент прислал RTF без расширения', async () => {
    const res = await upload('platezhka', 'application/rtf')
    expect(res.status).toBe(201)
    expect(res.body.payments[0].files[0].original_name).toBe('platezhka.rtf')
    const stored = await latestFile(customerId)
    expect(stored.filename.endsWith('.rtf')).toBe(true)
  })

  it('по-прежнему принимает прежние форматы подтверждения', async () => {
    const cases: Array<[string, string, Buffer]> = [
      ['scan.pdf', 'application/pdf', PDF],
      ['scan.jpg', 'image/jpeg', JPEG],
      ['scan.jpeg', 'image/jpeg', JPEG],
      ['scan.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
      ['scan.webp', 'image/webp', Buffer.from('RIFF')],
      ['scan.gif', 'image/gif', Buffer.from('GIF89a')],
      ['scan.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
      ['scan.tif', 'image/tiff', Buffer.from('II')],
      ['scan.tiff', 'image/tiff', Buffer.from('II')],
      ['scan.doc', 'application/msword', Buffer.from('doc')],
      ['scan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX],
      ['scan.xls', 'application/vnd.ms-excel', Buffer.from('xls')],
      ['scan.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', XLSX],
    ]
    for (const [filename, contentType, body] of cases) {
      const res = await upload(filename, contentType, body, { amount: '10' })
      expect(res.status).toBe(201)
      const stored = await latestFile(customerId)
      expect(stored.original_name).toBe(filename)
      expect(stored.filename.endsWith(filename.slice(filename.lastIndexOf('.')))).toBe(true)
      const path = resolveSafeExistingPath([legalPaymentsDir], stored.filename)
      expect(fs.readFileSync(path as string).equals(body)).toBe(true)
    }
  })

  it('принимает PDF и RTF в одном поступлении', async () => {
    const res = await request(app())
      .post(`/api/customers/${customerId}/legal-payments`)
      .field('amount', '15')
      .field('paid_at', '2026-11-11')
      .attach('files', PDF, { filename: 'scan.pdf', contentType: 'application/pdf' })
      .attach('files', RTF, { filename: 'platezhka.rtf', contentType: 'application/rtf' })
    expect(res.status).toBe(201)
    const names = res.body.payments[0].files.map((file: { original_name: string }) => file.original_name)
    expect(names).toEqual(['scan.pdf', 'platezhka.rtf'])
  })

  it('чужой тип файла отвечает 400, а не 500', async () => {
    const db = await getDb()
    const before = await db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM customer_legal_payments WHERE customer_id = ?',
      [customerId],
    )
    const res = await upload('virus.exe', 'application/octet-stream', Buffer.from('MZ'))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/RTF/)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    const after = await db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM customer_legal_payments WHERE customer_id = ?',
      [customerId],
    )
    expect(after?.n).toBe(before?.n)
  })

  it('общий uploadMemory не начинает принимать RTF', async () => {
    const server = express()
    server.post('/img', uploadMemory.single('image'), (_req, res) => {
      res.status(201).json({ ok: true })
    })
    server.use(errorHandler)
    const res = await request(server)
      .post('/img')
      .attach('image', RTF, { filename: 'a.rtf', contentType: 'application/rtf' })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).not.toBe(201)
  })
})
