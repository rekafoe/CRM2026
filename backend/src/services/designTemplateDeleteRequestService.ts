import { getDb } from '../config/database'
import { deleteDesignTemplate } from './designTemplateService'

export type DesignTemplateDeleteRequestStatus = 'pending' | 'rejected' | 'confirmed'

export interface DesignTemplateDeleteRequest {
  id: number
  design_template_id: number
  design_code: string | null
  template_name: string | null
  requested_by_user_id: number
  requested_by_name: string | null
  requested_at: string
  status: DesignTemplateDeleteRequestStatus
  resolved_by_user_id: number | null
  resolved_at: string | null
}

const REQUEST_SELECT = `
  r.id, r.design_template_id, r.requested_by_user_id, r.requested_at, r.status,
  r.resolved_by_user_id, r.resolved_at,
  dt.design_code AS design_code, dt.name AS template_name,
  u.name AS requested_by_name
`

function mapRequest(row: Record<string, unknown>): DesignTemplateDeleteRequest {
  const status = String(row.status || 'pending')
  return {
    id: Number(row.id),
    design_template_id: Number(row.design_template_id),
    design_code: row.design_code != null ? String(row.design_code) : null,
    template_name: row.template_name != null ? String(row.template_name) : null,
    requested_by_user_id: Number(row.requested_by_user_id),
    requested_by_name: row.requested_by_name != null ? String(row.requested_by_name) : null,
    requested_at: String(row.requested_at ?? ''),
    status: (status === 'rejected' || status === 'confirmed' ? status : 'pending'),
    resolved_by_user_id: row.resolved_by_user_id != null ? Number(row.resolved_by_user_id) : null,
    resolved_at: row.resolved_at != null ? String(row.resolved_at) : null,
  }
}

async function getRequestById(id: number): Promise<DesignTemplateDeleteRequest | null> {
  const db = await getDb()
  const row = await db.get(
    `SELECT ${REQUEST_SELECT}
     FROM design_template_delete_requests r
     JOIN design_templates dt ON dt.id = r.design_template_id
     LEFT JOIN users u ON u.id = r.requested_by_user_id
     WHERE r.id = ?`,
    id,
  ) as Record<string, unknown> | undefined
  return row ? mapRequest(row) : null
}

export async function listDesignTemplateDeleteRequests(opts: {
  status?: DesignTemplateDeleteRequestStatus
  requestedByUserId?: number
} = {}): Promise<DesignTemplateDeleteRequest[]> {
  const status = opts.status ?? 'pending'
  const params: Array<string | number> = [status]
  let requesterSql = ''
  if (opts.requestedByUserId != null) {
    requesterSql = ' AND r.requested_by_user_id = ?'
    params.push(opts.requestedByUserId)
  }
  const db = await getDb()
  const rows = await db.all(
    `SELECT ${REQUEST_SELECT}
     FROM design_template_delete_requests r
     JOIN design_templates dt ON dt.id = r.design_template_id
     LEFT JOIN users u ON u.id = r.requested_by_user_id
     WHERE r.status = ?${requesterSql}
     ORDER BY r.requested_at ASC, r.id ASC`,
    params,
  ) as Record<string, unknown>[]
  return rows.map(mapRequest)
}

export async function requestDesignTemplateDeletion(
  templateId: number,
  userId: number,
): Promise<DesignTemplateDeleteRequest> {
  const db = await getDb()
  const pending = await db.get(
    `SELECT ${REQUEST_SELECT}
     FROM design_template_delete_requests r
     JOIN design_templates dt ON dt.id = r.design_template_id
     LEFT JOIN users u ON u.id = r.requested_by_user_id
     WHERE r.design_template_id = ? AND r.status = 'pending'`,
    templateId,
  ) as Record<string, unknown> | undefined
  if (pending) return mapRequest(pending)

  let requestId = 0
  try {
    const result = await db.run(
      `INSERT INTO design_template_delete_requests (design_template_id, requested_by_user_id, status)
       VALUES (?, ?, 'pending')`,
      templateId,
      userId,
    )
    requestId = Number(result.lastID)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/UNIQUE|constraint/i.test(message)) throw err
    const again = await db.get(
      `SELECT ${REQUEST_SELECT}
       FROM design_template_delete_requests r
       JOIN design_templates dt ON dt.id = r.design_template_id
       LEFT JOIN users u ON u.id = r.requested_by_user_id
       WHERE r.design_template_id = ? AND r.status = 'pending'`,
      templateId,
    ) as Record<string, unknown> | undefined
    if (again) return mapRequest(again)
    throw err
  }

  const created = await getRequestById(requestId)
  if (!created) throw new Error('Не удалось создать запрос на удаление')
  return created
}

export async function confirmDesignTemplateDeletion(requestId: number): Promise<boolean> {
  const db = await getDb()
  const row = await db.get<{ id: number; design_template_id: number; status: string }>(
    `SELECT id, design_template_id, status FROM design_template_delete_requests WHERE id = ?`,
    requestId,
  )
  if (!row || row.status !== 'pending') return false
  return deleteDesignTemplate(row.design_template_id)
}

export async function rejectDesignTemplateDeletion(
  requestId: number,
  adminId: number,
): Promise<DesignTemplateDeleteRequest | null> {
  const db = await getDb()
  const result = await db.run(
    `UPDATE design_template_delete_requests
     SET status = 'rejected', resolved_by_user_id = ?, resolved_at = datetime('now')
     WHERE id = ? AND status = 'pending'`,
    adminId,
    requestId,
  )
  if (!result.changes) return null
  return getRequestById(requestId)
}
