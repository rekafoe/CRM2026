import { getDb } from '../../../db';
import { TelegramService, OrderNotification } from '../../telegram/services/telegramService';
import { Material } from '../../../models/Material';
import { logger } from '../../../utils/logger';

export interface AutoOrderConfig {
  enabled: boolean;
  minOrderAmount: number; // минимальная сумма заказа
  maxOrderAmount: number; // максимальная сумма заказа
  orderFrequency: 'daily' | 'weekly' | 'monthly'; // частота заказов
  preferredDeliveryDays: number[]; // предпочтительные дни недели (0-6)
  autoApproveOrders: boolean; // автоматическое одобрение заказов
  notificationEnabled: boolean; // уведомления о заказах
}

export interface OrderTemplate {
  id: number;
  supplierId: number;
  supplierName: string;
  templateName: string;
  materials: Array<{
    materialId: number;
    materialName: string;
    quantity: number;
    unit: string;
    price: number;
  }>;
  totalAmount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AutoOrder {
  id: number;
  supplierId: number;
  supplierName: string;
  materials: Array<{
    materialId: number;
    materialName: string;
    quantity: number;
    unit: string;
    price: number;
    currentStock: number;
    minStock: number;
    orderQuantity: number;
  }>;
  totalAmount: number;
  status: 'pending' | 'approved' | 'sent' | 'delivered' | 'cancelled';
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  notes?: string;
}

export class AutoOrderService {
  private static config: AutoOrderConfig = {
    enabled: false,
    minOrderAmount: 100, // 100 BYN
    maxOrderAmount: 10000, // 10000 BYN
    orderFrequency: 'weekly',
    preferredDeliveryDays: [1, 2, 3, 4, 5], // понедельник-пятница
    autoApproveOrders: false,
    notificationEnabled: true
  };

  /**
   * Инициализация сервиса
   */
  static initialize(config?: Partial<AutoOrderConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    logger.info('Auto order service initialized', this.config);
  }

  /**
   * Создание автоматического заказа на основе низких остатков
   */
  static async createAutoOrder(materialIds?: number[]): Promise<AutoOrder | null> {
    if (!this.config.enabled) {
      logger.debug('Auto ordering is disabled');
      return null;
    }

    logger.info('Creating auto order...');

    const db = await getDb();
    
    // Получаем материалы с низкими остатками
    let materialsQuery = `
      SELECT 
        m.id, m.name, m.quantity, m.min_quantity, m.min_quantity, m.sheet_price_single,
        s.id as supplier_id, s.name as supplier_name, s.contact_person as supplier_contact,
        c.name as category_name
      FROM materials m
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      LEFT JOIN material_categories c ON c.id = m.category_id
      WHERE s.is_active = 1
    `;

    if (materialIds && materialIds.length > 0) {
      materialsQuery += ` AND m.id IN (${materialIds.map(() => '?').join(',')})`;
    } else {
      // Только материалы с низкими остатками
      materialsQuery += ` AND m.quantity <= COALESCE(m.min_quantity, m.min_quantity, 10)`;
    }

    const materials = await db.all(materialsQuery, materialIds || []);

    if (materials.length === 0) {
      logger.info('No materials need reordering');
      return null;
    }

    // Группируем материалы по поставщикам
    const supplierGroups = new Map<number, typeof materials>();
    
    for (const material of materials) {
      if (!supplierGroups.has(material.supplier_id)) {
        supplierGroups.set(material.supplier_id, []);
      }
      supplierGroups.get(material.supplier_id)!.push(material);
    }

    // Создаем заказы для каждого поставщика
    const orders: AutoOrder[] = [];

    for (const [supplierId, supplierMaterials] of supplierGroups) {
      const order = await this.createSupplierOrder(supplierId, supplierMaterials);
      if (order) {
        orders.push(order);
      }
    }

    // Возвращаем первый заказ (можно расширить для множественных заказов)
    return orders.length > 0 ? orders[0] : null;
  }

  /**
   * Создание заказа для конкретного поставщика
   */
  private static async createSupplierOrder(
    supplierId: number, 
    materials: Array<Material & { supplier_id: number; supplier_name: string; supplier_contact?: string; category_name?: string }>
  ): Promise<AutoOrder | null> {
    const db = await getDb();
    
    const supplier = materials[0];
    const orderMaterials = materials.map(material => {
      const minStock = material.min_quantity || material.min_quantity || 10;
      const currentStock = material.quantity || 0;
      
      // Рассчитываем количество для заказа (до максимального уровня)
      const maxStock = minStock * 3; // заказываем в 3 раза больше минимального
      const orderQuantity = Math.max(maxStock - currentStock, minStock);
      
      return {
        materialId: material.id,
        materialName: material.name,
        quantity: currentStock,
        unit: material.unit,
        price: material.sheet_price_single || 0,
        currentStock,
        minStock,
        orderQuantity
      };
    });

    const totalAmount = orderMaterials.reduce((sum, item) => sum + (item.orderQuantity * item.price), 0);

    // Проверяем минимальную и максимальную сумму заказа
    if (totalAmount < this.config.minOrderAmount) {
      logger.warn(`Order amount ${totalAmount} is below minimum ${this.config.minOrderAmount}`);
      return null;
    }

    if (totalAmount > this.config.maxOrderAmount) {
      logger.warn(`Order amount ${totalAmount} exceeds maximum ${this.config.maxOrderAmount}`);
      return null;
    }

    const order: AutoOrder = {
      id: Date.now(), // временный ID
      supplierId,
      supplierName: supplier.supplier_name,
      materials: orderMaterials,
      totalAmount,
      status: this.config.autoApproveOrders ? 'approved' : 'pending',
      createdAt: new Date().toISOString(),
      notes: 'Автоматический заказ на основе низких остатков'
    };

    // Сохраняем заказ в базу данных
    const orderId = await this.saveAutoOrder(order);
    order.id = orderId;

    // Отправляем уведомление
    if (this.config.notificationEnabled) {
      const notification: OrderNotification = {
        orderId: orderId,
        supplierName: supplier.supplier_name,
        supplierContact: supplier.supplier_contact,
        materials: orderMaterials.map(m => ({
          name: m.materialName,
          quantity: m.orderQuantity,
          unit: m.unit,
          price: m.price
        })),
        totalAmount,
        deliveryDate: this.calculateDeliveryDate()
      };

      await TelegramService.sendOrderNotification(notification);
    }

    logger.info(`Auto order created for supplier ${supplier.supplier_name}: ${totalAmount.toFixed(2)} BYN`);
    return order;
  }

