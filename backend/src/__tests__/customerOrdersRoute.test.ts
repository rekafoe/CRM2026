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

describe('legal document customer/order ownership guards', () => {
  const frontendRoot = join(__dirname, '../../../frontend/src')

  it('refuses contract/act/invoice when order.customer_id ≠ customer.id', () => {
    const src = readFileSync(
      join(frontendRoot, 'pages/admin/clients/customerOrderLegalDocuments.ts'),
      'utf8',
    )
    expect(src).toContain('assertOrderBelongsToCustomer')
    expect(src).toContain('Number(order.customer_id) !== Number(customer.id)')
    expect(src).toMatch(/assertOrderBelongsToCustomer\(customer,\s*order\)/)
  })

  it('clears stale legalCustomer when order customer_id changes in pool hook', () => {
    const src = readFileSync(
      join(frontendRoot, 'components/optimized/hooks/useOrderLegalDocuments.ts'),
      'utf8',
    )
    expect(src).toContain('setLegalCustomer(null)')
    expect(src).toContain('setDocsMenuOpen(false)')
    expect(src).toContain('Number(legalCustomer.id) === customerId')
    expect(src).toContain('matchedLegalCustomer')
  })

  it('ignores stale getCustomerOrders responses when switching customer card', () => {
    const src = readFileSync(
      join(frontendRoot, 'components/admin/clients/CustomerDetailView.tsx'),
      'utf8',
    )
    expect(src).toContain('let cancelled = false')
    expect(src).toContain('if (cancelled) return')
    expect(src).toContain('Number(order.customer_id) === Number(customerIdForLoad)')
  })
})
