import { enqueueMail } from './mailOutboxService'

const PRODUCTION_VERIFICATION_ORIGIN = 'https://printcore.by'
const VERIFICATION_PATH = '/verify-email'
const ALLOWED_BODY_FIELDS = new Set([
  'to',
  'userName',
  'verificationUrl',
  'idempotencyKey',
])

export const WEBSITE_EMAIL_VERIFICATION_SUBJECT = 'Подтвердите email — Printcore'

export interface WebsiteEmailVerificationInput {
  to: string
  userName: string
  verificationUrl: string
  idempotencyKey: string
}

export interface WebsiteEmailVerificationMessage {
  subject: string
  html: string
  text: string
}

export class WebsiteEmailVerificationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebsiteEmailVerificationValidationError'
  }
}

function validationError(message: string): never {
  throw new WebsiteEmailVerificationValidationError(message)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requiredTrimmedString(
  body: Record<string, unknown>,
  field: keyof WebsiteEmailVerificationInput,
  maxLength: number,
): string {
  const value = body[field]
  if (typeof value !== 'string') validationError(`"${field}" must be a string`)
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) {
    validationError(`"${field}" length must be between 1 and ${maxLength}`)
  }
  return trimmed
}

function isValidStrictEmail(email: string): boolean {
  if (email.length > 254 || /[\s\u0000-\u001f\u007f]/.test(email)) return false
  const at = email.lastIndexOf('@')
  if (at <= 0 || at !== email.indexOf('@')) return false

  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length > 64 || !local || !domain || domain.length > 253) return false
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false

  const labels = domain.split('.')
  if (labels.length < 2) return false
  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[A-Z0-9-]+$/i.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-'),
  )
}

function getAllowedVerificationOrigins(): Set<string> {
  const allowed = new Set([PRODUCTION_VERIFICATION_ORIGIN])
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return allowed

  const configured = String(process.env.AUTH_MAIL_VERIFICATION_DEV_ORIGINS || '')
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean)

  for (const candidate of configured) {
    try {
      const url = new URL(candidate)
      const isLoopback =
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '[::1]'
      const isOriginOnly =
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      if (isLoopback && isOriginOnly && (url.protocol === 'http:' || url.protocol === 'https:')) {
        allowed.add(url.origin)
      }
    } catch {
      // Некорректная dev-запись не ослабляет production allowlist.
    }
  }

  return allowed
}

export function validateVerificationUrl(rawUrl: string): string {
  if (/[\u0000-\u001f\u007f]/.test(rawUrl)) {
    return validationError('"verificationUrl" must not contain control characters')
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return validationError('"verificationUrl" must be an absolute URL')
  }

  if (url.protocol !== 'https:' && url.origin === PRODUCTION_VERIFICATION_ORIGIN) {
    return validationError('"verificationUrl" must use HTTPS')
  }
  if (url.username || url.password) {
    return validationError('"verificationUrl" must not contain userinfo')
  }
  if (!getAllowedVerificationOrigins().has(url.origin)) {
    return validationError('"verificationUrl" origin is not allowed')
  }
  if (url.pathname !== VERIFICATION_PATH || url.hash) {
    return validationError('"verificationUrl" path or fragment is not allowed')
  }

  const queryKeys = Array.from(url.searchParams.keys())
  const tokens = url.searchParams.getAll('token')
  if (
    queryKeys.length !== 1 ||
    queryKeys[0] !== 'token' ||
    tokens.length !== 1 ||
    !tokens[0] ||
    tokens[0].length > 1024
  ) {
    return validationError('"verificationUrl" query must contain only one non-empty token')
  }

  return url.toString()
}

export function validateWebsiteEmailVerificationInput(
  input: unknown,
): WebsiteEmailVerificationInput {
  if (!isPlainObject(input)) validationError('Body must be a JSON object')

  const keys = Object.keys(input)
  if (keys.length !== ALLOWED_BODY_FIELDS.size || keys.some((key) => !ALLOWED_BODY_FIELDS.has(key))) {
    validationError('Body must contain only to, userName, verificationUrl and idempotencyKey')
  }

  const to = requiredTrimmedString(input, 'to', 254).toLowerCase()
  if (!isValidStrictEmail(to)) validationError('"to" must be a valid email address')

  const userName = requiredTrimmedString(input, 'userName', 120)
  if (/[\u0000-\u001f\u007f]/.test(userName)) {
    validationError('"userName" must not contain control characters')
  }

  const verificationUrl = validateVerificationUrl(
    requiredTrimmedString(input, 'verificationUrl', 2048),
  )
  const idempotencyKey = requiredTrimmedString(input, 'idempotencyKey', 128)
  if (
    idempotencyKey.length < 8 ||
    !/^[A-Z0-9][A-Z0-9._:-]*$/i.test(idempotencyKey)
  ) {
    validationError(
      '"idempotencyKey" must be 8-128 characters using letters, numbers, dot, underscore, colon or hyphen',
    )
  }

  return { to, userName, verificationUrl, idempotencyKey }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildWebsiteEmailVerificationMessage(
  input: Pick<WebsiteEmailVerificationInput, 'userName' | 'verificationUrl'>,
): WebsiteEmailVerificationMessage {
  const safeName = escapeHtml(input.userName)
  const safeUrl = escapeHtml(input.verificationUrl)

  return {
    subject: WEBSITE_EMAIL_VERIFICATION_SUBJECT,
    html: `<!doctype html>
<html lang="ru">
  <body>
    <p>Здравствуйте, ${safeName}!</p>
    <p>Подтвердите ваш email для Printcore:</p>
    <p><a href="${safeUrl}">Подтвердить email</a></p>
    <p>Если вы не создавали аккаунт, просто проигнорируйте это письмо.</p>
  </body>
</html>`,
    text: `Здравствуйте, ${input.userName}!

Подтвердите ваш email для Printcore:
${input.verificationUrl}

Если вы не создавали аккаунт, просто проигнорируйте это письмо.`,
  }
}

export async function enqueueWebsiteEmailVerification(
  rawInput: unknown,
): Promise<{ id: number; duplicate: boolean }> {
  const input = validateWebsiteEmailVerificationInput(rawInput)
  const message = buildWebsiteEmailVerificationMessage(input)
  const result = await enqueueMail({
    to: input.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    jobType: 'transactional',
    idempotencyKey: `website-email-verification:${input.idempotencyKey}`,
    maxAttempts: 5,
    payload: {
      source: 'website-email-verification',
    },
  })

  return {
    id: result.id,
    duplicate: result.duplicate === true,
  }
}
