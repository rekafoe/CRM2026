import { readFileSync } from 'fs'
import { join } from 'path'

describe('customer orders endpoint', () => {
  it('registers GET /customers/:id/orders before /:id', () => {
    const src = readFileSync(join(__dirname, '../modules/customers/routes/customers.ts'), 'utf8')
    const ordersRoute = src.indexOf("router.get('/:id/orders'")
    const byIdRoute = src.indexOf("router.get('/:id', CustomerController.getById)")
    expect(ordersRoute).toBeGreaterThanOrEqual(0)
    expect(byIdRoute).toBeGreaterThan(ordersRoute)
  })

  it('filters pool listing by customer_id when requested', () => {
    const src = readFileSync(join(__dirname, '../repositories/orderRepository.ts'), 'utf8')
    expect(src).toContain('customerId?: number')
    expect(src).toContain('o.customer_id = ?')
  })
})
