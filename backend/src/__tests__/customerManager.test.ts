import 'dotenv/config'
import { initDB, getDb } from '../config/database'
import { CustomerService } from '../modules/customers/services/customerService'

describe('менеджер юрлица', () => {
  const stamp = `ZZMGR${Date.now()}`
  const createdCustomerIds: number[] = []
  let managerId = 0

  beforeAll(async () => {
    await initDB()
    const db = await getDb()
    const inserted = await db.run(
      `INSERT INTO users (name, email, role, name_genitive, signing_basis)
       VALUES (?, ?, 'user', ?, ?)`,
      [`Менеджер ${stamp}`, `${stamp}@example.test`, 'Менеджера Теста', 'доверенности № 3'],
    )
    managerId = Number((inserted as { lastID: number }).lastID)
  })

  afterAll(async () => {
    for (const id of createdCustomerIds) {
      await CustomerService.deleteCustomer(id).catch(() => undefined)
    }
    if (managerId) {
      const db = await getDb()
      await db.run('DELETE FROM users WHERE id = ?', [managerId])
    }
  })

  it('закрепляет менеджера за юрлицом и не сбрасывает его при другом сохранении', async () => {
    const created = await CustomerService.createCustomer({
      type: 'legal',
      company_name: `ООО ${stamp}`,
      manager_user_id: managerId,
    })
    createdCustomerIds.push(created.id)

    expect(created.manager_user_id).toBe(managerId)
    expect(created.manager_name).toBe(`Менеджер ${stamp}`)
    expect(created.manager_name_genitive).toBe('Менеджера Теста')
    expect(created.manager_signing_basis).toBe('доверенности № 3')

    const kept = await CustomerService.updateCustomer(created.id, { phone: '+375291110000' })
    expect(kept.manager_user_id).toBe(managerId)
    expect(kept.phone).toBe('+375291110000')

    const cleared = await CustomerService.updateCustomer(created.id, { manager_user_id: null })
    expect(cleared.manager_user_id).toBeNull()
    expect(cleared.manager_name).toBeUndefined()
  })

  it('не закрепляет менеджера за физлицом и не принимает неизвестного пользователя', async () => {
    const person = await CustomerService.createCustomer({
      type: 'individual',
      first_name: 'Физ',
      last_name: stamp,
      manager_user_id: managerId,
    })
    createdCustomerIds.push(person.id)
    expect(person.manager_user_id).toBeNull()

    const company = await CustomerService.createCustomer({
      type: 'legal',
      company_name: `ЧУП ${stamp}`,
    })
    createdCustomerIds.push(company.id)
    await expect(
      CustomerService.updateCustomer(company.id, { manager_user_id: 9_999_999 }),
    ).rejects.toThrow('Менеджер не найден')
  })
})
