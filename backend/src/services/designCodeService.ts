import { getDb } from '../config/database'

const MAX_DESIGN_CODE = 999999

export function formatDesignCode(n: number): string {
  return String(n).padStart(6, '0')
}

export function isValidDesignCode(code: unknown): boolean {
  return typeof code === 'string' && /^\d{6}$/.test(code)
}

/** Выделяет следующий свободный 6-значный код (000001–999999) под блокировкой seq. */
export async function allocateNextDesignCode(): Promise<string> {
  const db = await getDb()
  await db.run('BEGIN IMMEDIATE')
  try {
    let row = await db.get<{ next_code: number }>('SELECT next_code FROM design_code_seq WHERE id = 1')
    if (!row) {
      await db.run('INSERT INTO design_code_seq (id, next_code) VALUES (1, 1)')
      row = { next_code: 1 }
    }
    let next = Number(row.next_code)
    if (!Number.isFinite(next) || next < 1) next = 1
    if (next > MAX_DESIGN_CODE) {
      throw new Error('Исчерпан диапазон design_code (000001–999999)')
    }
    // Пропускаем коды, которые уже заняты (ручной/legacy).
    for (;;) {
      if (next > MAX_DESIGN_CODE) {
        throw new Error('Исчерпан диапазон design_code (000001–999999)')
      }
      const code = formatDesignCode(next)
      const taken = await db.get<{ id: number }>(
        'SELECT id FROM design_templates WHERE design_code = ? LIMIT 1',
        [code],
      )
      next += 1
      if (!taken) {
        await db.run('UPDATE design_code_seq SET next_code = ? WHERE id = 1', [next])
        await db.run('COMMIT')
        return code
      }
    }
  } catch (err) {
    try {
      await db.run('ROLLBACK')
    } catch {
      /* noop */
    }
    throw err
  }
}
