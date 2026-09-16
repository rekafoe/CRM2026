import { readFileSync } from 'fs'
import { join } from 'path'
import { computeOrderAmounts } from '../utils/orderAmounts'

/**
 * Акт/счёт from-orders: orders[].amount должен совпадать с CRM (storedTotalCost),
 * а не с сырым price×qty — иначе сводка в шаблоне расходится со строками и totalAmount.
 */
describe('document from-orders order amounts', () => {
  it('uses computeOrderAmounts (storedTotalCost) instead of price×qty', () => {
    const src = readFileSync(join(__dirname, '../routes/documentTemplates.ts'), 'utf8')
    const fromOrdersIdx = src.indexOf("generate/:type/from-orders")
    expect(fromOrdersIdx).toBeGreaterThanOrEqual(0)
    const chunk = src.slice(fromOrdersIdx, fromOrdersIdx + 4500)
    expect(chunk).toContain('computeOrderAmounts')
    expect(chunk).not.toMatch(/sum \+= Math\.round\(\(Number\(it\.price\)/)
  })

  it('matches CRM total when unit price×qty diverges from storedTotalCost', () => {
    // Типичный калькуляторный кейс: итого 92.95, unit price = round(92.95/65, 2) = 1.43 → 1.43×65=92.95;
    // либо округление unit вверх: 1.7×65=110.50 при stored 92.95
    const amounts = computeOrderAmounts({
      items: [{ price: 1.7, quantity: 65, params: { storedTotalCost: 92.95 } }],
      discount_percent: 0,
    })
    expect(amounts.totalAmount).toBe(92.95)
    const naive = Math.round(1.7 * 65 * 100) / 100
    expect(naive).toBe(110.5)
    expect(amounts.totalAmount).not.toBe(naive)
  })

  it('applies order discount on stored subtotal', () => {
    const amounts = computeOrderAmounts({
      items: [{ price: 1.7, quantity: 65, params: { storedTotalCost: 100 } }],
      discount_percent: 10,
    })
    expect(amounts.totalAmount).toBe(90)
  })
})
