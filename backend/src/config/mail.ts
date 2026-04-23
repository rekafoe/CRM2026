/**
 * SMTP для исходящей почты (очередь mail_jobs).
 * См. docs/customer-notifications-setup.md — те же переменные.
 */
export interface SmtpConfig {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  pass: string | undefined;
  from: string;
  /** From для job_type=marketing, если задано SMTP_FROM_MARKETING, иначе = from */
  fromMarketing: string;
}

export function getSmtpConfig(): SmtpConfig {
  const host = String(process.env.SMTP_HOST || '').trim();
  const from = String(process.env.SMTP_FROM || '').trim();
  const fromMarketing = String(process.env.SMTP_FROM_MARKETING || '').trim() || from;
  const hasHost = Boolean(host);
  const hasFrom = Boolean(from);

  return {
    configured: hasHost && hasFrom,
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    user: (process.env.SMTP_USER || '').trim() || undefined,
    pass: (process.env.SMTP_PASS || '').trim() || undefined,
    from,
    fromMarketing,
  };
}

/** Интервал опроса очереди (мс). По умолчанию 15 с. */
export function getMailOutboxIntervalMs(): number {
  const raw = Number(process.env.MAIL_OUTBOX_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 5000) return raw;
  return 15000;
}

/** Включить фоновую обработку очереди в процессе API (true/false, по умолчанию true). */
export function isMailOutboxWorkerEnabled(): boolean {
  const v = String(process.env.MAIL_OUTBOX_ENABLED ?? 'true').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** Пауза после успешной отправки marketing-задания (мс, снижает «шлейф»). По умолчанию 2 с. */
export function getMarketingSendDelayMs(): number {
  const raw = Number(process.env.MAIL_MARKETING_SEND_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 0) return Math.min(60_000, raw);
  return 2000;
}

/**
 * {{trackingPixel}} / авто-вставка: только marketing + PUBLIC_API_BASE_URL + true.
 */
export function isMailOpenTrackingEnabled(): boolean {
  const v = String(process.env.MAIL_OPEN_TRACKING || '').toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return false;
}

/** Как smtp-«подпись» для письма */
export function getMailFromByJobType(
  cfg: SmtpConfig,
  jobType: 'transactional' | 'marketing' | string
): string {
  if (jobType === 'marketing') {
    return cfg.fromMarketing || cfg.from;
  }
  return cfg.from;
}
