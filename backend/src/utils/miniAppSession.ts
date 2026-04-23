import crypto from 'crypto';
import { config } from '../config/app';

const TOKEN_PREFIX = 'mapp1.';

export type MiniAppSessionPayload = { sub: string; iat: number; exp: number };

/**
 * Сессия мини-апа: HMAC, префикс mapp1. — не пересекается с api_token из users.
 */
export function signMiniAppSession(telegramUserId: string, expiresInSec: number = 7 * 24 * 3600): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSec;
  const body: MiniAppSessionPayload = { sub: String(telegramUserId), iat, exp };
  const bodyB64 = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const secret = (process.env.MINIAPP_SESSION_SECRET || config.jwtSecret).trim() || 'change-me-in-production';
  const sig = crypto.createHmac('sha256', secret).update(bodyB64, 'utf8').digest('base64url');
  return `${TOKEN_PREFIX}${bodyB64}.${sig}`;
}

export function verifyMiniAppSession(token: string): MiniAppSessionPayload | null {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const rest = token.slice(TOKEN_PREFIX.length);
  const lastDot = rest.lastIndexOf('.');
  if (lastDot < 0) {
    return null;
  }
  const bodyB64 = rest.slice(0, lastDot);
  const sig = rest.slice(lastDot + 1);
  const secret = (process.env.MINIAPP_SESSION_SECRET || config.jwtSecret).trim() || 'change-me-in-production';
  const expected = crypto.createHmac('sha256', secret).update(bodyB64, 'utf8').digest('base64url');
  if (sig.length !== expected.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))) {
    return null;
  }
  let payload: MiniAppSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as MiniAppSessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    return null;
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return null;
  }
  if (Date.now() / 1000 > payload.exp) {
    return null;
  }
  return payload;
}

export function isMiniAppBearerToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}
