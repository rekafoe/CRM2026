import { Request, Response } from 'express';
import { AutoOrderService } from '../services/autoOrderService';
import { AuthenticatedRequest } from '../middleware';

export class AutoOrderController {
  /**
   * Получить все правила авто-заказа
   */
  static async getRules(req: Request, res: Response) {
    try {
      const rules = await AutoOrderService.getAutoOrderRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Создать правило авто-заказа
   */
  static async createRule(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined;
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }

      const rule = await AutoOrderService.createAutoOrderRule(req.body);
      res.status(201).json(rule);
    } catch (error: any) {
      const status = error.message.includes('не найден') ? 404 : 500;
      res.status(status).json({ error: error.message });
    }
  }

  /**
   * Обновить правило авто-заказа
   */
  static async updateRule(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined;
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }

      const id = Number(req.params.id);
      const rule = await AutoOrderService.updateAutoOrderRule(id, req.body);
      res.json(rule);
    } catch (error: any) {
      const status = error.message.includes('не найдено') ? 404 : 500;
      res.status(status).json({ error: error.message });
    }
  }

  /**
   * Удалить правило авто-заказа
   */
  static async deleteRule(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined;
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }

      const id = Number(req.params.id);
      await AutoOrderService.deleteAutoOrderRule(id);
      res.status(204).end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Проверить материалы на необходимость авто-заказа
   */
  static async checkMaterials(req: Request, res: Response) {
    try {
      const requests = await AutoOrderService.checkMaterialsForAutoOrder();
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Создать заявку на авто-заказ
   */
  static async createRequest(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined;
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }

      const request = await AutoOrderService.createAutoOrderRequest(req.body);
      res.status(201).json(request);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Получить все заявки на авто-заказ
   */
  static async getRequests(req: Request, res: Response) {
    try {
      const requests = await AutoOrderService.getAutoOrderRequests();
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Обновить статус заявки
   */
  static async updateRequestStatus(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined;
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }

      const id = Number(req.params.id);
      const { status } = req.body;
      
      if (!status) {
        res.status(400).json({ error: 'Status is required' });
        return;
      }

      await AutoOrderService.updateRequestStatus(id, status);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Получить шаблоны сообщений
   */
  static async getTemplates(req: Request, res: Response) {
    try {
      const templates = await AutoOrderService.getTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Создать шаблон сообщения
   */
  static async createTemplate(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined;
      if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Forbidden' });
        return;
      }

      const template = await AutoOrderService.createTemplate(req.body);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Генерировать сообщение для заказа
   */
  static async generateMessage(req: Request, res: Response) {
    try {
      const { requestId, templateId } = req.body;
      
      if (!requestId) {
        res.status(400).json({ error: 'Request ID is required' });
        return;
      }

      // Получаем заявку
      const requests = await AutoOrderService.getAutoOrderRequests();
      const request = requests.find(r => r.id === requestId);
      
      if (!request) {
        res.status(404).json({ error: 'Request not found' });
        return;
      }

      const message = await AutoOrderService.generateOrderMessage(request, templateId);
      res.json({ message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
