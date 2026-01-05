import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'

type QuickTemplateRow = {
  id: string
  name: string
  description: string
  icon: string
  category: string
  popularity: number
  specs_json: string
}

const router = Router()

// GET /api/quick-templates
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { category, q, limit } = req.query as any
    const params: any[] = []
    const where: string[] = ['is_active = 1']

    if (category && category !== 'all') {
      where.push('category = ?')
      params.push(String(category))
    }

    if (q && String(q).trim()) {
      where.push('(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)')
      const needle = `%${String(q).toLowerCase()}%`
      params.push(needle, needle)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const limitNum = Number(limit)
    const limitSql = Number.isFinite(limitNum) && limitNum > 0 ? `LIMIT ${Math.min(200, Math.floor(limitNum))}` : ''

    const db = await getDb()
    const rows = (await db.all(
      `
      SELECT id, name, description, icon, category, popularity, specs_json
      FROM quick_templates
      ${whereSql}
      ORDER BY popularity DESC, name ASC
      ${limitSql}
      `,
      ...params
    )) as QuickTemplateRow[]

    const out = rows.map((r) => {
      let specs: any = {}
      try {
        specs = r.specs_json ? JSON.parse(r.specs_json) : {}
      } catch {
        specs = {}
      }

      return {
        id: r.id,
        name: r.name,
        description: r.description,
        icon: r.icon,
        category: r.category,
        popularity: r.popularity,
        specs
      }
    })

    res.json(out)
  })
)

export default router


