import crypto from 'crypto'
import { verifyTelegramInitData } from '../utils/telegramInitData'
import { signMiniAppSession, verifyMiniAppSession } from '../utils/miniAppSession'

const BOT_TOKEN = '123456:miniapp-test-token'
const AUTH_DATE = 1_700_000_000

function buildInitData(overrides?: { authDate?: number; userId?: number }): string {
  const values: Record<string, string> = {
    auth_date: String(overrides?.authDate ?? AUTH_DATE),
    query_id: 'AAEtest',
    user: JSON.stringify({ id: overrides?.userId ?? 42, first_name: 'Test', username: 'miniapp_test' }),
  }
  const dataCheckString = Object.keys(values).sort().map((key) => `${key}=${values[key]}`).join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN, 'utf8').digest()
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString, 'utf8').digest('hex')
  return new URLSearchParams({ ...values, hash }).toString()
}

describe('Mini App authentication', () => {
  const nowMs = (AUTH_DATE + 60) * 1000
  const previousSecret = process.env.MINIAPP_SESSION_SECRET

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(nowMs)
    process.env.MINIAPP_SESSION_SECRET = 'miniapp-session-test-secret'
  })

  afterEach(() => {
    jest.useRealTimers()
    if (previousSecret == null) delete process.env.MINIAPP_SESSION_SECRET
    else process.env.MINIAPP_SESSION_SECRET = previousSecret
  })

  it('accepts valid Telegram initData and returns the Telegram user', () => {
    const result = verifyTelegramInitData(buildInitData(), BOT_TOKEN, 300)
    expect(result).toMatchObject({
      valid: true,
      authDate: AUTH_DATE,
      user: { id: 42, username: 'miniapp_test' },
    })
  })

  it('rejects modified initData and stale authentication', () => {
    const tampered = buildInitData().replace('miniapp_test', 'attacker')
    expect(verifyTelegramInitData(tampered, BOT_TOKEN, 300)).toEqual({
      valid: false,
      reason: 'bad_hash',
    })
    expect(verifyTelegramInitData(
      buildInitData({ authDate: AUTH_DATE - 301 }),
      BOT_TOKEN,
      300,
    )).toEqual({ valid: false, reason: 'stale' })
  })

  it('rejects initData signed for another bot', () => {
    expect(verifyTelegramInitData(buildInitData(), '123456:another-token', 300)).toEqual({
      valid: false,
      reason: 'bad_hash',
    })
  })

  it('signs and verifies an isolated Mini App session', () => {
    const token = signMiniAppSession('42', 3600)
    expect(token.startsWith('mapp1.')).toBe(true)
    expect(verifyMiniAppSession(token)).toMatchObject({
      sub: '42',
      iat: AUTH_DATE + 60,
      exp: AUTH_DATE + 3660,
    })
  })

  it('rejects expired and tampered Mini App sessions', () => {
    const token = signMiniAppSession('42', 60)
    jest.setSystemTime(nowMs + 61_000)
    expect(verifyMiniAppSession(token)).toBeNull()

    const valid = signMiniAppSession('42', 3600)
    const tampered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`
    expect(verifyMiniAppSession(tampered)).toBeNull()
  })
})
