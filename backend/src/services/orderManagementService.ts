import { getDb } from '../db';
import { hasColumn } from '../utils/tableSchemaCache';
import { PhotoOrderService } from './photoOrderService';
import { UserOrderPageService } from './userOrderPageService';
import { NotificationService } from './notificationService';

export interface UnifiedOrder {
  id: number;
  type: 'website' | 'telegram' | 'manual';
  status: string;
  customerName?: string;
  customerContact?: string;
  totalAmount: number;
  prepaymentAmount?: number;
  prepaymentStatus?: string | null;
  paymentMethod?: string | null;
  createdAt: string;
  assignedTo?: number;
  assignedToName?: string;
  notes?: string;
  orderNumber?: string; // tg-ord-123 или site-ord-123
  // Специфичные поля для разных типов заказов
  photoOrder?: any;
  websiteOrder?: any;
  manualOrder?: any;
}

export interface OrderPool {
  unassigned: UnifiedOrder[];
  assigned: UnifiedOrder[];
  completed: UnifiedOrder[];
}

export class OrderManagementService {
  /**
   * Получение пула заказов (не назначенных)
   */
  static async getOrderPool(): Promise<OrderPool> {
    try {
      const db = await getDb();
      
      // Получаем заказы фото из Telegram
      const photoOrders = await db.all(`
        SELECT 
          id,
          'telegram' as type,
          status,
          first_name as customer_name,
          chat_id as customer_contact,
          total_price as total_amount,
          created_at,
          notes,
          'tg-ord-' || id as order_number
        FROM photo_orders 
        WHERE status IN ('pending', 'ready_for_approval')
        ORDER BY created_at DESC
      `);

      // Получаем заказы из CRM/сайта
      let websiteOrders: any[] = [];
      try {
        websiteOrders = await db.all(`
          SELECT 
            id,
            CASE 
              WHEN source = 'website' THEN 'website'
              ELSE 'manual'
            END as type,
            status,
            customerName as customer_name,
            customerPhone as customer_contact,
            COALESCE((SELECT SUM(price * quantity) FROM items WHERE orderId = orders.id), 0) as total_amount,
            prepaymentAmount as prepayment_amount,
            prepaymentStatus as prepayment_status,
            paymentMethod as payment_method,
            COALESCE(createdAt, created_at) as created_at,
            '' as notes,
            CASE 
              WHEN source = 'website' THEN 'site-ord-' || id
              ELSE number
            END as order_number
          FROM orders 
          WHERE status != 7
          ORDER BY COALESCE(createdAt, created_at) DESC
        `);
      } catch (error) {
        console.log('📝 Website orders table not found, skipping...');
      }

      // Объединяем все заказы
      const allOrders = [...photoOrders, ...websiteOrders];
      
      // Проверяем, какие заказы уже назначены
      const assignedOrderIds = await db.all(`
        SELECT order_id, order_type, page_id, uop.user_name as assigned_to_name
        FROM user_order_page_orders uopo
        JOIN user_order_pages uop ON uopo.page_id = uop.id
        WHERE uopo.status != 'completed'
      `);

      const assignedMap = new Map();
      assignedOrderIds.forEach(assignment => {
        assignedMap.set(`${assignment.order_id}_${assignment.order_type}`, {
          assignedTo: assignment.page_id,
          assignedToName: assignment.assigned_to_name
        });
      });

      // Разделяем заказы на категории
      const unassigned: UnifiedOrder[] = [];
      const assigned: UnifiedOrder[] = [];
      const completed: UnifiedOrder[] = [];

      allOrders.forEach(order => {
        const key = `${order.id}_${order.type}`;
        const assignment = assignedMap.get(key);
        
        const unifiedOrder: UnifiedOrder = {
          id: order.id,
          type: order.type,
          status: order.status,
          customerName: order.customer_name,
          customerContact: order.customer_contact,
          totalAmount: order.total_amount,
          prepaymentAmount: order.prepayment_amount ?? order.prepaymentAmount ?? undefined,
          prepaymentStatus: order.prepayment_status ?? order.prepaymentStatus ?? undefined,
          paymentMethod: order.payment_method ?? order.paymentMethod ?? undefined,
          createdAt: order.created_at,
          notes: order.notes,
          orderNumber: order.order_number,
          ...assignment
        };

        if (order.status === 'completed') {
          completed.push(unifiedOrder);
        } else if (assignment) {
          assigned.push(unifiedOrder);
        } else {
          unassigned.push(unifiedOrder);
        }
      });

      return {
        unassigned,
        assigned,
        completed
      };
    } catch (error) {
      console.error('❌ Error getting order pool:', error);
      return {
        unassigned: [],
        assigned: [],
        completed: []
      };
    }
  }

