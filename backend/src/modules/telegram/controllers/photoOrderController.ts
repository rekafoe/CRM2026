import { Request, Response } from 'express';
import { PhotoOrderService } from '../services/photoOrderService';
import { ImageProcessingService } from '../services/imageProcessingService';
import { TelegramService } from '../services/telegramService';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../../utils/logger';

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/photos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `photo_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10 // максимум 10 файлов
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены!'));
    }
  }
});

export class PhotoOrderController {
  /**
   * Получение доступных размеров фото
   */
  static async getAvailableSizes(req: Request, res: Response) {
    try {
      const sizes = ImageProcessingService.getAvailableSizes();
      const prices = await PhotoOrderService.getAllPrices();

      const sizesWithPrices = sizes.map(size => ({
        ...size,
        price: prices[size.name] || 0,
        priceRub: ((prices[size.name] || 0) / 100).toFixed(0)
      }));

      res.json({
        success: true,
        data: sizesWithPrices
      });
    } catch (error) {
      logger.error('Error getting available sizes', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении размеров'
      });
    }
  }

  /**
   * Создание заказа фото
   */
  static async createOrder(req: Request, res: Response) {
    try {
      const { chatId, username, firstName, selectedSize, processingOptions, quantity, notes } = req.body;

      if (!chatId || !selectedSize || !processingOptions || !quantity) {
        return res.status(400).json({
          success: false,
          message: 'Не все обязательные поля заполнены'
        });
      }

      // Проверяем, что размер существует
      const size = ImageProcessingService.getSizeByName(selectedSize.name);
      if (!size) {
        return res.status(400).json({
          success: false,
          message: 'Неверный размер фотографии'
        });
      }

      // Получаем пути к загруженным файлам
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Не загружены фотографии'
        });
      }

      const originalPhotos = files.map(file => file.path);

      // Создаем заказ
      const order = await PhotoOrderService.createOrder({
        chatId,
        username,
        firstName,
        originalPhotos,
        selectedSize: size,
        processingOptions,
        quantity: parseInt(quantity),
        notes
      });

      res.json({
        success: true,
        data: order
      });
    } catch (error) {
      logger.error('Error creating photo order', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при создании заказа'
      });
    }
  }

  /**
   * Получение заказов пользователя
   */
  static async getUserOrders(req: Request, res: Response) {
    try {
      const { chatId } = req.params;

      if (!chatId) {
        return res.status(400).json({
          success: false,
          message: 'Chat ID не указан'
        });
      }

      const orders = await PhotoOrderService.getOrdersByChatId(chatId);

      res.json({
        success: true,
        data: orders
      });
    } catch (error) {
      logger.error('Error getting user orders', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении заказов'
      });
    }
  }

  /**
   * Получение заказа по ID
   */
  static async getOrderById(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'ID заказа не указан'
        });
      }

      const order = await PhotoOrderService.getOrderById(parseInt(orderId));

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Заказ не найден'
        });
      }

      res.json({
        success: true,
        data: order
      });
    } catch (error) {
      logger.error('Error getting order by ID', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при получении заказа'
      });
    }
  }

  /**
   * Обновление статуса заказа
   */
  static async updateOrderStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { status } = req.body;

      if (!orderId || !status) {
        return res.status(400).json({
          success: false,
          message: 'ID заказа и статус обязательны'
        });
      }

      const validStatuses = ['pending', 'processing', 'ready_for_approval', 'approved', 'rejected', 'completed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Неверный статус заказа'
        });
      }

      const success = await PhotoOrderService.updateOrderStatus(parseInt(orderId), status);

      if (!success) {
        return res.status(500).json({
          success: false,
          message: 'Ошибка при обновлении статуса'
        });
      }

      res.json({
        success: true,
        message: 'Статус заказа обновлен'
      });
    } catch (error) {
      logger.error('Error updating order status', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при обновлении статуса'
      });
    }
  }

  /**
   * Отправка обработанных фото пользователю
   */
  static async sendProcessedPhotos(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'ID заказа не указан'
        });
      }

      const order = await PhotoOrderService.getOrderById(parseInt(orderId));

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Заказ не найден'
        });
      }

      if (order.status !== 'ready_for_approval') {
        return res.status(400).json({
          success: false,
          message: 'Заказ не готов для отправки'
        });
      }

      // Отправляем обработанные фото пользователю
      let sentCount = 0;
      for (const processedPhoto of order.processedPhotos) {
        try {
          const success = await TelegramService.sendDocumentToUser(
            order.chatId,
            processedPhoto.processedPath,
            `📸 Обработанное фото ${order.selectedSize.name}\n\n` +
            `📏 Размер: ${processedPhoto.metadata.processedWidth}x${processedPhoto.metadata.processedHeight}\n` +
            `📁 Размер файла: ${(processedPhoto.metadata.fileSize / 1024).toFixed(2)}KB\n` +
            `🎨 Режим: ${processedPhoto.options.cropMode === 'crop' ? 'Кроп' : 'Вписать с полями'}`
          );
          
          if (success) {
            sentCount++;
          }
        } catch (error) {
          logger.error(`Error sending photo ${processedPhoto.processedPath}`, error);
        }
      }

      // Отправляем сообщение с информацией о заказе
      const totalPriceRub = (order.totalPrice / 100).toFixed(0);
      const message = `📸 *ВАШ ЗАКАЗ ГОТОВ К ПОДТВЕРЖДЕНИЮ*\n\n` +
                     `🆔 Заказ #${order.id}\n` +
                     `📏 Размер: ${order.selectedSize.name}\n` +
                     `📸 Фотографий: ${order.originalPhotos.length}\n` +
                     `📦 Копий: ${order.quantity}\n` +
                     `💰 Стоимость: ${totalPriceRub} руб.\n` +
                     `📤 Отправлено фото: ${sentCount}/${order.processedPhotos.length}\n\n` +
                     `✅ Для подтверждения заказа ответьте "Подтвердить #${order.id}"\n` +
                     `❌ Для отмены заказа ответьте "Отменить #${order.id}"`;

      await TelegramService.sendMessageToUser(order.chatId, message);

      res.json({
        success: true,
        message: `Отправлено ${sentCount} из ${order.processedPhotos.length} фотографий`,
        data: { sentCount, totalCount: order.processedPhotos.length }
      });
    } catch (error) {
      logger.error('Error sending processed photos', error);
      res.status(500).json({
        success: false,
        message: 'Ошибка при отправке фотографий'
      });
    }
  }

  /**
   * Middleware для загрузки файлов
   */
  static getUploadMiddleware() {
    return upload.array('photos', 10);
  }
}
