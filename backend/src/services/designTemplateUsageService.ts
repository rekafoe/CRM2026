import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'

const DESIGN_TEMPLATE_ID_EXPR = `
  CAST(NULLIF(TRIM(COALESCE(CAST(json_extract(i.params, '$.designTemplateId') AS TEXT), '')), '') AS INTEGER)
`.trim()

export type DesignTemplateUsageQuery = {
  period?: string
  date_from?: string
  date_to?: string
  limit?: string
}

export type DesignTemplateUsageRow = {
  design_template_id: number
  name: string
  category_id: number | null
  category: string | null
  is_active: number
  preview_url: string | null
  line_count: number
  order_count: number
  total_quantity: number
  total_revenue: number
  draft_count: number
  last_used_at: string | null
  share_percent: number
}

export type DesignTemplateUsageCategoryRow = {
  category_id: number | null
  category_name: string
  line_count: number
  order_count: number
  total_quantity: number
  share_percent: number
}

export type DesignTemplateUnusedRow = {
  id: number
  name: string
  category_id: number | null
  category: string | null
  is_active: number
  ever_used: boolean
}

export type DesignTemplateUsageAnalytics = {
  period: {
    days: number | null
    startDate: string
    endDate?: string
    allTime: boolean
  }
  summary: {
    total_lines_with_template: number
    distinct_templates_used: number
    catalog_templates: number
    unused_in_period: number
    never_used_all_time: number
  }
  by_template: DesignTemplateUsageRow[]
  by_category: DesignTemplateUsageCategoryRow[]
  unused_in_period: DesignTemplateUnusedRow[]
}

function parseDateRange(query: DesignTemplateUsageQuery): {
  startDate: Date | null
  endDate: Date | null
  dateParams: string[]
  orderDateFilter: string
  allTime: boolean
} {
  const allTime = String(query.period ?? '').toLowerCase() === 'all'
  if (allTime) {
    return {
      startDate: null,
      endDate: null,
      dateParams: [],
      orderDateFilter: '1=1',
      allTime: true,
    }
  }

  const dateFrom = query.date_from ? String(query.date_from).trim().slice(0, 10) : null
  const dateTo = query.date_to ? String(query.date_to).trim().slice(0, 10) : null
  const createdExpr = "COALESCE(o.createdAt, o.created_at)"

  if (dateFrom && dateTo) {
    const startDate = new Date(`${dateFrom}T00:00:00.000Z`)
    const endDate = new Date(`${dateTo}T23:59:59.999Z`)
    return {
      startDate,
      endDate,
      dateParams: [startDate.toISOString(), endDate.toISOString()],
      orderDateFilter: `${createdExpr} >= ? AND ${createdExpr} <= ?`,
      allTime: false,
    }
  }

  const days = parseInt(String(query.period ?? '90'), 10) || 90
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  return {
    startDate,
    endDate: null,
    dateParams: [startDate.toISOString()],
    orderDateFilter: `${createdExpr} >= ?`,
    allTime: false,
  }
}