  /**
   * Назначение заказа пользователю
   */
  static async assignOrderToUser(orderId: number, orderType: string, userId: number, userName: string, date: string): Promise<boolean> {
    try {
      const db = await getDb();
      
      // Проверяем, не назначен ли уже заказ
      const existingAssignment = await db.get(`
        SELECT * FROM user_order_page_orders 
        WHERE order_id = ? AND order_type = ? AND status != 'completed'
      `, [orderId, orderType]);

      if (existingAssignment) {
        throw new Error('Заказ уже назначен другому пользователю');
      }

      // Получаем или создаем страницу пользователя
      const page = await UserOrderPageService.getOrCreateUserOrderPage(userId, userName, date);

      // Назначаем заказ
      await db.run(`
        INSERT INTO user_order_page_orders (page_id, order_id, order_type, status, assigned_at)
        VALUES (?, ?, ?, 'pending', datetime('now'))
      `, [page.id, orderId, orderType]);

            // Фото-заказы: строковый статус + userId (как в orders)
            if (orderType === 'telegram') {
              const hasPoUid = await hasColumn('photo_orders', 'userId');
              if (hasPoUid) {
                await db.run(
                  `UPDATE photo_orders SET status = 'approved', userId = ?, updated_at = datetime('now') WHERE id = ?`,
                  [userId, orderId]
                );
              } else {
                await db.run(
                  `UPDATE photo_orders SET status = 'approved', updated_at = datetime('now') WHERE id = ?`,
                  [orderId]
                );
              }
            } else if (orderType === 'website') {
              await db.run(`
                UPDATE orders 
                SET status = 2, updated_at = datetime('now')
                WHERE id = ?
              `, [orderId]);
            }

      console.log(`✅ Assigned ${orderType} order ${orderId} to user ${userName}`);
      
      // Запускаем проверку уведомлений в фоне
      NotificationService.checkOrderNotifications().catch(error => {
        console.error('❌ Ошибка при проверке уведомлений:', error);
      });
      
      return true;
    } catch (error) {
      console.error('❌ Error assigning order to user:', error);
      return false;
    }
  }

  /**
   * Завершение заказа
   */
  static async completeOrder(orderId: number, orderType: string, notes?: string): Promise<boolean> {
    try {
      const db = await getDb();
      
      // Обновляем статус в user_order_page_orders
      await db.run(`
        UPDATE user_order_page_orders 
        SET status = 'completed', completed_at = datetime('now'), notes = ?
        WHERE order_id = ? AND order_type = ?
      `, [notes, orderId, orderType]);

            if (orderType === 'telegram') {
              await db.run(
                `UPDATE photo_orders SET status = 'completed', updated_at = datetime('now') WHERE id = ?`,
                [orderId]
              );
            } else if (orderType === 'website') {
              await db.run(`
                UPDATE orders 
                SET status = 5, updated_at = datetime('now')
                WHERE id = ?
              `, [orderId]);
            }

      // Обновляем статистику страницы
      const pageOrder = await db.get(`
        SELECT page_id FROM user_order_page_orders 
        WHERE order_id = ? AND order_type = ?
      `, [orderId, orderType]);

      if (pageOrder) {
        await UserOrderPageService.updatePageStats(pageOrder.page_id);
      }

      console.log(`✅ Completed ${orderType} order ${orderId}`);
      
      // Запускаем проверку уведомлений в фоне
      NotificationService.checkOrderNotifications().catch(error => {
        console.error('❌ Ошибка при проверке уведомлений:', error);
      });
      
      return true;
    } catch (error) {
      console.error('❌ Error completing order:', error);
      return false;
    }
  }

