import { getDb } from '../../../db';
import { ImageProcessingService, PhotoSize, ProcessingOptions, ProcessedPhoto } from './imageProcessingService';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../../utils/logger';

export interface PhotoOrder {
  id: number;
  chatId: string;
  username?: string;
  firstName?: string;
  status: 'pending' | 'processing' | 'ready_for_approval' | 'approved' | 'rejected' | 'completed';
  originalPhotos: string[]; // Пути к оригинальным фото
  processedPhotos: ProcessedPhoto[]; // Обработанные фото
  selectedSize: PhotoSize;
  processingOptions: ProcessingOptions;
  quantity: number;
  totalPrice: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePhotoOrderRequest {
  chatId: string;
  username?: string;
  firstName?: string;
  originalPhotos: string[];
  selectedSize: PhotoSize;
  processingOptions: ProcessingOptions;
  quantity: number;
  notes?: string;
}

export class PhotoOrderService {
  // Цены за печать (в копейках) — фолбэк
  private static readonly PRICES: Record<string, number> = {
    '9x13': 1500,    // 15 рублей
    '10x15': 2000,   // 20 рублей
    '13x18': 3000,   // 30 рублей
    '15x21': 4000,   // 40 рублей
    '18x24': 6000,   // 60 рублей
    '20x30': 8000,   // 80 рублей
    '21x29.7': 10000 // 100 рублей
  };

  private static async getPriceFromDb(sizeName: string): Promise<number | null> {
    try {
      const db = await getDb();
      const row = await db.get(
        `SELECT price_kopecks FROM photo_print_prices WHERE size_name = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`,
        [sizeName]
      );
      return row ? Number((row as any).price_kopecks) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Создание нового заказа фото
   */
  static async createOrder(request: CreatePhotoOrderRequest): Promise<PhotoOrder> {
    try {
      logger.debug(`Creating photo order for ${request.chatId}`);
      
      const db = await getDb();
      const dbPrice = await this.getPriceFromDb(request.selectedSize.name);
      const unitPrice = dbPrice ?? this.PRICES[request.selectedSize.name] ?? 0;
      const totalPrice = unitPrice * request.quantity;
      
      // Создаем заказ в базе данных
      const result = await db.run(
        `
        INSERT INTO photo_orders (
          chat_id, username, first_name, status, 
          selected_size, processing_options, quantity, total_price, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
        [
          request.chatId,
          request.username,
          request.firstName,
          'processing',
          JSON.stringify(request.selectedSize),
          JSON.stringify(request.processingOptions),
          request.quantity,
          totalPrice,
          request.notes
        ]
      );

      const orderId = Number((result as any).lastID);

      // Обрабатываем фотографии
      const processedPhotos: ProcessedPhoto[] = [];
      
      for (const photoPath of request.originalPhotos) {
        try {
          const processedPhoto = await ImageProcessingService.processPhoto(
            photoPath,
            request.selectedSize,
            request.processingOptions
          );
          processedPhotos.push(processedPhoto);
        } catch (error) {
          logger.error(`Error processing photo ${photoPath}`, error);
        }
      }

      // Сохраняем пути к обработанным фото
      await db.run(
        `
        UPDATE photo_orders 
        SET original_photos = ?, processed_photos = ?, status = ?
        WHERE id = ?
      `,
        [
          JSON.stringify(request.originalPhotos),
          JSON.stringify(processedPhotos),
          'ready_for_approval',
          orderId
        ]
      );

      const order: PhotoOrder = {
        id: orderId,
        chatId: request.chatId,
        username: request.username,
        firstName: request.firstName,
        status: 'ready_for_approval',
        originalPhotos: request.originalPhotos,
        processedPhotos,
        selectedSize: request.selectedSize,
        processingOptions: request.processingOptions,
        quantity: request.quantity,
        totalPrice,
        notes: request.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      logger.info(`Photo order created: ${orderId}`);
      return order;
    } catch (error) {
      logger.error('Error creating photo order', error);
      throw error;
    }
  }

  /**
   * Получение заказа по ID
   */
  static async getOrderById(orderId: number): Promise<PhotoOrder | null> {
    try {
      const db = await getDb();
      const row = await db.get(`
        SELECT * FROM photo_orders WHERE id = ?
      `, orderId);

      if (!row) return null;

      return this.mapRowToOrder(row);
    } catch (error) {
      logger.error('Error getting order by ID', error);
      return null;
    }
  }

  /**
   * Получение заказов пользователя
   */
  static async getOrdersByChatId(chatId: string): Promise<PhotoOrder[]> {
    try {
      const db = await getDb();
      const rows = await db.all(`
        SELECT * FROM photo_orders 
        WHERE chat_id = ? 
        ORDER BY created_at DESC
      `, chatId);

      return rows.map(row => this.mapRowToOrder(row));
    } catch (error) {
      logger.error('Error getting orders by chat ID', error);
      return [];
    }
  }

  /**
   * Обновление статуса заказа
   */
  static async updateOrderStatus(orderId: number, status: PhotoOrder['status']): Promise<boolean> {
    try {
      const db = await getDb();
      await db.run(`
        UPDATE photo_orders 
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [status, orderId]);

      logger.info(`Order ${orderId} status updated to ${status}`);
      return true;
    } catch (error) {
      logger.error('Error updating order status', error);
      return false;
    }
  }

  /**
   * Получение цены за размер (с проверкой БД)
   */
  static async getPriceForSize(sizeName: string): Promise<number> {
    const dbPrice = await this.getPriceFromDb(sizeName);
    return dbPrice ?? (this.PRICES[sizeName] || 0);
  }

  /**
   * Получение всех цен (обогащено данными БД)
   */
  static async getAllPrices(): Promise<Record<string, number>> {
    try {
      const db = await getDb();
      const rows = await db.all(
        `SELECT size_name, price_kopecks FROM photo_print_prices WHERE is_active = 1`
      );
      const map: Record<string, number> = { ...this.PRICES };
      (rows as any[]).forEach(r => {
        map[r.size_name] = Number(r.price_kopecks);
      });
      return map;
    } catch (e) {
      return { ...this.PRICES };
    }
  }

  /**
   * Маппинг строки БД в объект заказа
   */
  private static mapRowToOrder(row: any): PhotoOrder {
    return {
      id: row.id,
      chatId: row.chat_id,
      username: row.username,
      firstName: row.first_name,
      status: row.status,
      originalPhotos: JSON.parse(row.original_photos || '[]'),
      processedPhotos: JSON.parse(row.processed_photos || '[]'),
      selectedSize: JSON.parse(row.selected_size),
      processingOptions: JSON.parse(row.processing_options),
      quantity: row.quantity,
      totalPrice: row.total_price,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Создание таблицы заказов фото (миграция)
   */
  static async createTable(): Promise<void> {
    try {
      const db = await getDb();
      await db.exec(`
        CREATE TABLE IF NOT EXISTS photo_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          username TEXT,
          first_name TEXT,
          status TEXT DEFAULT 'pending',
          original_photos TEXT DEFAULT '[]',
          processed_photos TEXT DEFAULT '[]',
          selected_size TEXT NOT NULL,
          processing_options TEXT NOT NULL,
          quantity INTEGER DEFAULT 1,
          total_price INTEGER NOT NULL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_photo_orders_chat_id ON photo_orders (chat_id);
        CREATE INDEX IF NOT EXISTS idx_photo_orders_status ON photo_orders (status);
      `);
      
      logger.info('Photo orders table created');
    } catch (error) {
      logger.error('Error creating photo orders table', error);
      throw error;
    }
  }
}
