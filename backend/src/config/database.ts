import { initDB } from '../db'
import { Database } from 'sqlite'

export { initDB }

let dbInstance: Database | null = null

export const getDb = async (): Promise<Database> => {
  if (!dbInstance) {
    dbInstance = await initDB()
  }
  return dbInstance
}

export const db = {
  get: async <T = any>(sql: string, ...params: any[]): Promise<T | undefined> => {
    const database = await getDb()
    return database.get<T>(sql, ...params)
  },
  all: async <T = any>(sql: string, ...params: any[]): Promise<T[]> => {
    const database = await getDb()
    return database.all<T>(sql, ...params) as Promise<T[]>
  },
  run: async (sql: string, ...params: any[]): Promise<{ lastID?: number; changes: number }> => {
    const database = await getDb()
    const result = await database.run(sql, ...params)
    return { lastID: result.lastID, changes: result.changes || 0 }
  }
}
