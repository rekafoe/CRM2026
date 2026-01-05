import { getDb } from '../db';
import { UserOrderPage, UserOrderPageOrder, CreateUserOrderPageRequest, AssignOrderRequest } from '../models/userOrderPage';

export class UserOrderPageService {
  /**
   * Создание или получение страницы заказов пользователя на дату
   */
  static async getOrCreateUserOrderPage(userId: number, userName: string, date: string): Promise<UserOrderPage> {
    try {
      const db = await getDb();
      
      // Проверяем, существует ли страница
      const existingPage = await db.get(`
        SELECT * FROM user_order_pages 
        WHERE user_id = ? AND date = ?
      `, [userId, date]);

      if (existingPage) {
        return this.mapRowToPage(existingPage);
      }

      // Создаем новую страницу
      const result = await db.run(`
        INSERT INTO user_order_pages (user_id, user_name, date, status, total_orders, completed_orders, total_revenue, created_at, updated_at)
        VALUES (?, ?, ?, 'active', 0, 0, 0, datetime('now'), datetime('now'))
      `, [userId, userName, date]);

      const newPage = await db.get(`
        SELECT * FROM user_order_pages WHERE id = ?
      `, [result.lastID]);

      console.log(`✅ Created user order page for ${userName} on ${date}`);
      return this.mapRowToPage(newPage);
    } catch (error) {
      console.error('❌ Error creating user order page:', error);
      throw error;
    }
  }

  /**
   * Получение страницы заказов пользователя на дату
   */
  static async getUserOrderPage(userId: number, date: string): Promise<UserOrderPage | null> {
    try {
      const db = await getDb();
      const row = await db.get(`
        SELECT * FROM user_order_pages 
        WHERE user_id = ? AND date = ?
      `, [userId, date]);

      return row ? this.mapRowToPage(row) : null;
    } catch (error) {
      console.error('❌ Error getting user order page:', error);
      return null;
    }
  }

  /**
   * Получение всех страниц пользователя
   */
  static async getUserOrderPages(userId: number, daysBack: number = 14): Promise<UserOrderPage[]> {
    try {
      const db = await getDb();
      const rows = await db.all(`
        SELECT * FROM user_order_pages 
        WHERE user_id = ? 
        AND date >= date('now', '-${daysBack} days')
        ORDER BY date DESC
      `, [userId]);

      return rows.map(row => this.mapRowToPage(row));
    } catch (error) {
      console.error('❌ Error getting user order pages:', error);
      return [];
    }
  }

  /**
   * Получение всех страниц (для админов)
   */
  static async getAllOrderPages(daysBack: number = 90): Promise<UserOrderPage[]> {
    try {
      const db = await getDb();
      const rows = await db.all(`
        SELECT * FROM user_order_pages 
        WHERE date >= date('now', '-${daysBack} days')
        ORDER BY date DESC, user_name ASC
      `);

      return rows.map(row => this.mapRowToPage(row));
    } catch (error) {
      console.error('❌ Error getting all order pages:', error);
      return [];
    }
  }

  /**
   * Назначение заказа на страницу
   */
  static async assignOrderToPage(request: AssignOrderRequest): Promise<UserOrderPageOrder | null> {
    try {
      const db = await getDb();
      
      // Проверяем, не назначен ли уже этот заказ
      const existingAssignment = await db.get(`
        SELECT * FROM user_order_page_orders 
        WHERE order_id = ? AND order_type = ?
      `, [request.orderId, request.orderType]);

      if (existingAssignment) {
        throw new Error('Заказ уже назначен на другую страницу');
      }

      // Назначаем заказ
      const result = await db.run(`
        INSERT INTO user_order_page_orders (page_id, order_id, order_type, status, assigned_at, notes)
        VALUES (?, ?, ?, 'pending', datetime('now'), ?)
      `, [request.pageId, request.orderId, request.orderType, request.notes]);

      // Обновляем статистику страницы
      await this.updatePageStats(request.pageId);

      const newAssignment = await db.get(`
        SELECT * FROM user_order_page_orders WHERE id = ?
      `, [result.lastID]);

      console.log(`✅ Assigned order ${request.orderId} to page ${request.pageId}`);
      return this.mapRowToOrder(newAssignment);
    } catch (error) {
      console.error('❌ Error assigning order to page:', error);
      throw error;
    }
  }

  /**
   * Получение заказов страницы
   */
  static async getPageOrders(pageId: number): Promise<UserOrderPageOrder[]> {
    try {
      const db = await getDb();
      const rows = await db.all(`
        SELECT * FROM user_order_page_orders 
        WHERE page_id = ?
        ORDER BY assigned_at DESC
      `, [pageId]);

      return rows.map(row => this.mapRowToOrder(row));
    } catch (error) {
      console.error('❌ Error getting page orders:', error);
      return [];
    }
  }

