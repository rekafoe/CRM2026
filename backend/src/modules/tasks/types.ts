export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'] as const
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

export type TaskStatus = typeof TASK_STATUSES[number]
export type TaskPriority = typeof TASK_PRIORITIES[number]

export interface TaskActor {
  id: number
  role: string
}

export interface InternalTask {
  id: number
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  assigneeId: number | null
  assigneeName: string | null
  departmentId: number | null
  departmentName: string | null
  createdById: number | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface TaskWriteInput {
  title?: unknown
  description?: unknown
  status?: unknown
  priority?: unknown
  dueDate?: unknown
  assigneeId?: unknown
  departmentId?: unknown
}
