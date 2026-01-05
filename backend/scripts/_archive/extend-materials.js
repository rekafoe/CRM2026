// Run once script to add missing material columns in dev
const sqlite3 = require('sqlite3')
const { open } = require('sqlite')
const path = require('path')

;(async () => {
  const dbFile = path.resolve(__dirname, '../data.db')
  console.log('Using DB:', dbFile)
  const db = await open({ filename: dbFile, driver: sqlite3.Database })
  const add = async (sql) => {
    try {
      await db.exec(sql)
      console.log('Applied:', sql)
    } catch (e) {
      const msg = String(e && e.message || '')
      if (msg.includes('duplicate column name')) {
        console.log('Skip (exists):', sql)
      } else {
        throw e
      }
    }
  }
  await add('ALTER TABLE materials ADD COLUMN sheet_width REAL')
  await add('ALTER TABLE materials ADD COLUMN sheet_height REAL')
  await add('ALTER TABLE materials ADD COLUMN printable_width REAL')
  await add('ALTER TABLE materials ADD COLUMN printable_height REAL')
  await add('ALTER TABLE materials ADD COLUMN finish TEXT')
  console.log('Done')
  await db.close()
})().catch(e => { console.error(e); process.exit(1) })