  /**
   * Поиск заказа по номеру/ID (CRM/website/telegram)
   */
  static async searchOrder(query: string): Promise<UnifiedOrder | null> {
    try {
      const db = await getDb();
      const rawQuery = String(query || '').trim();
      if (!rawQuery) return null;

      const normalized = rawQuery.replace(/^#/, '');
      const isNumeric = /^\d+$/.test(normalized);
      const numericId = isNumeric ? Number(normalized) : null;
      const tgMatch = normalized.match(/^tg-ord-(\d+)$/i);
      const siteMatch = normalized.match(/^site-ord-(\d+)$/i);

      const fetchOrderById = async (id: number) =>
        db.get(
          `
          SELECT 
            id,
            CASE 
              WHEN source = 'website' THEN 'website'
              ELSE 'manual'
            END as type,
            status,
            customerName as customer_name,
            customerPhone as customer_contact,
            COALESCE((SELECT SUM(price * quantity) FROM items WHERE orderId = orders.id), 0) as total_amount,
            prepaymentAmount as prepayment_amount,
            prepaymentStatus as prepayment_status,
            paymentMethod as payment_method,
            COALESCE(createdAt, created_at) as created_at,
            '' as notes,
            CASE 
              WHEN source = 'website' THEN 'site-ord-' || id
              ELSE number
            END as order_number
          FROM orders 
          WHERE id = ?
        `,
          [id],
        );

      const fetchOrderByNumber = async (number: string) => {
        // Убираем ведущие нули для поиска без них
        const withoutLeadingZeros = number.replace(/^0+/, '') || '0';
        // Если введено число, также ищем с ведущими нулями
        const paddedNumber = number.padStart(4, '0');
        
        return db.get(
          `
          SELECT 
            id,
            CASE 
              WHEN source = 'website' THEN 'website'
              ELSE 'manual'
            END as type,
            status,
            customerName as customer_name,
            customerPhone as customer_contact,
            COALESCE((SELECT SUM(price * quantity) FROM items WHERE orderId = orders.id), 0) as total_amount,
            prepaymentAmount as prepayment_amount,
            prepaymentStatus as prepayment_status,
            paymentMethod as payment_method,
            COALESCE(createdAt, created_at) as created_at,
            '' as notes,
            CASE 
              WHEN source = 'website' THEN 'site-ord-' || id
              ELSE number
            END as order_number
          FROM orders 
          WHERE number = ? 
             OR number = ? 
             OR number = ?
             OR CAST(REPLACE(number, '-', '') AS INTEGER) = ?
        `,
          [number, withoutLeadingZeros, paddedNumber, parseInt(withoutLeadingZeros) || 0],
        );
      };

      const fetchTelegramById = async (id: number) =>
        db.get(
          `
          SELECT 
            id,
            'telegram' as type,
            status,
            first_name as customer_name,
            chat_id as customer_contact,
            total_price as total_amount,
            created_at,
            notes,
            'tg-ord-' || id as order_number
          FROM photo_orders 
          WHERE id = ?
        `,
          [id],
        );

      let order: any = null;
      if (tgMatch) {
        order = await fetchTelegramById(Number(tgMatch[1]));
      } else if (siteMatch) {
        order = await fetchOrderById(Number(siteMatch[1]));
      } else {
        order = await fetchOrderByNumber(normalized);
        if (!order && numericId) {
          order = await fetchOrderById(numericId);
        }
        if (!order && numericId) {
          order = await fetchTelegramById(numericId);
        }
        if (!order && normalized.length >= 3) {
          order = await db.get(
            `
            SELECT 
              id,
              CASE 
                WHEN source = 'website' THEN 'website'
                ELSE 'manual'
              END as type,
              status,
              customerName as customer_name,
              customerPhone as customer_contact,
              COALESCE((SELECT SUM(price * quantity) FROM items WHERE orderId = orders.id), 0) as total_amount,
              prepaymentAmount as prepayment_amount,
              prepaymentStatus as prepayment_status,
              paymentMethod as payment_method,
              COALESCE(createdAt, created_at) as created_at,
              '' as notes,
              CASE 
                WHEN source = 'website' THEN 'site-ord-' || id
                ELSE number
              END as order_number
            FROM orders 
            WHERE number LIKE ?
          `,
            [`%${normalized}%`],
          );
        }
      }

      if (!order) return null;

      const assignment = await db.get(
        `
        SELECT order_id, order_type, page_id, uop.user_name as assigned_to_name
        FROM user_order_page_orders uopo
        JOIN user_order_pages uop ON uopo.page_id = uop.id
        WHERE uopo.order_id = ? AND uopo.order_type = ? AND uopo.status != 'completed'
      `,
        [order.id, order.type],
      );

      return {
        id: order.id,
        type: order.type,
        status: order.status,
        customerName: order.customer_name,
        customerContact: order.customer_contact,
        totalAmount: order.total_amount,
        prepaymentAmount: order.prepayment_amount ?? order.prepaymentAmount ?? undefined,
        prepaymentStatus: order.prepayment_status ?? order.prepaymentStatus ?? undefined,
        paymentMethod: order.payment_method ?? order.paymentMethod ?? undefined,
        createdAt: order.created_at,
        notes: order.notes,
        orderNumber: order.order_number,
        assignedTo: assignment?.page_id,
        assignedToName: assignment?.assigned_to_name,
      };
    } catch (error) {
      console.error('❌ Error searching order:', error);
      return null;
    }
  }

  /**
   * Выдача заказа/закрытие долга. Website: status 7 (Завершён = выдан), debt_closed_events. Telegram: status 7.
   * issuedOn — дата выдачи YYYY-MM-DD (из фронта), чтобы заказ попал в «Выданные заказы» за выбранный день.
   */
  static async issueOrder(orderId: number, orderType: string, issuerId?: number | null, issuedOn?: string | null): Promise<UnifiedOrder | null> {
    try {
      const db = await getDb();
      await db.run('BEGIN');
      try {
        if (orderType === 'telegram') {
          await db.run(
            `
            UPDATE photo_orders 
            SET status = 7, updated_at = datetime('now','localtime')
            WHERE id = ?
          `,
            [orderId],
          );
        } else {
          const order = await db.get<any>(
            `
            SELECT id, source, prepaymentAmount, prepaymentStatus, paymentMethod, discount_percent
            FROM orders WHERE id = ?
          `,
            [orderId],
          );
          if (!order) {
            await db.run('ROLLBACK');
            return null;
          }

          const items = await db.all<any>('SELECT price, quantity FROM items WHERE orderId = ?', [orderId]);
          const subtotal = items.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
          const discount = Number(order.discount_percent) || 0;
          const totalAmount = Math.round((1 - discount / 100) * subtotal * 100) / 100;
          const prepaymentAmount = Number(order.prepaymentAmount || 0);
          const remainder = Math.round((totalAmount - prepaymentAmount) * 100) / 100;

          let hasPrepaymentUpdatedAt = false;
          try { hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt'); } catch { /* ignore */ }
          const paymentId = `ISSUE-${Date.now()}-${orderId}`;
          const updateSql = hasPrepaymentUpdatedAt
            ? `UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = 'paid', paymentUrl = NULL, paymentId = ?, paymentMethod = 'offline', prepaymentUpdatedAt = datetime('now','localtime'), updated_at = datetime('now','localtime'), status = 7 WHERE id = ?`
            : `UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = 'paid', paymentUrl = NULL, paymentId = ?, paymentMethod = 'offline', updated_at = datetime('now','localtime'), status = 7 WHERE id = ?`;
          await db.run(updateSql, totalAmount, paymentId, orderId);

          // debt_closed_events — чтобы заказ попал в «Выданные заказы» и в кассу (debt_closed_issued_by_me)
          const issuer = issuerId ?? null;
          const isValidIssuedOn = issuedOn && /^\d{4}-\d{2}-\d{2}$/.test(String(issuedOn).slice(0, 10));
          const closedDate = isValidIssuedOn
            ? String(issuedOn).slice(0, 10)
            : ((await db.get<{ d: string }>("SELECT date('now','localtime') as d"))?.d ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
          try {
            const hasIssuedBy = await hasColumn('debt_closed_events', 'issued_by_user_id');
            if (hasIssuedBy) {
              await db.run(
                'INSERT INTO debt_closed_events (order_id, closed_date, amount, issued_by_user_id) VALUES (?, ?, ?, ?)',
                orderId, closedDate, remainder, issuer
              );
            } else {
              await db.run(
                'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
                orderId, closedDate, remainder
              );
            }
          } catch (e) {
            console.warn('[OrderManagementService.issueOrder] debt_closed_events insert failed:', (e as Error)?.message);
          }
        }

        await db.run(
          `
          UPDATE user_order_page_orders 
          SET status = 'completed', completed_at = datetime('now','localtime')
          WHERE order_id = ? AND order_type = ?
        `,
          [orderId, orderType],
        );

        const pageOrder = await db.get(
          `
          SELECT page_id FROM user_order_page_orders 
          WHERE order_id = ? AND order_type = ?
        `,
          [orderId, orderType],
        );

        if (pageOrder) {
          await UserOrderPageService.updatePageStats(pageOrder.page_id);
        }

        await db.run('COMMIT');
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }

      const searchKey =
        orderType === 'telegram'
          ? `tg-ord-${orderId}`
          : orderType === 'website'
            ? `site-ord-${orderId}`
            : String(orderId);
      return await OrderManagementService.searchOrder(searchKey);
    } catch (error) {
      console.error('❌ Error issuing order:', error);
      return null;
    }
  }

  /**
   * Получение деталей заказа
   */
  static async getOrderDetails(orderId: number, orderType: string): Promise<UnifiedOrder | null> {
    try {
      const db = await getDb();
      
      let order: any = null;
      
      if (orderType === 'telegram') {
        order = await db.get(`
          SELECT 
            id,
            'telegram' as type,
            status,
            first_name as customer_name,
            chat_id as customer_contact,
            total_price as total_amount,
            created_at,
            notes,
            selected_size,
            processing_options,
            quantity
          FROM photo_orders 
          WHERE id = ?
        `, [orderId]);
        
        if (order) {
          order.photoOrder = {
            selectedSize: JSON.parse(order.selected_size),
            processingOptions: JSON.parse(order.processing_options),
            quantity: order.quantity
          };
        }
      } else if (orderType === 'website') {
        order = await db.get(`
          SELECT 
            id,
            'website' as type,
            status,
            customer_name,
            customer_phone as customer_contact,
            total_amount,
            created_at,
            notes
          FROM orders 
          WHERE id = ?
        `, [orderId]);
      }

      if (!order) {
        return null;
      }

      // Получаем информацию о назначении
      const assignment = await db.get(`
        SELECT 
          uopo.status as assignment_status,
          uop.user_name as assigned_to_name,
          uopo.assigned_at,
          uopo.completed_at,
          uopo.notes as assignment_notes
        FROM user_order_page_orders uopo
        JOIN user_order_pages uop ON uopo.page_id = uop.id
        WHERE uopo.order_id = ? AND uopo.order_type = ?
      `, [orderId, orderType]);

      return {
        id: order.id,
        type: order.type,
        status: order.status,
        customerName: order.customer_name,
        customerContact: order.customer_contact,
        totalAmount: order.total_amount,
        createdAt: order.created_at,
        notes: order.notes,
        assignedToName: assignment?.assigned_to_name,
        photoOrder: order.photoOrder,
        websiteOrder: order.websiteOrder,
        manualOrder: order.manualOrder
      };
    } catch (error) {
      console.error('❌ Error getting order details:', error);
      return null;
    }
  }

  /**
   * Перемещение заказа между датами
   */
  static async moveOrderToDate(orderId: number, orderType: string, newDate: string, userId: number): Promise<boolean> {
    try {
      const db = await getDb();
      
      // Находим текущую страницу заказа
      const currentPageOrder = await db.get(`
        SELECT uopo.*, uop.date as current_date
        FROM user_order_page_orders uopo
        JOIN user_order_pages uop ON uopo.page_id = uop.id
        WHERE uopo.order_id = ? AND uopo.order_type = ?
      `, [orderId, orderType]);

      if (!currentPageOrder) {
        console.error('❌ Order not found in user pages');
        return false;
      }

      // Находим или создаем страницу для новой даты
      let targetPage = await db.get(`
        SELECT id FROM user_order_pages 
        WHERE user_id = ? AND date = ?
      `, [userId, newDate]);

      if (!targetPage) {
        // Создаем новую страницу для новой даты
        const result = await db.run(`
          INSERT INTO user_order_pages (user_id, date, status, total_orders, completed_orders, total_revenue)
          VALUES (?, ?, 'active', 0, 0, 0)
        `, [userId, newDate]);
        
        targetPage = { id: result.lastID };
        console.log(`✅ Created new page for date ${newDate}`);
      }

      // Перемещаем заказ на новую страницу
      await db.run(`
        UPDATE user_order_page_orders 
        SET page_id = ?, assigned_at = datetime('now')
        WHERE order_id = ? AND order_type = ?
      `, [targetPage.id, orderId, orderType]);

      // Обновляем статистику обеих страниц
      await UserOrderPageService.updatePageStats(currentPageOrder.page_id);
      await UserOrderPageService.updatePageStats(targetPage.id);

      console.log(`✅ Moved order ${orderId} from ${currentPageOrder.current_date} to ${newDate}`);
      return true;
    } catch (error) {
      console.error('❌ Error moving order to date:', error);
      return false;
    }
  }
}
