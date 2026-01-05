import { Request, Response } from 'express';
import { UnifiedWarehouseService } from '../services/unifiedWarehouseService';
import { logger } from '../utils/logger';

export class UnifiedWarehouseController {
  // Получить все материалы с унифицированными данными
  static getAllMaterials = async (req: Request, res: Response) => {
    try {
      const materials = await UnifiedWarehouseService.getAllMaterials();
      res.json({
        success: true,
        data: materials
      });
    } catch (error: any) {
      logger.error('Ошибка получения материалов', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения материалов',
        details: error.message
      });
    }
  };

  // Получить статистику склада
  static getWarehouseStats = async (req: Request, res: Response) => {
    try {
      const stats = await UnifiedWarehouseService.getWarehouseStats();
      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('Ошибка получения статистики склада', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения статистики склада',
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

      const createdReservations = await UnifiedWarehouseService.reserveMaterials(reservations);
      
      res.json({
        success: true,
        data: createdReservations
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

  // Подтверждение резервов
  static confirmReservations = async (req: Request, res: Response) => {
    try {
      const { reservationIds } = req.body;
      
      if (!Array.isArray(reservationIds) || reservationIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать массив ID резерваций'
        });
        return;
      }

      await UnifiedWarehouseService.confirmReservations(reservationIds);
      
      res.json({
        success: true,
        message: 'Резервы подтверждены'
      });
    } catch (error: any) {
      logger.error('Ошибка подтверждения резервов', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка подтверждения резервов',
        details: error.message
      });
    }
  };

  // Отмена резервов
  static cancelReservations = async (req: Request, res: Response) => {
    try {
      const { reservationIds } = req.body;
      
      if (!Array.isArray(reservationIds) || reservationIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать массив ID резерваций'
        });
        return;
      }

      await UnifiedWarehouseService.cancelReservations(reservationIds);
      
      res.json({
        success: true,
        message: 'Резервы отменены'
      });
    } catch (error: any) {
      logger.error('Ошибка отмены резервов', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка отмены резервов',
        details: error.message
      });
    }
  };

  // Получить резервы по заказу
  static getReservationsByOrder = async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      
      if (!orderId || isNaN(Number(orderId))) {
        res.status(400).json({
          success: false,
          error: 'Необходимо указать корректный ID заказа'
        });
        return;
      }

      const reservations = await UnifiedWarehouseService.getReservationsByOrder(Number(orderId));
      
      res.json({
        success: true,
        data: reservations
      });
    } catch (error: any) {
      logger.error('Ошибка получения резервов по заказу', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка получения резервов по заказу',
        details: error.message
      });
    }
  };

  // Синхронизация с системой ценообразования
  static syncWithPricing = async (req: Request, res: Response) => {
    try {
      await UnifiedWarehouseService.syncWithPricing();
      
      res.json({
        success: true,
        message: 'Синхронизация с системой ценообразования завершена'
      });
    } catch (error: any) {
      logger.error('Ошибка синхронизации с ценообразованием', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка синхронизации с ценообразованием',
        details: error.message
      });
    }
  };
}
