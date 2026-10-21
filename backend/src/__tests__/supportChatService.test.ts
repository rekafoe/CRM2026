import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { getDb } from '../config/database'
import { up } from '../migrations/20261021180000_create_support_chats'
import { keysMatch, readSupportCustomer } from '../modules/support/supportCustomerAuth'
import { SupportError } from '../modules/support/supportErrors'
import { SupportService } from '../modules/support/supportService'

jest.mock('../config/database', () => ({
  getDb: jest.fn(),
}))

const anna = { id: 'user-anna', name: 'Анна Коваль', email: 'anna@example.com', phone: '+375291112233' }
const igor = { id: 'user-igor', name: 'Игорь Петров', email: 'igor@example.com', phone: '' }
const maria = { id: 2, role: 'manager', name: 'Мария' }
const ivan = { id: 3, role: 'user', name: 'Иван' }

function encode(user: { id: string; name: string; email: string; phone: string }) {
  return Buffer.from(JSON.stringify(user), 'utf8').toString('base64url')
}

describe('support chats', () => {
  let db: Database
  const previousKey = process.env.CRM_SUPPORT_API_KEY

  beforeEach(async () => {
    process.env.CRM_SUPPORT_API_KEY = 'support-test-key'
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT,
        is_active INTEGER DEFAULT 1
      );
      INSERT INTO users (id, name, role, is_active) VALUES
        (2, 'Мария', 'manager', 1),
        (3, 'Иван', 'user', 1),
        (4, 'Архив', 'user', 0);
    `)
    await up(db)
    ;(getDb as jest.Mock).mockResolvedValue(db)
  })

  afterEach(async () => {
    process.env.CRM_SUPPORT_API_KEY = previousKey
    await db.close()
  })

  it('keeps a customer inside their own chats and stores hostile text as text', async () => {
    const created = await SupportService.createForCustomer(anna, {
      topic: 'print_quality',
      text: "' OR 1=1; DROP TABLE support_conversations; --",
      orderId: '10482',
    })
    await SupportService.createForCustomer(igor, {
      topic: 'shipping',
      text: 'Курьер не доехал',
      orderId: '10311',
    })

    const annaList = await SupportService.listForCustomer(anna)
    expect(annaList.conversations).toHaveLength(1)
    expect(annaList.conversations[0].id).toBe(created.conversation.id)
    expect(annaList.conversations[0].lastMessage?.text).toContain('DROP TABLE')

    await expect(SupportService.listMessagesForCustomer(igor, created.conversation.id))
      .rejects.toMatchObject({ status: 404 })
    const stillThere = await db.get<{ c: number }>('SELECT COUNT(1) as c FROM support_conversations')
    expect(Number(stillThere?.c)).toBe(2)
  })

  it('rejects a bad topic, a bad order and an oversized message', async () => {
    await expect(SupportService.createForCustomer(anna, {
      topic: 'print_quality; delete',
      text: 'Привет',
    })).rejects.toBeInstanceOf(SupportError)
    await expect(SupportService.createForCustomer(anna, {
      topic: 'other',
      text: 'Привет',
      orderId: '1 OR 1=1',
    })).rejects.toMatchObject({ status: 400 })
    await expect(SupportService.createForCustomer(anna, {
      topic: 'other',
      text: 'а'.repeat(4001),
    })).rejects.toMatchObject({ status: 400 })
  })

  it('claims, blocks the other operator, then allows a transfer', async () => {
    const created = await SupportService.createForCustomer(anna, {
      topic: 'print_quality',
      text: 'Белые полосы по краю',
      orderId: '10482',
    })
    const id = created.conversation.id
    await SupportService.claim(maria, id)
    await expect(SupportService.addOperatorMessage(ivan, id, 'Я отвечу'))
      .rejects.toMatchObject({ status: 409 })

    const sent = await SupportService.addOperatorMessage(maria, id, 'Тираж ушёл в перепечатку')
    expect(sent.message.operatorName).toBe('Мария')
    expect(sent.conversation.mine).toBe(true)

    const moved = await SupportService.transfer(maria, id, ivan.id)
    expect(moved.conversation.assignedUserName).toBe('Иван')
    expect(moved.conversation.mine).toBe(false)
    await expect(SupportService.addOperatorMessage(maria, id, 'Ещё строка'))
      .rejects.toMatchObject({ status: 409 })
    await expect(SupportService.release(maria, id)).rejects.toMatchObject({ status: 403 })

    const released = await SupportService.release(ivan, id)
    expect(released.conversation.assignedUserId).toBeNull()
    const queue = await SupportService.listForOperator(maria, 'unassigned')
    expect(queue.conversations.map((item) => item.id)).toContain(id)
    expect(queue.unassignedCount).toBe(1)
  })

  it('closes a chat for operators and lets the customer reopen it', async () => {
    const created = await SupportService.createForCustomer(anna, {
      topic: 'design_help',
      text: 'Нужны вылеты',
    })
    const id = created.conversation.id
    await SupportService.close(maria, id)
    await expect(SupportService.addOperatorMessage(maria, id, 'Закрыто'))
      .rejects.toMatchObject({ status: 409 })

    const reply = await SupportService.addCustomerMessage(anna, id, 'Можно ещё вопрос?')
    expect(reply.message.sender).toBe('customer')
    const open = await SupportService.listForOperator(maria, 'open')
    expect(open.conversations[0].status).toBe('open')
  })

  it('sends from an free chat by taking it and seeds reply scripts', async () => {
    const created = await SupportService.createForCustomer(igor, {
      topic: 'shipping',
      text: 'Где заказ?',
    })
    const sent = await SupportService.addOperatorMessage(maria, created.conversation.id, 'Курьер выехал')
    expect(sent.conversation.assignedUserId).toBe(maria.id)
    const scripts = await SupportService.listScripts()
    expect(scripts.scripts.map((item) => item.title)).toEqual(['Качество', 'Доставка', 'Макет', 'Свой'])
    const extra = await SupportService.createScript({ title: 'Пауза', body: '{имя}, уточним и вернёмся.' })
    expect(extra.script.title).toBe('Пауза')
    await SupportService.hideScript(extra.script.id)
    const visible = await SupportService.listScripts()
    expect(visible.scripts.map((item) => item.title)).not.toContain('Пауза')
    const operators = await SupportService.listOperators()
    expect(operators.operators.map((item) => item.name)).toEqual(['Иван', 'Мария'])
  })

  it('counts unanswered chats for the pool and for the assignee only', async () => {
    const free = await SupportService.createForCustomer(anna, {
      topic: 'print_quality',
      text: 'Полосы на наклейке',
    })
    const taken = await SupportService.createForCustomer(igor, {
      topic: 'shipping',
      text: 'Где курьер?',
    })
    await SupportService.claim(ivan, taken.conversation.id)

    expect(await SupportService.countAttention(maria)).toEqual({ count: 1 })
    expect(await SupportService.countAttention(ivan)).toEqual({ count: 2 })

    await SupportService.addOperatorMessage(maria, free.conversation.id, 'Смотрим тираж')
    expect(await SupportService.countAttention(maria)).toEqual({ count: 0 })
    expect(await SupportService.countAttention(ivan)).toEqual({ count: 1 })

    await SupportService.addCustomerMessage(igor, taken.conversation.id, 'Уже вечер')
    expect(await SupportService.countAttention(ivan)).toEqual({ count: 1 })
    expect(await SupportService.countAttention(maria)).toEqual({ count: 0 })

    await SupportService.close(ivan, taken.conversation.id)
    expect(await SupportService.countAttention(ivan)).toEqual({ count: 0 })
  })

  it('accepts only the support key and a signed customer', () => {
    expect(keysMatch('support-test-key', 'support-test-key')).toBe(true)
    expect(keysMatch('website-order-key', 'support-test-key')).toBe(false)
    const req = {
      headers: {
        'x-api-key': 'support-test-key',
        'x-support-user': encode(anna),
      },
    }
    expect(readSupportCustomer(req as never).id).toBe(anna.id)
    expect(() => readSupportCustomer({
      headers: { 'x-api-key': 'support-test-key', 'x-support-user': encode({ ...anna, id: "1' OR '1'='1" }) },
    } as never)).toThrow(SupportError)
    expect(() => readSupportCustomer({ headers: { 'x-api-key': 'nope' } } as never)).toThrow(SupportError)
  })
})