  /**
   * Получение изменений с момента последнего обновления страницы
   */
  static async getPageChangesSinceLastUpdate(pageId: number, lastUpdate: string): Promise<{
    newOrders: UserOrderPageOrder[];
    updatedOrders: UserOrderPageOrder[];
    completedOrders: UserOrderPageOrder[];
    stats: {
      totalOrders: number;
      completedOrders: number;
      totalRevenue: number;
    };
  }> {
    try {
      const db = await getDb();
      
      // Получаем новые заказы (назначенные после lastUpdate)
      const newOrders = await db.all(`
        SELECT * FROM user_order_page_orders 
        WHERE page_id = ? AND assigned_at > ?
        ORDER BY assigned_at DESC
      `, [pageId, lastUpdate]);

      // Получаем обновленные заказы (изменения статуса после lastUpdate)
      const updatedOrders = await db.all(`
        SELECT * FROM user_order_page_orders 
        WHERE page_id = ? AND (
          (status = 'completed' AND completed_at > ?) OR
          (assigned_at <= ? AND updated_at > ?)
        )
        ORDER BY assigned_at DESC
      `, [pageId, lastUpdate, lastUpdate, lastUpdate]);

      // Получаем завершенные заказы
      const completedOrders = await db.all(`
        SELECT * FROM user_order_page_orders 
        WHERE page_id = ? AND status = 'completed' AND completed_at > ?
        ORDER BY completed_at DESC
      `, [pageId, lastUpdate]);

      // Получаем текущую статистику
      const stats = await db.get(`
        SELECT 
          COUNT(*) as totalOrders,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedOrders,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 
            CASE 
              WHEN order_type = 'telegram' THEN (SELECT total_price FROM photo_orders WHERE id = order_id)
              WHEN order_type = 'website' THEN (SELECT total FROM orders WHERE id = order_id)
              ELSE 0
            END
          END), 0) as totalRevenue
        FROM user_order_page_orders 
        WHERE page_id = ?
      `, [pageId]);

      return {
        newOrders: newOrders.map(row => this.mapRowToOrder(row)),
        updatedOrders: updatedOrders.map(row => this.mapRowToOrder(row)),
        completedOrders: completedOrders.map(row => this.mapRowToOrder(row)),
        stats: {
          totalOrders: stats.totalOrders || 0,
          completedOrders: stats.completedOrders || 0,
          totalRevenue: stats.totalRevenue || 0
        }
      };
    } catch (error) {
      console.error('❌ Error getting page changes:', error);
      return {
        newOrders: [],
        updatedOrders: [],
        completedOrders: [],
        stats: { totalOrders: 0, completedOrders: 0, totalRevenue: 0 }
      };
    }
  }

  /**
   * Обновление статуса заказа на странице
   */
  static async updateOrderStatus(orderId: number, orderType: string, status: string): Promise<boolean> {
    try {
      const db = await getDb();
      
      await db.run(`
        UPDATE user_order_page_orders 
        SET status = ?, completed_at = ?
        WHERE order_id = ? AND order_type = ?
      `, [status, status === 'completed' ? new Date().toISOString() : null, orderId, orderType]);

      // Обновляем статистику страницы
      const pageOrder = await db.get(`
        SELECT page_id FROM user_order_page_orders 
        WHERE order_id = ? AND order_type = ?
      `, [orderId, orderType]);

      if (pageOrder) {
        await this.updatePageStats(pageOrder.page_id);
      }

      console.log(`✅ Updated order ${orderId} status to ${status}`);
      return true;
    } catch (error) {
      console.error('❌ Error updating order status:', error);
      return false;
    }
  }

  /**
   * Обновление статистики страницы
   */
  static async updatePageStats(pageId: number): Promise<void> {
    try {
      const db = await getDb();
      
      const stats = await db.get(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders
        FROM user_order_page_orders 
        WHERE page_id = ?
      `, [pageId]);

      await db.run(`
        UPDATE user_order_pages 
        SET total_orders = ?, completed_orders = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [stats.total_orders, stats.completed_orders, pageId]);

    } catch (error) {
      console.error('❌ Error updating page stats:', error);
    }
  }

  /**
   * Создание таблиц (миграция)
   */
  static async createTables(): Promise<void> {
    try {
      const db = await getDb();
      
      await db.exec(`
        CREATE TABLE IF NOT EXISTS user_order_pages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          user_name TEXT NOT NULL,
          date TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          total_orders INTEGER DEFAULT 0,
          completed_orders INTEGER DEFAULT 0,
          total_revenue INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, date)
        );
        
        CREATE TABLE IF NOT EXISTS user_order_page_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          page_id INTEGER NOT NULL,
          order_id INTEGER NOT NULL,
          order_type TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          notes TEXT,
          FOREIGN KEY (page_id) REFERENCES user_order_pages (id) ON DELETE CASCADE,
          UNIQUE(order_id, order_type)
        );
        
        CREATE INDEX IF NOT EXISTS idx_user_order_pages_user_date ON user_order_pages (user_id, date);
        CREATE INDEX IF NOT EXISTS idx_user_order_page_orders_page ON user_order_page_orders (page_id);
        CREATE INDEX IF NOT EXISTS idx_user_order_page_orders_order ON user_order_page_orders (order_id, order_type);
      `);
      
      console.log('✅ User order pages tables created');
    } catch (error) {
      console.error('❌ Error creating user order pages tables:', error);
      throw error;
    }
  }

  /**
   * Маппинг строки БД в объект страницы
   */
  private static mapRowToPage(row: any): UserOrderPage {
    return {
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      date: row.date,
      status: row.status,
      totalOrders: row.total_orders,
      completedOrders: row.completed_orders,
      totalRevenue: row.total_revenue,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Маппинг строки БД в объект заказа страницы
   */
  private static mapRowToOrder(row: any): UserOrderPageOrder {
    return {
      id: row.id,
      pageId: row.page_id,
      orderId: row.order_id,
      orderType: row.order_type,
      status: row.status,
      assignedAt: row.assigned_at,
      completedAt: row.completed_at,
      notes: row.notes
    };
  }
}
