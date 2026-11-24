import { getDb } from '../../config/database'
import {
  InternalTask,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TaskActor,
  TaskPriority,
  TaskStatus,
  TaskWriteInput,
} from './types'

const TASK_SELECT = `
  SELECT
    t.*,
    assignee.name AS assignee_name,
    creator.name AS created_by_name,
    d.name AS department_name
  FROM internal_tasks t
  LEFT JOIN users assignee ON assignee.id = t.assignee_id
  LEFT JOIN users creator ON creator.id = t.created_by
  LEFT JOIN departments d ON d.id = t.department_id
`

export class TaskError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
    this.name = status === 404
      ? 'NotFoundError'
      : status === 403
        ? 'ForbiddenError'
        : status === 401
          ? 'UnauthorizedError'
          : 'ValidationError'
  }
}

function cleanTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TaskError(400, 'VALIDATION_ERROR', 'Название задачи должно быть строкой')
  }
  const title = value.trim()
  if (!title || title.length > 200) {
    throw new TaskError(400, 'VALIDATION_ERROR', 'Название задачи должно содержать от 1 до 200 символов')
  }
  return title
}

function cleanDescription(value: unknown): string {
  if (value == null) return ''
  if (typeof value !== 'string' || value.length > 10000) {
    throw new TaskError(400, 'VALIDATION_ERROR', 'Описание задачи должно быть строкой до 10000 символов')
  }
  return value.trim()
}

function cleanEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  const normalized = value == null || value === '' ? fallback : value
  if (typeof normalized !== 'string' || !allowed.includes(normalized as T)) {
    throw new TaskError(400, 'VALIDATION_ERROR', `Некорректное значение ${label}`)
  }
  return normalized as T
}

function cleanOptionalId(value: unknown, label: string): number | null {
  if (value == null || value === '') return null
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) {
    throw new TaskError(400, 'VALIDATION_ERROR', `${label} должен быть положительным целым числом`)
  }
  return id
}

function cleanDueDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TaskError(400, 'VALIDATION_ERROR', 'Срок должен быть датой в формате YYYY-MM-DD')
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TaskError(400, 'VALIDATION_ERROR', 'Указана несуществующая дата')
  }
  return value
}

function mapTask(row: any): InternalTask {
  return {
    id: Number(row.id),
    title: String(row.title || ''),
    description: String(row.description || ''),
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    dueDate: row.due_date ?? null,
    assigneeId: row.assignee_id == null ? null : Number(row.assignee_id),
    assigneeName: row.assignee_name ?? null,
    departmentId: row.department_id == null ? null : Number(row.department_id),
    departmentName: row.department_name ?? null,
    createdById: row.created_by == null ? null : Number(row.created_by),
    createdByName: row.created_by_name ?? null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    completedAt: row.completed_at ?? null,
  }
}

export class TaskService {
  static async list(): Promise<InternalTask[]> {
    const db = await getDb()
    const rows = await db.all(`${TASK_SELECT}
      ORDER BY
        CASE t.status WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'review' THEN 3 ELSE 4 END,
        CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        t.due_date IS NULL,
        t.due_date,
        t.updated_at DESC,
        t.id DESC`)
    return rows.map(mapTask)
  }

  static async create(actor: TaskActor, input: TaskWriteInput): Promise<InternalTask> {
    const db = await getDb()
    const title = cleanTitle(input.title)
    const description = cleanDescription(input.description)
    const status = cleanEnum(input.status, TASK_STATUSES, 'todo', 'статуса')
    const priority = cleanEnum(input.priority, TASK_PRIORITIES, 'medium', 'приоритета')
    const dueDate = cleanDueDate(input.dueDate)
    const assigneeId = cleanOptionalId(input.assigneeId, 'assigneeId')
    const departmentId = cleanOptionalId(input.departmentId, 'departmentId')
    await this.assertReferences(assigneeId, departmentId)

    const result = await db.run(
      `INSERT INTO internal_tasks
        (title, description, status, priority, due_date, assignee_id, department_id, created_by, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END)`,
      title,
      description,
      status,
      priority,
      dueDate,
      assigneeId,
      departmentId,
      actor.id,
      status,
    )
    return this.getById(Number(result.lastID))
  }

  static async update(id: number, _actor: TaskActor, input: TaskWriteInput): Promise<InternalTask> {
    const existing = await this.getById(id)
    const title = input.title === undefined ? existing.title : cleanTitle(input.title)
    const description = input.description === undefined ? existing.description : cleanDescription(input.description)
    const status = input.status === undefined
      ? existing.status
      : cleanEnum(input.status, TASK_STATUSES, existing.status, 'статуса')
    const priority = input.priority === undefined
      ? existing.priority
      : cleanEnum(input.priority, TASK_PRIORITIES, existing.priority, 'приоритета')
    const dueDate = input.dueDate === undefined ? existing.dueDate : cleanDueDate(input.dueDate)
    const assigneeId = input.assigneeId === undefined
      ? existing.assigneeId
      : cleanOptionalId(input.assigneeId, 'assigneeId')
    const departmentId = input.departmentId === undefined
      ? existing.departmentId
      : cleanOptionalId(input.departmentId, 'departmentId')
    await this.assertReferences(assigneeId, departmentId)

    const db = await getDb()
    await db.run(
      `UPDATE internal_tasks
       SET title = ?, description = ?, status = ?, priority = ?, due_date = ?,
           assignee_id = ?, department_id = ?, updated_at = datetime('now'),
           completed_at = CASE
             WHEN ? = 'done' THEN COALESCE(completed_at, datetime('now'))
             ELSE NULL
           END
       WHERE id = ?`,
      title,
      description,
      status,
      priority,
      dueDate,
      assigneeId,
      departmentId,
      status,
      id,
    )
    return this.getById(id)
  }

  static async delete(id: number, actor: TaskActor): Promise<void> {
    const existing = await this.getById(id)
    if (actor.role !== 'admin' && existing.createdById !== actor.id) {
      throw new TaskError(403, 'FORBIDDEN', 'Удалить задачу может только её автор или администратор')
    }
    const db = await getDb()
    await db.run('DELETE FROM internal_tasks WHERE id = ?', id)
  }

  private static async getById(id: number): Promise<InternalTask> {
    const db = await getDb()
    const row = await db.get(`${TASK_SELECT} WHERE t.id = ?`, id)
    if (!row) throw new TaskError(404, 'TASK_NOT_FOUND', 'Задача не найдена')
    return mapTask(row)
  }

  private static async assertReferences(assigneeId: number | null, departmentId: number | null): Promise<void> {
    const db = await getDb()
    if (assigneeId != null) {
      const user = await db.get('SELECT id FROM users WHERE id = ?', assigneeId)
      if (!user) throw new TaskError(400, 'VALIDATION_ERROR', 'Выбранный исполнитель не существует')
    }
    if (departmentId != null) {
      const department = await db.get('SELECT id FROM departments WHERE id = ?', departmentId)
      if (!department) throw new TaskError(400, 'VALIDATION_ERROR', 'Выбранный отдел не существует')
    }
  }
}
