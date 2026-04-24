import { Request, Response } from 'express';
import { CustomerService } from '../modules/customers/services/customerService';
import { TelegramUserService } from '../services/telegramUserService';
import { verifyTelegramInitData } from '../utils/telegramInitData';
import { signMiniAppSession } from '../utils/miniAppSession';
import type { AuthenticatedRequest } from '../middleware/auth';

const DEFAULT_INIT_MAX_AGE = 24 * 3600;
const DEFAULT_SESSION_TTL = 24 * 3600;

function intEnv(name: string, def: number): number {
  const n = parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export class MiniappAuthController {
  /**
   * POST /api/miniapp/auth
   * Body: { initData: string } — сырой query string из Telegram.WebApp.initData
   */
  static async auth(req: Request, res: Response) {
    const initData = (req.body as { initData?: string })?.initData;
    if (initData == null || typeof initData !== 'string' || !initData.trim()) {
      res.status(400).json({ error: 'initData required' });
      return;
    }

    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!botToken) {
      res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' });
      return;
    }

    const maxAge = intEnv('MINIAPP_INIT_DATA_MAX_AGE_SEC', DEFAULT_INIT_MAX_AGE);
    const v = verifyTelegramInitData(initData, botToken, maxAge);
    if (v.valid === false) {
      res.status(401).json({ error: 'init_data_invalid', reason: v.reason });
      return;
    }

    const chatId = String(v.user.id);
    let row = await TelegramUserService.getUserByChatId(chatId);
    if (!row) {
      await TelegramUserService.createUser({
        chat_id: chatId,
        username: v.user.username,
        first_name: v.user.first_name,
        last_name: v.user.last_name,
        role: 'client',
      });
      row = await TelegramUserService.getUserByChatId(chatId);
    } else {
      await TelegramUserService.updateUser(row.id, {
        username: v.user.username,
        first_name: v.user.first_name,
        last_name: v.user.last_name,
      });
    }

    if (!row) {
      res.status(500).json({ error: 'failed_to_ensure_telegram_user' });
      return;
    }

    const ttl = intEnv('MINIAPP_SESSION_TTL_SEC', DEFAULT_SESSION_TTL);
    const token = signMiniAppSession(chatId, ttl);

    res.json({
      token,
      token_type: 'Bearer',
      expires_in: ttl,
      telegram: {
        id: row.id,
        chat_id: row.chat_id,
        username: row.username,
        first_name: row.first_name,
        last_name: row.last_name,
      },
    });
  }

  /**
   * GET /api/miniapp/me
   */
  static async me(req: Request, res: Response) {
    const m = (req as AuthenticatedRequest).miniApp;
    if (!m?.telegramUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const row = await TelegramUserService.getUserByChatId(m.telegramUserId);
    if (!row) {
      res.status(404).json({ error: 'telegram_user_not_found' });
      return;
    }

    const crmId = await TelegramUserService.getCrmCustomerIdByChatId(m.telegramUserId);
    let crm: { customer_id: number; phone: string | null; email: string | null } | null = null;
    if (crmId) {
      const cust = await CustomerService.getCustomerById(crmId);
      if (cust) {
        crm = {
          customer_id: cust.id,
          phone: cust.phone && String(cust.phone).trim() ? String(cust.phone).trim() : null,
          email: cust.email && String(cust.email).trim() ? String(cust.email).trim() : null,
        };
      }
    }

    res.json({
      telegram: {
        id: row.id,
        chat_id: row.chat_id,
        username: row.username,
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.role,
      },
      crm,
    });
  }
}
