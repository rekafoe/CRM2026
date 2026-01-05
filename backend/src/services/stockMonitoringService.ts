import { getDb } from '../db';
import { TelegramService, LowStockNotification } from './telegramService';
import { UserNotificationService } from './userNotificationService';
import { Material } from '../models/Material';

export interface StockAlert {
  id: number;
  materialId: number;
  materialName: string;
  currentQuantity: number;
  minQuantity: number;
  supplierName?: string;
  supplierContact?: string;
  categoryName?: string;
  alertLevel: 'low' | 'critical' | 'out_of_stock';
  createdAt: string;
  isResolved: boolean;
  resolvedAt?: string;
}

export interface StockMonitoringConfig {
  enabled: boolean;
  checkInterval: number; // в минутах
  lowStockThreshold: number; // процент от минимального уровня
  criticalStockThreshold: number; // процент от минимального уровня
  autoOrderEnabled: boolean;
  autoOrderThreshold: number; // процент от минимального уровня
}

export class StockMonitoringService {
  private static config: StockMonitoringConfig = {
    enabled: true,
    checkInterval: 30, // 30 минут
    lowStockThreshold: 120, // 120% от минимального уровня
    criticalStockThreshold: 100, // 100% от минимального уровня
    autoOrderEnabled: false,
    autoOrderThreshold: 80 // 80% от минимального уровня
  };

  private static monitoringInterval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Инициализация мониторинга
   */
  static initialize(config?: Partial<StockMonitoringConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    console.log('📊 Stock monitoring service initialized:', this.config);

    if (this.config.enabled) {
      this.startMonitoring();
    }
  }

