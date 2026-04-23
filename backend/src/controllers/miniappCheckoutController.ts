import { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  mapMiniappCheckoutErrorToHttp,
  submitMiniappCheckout,
  type MiniappCheckoutBody,
} from '../services/miniappCheckoutService';
import { logger } from '../utils/logger';

export class MiniappCheckoutController {
  static async checkout(req: Request, res: Response) {
    const m = (req as AuthenticatedRequest).miniApp;
    if (!m?.telegramUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const result = await submitMiniappCheckout(m.telegramUserId, req.body as MiniappCheckoutBody);
      res.status(201).json({
        order: result.order,
        deductionResult: result.deductionResult,
        message: 'Заказ создан',
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
}