export async function getDesignTemplateUsageAnalytics(
  query: DesignTemplateUsageQuery,
): Promise<DesignTemplateUsageAnalytics> {
  const db = await getDb()
  const range = parseDateRange(query)
  const limitNum = Math.min(200, Math.max(5, parseInt(String(query.limit ?? '50'), 10) || 50))

  const hasIsCancelled = await hasColumn('orders', 'is_cancelled')
  const notCancelledCond = hasIsCancelled
    ? '(o.status != 0 AND COALESCE(o.is_cancelled, 0) = 0)'
    : 'o.status != 0'

  const usageRows = await db.all<Array<{
    design_template_id: number
    line_count: number
    order_count: number
    total_quantity: number
    total_revenue: number
    last_used_at: string | null
  }>>(
    `SELECT
      ${DESIGN_TEMPLATE_ID_EXPR} AS design_template_id,
      COUNT(*) AS line_count,
      COUNT(DISTINCT i.orderId) AS order_count,
      SUM(i.quantity) AS total_quantity,
      SUM(i.price * i.quantity) AS total_revenue,
      MAX(COALESCE(o.createdAt, o.created_at)) AS last_used_at
     FROM items i
     JOIN orders o ON o.id = i.orderId
     WHERE ${DESIGN_TEMPLATE_ID_EXPR} > 0
       AND ${range.orderDateFilter}
       AND ${notCancelledCond}
     GROUP BY design_template_id
     ORDER BY line_count DESC, total_quantity DESC`,
    range.dateParams,
  )

  const draftDateExpr = 'COALESCE(ed.created_at, ed.updated_at)'
  const draftDateFilter = range.allTime
    ? 'ed.design_template_id IS NOT NULL'
    : range.endDate
      ? `${draftDateExpr} >= ? AND ${draftDateExpr} <= ?`
      : `${draftDateExpr} >= ?`

  const draftRows = await db.all<Array<{ design_template_id: number; draft_count: number }>>(
    `SELECT ed.design_template_id, COUNT(*) AS draft_count
     FROM editor_drafts ed
     WHERE ed.design_template_id IS NOT NULL
       AND ${draftDateFilter}
     GROUP BY ed.design_template_id`,
    range.dateParams,
  )
  const draftMap = new Map(draftRows.map((r) => [Number(r.design_template_id), Number(r.draft_count) || 0]))

  const totalLines = usageRows.reduce((s, r) => s + (Number(r.line_count) || 0), 0)
  const usedIds = usageRows.map((r) => Number(r.design_template_id)).filter((id) => id > 0)

  let templateMeta = new Map<number, {
    name: string
    category_id: number | null
    category: string | null
    is_active: number
    preview_url: string | null
  }>()

  if (usedIds.length > 0) {
    const placeholders = usedIds.map(() => '?').join(',')
    const metaRows = await db.all<Array<{
      id: number
      name: string
      category_id: number | null
      category: string | null
      is_active: number
      preview_url: string | null
    }>>(
      `SELECT dt.id, dt.name, dt.category_id,
        COALESCE(c.name, dt.category) AS category,
        dt.is_active, dt.preview_url
       FROM design_templates dt
       LEFT JOIN design_template_categories c ON c.id = dt.category_id
       WHERE dt.id IN (${placeholders})`,
      usedIds,
    )
    templateMeta = new Map(metaRows.map((r) => [Number(r.id), {
      name: String(r.name),
      category_id: r.category_id != null ? Number(r.category_id) : null,
      category: r.category != null ? String(r.category) : null,
      is_active: Number(r.is_active) ? 1 : 0,
      preview_url: r.preview_url != null ? String(r.preview_url) : null,
    }]))
  }

  const by_template: DesignTemplateUsageRow[] = usageRows
    .filter((r) => Number(r.design_template_id) > 0)
    .slice(0, limitNum)
    .map((r) => {
      const id = Number(r.design_template_id)
      const meta = templateMeta.get(id)
      const lineCount = Number(r.line_count) || 0
      return {
        design_template_id: id,
        name: meta?.name ?? `Шаблон #${id}`,
        category_id: meta?.category_id ?? null,
        category: meta?.category ?? null,
        is_active: meta?.is_active ?? 0,
        preview_url: meta?.preview_url ?? null,
        line_count: lineCount,
        order_count: Number(r.order_count) || 0,
        total_quantity: Number(r.total_quantity) || 0,
        total_revenue: Math.round((Number(r.total_revenue) || 0) * 100) / 100,
        draft_count: draftMap.get(id) ?? 0,
        last_used_at: r.last_used_at != null ? String(r.last_used_at) : null,
        share_percent: totalLines > 0 ? Math.round((lineCount / totalLines) * 1000) / 10 : 0,
      }
    })

  const categoryBuckets = new Map<string, DesignTemplateUsageCategoryRow>()
  for (const row of by_template) {
    const key = row.category_id != null ? `id:${row.category_id}` : `n:${row.category ?? ''}`
    const label = row.category?.trim() || 'Без категории'
    const existing = categoryBuckets.get(key) ?? {
      category_id: row.category_id,
      category_name: label,
      line_count: 0,
      order_count: 0,
      total_quantity: 0,
      share_percent: 0,
    }
    existing.line_count += row.line_count
    existing.order_count += row.order_count
    existing.total_quantity += row.total_quantity
    categoryBuckets.set(key, existing)
  }
  const by_category = [...categoryBuckets.values()]
    .map((c) => ({
      ...c,
      share_percent: totalLines > 0 ? Math.round((c.line_count / totalLines) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.line_count - a.line_count)

  const catalogRow = await db.get<{ c: number }>('SELECT COUNT(*) AS c FROM design_templates')
  const catalogTemplates = Number(catalogRow?.c) || 0

  const allTemplates = await db.all<Array<{
    id: number
    name: string
    category_id: number | null
    category: string | null
    is_active: number
  }>>(
    `SELECT dt.id, dt.name, dt.category_id, COALESCE(c.name, dt.category) AS category, dt.is_active
     FROM design_templates dt
     LEFT JOIN design_template_categories c ON c.id = dt.category_id
     ORDER BY dt.sort_order ASC, dt.name ASC`,
  )

  const usedIdSet = new Set(usedIds)
  const everUsedRows = await db.all<Array<{ design_template_id: number }>>(
    `SELECT DISTINCT ${DESIGN_TEMPLATE_ID_EXPR} AS design_template_id
     FROM items i
     JOIN orders o ON o.id = i.orderId
     WHERE ${DESIGN_TEMPLATE_ID_EXPR} > 0 AND ${notCancelledCond}`,
  )
  const everUsedSet = new Set(
    everUsedRows.map((r) => Number(r.design_template_id)).filter((id) => id > 0),
  )

  const unused_in_period: DesignTemplateUnusedRow[] = allTemplates
    .filter((t) => !usedIdSet.has(Number(t.id)))
    .map((t) => ({
      id: Number(t.id),
      name: String(t.name),
      category_id: t.category_id != null ? Number(t.category_id) : null,
      category: t.category != null ? String(t.category) : null,
      is_active: Number(t.is_active) ? 1 : 0,
      ever_used: everUsedSet.has(Number(t.id)),
    }))

  const days = range.allTime
    ? null
    : range.endDate && range.startDate
      ? Math.ceil((range.endDate.getTime() - range.startDate.getTime()) / 86400000)
      : range.startDate
        ? Math.ceil((Date.now() - range.startDate.getTime()) / 86400000)
        : 90

  return {
    period: {
      days,
      startDate: range.startDate?.toISOString() ?? '',
      endDate: range.endDate?.toISOString(),
      allTime: range.allTime,
    },
    summary: {
      total_lines_with_template: totalLines,
      distinct_templates_used: usedIdSet.size,
      catalog_templates: catalogTemplates,
      unused_in_period: unused_in_period.length,
      never_used_all_time: allTemplates.filter((t) => !everUsedSet.has(Number(t.id))).length,
    },
    by_template,
    by_category,
    unused_in_period,
  }
}
