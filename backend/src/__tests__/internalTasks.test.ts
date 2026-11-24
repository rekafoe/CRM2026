import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20261124120000_create_internal_tasks'
import { getDb } from '../config/database'
import { TaskService } from '../modules/tasks/taskService'

jest.mock('../config/database', () => ({ getDb: jest.fn() }))

const mockedGetDb = getDb as jest.MockedFunction<typeof getDb>
const author = { id: 1, role: 'user' }
const colleague = { id: 2, role: 'manager' }
const admin = { id: 3, role: 'admin' }

describe('internal task dashboard service', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT
      );
      CREATE TABLE departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      INSERT INTO users (id, name, role) VALUES
        (1, 'Разработчик', 'user'),
        (2, 'Менеджер', 'manager'),
        (3, 'Администратор', 'admin');
      INSERT INTO departments (id, name) VALUES (1, 'Разработка'), (2, 'Продажи');
    `)
    await up(db)
    mockedGetDb.mockResolvedValue(db)
  })

  afterEach(async () => {
    await db.close()
    jest.clearAllMocks()
  })

  it('creates the isolated schema without any order relation', async () => {
    await up(db)
    const columns = await db.all<Array<{ name: string }>>('PRAGMA table_info(internal_tasks)')
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'id', 'title', 'status', 'priority', 'due_date', 'assignee_id', 'department_id', 'completed_at',
    ]))
    expect(columns.some((column) => column.name.toLowerCase().includes('order'))).toBe(false)
  })

  it('creates and lists tasks with assignee and department names', async () => {
    const created = await TaskService.create(author, {
      title: 'Подготовить прототип личного кабинета',
      description: 'Согласовать с отделом продаж',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-12-01',
      assigneeId: colleague.id,
      departmentId: 1,
    })

    expect(created.id).toBeGreaterThan(0)
    expect(created.createdById).toBe(author.id)
    expect(created.assigneeName).toBe('Менеджер')
    expect(created.departmentName).toBe('Разработка')
    await expect(TaskService.list()).resolves.toEqual([created])
  })

  it('validates dates and related users', async () => {
    await expect(TaskService.create(author, {
      title: 'Некорректная дата',
      dueDate: '2026-02-30',
    })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })

    await expect(TaskService.create(author, {
      title: 'Неизвестный исполнитель',
      assigneeId: 999,
    })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' })
  })

  it('tracks completion and preserves other fields on a status-only update', async () => {
    const created = await TaskService.create(author, {
      title: 'Позвонить клиенту',
      priority: 'urgent',
      assigneeId: colleague.id,
      dueDate: '2026-11-25',
    })
    const done = await TaskService.update(created.id, colleague, { status: 'done' })

    expect(done.status).toBe('done')
    expect(done.completedAt).not.toBeNull()
    expect(done.priority).toBe('urgent')
    expect(done.assigneeId).toBe(colleague.id)
    expect(done.dueDate).toBe('2026-11-25')

    const reopened = await TaskService.update(created.id, colleague, { status: 'todo' })
    expect(reopened.completedAt).toBeNull()
  })

  it('allows deletion only to the author or an admin', async () => {
    const created = await TaskService.create(author, { title: 'Черновая задача' })
    await expect(TaskService.delete(created.id, colleague)).rejects.toMatchObject({ status: 403 })
    await expect(TaskService.delete(created.id, admin)).resolves.toBeUndefined()
    await expect(TaskService.list()).resolves.toEqual([])
  })
})
