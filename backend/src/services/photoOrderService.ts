import { getDb } from '../db';
import { ImageProcessingService, PhotoSize, ProcessingOptions, ProcessedPhoto } from './imageProcessingService';
import * as fs from 'fs';
import * as path from 'path';

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
  private static async getPriceFromDb(sizeName: string): Promise<number | null> {
    try {
      const db = await getDb();
      const row = await db.get(
        `SELECT price_kopecks FROM photo_print_prices WHERE size_name = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`,
        [sizeName]
      );
      return row ? Number((row as { price_kopecks: number }).price_kopecks) : null;
    } catch {
      return null;
    }
  }

  /**
   * Создание нового заказа фото
   */
  static async createOrder(request: CreatePhotoOrderRequest): Promise<PhotoOrder> {
    try {
      console.log(`📸 Creating photo order for ${request.chatId}`);
      
      const db = await getDb();
      const unit = await this.getPriceFromDb(request.selectedSize.name);
      if (unit == null || !Number.isFinite(unit) || unit < 0) {
        throw new Error(
          `Нет цены в photo_print_prices для размера «${request.selectedSize.name}». Добавьте строку в БД.`
        );
      }
      const totalPrice = unit * request.quantity;
      
      // Создаем заказ в базе данных
      const result = await db.run(`
        INSERT INTO photo_orders (
          chat_id, username, first_name, status, 
          selected_size, processing_options, quantity, total_price, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [
        request.chatId,
        request.username,
        request.firstName,
        'processing',
        JSON.stringify(request.selectedSize),
        JSON.stringify(request.processingOptions),
        request.quantity,
        totalPrice,
        request.notes
      ]);

      const orderId = result.lastID;

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
          console.error(`❌ Error processing photo ${photoPath}:`, error);
        }
      }

      // Сохраняем пути к обработанным фото
      await db.run(`
        UPDATE photo_orders 
        SET original_photos = ?, processed_photos = ?, status = ?
        WHERE id = ?
      `, [
        JSON.stringify(request.originalPhotos),
        JSON.stringify(processedPhotos),
        'ready_for_approval',
        orderId
      ]);

      const order: PhotoOrder = {
        id: orderId!,
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

      console.log(`✅ Photo order created: ${orderId}`);
      return order;
    } catch (error) {
      console.error('❌ Error creating photo order:', error);
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
      console.error('❌ Error getting order by ID:', error);
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
      console.error('❌ Error getting orders by chat ID:', error);
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

      console.log(`✅ Order ${orderId} status updated to ${status}`);
      return true;
    } catch (error) {
      console.error('❌ Error updating order status:', error);
      return false;
    }
  }

  static async getPriceForSize(sizeName: string): Promise<number> {
    const p = await this.getPriceFromDb(sizeName);
    return p ?? 0;
  }

  static async getAllPrices(): Promise<Record<string, number>> {
    try {
      const db = await getDb();
      const rows = await db.all(
        `SELECT size_name, price_kopecks FROM photo_print_prices WHERE is_active = 1`
      ) as { size_name: string; price_kopecks: number }[];
      const map: Record<string, number> = {};
      rows.forEach((r) => {
        map[r.size_name] = Number(r.price_kopecks);
      });
      return map;
    } catch {
      return {};
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
      
      console.log('✅ Photo orders table created');
    } catch (error) {
      console.error('❌ Error creating photo orders table:', error);
      throw error;
    }
  }
}