  /**
   * Сохранение автоматического заказа в базу данных
   */
  private static async saveAutoOrder(order: AutoOrder): Promise<number> {
    const db = await getDb();
    
    const result = await db.run(`
      INSERT INTO auto_orders (
        supplier_id, supplier_name, total_amount, status, created_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      order.supplierId,
      order.supplierName,
      order.totalAmount,
      order.status,
      order.createdAt,
      order.notes || null
    ]);

    const orderId = result.lastID;
    
    if (!orderId) {
      throw new Error('Failed to create auto order - no order ID returned');
    }

    // Сохраняем материалы заказа
    for (const material of order.materials) {
      await db.run(`
        INSERT INTO auto_order_materials (
          order_id, material_id, material_name, current_stock, min_stock,
          order_quantity, unit, price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        orderId,
        material.materialId,
        material.materialName,
        material.currentStock,
        material.minStock,
        material.orderQuantity,
        material.unit,
        material.price
      ]);
    }

    return orderId;
  }

  /**
   * Получение всех автоматических заказов
   */
  static async getAutoOrders(status?: string): Promise<AutoOrder[]> {
    const db = await getDb();
    
    let query = `
      SELECT 
        ao.id, ao.supplier_id as supplierId, ao.supplier_name as supplierName,
        ao.total_amount as totalAmount, ao.status, ao.created_at as createdAt,
        ao.sent_at as sentAt, ao.delivered_at as deliveredAt, ao.notes
      FROM auto_orders ao
    `;

    const params: any[] = [];
    
    if (status) {
      query += ` WHERE ao.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY ao.created_at DESC`;

    const orders = await db.all(query, params);

    // Загружаем материалы для каждого заказа
    for (const order of orders) {
      const materials = await db.all(`
        SELECT 
          material_id as materialId, material_name as materialName,
          current_stock as currentStock, min_stock as minStock,
          order_quantity as orderQuantity, unit, price
        FROM auto_order_materials
        WHERE order_id = ?
      `, order.id);

      order.materials = materials;
    }

    return orders;
  }

  /**
   * Одобрение заказа
   */
  static async approveOrder(orderId: number): Promise<void> {
    const db = await getDb();
    
    await db.run(`
      UPDATE auto_orders 
      SET status = 'approved'
      WHERE id = ?
    `, orderId);

    logger.info(`Order ${orderId} approved`);
  }

  /**
   * Отправка заказа поставщику
   */
  static async sendOrder(orderId: number): Promise<void> {
    const db = await getDb();
    
    await db.run(`
      UPDATE auto_orders 
      SET status = 'sent', sent_at = datetime('now')
      WHERE id = ?
    `, orderId);

    logger.info(`Order ${orderId} sent to supplier`);
  }

  /**
   * Отметка заказа как доставленного
   */
  static async markAsDelivered(orderId: number): Promise<void> {
    const db = await getDb();
    
    await db.run(`
      UPDATE auto_orders 
      SET status = 'delivered', delivered_at = datetime('now')
      WHERE id = ?
    `, orderId);

    logger.info(`Order ${orderId} marked as delivered`);
  }

  /**
   * Расчет даты поставки
   */
  private static calculateDeliveryDate(): string {
    const now = new Date();
    const deliveryDate = new Date(now);
    
    // Добавляем 3-5 рабочих дней
    let daysToAdd = 3 + Math.floor(Math.random() * 3);
    
    while (daysToAdd > 0) {
      deliveryDate.setDate(deliveryDate.getDate() + 1);
      const dayOfWeek = deliveryDate.getDay();
      
      // Пропускаем выходные
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysToAdd--;
      }
    }
    
    return deliveryDate.toISOString().split('T')[0];
  }

  /**
   * Получение конфигурации
   */
  static getConfig(): AutoOrderConfig {
    return { ...this.config };
  }

  /**
   * Обновление конфигурации
   */
  static updateConfig(newConfig: Partial<AutoOrderConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Auto order config updated', this.config);
  }
}
