import {
  contactOnlyAnyDaySql,
  contactOnlyOnDaySql,
  freezeOpenedOn,
} from '../modules/orders/orderReportVisibility'

describe('день создания заказа для контактёра', () => {
  it('сохраняет уже записанный день и не подменяет его датой передачи', () => {
    expect(freezeOpenedOn('2026-10-01', '2026-10-03T12:00:00.000Z')).toBe('2026-10-01')
    expect(freezeOpenedOn(null, '2026-10-03T12:00:00.000Z')).toBe('2026-10-03')
    expect(freezeOpenedOn('  ', '2026-10-03')).toBe('2026-10-03')
    expect(freezeOpenedOn(null, null)).toBeNull()
  })

  it('в отбор дня берёт контактёра, который не владелец, по opened_on', () => {
    const sql = contactOnlyOnDaySql({ hasOpenedOn: true })
    expect(sql).toContain('o.userId IS NOT NULL')
    expect(sql).toContain('contact_user_id != o.userId')
    expect(sql).toContain('o.opened_on')
    expect(contactOnlyOnDaySql({ hasOpenedOn: false })).not.toContain('opened_on')
    expect(contactOnlyAnyDaySql()).toContain('contact_user_id = ?')
  })
})
