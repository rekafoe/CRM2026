import nodemailer, { Transporter } from 'nodemailer';
import { getSmtpConfig, getSmtpTimeoutMs } from '../config/mail';
import { logger } from '../utils/logger';

let transporter: Transporter | null = null;

export function getMailTransporter(): Transporter | null {
  const cfg = getSmtpConfig();
  if (!cfg.configured) {
    return null;
  }
  if (!transporter) {
    const t = getSmtpTimeoutMs();
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      connectionTimeout: t,
      greetingTimeout: t,
      socketTimeout: t,
      auth:
        cfg.user && cfg.pass
          ? {
              user: cfg.user,
              pass: cfg.pass,
            }
          : undefined,
    });
    logger.info('Mail transporter initialized', { host: cfg.host, port: cfg.port, timeoutMs: t });
  }
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Прямая отправка (без очереди). Для тестов и редких сценариев.
 */
export async function sendMailDirect(input: SendMailInput): Promise<void> {
  const cfg = getSmtpConfig();
  if (!cfg.configured) {
    throw new Error('SMTP not configured (set SMTP_HOST and SMTP_FROM)');
  }
  const transport = getMailTransporter();
  if (!transport) throw new Error('Mail transporter unavailable');

  await transport.sendMail({
    from: cfg.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text ?? (input.html ? undefined : ''),
  });
}
