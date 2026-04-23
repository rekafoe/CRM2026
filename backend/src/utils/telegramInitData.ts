import crypto from 'crypto';

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

/**
 * Валидация Telegram.WebApp.initData (классический HMAC, не third-party Ed25519).
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSec: number
):
  | { valid: true; user: TelegramWebAppUser; authDate: number }
  | { valid: false; reason: string } {
  const raw = (initData || '').trim();
  if (!raw) {
    return { valid: false, reason: 'empty' };
  }
  if (!botToken) {
    return { valid: false, reason: 'no_bot_token' };
  }

  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash) {
    return { valid: false, reason: 'no_hash' };
  }
  params.delete('hash');

  const keys = [...new Set([...params.keys()])].sort();
  const lines: string[] = [];
  for (const k of keys) {
    const v = params.get(k);
    if (v != null) {
      lines.push(`${k}=${v}`);
    }
  }
  const dataCheckString = lines.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken, 'utf8').digest();
  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString, 'utf8')
    .digest('hex');

  if (!constantTimeStringEqualHex(computed, hash)) {
    return { valid: false, reason: 'bad_hash' };
  }

  const authDateRaw = params.get('auth_date');
  const authDate = authDateRaw != null ? parseInt(authDateRaw, 10) : NaN;
  if (Number.isNaN(authDate)) {
    return { valid: false, reason: 'no_auth_date' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (authDate - now > 300) {
    return { valid: false, reason: 'auth_future' };
  }
  if (now - authDate > maxAgeSec) {
    return { valid: false, reason: 'stale' };
  }

  const userJson = params.get('user');
  if (!userJson) {
    return { valid: false, reason: 'no_user' };
  }
  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userJson) as TelegramWebAppUser;
  } catch {
    return { valid: false, reason: 'user_json' };
  }
  if (typeof user.id !== 'number' || !user.id) {
    return { valid: false, reason: 'user_id' };
  }

  return { valid: true, user, authDate };
}

function constantTimeStringEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
