import React, { useEffect, useState } from 'react';
import type { AssignableUser, Department } from '../../api';
import { AppIcon } from '../../components/ui/AppIcon';
import { getErrorMessage } from '../../utils/errorUtils';
import {
  createTask,
  deleteTask,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  updateTask,
  type InternalTask,
  type TaskPriority,
  type TaskStatus,
} from './tasksApi';

interface TaskFormModalProps {
  task: InternalTask | null;
  users: AssignableUser[];
  departments: Department[];
  currentUser: { id: number; name: string; role: string };
  onClose: () => void;
  onSaved: (task: InternalTask) => void;
  onDeleted: (id: number) => void;
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  task,
  users,
  departments,
  currentUser,
  onClose,
  onSaved,
  onDeleted,
}) => {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId == null ? '' : String(task.assigneeId));
  const [departmentId, setDepartmentId] = useState(task?.departmentId == null ? '' : String(task.departmentId));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const canDelete = Boolean(task) && (currentUser.role === 'admin' || task?.createdById === currentUser.id);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      dueDate: dueDate || null,
      assigneeId: assigneeId ? Number(assigneeId) : null,
      departmentId: departmentId ? Number(departmentId) : null,
    };
    try {
      const response = task ? await updateTask(task.id, payload) : await createTask(payload);
      onSaved(response.data);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Не удалось сохранить задачу'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !window.confirm(`Удалить задачу «${task.title}»?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteTask(task.id);
      onDeleted(task.id);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Не удалось удалить задачу'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="task-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <header className="task-modal__header">
          <div>
            <p className="task-modal__kicker">Внутренняя задача</p>
            <h2 id="task-modal-title">{task ? 'Редактирование' : 'Новая задача'}</h2>
          </div>
          <button type="button" className="task-icon-btn" onClick={onClose} aria-label="Закрыть">
            <AppIcon name="x" size="sm" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="task-modal__body">
            {error ? <div className="task-form-error" role="alert">{error}</div> : null}
            <label className="task-field task-field--wide">
              <span>Название</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                placeholder="Например, подготовить предложение для клиента"
                required
                autoFocus
              />
            </label>
            <label className="task-field task-field--wide">
              <span>Описание</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={10000}
                rows={5}
                placeholder="Результат, контекст и полезные ссылки"
              />
            </label>
            <div className="task-form-grid">
              <label className="task-field">
                <span>Статус</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
                  {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="task-field">
                <span>Приоритет</span>
                <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                  {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="task-field">
                <span>Исполнитель</span>
                <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Не назначен</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
              <label className="task-field">
                <span>Отдел</span>
                <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                  <option value="">Общая задача</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
              </label>
              <label className="task-field">
                <span>Срок</span>
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            </div>
            {task ? (
              <p className="task-modal__meta">
                Создал: {task.createdByName ?? 'сотрудник удалён'} · #{task.id}
              </p>
            ) : null}
          </div>

          <footer className="task-modal__footer">
            {canDelete ? (
              <button
                type="button"
                className="task-btn task-btn--danger task-modal__delete"
                onClick={() => void handleDelete()}
                disabled={saving || deleting}
              >
                <AppIcon name="trash" size="xs" />
                {deleting ? 'Удаление…' : 'Удалить'}
              </button>
            ) : null}
            <button type="button" className="task-btn" onClick={onClose} disabled={saving || deleting}>
              Отмена
            </button>
            <button type="submit" className="task-btn task-btn--primary" disabled={saving || deleting}>
              {saving ? 'Сохранение…' : task ? 'Сохранить' : 'Создать задачу'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};
