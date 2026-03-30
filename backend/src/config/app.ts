function parseCorsOrigin(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) {
    const fallback =
      process.env.NODE_ENV === 'production'
        ? 'https://your-domain.com'
        : 'http://localhost:5173';
    return [fallback];
  }
  return raw
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Vercel CRM (и preview *.vercel.app) — прямой fetch на Railway для multipart upload */
const VERCEL_APP_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i

/** Список разрешённых Origin для CORS */
export function getCorsAllowedOrigins(): string[] {
  return parseCorsOrigin();
}

/**
 * Динамический origin для cors(): env + любой https://*.vercel.app (иначе preflight fetch с printcrm → Railway падает).
 */
export function corsDynamicOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void {
  const allowed = getCorsAllowedOrigins()
  if (!origin) {
    callback(null, true)
    return
  }
  if (allowed.includes(origin)) {
    callback(null, true)
    return
  }
  if (VERCEL_APP_ORIGIN_RE.test(origin)) {
    callback(null, true)
    return
  }
  callback(null, false)
}

export const config = {
  port: Number(process.env.PORT || 3001),
  corsOrigin: parseCorsOrigin(),
  nodeEnv: process.env.NODE_ENV || 'development',
  showErrorStack: process.env.SHOW_ERROR_STACK !== 'false' && process.env.NODE_ENV !== 'production',
  sentryDsn: process.env.SENTRY_DSN,
  flyersAnchorRush: Number(process.env.FLYERS_ANCHOR_RUSH || 104.85),
  flyersAnchorOnline: Number(process.env.FLYERS_ANCHOR_ONLINE || 89.86),
  flyersAnchorPromo: Number(process.env.FLYERS_ANCHOR_PROMO || 41.23),
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 100),
  rateLimitWindow: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), // 15 минут
}
