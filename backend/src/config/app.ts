export const config = {
  port: Number(process.env.PORT || 3001),
  corsOrigin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:5173'),
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
