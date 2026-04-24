import { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  createMiniappDraft,
  finalizeMiniappDraft,
  mapMiniappCheckoutErrorToHttp,
  type MiniappCheckoutBody,
} from '../services/miniappCheckoutService';
import { logger } from '../utils/logger';

export class MiniappCheckoutController {
  static async createDraft(req: Request, res: Response) {
    const m = (req as AuthenticatedRequest).miniApp;
    if (!m?.telegramUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const result = await createMiniappDraft(m.telegramUserId, req.body as MiniappCheckoutBody);
      res.status(201).json({
        order: result.order,
        itemIds: result.itemIds ?? [],
        message: 'Черновик создан',
      });
    } catch (e) {
      const mapped = mapMiniappCheckoutErrorToHttp(e);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
      if (e instanceof Error) {
        const msg = e.message || '';
        if (
          msg.includes('необходимо') ||
          msg.includes('Для физ') ||
          msg.includes('Для юр') ||
          msg.includes('не найден')
        ) {
          res.status(400).json({ error: msg });
          return;
        }
      }
      logger.error('miniapp checkout failed', {
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      throw e;
    }
  }

  static async finalize(req: Request, res: Response) {
    const m = (req as AuthenticatedRequest).miniApp;
    if (!m?.telegramUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const orderId = parseInt(String(req.params.orderId), 10);
    try {
      const result = await finalizeMiniappDraft(m.telegramUserId, orderId);
      res.json({
        order: result.order,
        deductionResult: result.deductionResult,
        message: 'Заказ оформлен',
      });
    } catch (e) {
      const mapped = mapMiniappCheckoutErrorToHttp(e);
      if (mapped) {
        res.status(mapped.status).json(mapped.body);
        return;
      }
      logger.error('miniapp finalize failed', {
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      throw e;
    }
  }
}
