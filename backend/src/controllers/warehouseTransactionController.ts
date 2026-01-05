import { Request, Response } from 'express';
import { WarehouseTransactionService } from '../services/warehouseTransactionService';
import { logger } from '../utils/logger';

export class WarehouseTransactionController {
  // Выполнить транзакцию
  static executeTransaction = async (req: Request, res: Response) => {
    try {
      const { operations } = req.body;
      
      if (!Array.isArray(operations) || operations.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать массив операций'
        });
        return;
      }

      const results = await WarehouseTransactionService.executeTransaction(operations);
      
      res.json({
        success: true,
        data: results
      });
    } catch (error: any) {
      logger.error('Ошибка выполнения транзакции', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка выполнения транзакции',
        details: error.message
      });
    }
  };

  // Безопасное списание материалов
  static spendMaterial = async (req: Request, res: Response) => {
    try {
      const { materialId, quantity, reason, orderId, userId } = req.body;
      
      if (!materialId || !quantity || !reason) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать materialId, quantity и reason'
        });
        return;
      }

      // TODO: Update to use new API
      const result = await WarehouseTransactionService.spendMaterials(
        materialId, 
        quantity, 
        reason, 
        orderId, 
        userId
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Ошибка списания материала', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка списания материала',
        details: error.message
      });
    }
  };

  // Безопасное добавление материалов
  static addMaterial = async (req: Request, res: Response) => {
    try {
      const { materialId, quantity, reason, orderId, userId } = req.body;
      
      if (!materialId || !quantity || !reason) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать materialId, quantity и reason'
        });
        return;
      }

      const result = await WarehouseTransactionService.addMaterials(
        materialId, 
        quantity, 
        reason, 
        orderId, 
        userId
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Ошибка добавления материала', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка добавления материала',
        details: error.message
      });
    }
  };

  // Безопасная корректировка остатков
  static adjustStock = async (req: Request, res: Response) => {
    try {
      const { materialId, newQuantity, reason, userId } = req.body;
      
      if (!materialId || newQuantity === undefined || !reason) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать materialId, newQuantity и reason'
        });
        return;
      }

      // TODO: Implement using new API
      res.status(501).json({ error: 'Not implemented yet' });
    } catch (error: any) {
      logger.error('Ошибка корректировки остатков', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка корректировки остатков',
        details: error.message
      });
    }
  };

  // Резервирование материалов
  static reserveMaterials = async (req: Request, res: Response) => {
    try {
      const { reservations } = req.body;
      
      if (!Array.isArray(reservations) || reservations.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать массив резерваций'
        });
        return;
      }

      const results = await WarehouseTransactionService.reserveMaterials(reservations);
      
      res.json({
        success: true,
        data: results
      });
    } catch (error: any) {
      logger.error('Ошибка резервирования материалов', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка резервирования материалов',
        details: error.message
      });
    }
  };

  // Отмена резерва
  static unreserveMaterials = async (req: Request, res: Response) => {
    try {
      const { materialIds, orderId } = req.body;
      
      if (!Array.isArray(materialIds) || !orderId) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать materialIds и orderId'
        });
        return;
      }

      const results = await WarehouseTransactionService.cancelReservations(materialIds);
      
      res.json({
        success: true,
        data: results
      });
    } catch (error: any) {
      logger.error('Ошибка отмены резерва', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка отмены резерва',
        details: error.message
      });
    }
  };

  // Проверка доступности материалов
  static checkAvailability = async (req: Request, res: Response) => {
    try {
      const { materialRequirements } = req.body;
      
      if (!Array.isArray(materialRequirements) || materialRequirements.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать массив требований к материалам'
        });
        return;
      }

      // TODO: Implement using new API
      res.status(501).json({ error: 'Not implemented yet' });
    } catch (error: any) {
      logger.error('Ошибка проверки доступности', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка проверки доступности',
        details: error.message
      });
    }
  };

  // Получение истории операций
  static getOperationHistory = async (req: Request, res: Response) => {
    try {
      const { materialId, orderId, limit } = req.query;
      
      // TODO: Implement using new API
      res.status(501).json({ error: 'Not implemented yet' });
    } catch (error: any) {
      logger.error('Ошибка получения истории операций', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения истории операций',
        details: error.message
      });
    }
  };
}
