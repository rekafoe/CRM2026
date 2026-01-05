import fs from 'fs'
import os from 'os'
import path from 'path'

describe('seedDemoData', () => {
  const tmpDbPath = path.join(os.tmpdir(), `seed-demo-${Date.now()}.db`)

  beforeAll(() => {
    process.env.DB_FILE = tmpDbPath
    jest.resetModules()
  })

  afterAll(() => {
    try {
      if (fs.existsSync(tmpDbPath)) {
        fs.unlinkSync(tmpDbPath)
      }
    } catch {
      // ignore cleanup errors
    }
  })

  it('populates baseline data and remains idempotent', async () => {
    const { seedDemoData } = require('../scripts/seedDemoData')
    const { getDb } = require('../db')

    await seedDemoData()

    const db = await getDb()

    const statusRow = (await db.get('SELECT COUNT(1) as c FROM order_statuses')) as { c: number }
    expect(Number(statusRow?.c)).toBeGreaterThanOrEqual(5)

    const adminRow = (await db.get('SELECT COUNT(1) as c FROM users WHERE name = ?', 'Админ')) as { c: number }
    expect(Number(adminRow?.c)).toBe(1)

    await seedDemoData()

    const statusRowAfter = (await db.get('SELECT COUNT(1) as c FROM order_statuses')) as { c: number }
    expect(Number(statusRowAfter?.c)).toEqual(Number(statusRow?.c))

    const adminRowAfter = (await db.get('SELECT COUNT(1) as c FROM users WHERE name = ?', 'Админ')) as { c: number }
    expect(Number(adminRowAfter?.c)).toEqual(1)
  })
})

