import { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  attachFileToMiniappOrder,
  getMiniappOrderDetail,
  listMiniappOrders,
} from '../services/miniappOrderService';
import { getMiniappOrderFileForDownload } from '../services/miniappOrderFileDownloadService';

function miniChatId(req: Request): string | null {
  return (req as AuthenticatedRequest).miniApp?.telegramUserId?.trim() || null;
}

export class MiniappOrderController {
  static async list(req: Request, res: Response) {
    const chatId = miniChatId(req);
    if (!chatId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const limitRaw = (req.query as { limit?: string }).limit;
    const limit = limitRaw != null ? parseInt(String(limitRaw), 10) : undefined;
    const { orders, available } = await listMiniappOrders(chatId, {
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json({
      orders,
      meta: { telegram_orders: available, ...(available ? {} : { hint: 'Apply DB migrations (telegram_chat_id on orders)' }) },
    });
  }

  static async downloadFile(req: Request, res: Response) {
    const chatId = miniChatId(req);
    if (!chatId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const orderId = parseInt(String(req.params.orderId), 10);
    const fileId = parseInt(String(req.params.fileId), 10);
    if (!Number.isFinite(orderId) || orderId < 1 || !Number.isFinite(fileId) || fileId < 1) {
      res.status(400).json({ error: 'Invalid orderId or fileId' });
      return;
    }
    const result = await getMiniappOrderFileForDownload(chatId, orderId, fileId);
    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, message: result.message });
      return;
    }
    const displayName = result.displayName;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${String(displayName).replace(/"/g, '%22')}"; filename*=UTF-8''${encodeURIComponent(displayName)}`
    );
    res.setHeader('Content-Length', String(result.buffer.length));
    if (result.mime) {
      res.setHeader('Content-Type', result.mime);
    }
    res.send(result.buffer);
  }

  static async getOne(req: Request, res: Response) {
    const chatId = miniChatId(req);
    if (!chatId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const orderId = parseInt(String(req.params.orderId), 10);
    if (!Number.isFinite(orderId) || orderId < 1) {
      res.status(400).json({ error: 'Invalid orderId' });
      return;
    }
    const data = await getMiniappOrderDetail(chatId, orderId);
    if (!data) {
      res.status(404).json({ error: 'Заказ не найден' });
      return;
    }
    res.json(data);
  }

  static async uploadFile(req: Request, res: Response) {
    const chatId = miniChatId(req);
    if (!chatId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const orderId = parseInt(String(req.params.orderId), 10);
    if (!Number.isFinite(orderId) || orderId < 1) {
      res.status(400).json({ error: 'Invalid orderId' });
      return;
    }
    const f = (req as any).file as
      | { buffer?: Buffer; originalname?: string; originalName?: string; mimetype?: string }
      | undefined;
    if (!f) {
      res.status(400).json({ message: 'Файл не получен' });
      return;
    }
    const buf = f.buffer;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({
        message:
          'Тело файла пустое (0 байт). Отправьте multipart/form-data с полем file (без ручного Content-Type).',
      });
      return;
    }
    const nameFromClient = f.originalname ?? f.originalName ?? 'file';
    const body = req.body as { orderItemId?: string | number | null };
    const orderItemIdRaw = body?.orderItemId;
    let orderItemId: number | null = null;
    if (orderItemIdRaw !== undefined && orderItemIdRaw !== null && String(orderItemIdRaw) !== '') {
      const n = Number(orderItemIdRaw);
      if (Number.isFinite(n)) {
        orderItemId = n;
      }
    }

    const result = await attachFileToMiniappOrder(chatId, orderId, {
      buffer: buf,
      originalName: nameFromClient,
      mimetype: f.mimetype || null,
    }, orderItemId);

    if (result.ok === false) {
      res.status(result.status).json({ error: result.message, message: result.message });
      return;
    }
    res.status(201).json(result.row);
  }
}
