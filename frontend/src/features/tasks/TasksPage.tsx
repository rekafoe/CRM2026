import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAssignableUsers,
  getCurrentUser,
  getDepartments,
  type AssignableUser,
  type Department,
} from '../../api';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AppIcon } from '../../components/ui/AppIcon';
import { getErrorMessage } from '../../utils/errorUtils';
import { TaskFormModal } from './TaskFormModal';
import {
  getTasks,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  updateTask,
  type InternalTask,
  type TaskStatus,
} from './tasksApi';
import './tasks.css';

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

function dateIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDueDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
    .format(new Date(`${value}T00:00:00`));
}

function initials(name: string | null): string {
  if (!name) return '—';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [editingTask, setEditingTask] = useState<InternalTask | null | undefined>(undefined);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskResponse, userResponse, departmentResponse, currentUserResponse] = await Promise.all([
        getTasks(),
        getAssignableUsers(),
        getDepartments(),
        getCurrentUser(),
      ]);
      setTasks(taskResponse.data.items ?? []);
      setUsers(userResponse.data.all ?? []);
      setDepartments(departmentResponse.data ?? []);
      setCurrentUser(currentUserResponse.data);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Не удалось загрузить задачи'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matchingTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru');
    return tasks.filter((task) => {
      if (assigneeFilter === 'mine' && task.assigneeId !== currentUser?.id) return false;
      if (assigneeFilter === 'unassigned' && task.assigneeId != null) return false;
      if (!['all', 'mine', 'unassigned'].includes(assigneeFilter) && task.assigneeId !== Number(assigneeFilter)) return false;
      if (departmentFilter === 'general' && task.departmentId != null) return false;
      if (departmentFilter && departmentFilter !== 'general' && task.departmentId !== Number(departmentFilter)) return false;
      if (!query) return true;
      return [task.title, task.description, task.assigneeName, task.departmentName]
        .some((value) => value?.toLocaleLowerCase('ru').includes(query));
    });
  }, [assigneeFilter, currentUser?.id, departmentFilter, search, tasks]);

  const visibleTasks = useMemo(
    () => matchingTasks.filter((task) => showDone || task.status !== 'done'),
    [matchingTasks, showDone],
  );

  const summary = useMemo(() => {
    const today = dateIso();
    const weekAgo = dateIso(-6);
    return {
      active: matchingTasks.filter((task) => task.status !== 'done').length,
      overdue: matchingTasks.filter((task) => task.status !== 'done' && task.dueDate && task.dueDate < today).length,
      dueToday: matchingTasks.filter((task) => task.status !== 'done' && task.dueDate === today).length,
      doneWeek: matchingTasks.filter((task) => {
        const completed = task.completedAt?.slice(0, 10);
        return task.status === 'done' && completed && completed >= weekAgo && completed <= dateIso(1);
      }).length,
    };
  }, [matchingTasks]);

  const grouped = useMemo(() => {
    const result = new Map<TaskStatus, InternalTask[]>(STATUS_ORDER.map((status) => [status, []]));
    visibleTasks.forEach((task) => result.get(task.status)?.push(task));
    result.forEach((items) => items.sort((a, b) => {
      const priority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priority) return priority;
      if (a.dueDate !== b.dueDate) {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      return b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id;
    }));
    return result;
  }, [visibleTasks]);

  const handleStatusChange = async (task: InternalTask, status: TaskStatus) => {
    if (task.status === status || updatingIds.has(task.id)) return;
    setError(null);
    setUpdatingIds((previous) => new Set(previous).add(task.id));
    try {
      const response = await updateTask(task.id, { status });
      setTasks((previous) => previous.map((item) => item.id === task.id ? response.data : item));
      setEditingTask((previous) => previous?.id === task.id ? response.data : previous);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Не удалось изменить статус задачи'));
    } finally {
      setUpdatingIds((previous) => {
        const next = new Set(previous);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleSaved = (task: InternalTask) => {
    setTasks((previous) => {
      const exists = previous.some((item) => item.id === task.id);
      return exists ? previous.map((item) => item.id === task.id ? task : item) : [task, ...previous];
    });
    setEditingTask(undefined);
  };

  const resetFilters = () => {
    setSearch('');
    setAssigneeFilter('all');
    setDepartmentFilter('');
  };

  const hasFilters = Boolean(search || assigneeFilter !== 'all' || departmentFilter);
  const today = dateIso();

  return (
    <AdminPageLayout
      title="Задачи команды"
      description="Внутренние задачи разработки, продаж и других отделов — без привязки к заказам полиграфии."
      icon={<AppIcon name="check" size="lg" />}
      onBack={() => navigate('/')}
      backLabel="← В рабочее место"
      className="tasks-layout"
      headerExtra={(
        <div className="tasks-header-actions">
          <button type="button" className="task-icon-btn" onClick={() => void load()} title="Обновить" aria-label="Обновить задачи">
            <AppIcon name="refresh" size="sm" />
          </button>
          <button type="button" className="task-btn task-btn--primary" onClick={() => setEditingTask(null)}>
            <AppIcon name="plus" size="xs" /> Новая задача
          </button>
        </div>
      )}
    >
      <div className="tasks-page">
        {error ? (
          <div className="tasks-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void load()}>Повторить</button>
          </div>
        ) : null}

        <section className="task-summary" aria-label="Сводка по задачам">
          <div className="task-summary__card">
            <span>Активные</span>
            <strong>{summary.active}</strong>
            <small>Все незавершённые</small>
          </div>
          <div className={`task-summary__card${summary.overdue ? ' task-summary__card--danger' : ''}`}>
            <span>Просрочено</span>
            <strong>{summary.overdue}</strong>
            <small>Требуют внимания</small>
          </div>
          <div className={`task-summary__card${summary.dueToday ? ' task-summary__card--warning' : ''}`}>
            <span>Срок сегодня</span>
            <strong>{summary.dueToday}</strong>
            <small>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date())}</small>
          </div>
          <div className="task-summary__card task-summary__card--success">
            <span>Готово за 7 дней</span>
            <strong>{summary.doneWeek}</strong>
            <small>Завершённые задачи</small>
          </div>
        </section>

        <section className="task-filters" aria-label="Фильтры задач">
          <label className="task-search">
            <AppIcon name="search" size="xs" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Название, описание или исполнитель"
              aria-label="Поиск задач"
            />
          </label>
          <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} aria-label="Исполнитель">
            <option value="all">Все исполнители</option>
            <option value="mine">Мои задачи</option>
            <option value="unassigned">Без исполнителя</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} aria-label="Отдел">
            <option value="">Все отделы</option>
            <option value="general">Общие задачи</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
          <label className="task-done-toggle">
            <input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />
            <span>Завершённые</span>
          </label>
          {hasFilters ? <button type="button" className="task-filter-reset" onClick={resetFilters}>Сбросить</button> : null}
        </section>

        {loading ? (
          <div className="tasks-loading"><AppIcon name="loader" size="md" /> Загружаем задачи…</div>
        ) : (
          <div className={`task-board${showDone ? '' : ' task-board--without-done'}`}>
            {STATUS_ORDER.filter((status) => showDone || status !== 'done').map((status) => {
              const items = grouped.get(status) ?? [];
              return (
                <section
                  key={status}
                  className={`task-column task-column--${status}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = Number(event.dataTransfer.getData('text/plain'));
                    const task = tasks.find((item) => item.id === id);
                    setDraggingId(null);
                    if (task) void handleStatusChange(task, status);
                  }}
                >
                  <header className="task-column__header">
                    <h2>{TASK_STATUS_LABELS[status]}</h2>
                    <span>{items.length}</span>
                  </header>
                  <div className="task-column__body">
                    {items.map((task) => {
                      const overdue = task.status !== 'done' && task.dueDate != null && task.dueDate < today;
                      const dueToday = task.status !== 'done' && task.dueDate === today;
                      return (
                        <article
                          key={task.id}
                          className={`task-card task-card--${task.priority}${draggingId === task.id ? ' is-dragging' : ''}`}
                          draggable={!updatingIds.has(task.id)}
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', String(task.id));
                            event.dataTransfer.effectAllowed = 'move';
                            setDraggingId(task.id);
                          }}
                          onDragEnd={() => setDraggingId(null)}
                        >
                          <button type="button" className="task-card__main" onClick={() => setEditingTask(task)}>
                            <span className="task-card__labels">
                              <span className={`task-priority task-priority--${task.priority}`}>
                                {TASK_PRIORITY_LABELS[task.priority]}
                              </span>
                              {task.departmentName ? <span className="task-department">{task.departmentName}</span> : null}
                            </span>
                            <strong className="task-card__title">{task.title}</strong>
                            {task.description ? <span className="task-card__description">{task.description}</span> : null}
                            <span className="task-card__meta">
                              {task.dueDate ? (
                                <span className={`task-due${overdue ? ' task-due--overdue' : dueToday ? ' task-due--today' : ''}`}>
                                  <AppIcon name="calendar" size="xs" />
                                  {overdue ? 'Просрочено · ' : ''}{formatDueDate(task.dueDate)}
                                </span>
                              ) : <span>Без срока</span>}
                              <span className="task-assignee" title={task.assigneeName ?? 'Исполнитель не назначен'}>
                                <span className="task-avatar">{initials(task.assigneeName)}</span>
                                {task.assigneeName ?? 'Не назначен'}
                              </span>
                            </span>
                          </button>
                          <div className="task-card__status">
                            <select
                              value={task.status}
                              disabled={updatingIds.has(task.id)}
                              onChange={(event) => void handleStatusChange(task, event.target.value as TaskStatus)}
                              aria-label={`Статус задачи «${task.title}»`}
                            >
                              {STATUS_ORDER.map((value) => <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>)}
                            </select>
                            <button type="button" onClick={() => setEditingTask(task)} aria-label={`Изменить задачу «${task.title}»`}>
                              <AppIcon name="pencil" size="xs" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {items.length === 0 ? (
                      <div className="task-column__empty">
                        {hasFilters ? 'Нет задач по фильтрам' : status === 'done' ? 'Завершённые появятся здесь' : 'Перетащите задачу сюда'}
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {!loading && tasks.length === 0 ? (
          <div className="tasks-first-task">
            <p>Создайте первую внутреннюю задачу — она не попадёт в заказы и производственные отчёты.</p>
            <button type="button" className="task-btn task-btn--primary" onClick={() => setEditingTask(null)}>
              <AppIcon name="plus" size="xs" /> Создать задачу
            </button>
          </div>
        ) : null}
      </div>

      {editingTask !== undefined && currentUser ? (
        <TaskFormModal
          task={editingTask}
          users={users}
          departments={departments}
          currentUser={currentUser}
          onClose={() => setEditingTask(undefined)}
          onSaved={handleSaved}
          onDeleted={(id) => {
            setTasks((previous) => previous.filter((task) => task.id !== id));
            setEditingTask(undefined);
          }}
        />
      ) : null}
    </AdminPageLayout>
  );
};

export default TasksPage;