  /**
   * Запуск мониторинга
   */
  static startMonitoring() {
    if (this.isRunning) {
      console.log('⚠️ Stock monitoring is already running');
      return;
    }

    console.log(`🔄 Starting stock monitoring (interval: ${this.config.checkInterval} minutes)`);
    
    this.isRunning = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkStockLevels();
      } catch (error) {
        console.error('❌ Error in stock monitoring:', error);
      }
    }, this.config.checkInterval * 60 * 1000);

    // Первоначальная проверка
    this.checkStockLevels();
  }

  /**
   * Остановка мониторинга
   */
  static stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('⏹️ Stock monitoring stopped');
  }

  /**
   * Проверка уровней запасов
   */
  static async checkStockLevels(): Promise<StockAlert[]> {
    console.log('🔍 Checking stock levels...');
    
    const db = await getDb();
    
    // Получаем все материалы с их поставщиками и категориями
    const materials = await new Promise<any[]>((resolve, reject) => {
      db.all(`
        SELECT 
          m.id, m.name, m.quantity, m.min_quantity,
          s.name as supplier_name, s.contact_person as supplier_contact,
          c.name as category_name
        FROM materials m
        LEFT JOIN suppliers s ON s.id = m.supplier_id
        LEFT JOIN material_categories c ON c.id = m.category_id
        WHERE 1=1
      `, (err: any, rows: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as any[]);
        }
      });
    });

    const alerts: StockAlert[] = [];

    for (const material of materials) {
      const minStock = material.min_quantity || material.min_quantity || 10;
      const currentQuantity = material.quantity || 0;
      
      // Определяем уровень предупреждения
      let alertLevel: 'low' | 'critical' | 'out_of_stock' | null = null;
      
      if (currentQuantity <= 0) {
        alertLevel = 'out_of_stock';
      } else if (currentQuantity <= minStock) {
        alertLevel = 'critical';
      } else if (currentQuantity <= minStock * (this.config.lowStockThreshold / 100)) {
        alertLevel = 'low';
      }

      if (alertLevel) {
        const alert: StockAlert = {
          id: Date.now() + Math.random(), // временный ID
          materialId: material.id,
          materialName: material.name,
          currentQuantity,
          minQuantity: minStock,
          supplierName: material.supplier_name,
          supplierContact: material.supplier_contact,
          categoryName: material.category_name,
          alertLevel,
          createdAt: new Date().toISOString(),
          isResolved: false
        };

        alerts.push(alert);

        // Отправляем уведомление в Telegram (общее)
        const notification: LowStockNotification = {
          materialId: material.id,
          materialName: material.name,
          currentQuantity,
          minQuantity: minStock,
          supplierName: material.supplier_name,
          supplierContact: material.supplier_contact,
          categoryName: material.category_name
        };

        await TelegramService.sendLowStockNotification(notification);

        // Отправляем уведомление админам через UserNotificationService
        await UserNotificationService.sendLowStockAlert(
          material.name,
          currentQuantity,
          minStock,
          material.supplier_name
        );

        // Сохраняем предупреждение в базу данных
        await this.saveStockAlert(alert);
      }
    }

    console.log(`📊 Stock check completed. Found ${alerts.length} alerts`);
    return alerts;
  }

  /**
   * Сохранение предупреждения в базу данных
   */
  private static async saveStockAlert(alert: StockAlert): Promise<void> {
    const db = await getDb();
    
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO stock_alerts (
          material_id, material_name, current_quantity, min_stock_level, min_quantity,
          supplier_name, supplier_contact, category_name, alert_level,
          created_at, is_resolved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        alert.materialId,
        alert.materialName,
        alert.currentQuantity,
        alert.minQuantity, // min_stock_level (NOT NULL)
        alert.minQuantity, // min_quantity (NULL)
        alert.supplierName || null,
        alert.supplierContact || null,
        alert.categoryName || null,
        alert.alertLevel,
        alert.createdAt,
        alert.isResolved ? 1 : 0
      ], (err: any) => {
        if (err) {
          console.error('❌ Failed to save stock alert:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Получение активных предупреждений
   */
  static async getActiveAlerts(): Promise<StockAlert[]> {
    console.log('🔍 StockMonitoringService.getActiveAlerts() called');
    const db = await getDb();
    console.log('📊 Database connection obtained');
    
    return new Promise((resolve, reject) => {
      console.log('🔍 Executing SQL query...');
      db.all(`
        SELECT 
          id, material_id as materialId, material_name as materialName,
          current_quantity as currentQuantity, min_quantity as minQuantity,
          supplier_name as supplierName, supplier_contact as supplierContact,
          category_name as categoryName, alert_level as alertLevel,
          created_at as createdAt, is_resolved as isResolved,
          resolved_at as resolvedAt
        FROM stock_alerts
        WHERE is_resolved = 0
        ORDER BY created_at DESC
      `, (err: any, rows: any) => {
        if (err) {
          console.error('❌ SQL error:', err);
          reject(err);
        } else {
          console.log(`✅ SQL query successful, got ${rows.length} rows`);
          resolve(rows as StockAlert[]);
        }
      });
    });
  }

  /**
   * Отметка предупреждения как решенного
   */
  static async resolveAlert(alertId: number): Promise<void> {
    const db = await getDb();
    
    return new Promise((resolve, reject) => {
      db.run(`
        UPDATE stock_alerts 
        SET is_resolved = 1, resolved_at = datetime('now')
        WHERE id = ?
      `, [alertId], (err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Получение конфигурации
   */
  static getConfig(): StockMonitoringConfig {
    return { ...this.config };
  }

  /**
   * Обновление конфигурации
   */
  static updateConfig(newConfig: Partial<StockMonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('📊 Stock monitoring config updated:', this.config);
    
    // Перезапускаем мониторинг с новой конфигурацией
    if (this.config.enabled) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Ручная проверка конкретного материала
   */
  static async checkMaterialStock(materialId: number): Promise<StockAlert | null> {
    const db = await getDb();
    
    const material = await db.get<Material & { 
      supplier_name?: string; 
      supplier_contact?: string; 
      category_name?: string 
    }>(`
      SELECT 
        m.id, m.name, m.quantity, m.min_quantity, m.min_quantity,
        s.name as supplier_name, s.contact_person as supplier_contact,
        c.name as category_name
      FROM materials m
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      LEFT JOIN material_categories c ON c.id = m.category_id
      WHERE m.id = ?
    `, materialId);

    if (!material) {
      return null;
    }

    const minStock = material.min_quantity || material.min_quantity || 10;
    const currentQuantity = material.quantity || 0;
    
    let alertLevel: 'low' | 'critical' | 'out_of_stock' | null = null;
    
    if (currentQuantity <= 0) {
      alertLevel = 'out_of_stock';
    } else if (currentQuantity <= minStock) {
      alertLevel = 'critical';
    } else if (currentQuantity <= minStock * (this.config.lowStockThreshold / 100)) {
      alertLevel = 'low';
    }

    if (alertLevel) {
      const alert: StockAlert = {
        id: Date.now() + Math.random(),
        materialId: material.id,
        materialName: material.name,
        currentQuantity,
        minQuantity: minStock,
        supplierName: material.supplier_name,
        supplierContact: material.supplier_contact,
        categoryName: material.category_name,
        alertLevel,
        createdAt: new Date().toISOString(),
        isResolved: false
      };

      return alert;
    }

    return null;
  }
}
