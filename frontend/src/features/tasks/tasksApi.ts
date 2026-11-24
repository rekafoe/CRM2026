import { api } from '../../api';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface InternalTask {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  createdById: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TaskPayload {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: number | null;
  departmentId: number | null;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Готово',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Низкий',
  medium: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочно',
};

export const getTasks = () => api.get<{ items: InternalTask[] }>('/tasks');
export const createTask = (payload: TaskPayload) => api.post<InternalTask>('/tasks', payload);
export const updateTask = (id: number, payload: Partial<TaskPayload>) =>
  api.patch<InternalTask>(`/tasks/${id}`, payload);
export const deleteTask = (id: number) => api.delete<void>(`/tasks/${id}`);
