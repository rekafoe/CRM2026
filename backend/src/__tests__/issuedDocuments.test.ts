import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { getDb } from '../config/database'
import { up } from '../migrations/20261027190000_issued_documents_and_vat_rate'
import { issueOrReuse, readIssuedFileForCustomer } from '../services/issuedDocumentService'
import { amountInWordsBel } from '../utils/amountInWordsBel'
import { applyVatToAmounts } from '../utils/documentVat'
import { pricedSlices } from '../utils/pricedSlices'

jest.mock('../config/database', () => ({
  getDb: jest.fn(),
}))

describe('price times quantity', () => {
  it('splits 10.00 across 3 pieces without a one-kopeck gap', () => {
    const slices = pricedSlices(10, 3)
    expect(slices).toEqual([
      { quantity: 2, price: 3.33, amount: 6.66 },
      { quantity: 1, price: 3.34, amount: 3.34 },
    ])
    expect(slices.reduce((sum, slice) => sum + slice.amount, 0)).toBeCloseTo(10, 2)
    for (const slice of slices) {
      expect(Math.round(slice.price * slice.quantity * 100)).toBe(Math.round(slice.amount * 100))
    }
  })

  it('keeps one line when two decimal places already match', () => {
    expect(pricedSlices(10, 12.5)).toEqual([{ quantity: 12.5, price: 0.8, amount: 10 }])
  })

  it('keeps a zero amount as a zero price', () => {
    expect(pricedSlices(0, 4)).toEqual([{ quantity: 4, price: 0, amount: 0 }])
  })
})

describe('amount in words', () => {
  it('uses Belarusian rubles on the receipt and on the act', () => {
    const words = amountInWordsBel(100)
    expect(words).toContain('белорусских')
    expect(words).toContain('00 копеек')
    expect(amountInWordsBel(10.01)).toContain('белорусских рублей')
  })
})

describe('vat from the organization', () => {
  it('writes Без НДС when the rate is empty and keeps the line amount when a rate is set', () => {
    expect(applyVatToAmounts([{ amount: 10 }], null)[0].vatRate).toBe('Без НДС')
    const withVat = applyVatToAmounts([{ amount: 10 }], 20)
    expect(withVat[0].vatRate).toBe('20%')
    expect(withVat[0].totalWithVat).toBe(10)
    expect(withVat[0].vatAmount).toBe(1.67)
  })
})

describe('issued documents', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE organizations (id INTEGER PRIMARY KEY, name TEXT, unp TEXT);
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        type TEXT,
        company_name TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      INSERT INTO customers (id, type, company_name, created_at, updated_at) VALUES
        (1, 'legal', 'ООО Тест', datetime('now'), datetime('now')),
        (2, 'individual', 'Иван', datetime('now'), datetime('now'));
      CREATE TABLE order_statuses (id INTEGER PRIMARY KEY, code TEXT, name TEXT);
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER,
        status INTEGER,
        created_at TEXT,
        createdAt TEXT,
        discount_percent REAL
      );
      INSERT INTO orders (id, customer_id, status, created_at) VALUES (42, 1, 0, '2026-10-27');
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        orderId INTEGER,
        price REAL,
        quantity REAL,
        params TEXT
      );
      CREATE TABLE customer_legal_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        order_id INTEGER,
        title TEXT NOT NULL,
        document_kind TEXT,
        issued_at TEXT NOT NULL,
        returned_at TEXT,
        notes TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `)
    await up(db)
    ;(getDb as jest.Mock).mockResolvedValue(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('reserves a number, stores the file, and reprints the same bytes', async () => {
    const first = await issueOrReuse({
      kind: 'act',
      orderIds: [42],
      customerId: 1,
      organizationId: null,
      sourceHash: 'hash-a',
      totalAmount: 10,
      mimeType: 'application/pdf',
      filenameFor: (number) => `act-${number}.pdf`,
      render: async ({ number }) => Buffer.from(`act ${number}`),
    })
    expect(first.number).toBe('А-00001')

    const again = await issueOrReuse({
      kind: 'act',
      orderIds: [42],
      customerId: 1,
      organizationId: null,
      sourceHash: 'hash-a',
      totalAmount: 10,
      mimeType: 'application/pdf',
      filenameFor: () => 'should-not-matter.pdf',
      render: async () => {
        throw new Error('повтор не должен собирать документ заново')
      },
    })
    expect(again.id).toBe(first.id)
    expect(again.number).toBe('А-00001')
    expect(again.buffer.toString()).toBe('act А-00001')

    const changed = await issueOrReuse({
      kind: 'act',
      orderIds: [42],
      customerId: 1,
      organizationId: null,
      sourceHash: 'hash-b',
      totalAmount: 12,
      mimeType: 'application/pdf',
      filenameFor: (number) => `act-${number}.pdf`,
      render: async ({ number }) => Buffer.from(`act ${number}`),
    })
    expect(changed.number).toBe('А-00002')
    expect(changed.buffer.toString()).toBe('act А-00002')

    const journals = await db.all<{ id: number; title: string; issued_document_id: number }>(
      'SELECT id, title, issued_document_id FROM customer_legal_documents ORDER BY id',
    )
    expect(journals).toEqual([
      { id: 1, title: 'Акт А-00001', issued_document_id: first.id },
      { id: 2, title: 'Акт А-00002', issued_document_id: changed.id },
    ])

    const stored = await readIssuedFileForCustomer(1, journals[0].id)
    expect(stored.buffer.toString()).toBe('act А-00001')
    expect(stored.filename).toBe('act-А-00001.pdf')

    await issueOrReuse({
      kind: 'invoice',
      orderIds: [42],
      customerId: 2,
      organizationId: null,
      sourceHash: 'hash-person',
      totalAmount: 1,
      mimeType: 'application/pdf',
      filenameFor: (number) => `invoice-${number}.pdf`,
      render: async () => Buffer.from('invoice'),
    })
    const personRows = await db.get<{ c: number }>(
      'SELECT COUNT(1) as c FROM customer_legal_documents WHERE customer_id = 2',
    )
    expect(Number(personRows?.c)).toBe(0)
    const invoice = await db.get<{ number: string }>('SELECT number FROM issued_documents WHERE kind = ?', ['invoice'])
    expect(invoice?.number).toBe('С-00001')
  })
})
