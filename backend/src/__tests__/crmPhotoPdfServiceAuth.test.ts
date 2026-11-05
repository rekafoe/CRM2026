import { getDb } from '../config/database'
import { CrmPhotoPdfError, startCrmPhotoPdf } from '../services/crmPhotoPdfService'

describe('startCrmPhotoPdf website source gate', () => {
  let websiteOrderId: number
  let crmOrderId: number

  beforeAll(async () => {
    const db = await getDb()
    const stamp = Date.now()
    const website = await db.run(
      `INSERT INTO orders (number, status, source, createdAt) VALUES (?, ?, ?, ?)`,
      `PDF-WEB-${stamp}`,
      1,
      'website',
      new Date().toISOString(),
    )
    websiteOrderId = website.lastID!
    const crm = await db.run(
      `INSERT INTO orders (number, status, source, createdAt) VALUES (?, ?, ?, ?)`,
      `PDF-CRM-${stamp}`,
      1,
      'crm',
      new Date().toISOString(),
    )
    crmOrderId = crm.lastID!
  })

  it('rejects CRM-source orders even with a valid website API caller', async () => {
    try {
      await startCrmPhotoPdf(crmOrderId, [{
        orderId: 'photo-1',
        orderType: 'photo',
        printType: 'digital',
        orderName: 'Стандарт - test',
        items: [{ mockupId: 'm1', quantity: 1 }],
      }])
      throw new Error('expected CrmPhotoPdfError')
    } catch (error) {
      expect(error).toBeInstanceOf(CrmPhotoPdfError)
      expect((error as CrmPhotoPdfError).status).toBe(403)
    }
  })

  it('allows website-source orders to pass the source gate (empty plan is not 403)', async () => {
    const result = await startCrmPhotoPdf(websiteOrderId, [])
    expect(result).toEqual({ started: false, count: 0, alreadyRunning: false })
  })
})
