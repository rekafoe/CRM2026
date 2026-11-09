import {
  canEditDesign,
  canEditDesignFamily,
  canUseDesignCatalog,
  isDesignCatalogAdmin,
} from '../services/designTemplateAccess'

describe('design template catalog access', () => {
  const admin = { id: 1, role: 'admin' }
  const manager = { id: 2, role: 'manager' }
  const operator = { id: 3, role: 'operator' }
  const user = { id: 4, role: 'user' }

  test('crm staff can use the catalog, site clients cannot', () => {
    expect(canUseDesignCatalog('admin')).toBe(true)
    expect(canUseDesignCatalog('manager')).toBe(true)
    expect(canUseDesignCatalog('operator')).toBe(true)
    expect(canUseDesignCatalog('user')).toBe(true)
    expect(canUseDesignCatalog('viewer')).toBe(true)
    expect(canUseDesignCatalog('client')).toBe(false)
    expect(canUseDesignCatalog('Client')).toBe(false)
  })

  test('only admin role keeps full edit rights', () => {
    expect(isDesignCatalogAdmin('admin')).toBe(true)
    expect(isDesignCatalogAdmin('manager')).toBe(false)
    expect(canEditDesign(admin, { uploaded_by_user_id: null })).toBe(true)
    expect(canEditDesign(admin, { uploaded_by_user_id: 99 })).toBe(true)
  })

  test('staff edit only designs they uploaded', () => {
    expect(canEditDesign(manager, { uploaded_by_user_id: 2 })).toBe(true)
    expect(canEditDesign(operator, { uploaded_by_user_id: 3 })).toBe(true)
    expect(canEditDesign(user, { uploaded_by_user_id: 4 })).toBe(true)
    expect(canEditDesign(manager, { uploaded_by_user_id: 3 })).toBe(false)
    expect(canEditDesign(manager, { uploaded_by_user_id: null })).toBe(false)
  })

  test('family edits require every variant to belong to the same user', () => {
    expect(canEditDesignFamily(manager, [
      { uploaded_by_user_id: 2 },
      { uploaded_by_user_id: 2 },
    ])).toBe(true)
    expect(canEditDesignFamily(manager, [
      { uploaded_by_user_id: 2 },
      { uploaded_by_user_id: 9 },
    ])).toBe(false)
    expect(canEditDesignFamily(manager, [
      { uploaded_by_user_id: 2 },
      { uploaded_by_user_id: null },
    ])).toBe(false)
    expect(canEditDesignFamily(admin, [
      { uploaded_by_user_id: null },
      { uploaded_by_user_id: 9 },
    ])).toBe(true)
    expect(canEditDesignFamily(manager, [])).toBe(false)
  })
})
