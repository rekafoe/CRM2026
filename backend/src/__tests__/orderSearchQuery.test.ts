import {
  buildOrderQuerySearchClause,
  digitsOnly,
  isExactOrderNumberSearch,
  isExplicitOrderNumberQuery,
  isIdentifierQuery,
  likeCaseVariants,
  parseOrderLookupId,
} from '../modules/orders/utils/orderSearchQuery'

describe('orderSearchQuery', () => {
  it('явный номер заказа ищет только id/number', () => {
    const clause = buildOrderQuerySearchClause('ORD-10104')
    expect(clause).not.toBeNull()
    expect(clause!.sql).toContain('o.id = ?')
    expect(clause!.sql).toContain('o.number IN')
    expect(clause!.sql).not.toContain('tax_id')
    expect(clause!.sql).not.toContain('customerName')
    expect(clause!.params).toContain(10104)
    expect(clause!.params).toContain('ORD-10104')
    expect(isExplicitOrderNumberQuery('#10104')).toBe(true)
  })

  it('старый номер 2112 ищется точечно, без LIKE и без зависимости от лимита', () => {
    expect(isExactOrderNumberSearch('2112')).toBe(true)
    expect(isExactOrderNumberSearch('#2112')).toBe(true)
    expect(isExactOrderNumberSearch('ORD-2112')).toBe(true)
    const clause = buildOrderQuerySearchClause('2112')
    expect(clause!.sql).toContain('o.id = ?')
    expect(clause!.params[0]).toBe(2112)
    expect(clause!.params).toContain('ORD-2112')
    expect(clause!.sql).not.toContain('LIKE')
    expect(clause!.sql).not.toContain('customerName')
  })

  it('УНП из 9 цифр ищет tax_id и не режет выдачу поиском по имени', () => {
    expect(isIdentifierQuery('100582333')).toBe(true)
    expect(isExactOrderNumberSearch('100582333')).toBe(false)
    const clause = buildOrderQuerySearchClause('100582333')
    expect(clause!.sql).toContain('c.tax_id')
    expect(clause!.sql).toContain('o.customerPhone')
    expect(clause!.sql).not.toContain('customerName LIKE')
    expect(clause!.params).toContain('100582333')
  })

  it('телефон с маской ищет по цифрам, а не как номер заказа', () => {
    const clause = buildOrderQuerySearchClause('+375 (29) 123-45-67')
    expect(isIdentifierQuery('+375 (29) 123-45-67')).toBe(true)
    expect(parseOrderLookupId('+375 (29) 123-45-67')).toBeNull()
    expect(clause!.sql).toContain('REPLACE')
    expect(clause!.params.some((p) => String(p).includes('291234567'))).toBe(true)
    expect(digitsOnly('+375 (29) 123-45-67')).toBe('375291234567')
  })

  it('имя клиента остаётся текстовым LIKE с вариантами регистра', () => {
    expect(isIdentifierQuery('Иванов')).toBe(false)
    const clause = buildOrderQuerySearchClause('Иванов')
    expect(clause!.sql).toContain('o.customerName LIKE')
    expect(clause!.sql).toContain('c.company_name LIKE')
    expect(likeCaseVariants('Иванов')).toEqual(expect.arrayContaining(['Иванов', 'иванов']))
  })
})
