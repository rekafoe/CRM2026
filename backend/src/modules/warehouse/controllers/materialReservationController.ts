import { Request, Response } from 'express';
import { MaterialReservationService } from '../services/materialReservationService';
import { Database } from 'sqlite';
import { logger } from '../../../utils/logger';

export class MaterialReservationController {
  private reservationService: MaterialReservationService;

  constructor(database: Database) {
    this.reservationService = new MaterialReservationService(database);
  }

  /**
   * Создать резервирование материала
   */
  async createReservation(req: Request, res: Response): Promise<void> {
    try {
      const {
        material_id,
        order_id,
        quantity_reserved,
        expires_at,
        notes
      } = req.body;

      // Валидация
      if (!material_id || !quantity_reserved) {
        res.status(400).json({
          success: false,
          message: 'material_id и quantity_reserved обязательны'
        });
        return;
      }

      if (quantity_reserved <= 0) {
        res.status(400).json({
          success: false,
          message: 'Количество должно быть больше 0'
        });
        return;
      }

      const reservation = await this.reservationService.createReservation({
        material_id,
        order_id,
        quantity_reserved,
        expires_at,
        reserved_by: (req as any).user?.id,
        notes
      });

      logger.info(`[MaterialReservationController] Created reservation ${reservation.id} for material ${material_id}`);

      res.status(201).json({
        success: true,
        data: reservation,
        message: 'Резервирование создано успешно'
      });
    } catch (error: any) {
      logger.error('[MaterialReservationController] createReservation error', error);
      
      if (error.message.includes('Insufficient material')) {
        res.status(409).json({
          success: false,
          message: 'Недостаточно материала на складе',
          details: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Ошибка при создании резервирования',
        error: error.message
      });
    }
  }

  /**
   * Получить все резервирования
   */
  async getAllReservations(req: Request, res: Response): Promise<void> {
    try {
      const reservations = await this.reservationService.getAllReservations();

      res.json({
        success: true,
        data: reservations,
        count: reservations.length
      });
    } catch (error: any) {
      logger.error('[MaterialReservationController] getAllReservations error', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении резервирований',
        error: error.message
      });
    }
  }

  /**
   * Получить резервирования по материалу
   */
  async getReservationsByMaterial(req: Request, res: Response): Promise<void> {
    try {
      const { materialId } = req.params;
      const material_id = parseInt(materialId);

      if (isNaN(material_id)) {
        res.status(400).json({
          success: false,
          message: 'Некорректный ID материала'
        });
        return;
      }

      const reservations = await this.reservationService.getReservationsByMaterial(material_id);

      res.json({
        success: true,
        data: reservations,
        count: reservations.length
      });
    } catch (error: any) {
      logger.error('[MaterialReservationController] getReservationsByMaterial error', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении резервирований материала',
        error: error.message
      });
    }
  }

  /**
   * Обновить резервирование
   */
  async updateReservation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const reservationId = parseInt(id);
      const updates = req.body;

      if (isNaN(reservationId)) {
        res.status(400).json({
          success: false,
          message: 'Некорректный ID резервирования'
        });
        return;
      }

      const reservation = await this.reservationService.updateReservation(
        reservationId,
        updates,
        (req as any).user?.id
      );

      logger.info(`[MaterialReservationController] Updated reservation ${reservationId}`);

      res.json({
        success: true,
        data: reservation,
        message: 'Резервирование обновлено успешно'
      });
    } catch (error: any) {
      logger.error('[MaterialReservationController] updateReservation error', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при обновлении резервирования',
        error: error.message
      });
    }
  }

  /**
   * Отменить резервирование
   */
  async cancelReservation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const reservationId = parseInt(id);
      const { reason } = req.body;

      if (isNaN(reservationId)) {
        res.status(400).json({
          success: false,
          message: 'Некорректный ID резервирования'
        });
        return;
      }

      await this.reservationService.cancelReservation(
        reservationId,
        reason,
        (req as any).user?.id
      );

      logger.info(`[MaterialReservationController] Cancelled reservation ${reservationId}`);

      res.json({
        success: true,
        message: 'Резервирование отменено успешно'
      });
    } catch (error: any) {
      logger.error('[MaterialReservationController] cancelReservation error', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при отмене резервирования',
        error: error.message
      });
    }
  }

  /**
   * Выполнить резервирование (списать со склада)
   */
  async fulfillReservation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const reservationId = parseInt(id);

      if (isNaN(reservationId)) {
        res.status(400).json({
          success: false,
          message: 'Некорректный ID резервирования'
        });
        return;
      }

      await this.reservationService.fulfillReservation(
        reservationId,
        (req as any).user?.id
      );

      logger.info(`[MaterialReservationController] Fulfilled reservation ${reservationId}`);

      res.json({
        success: true,
        message: 'Резервирование выполнено успешно'
      });
    } catch (error: any) {
      logger.error('[MaterialReservationController] fulfillReservation error', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при выполнении резервирования',
        error: error.message
      });
    }
  }

  /**
   * Получить доступное количество материала
   */
  async getAvailableQuantity(req: Request, res: Response): Promise<void> {
    try {
      const { materialId } = req.params;
      const material_id = parseInt(materialId);

      if (isNaN(material_id)) {
        res.status(400).json({
          success: false,
          message: 'Некорректный ID материала'
        });
        return;
      }

      const availableQuantity = await this.reservationService.getAvailableQuantity(material_id);

      res.json({
        success: true,
        data: {
          material_id,
          available_quantity: availableQuantity
        }
      });
    } catch (error: any) {
      logger.error('[MaterialReservationController] getAvailableQuantity error', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении доступного количества',
        error: error.message
      });
    }
  }

  /**
   * Очистить истекшие резервирования
   */
  async cleanupExpiredReservations(req: Request, res: Response): Promise<void> {
    try {
      const expiredCount = await this.reservationService.cleanupExpiredReservations();

      logger.info(`[MaterialReservationController] Cleaned up ${expiredCount} expired reservations`);

      res.json({
        success: true,
        data: {
          expired_count: expiredCount
        },
        message: `Очищено ${expiredCount} истекших резервирований`
      });
    } catch (error: any) {
      logger.error('[MaterialReservationController] cleanupExpiredReservations error', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при очистке истекших резервирований',
        error: error.message
      });
    }
  }
}

