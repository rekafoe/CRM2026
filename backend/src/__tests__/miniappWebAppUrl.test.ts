import { withMiniappOrder, withMiniappRepeat } from '../utils/miniappWebAppUrl'

describe('Mini App order links', () => {
  it('builds order and repeat links with the order id', () => {
    expect(withMiniappOrder('https://example.test/miniapp', 15266))
      .toBe('https://example.test/miniapp?order=15266')
    expect(withMiniappRepeat('https://example.test/miniapp', 15266))
      .toBe('https://example.test/miniapp?repeat=15266')
  })

  it('preserves existing query parameters and rejects invalid ids', () => {
    expect(withMiniappOrder('https://example.test/miniapp?theme=dark', 42))
      .toBe('https://example.test/miniapp?theme=dark&order=42')
    expect(withMiniappRepeat('https://example.test/miniapp', 0)).toBeNull()
    expect(withMiniappOrder('https://example.test/miniapp', -1)).toBeNull()
  })
})
