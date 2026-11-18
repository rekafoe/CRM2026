import { getDb } from '../db';
import { TelegramService } from './telegramService';
import {
  alertLevelFor,
  configuredMinimum,
  formatStockAlertLine,
} from './stockAlertMath';

export interface StockAlert {
  id: number;
  materialId: number;
  materialName: string;
  currentQuantity: number;
  minQuantity: number;
  supplierName?: string;
  supplierContact?: string;
  categoryName?: string;
  unit?: string;
  warehouseLabel?: string;
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

type MaterialSnapshot = {
  id: number;
  name: string;
  unit: string | null;
  materialQuantity: number;
  minQuantity: number | null;
  minStockLevel: number | null;
  supplierName?: string;
  supplierContact?: string;
  categoryName?: string;
  stockRows: number;
  stockSum: number;
  warehouseLabel: string;
};

export class StockMonitoringService {
  private static config: StockMonitoringConfig = {
    enabled: true,
    checkInterval: 30, // 30 минут
    lowStockThreshold: 120, // оставлено в конфиге, в проверке не используется
    criticalStockThreshold: 100,
    autoOrderEnabled: false,
    autoOrderThreshold: 80
  };

  private static monitoringInterval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  static initialize(config?: Partial<StockMonitoringConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    console.log('Stock monitoring service initialized:', this.config);

    if (this.config.enabled) {
      this.startMonitoring();
    }
  }

  static startMonitoring() {
    if (this.isRunning) {
      console.log('Stock monitoring is already running');
      return;
    }

    console.log(`Starting stock monitoring (interval: ${this.config.checkInterval} minutes)`);
    
    this.isRunning = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkStockLevels();
      } catch (error) {
        console.error('Error in stock monitoring:', error);
      }
    }, this.config.checkInterval * 60 * 1000);

    const startupDelayMs = Math.max(
      0,
      parseInt(process.env.STOCK_STARTUP_DELAY_MS || '60000', 10) || 60000,
    );
    console.log(`Stock monitoring: first check in ${startupDelayMs}ms`);
    setTimeout(() => {
      this.checkStockLevels().catch((error) => {
        console.error('Error in initial stock monitoring:', error);
      });
    }, startupDelayMs);
  }

  static stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('Stock monitoring stopped');
  }

  /**
   * Свободный остаток: сумма склада (или materials.quantity, если строк склада нет) минус активный резерв.
   * Одна строка stock_alerts на материал. Закрывается, когда запас снова выше минимума.
   */
  static async checkStockLevels(options?: { notify?: 'auto' | 'off' }): Promise<StockAlert[]> {
    const started = Date.now();
    console.log('Checking stock levels...');
    const db = await getDb();
    const snapshots = await this.loadSnapshots(db);
    const reservedByMaterial = await this.loadReserved(db);
    const now = new Date().toISOString();
    const alerts: StockAlert[] = [];
    const alertingIds: number[] = [];

    await db.exec('BEGIN IMMEDIATE');
    try {
      for (const material of snapshots) {
        const minimum = configuredMinimum(material.minQuantity, material.minStockLevel);
        const onHand = material.stockRows > 0 ? material.stockSum : material.materialQuantity;
        const reserved = reservedByMaterial.get(material.id) || 0;
        const available = onHand - reserved;
        const level = alertLevelFor(available, minimum);
        if (!level || minimum == null) continue;

        const warehouseLabel = material.stockRows > 0
          ? (material.warehouseLabel || 'склад')
          : 'без склада';
        const alert: StockAlert = {
          id: 0,
          materialId: material.id,
          materialName: material.name,
          currentQuantity: available,
          minQuantity: minimum,
          supplierName: material.supplierName,
          supplierContact: material.supplierContact,
          categoryName: material.categoryName,
          unit: material.unit || undefined,
          warehouseLabel,
          alertLevel: level,
          createdAt: now,
          isResolved: false,
        };
        alert.id = await this.upsertOpenAlert(db, alert, now);
        alerts.push(alert);
        alertingIds.push(material.id);
      }

      await this.resolveRecovered(db, alertingIds, now);
      await db.exec('COMMIT');
    } catch (error) {
      try { await db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw error;
    }

    const notify = options?.notify ?? 'auto';
    const telegramAlertsEnabled = process.env.STOCK_TELEGRAM_ALERTS === 'true';
    if (
      notify === 'auto'
      && telegramAlertsEnabled
      && alerts.length > 0
      && TelegramService.isNetworkAvailable()
    ) {
      void TelegramService.sendLowStockDigest(this.formatDigest(alerts)).catch(() => {});
    }

    console.log(`Stock check completed. Found ${alerts.length} alerts in ${Date.now() - started}ms`);
    return alerts;
  }

  /** Та же проверка и тот же список получателей, без чисел из формы. */
  static async broadcastFreshDigest(): Promise<{ sent: number; failed: number; count: number }> {
    const alerts = await this.checkStockLevels({ notify: 'off' });
    if (alerts.length === 0 || !TelegramService.isNetworkAvailable()) {
      return { sent: 0, failed: 0, count: alerts.length };
    }
    const delivery = await TelegramService.sendLowStockDigest(this.formatDigest(alerts));
    return { ...delivery, count: alerts.length };
  }

  static formatDigest(alerts: StockAlert[]): string {
    const top = alerts.slice(0, 5);
    const summary = top.map((alert) => `• ${formatStockAlertLine(alert)}`).join('\n');
    const more = alerts.length > top.length ? `\n…и ещё ${alerts.length - top.length}` : '';
    return `*Низкие остатки*\n\n${alerts.length} позиций\n${summary}${more}`;
  }

  private static async loadSnapshots(db: Awaited<ReturnType<typeof getDb>>): Promise<MaterialSnapshot[]> {
    const rows = await db.all<any[]>(`
      SELECT
        m.id,
        m.name,
        m.unit,
        COALESCE(m.quantity, 0) AS material_quantity,
        m.min_quantity,
        m.min_stock_level,
        s.name AS supplier_name,
        s.contact_person AS supplier_contact,
        c.name AS category_name,
        (SELECT COUNT(1) FROM material_stock ms WHERE ms.material_id = m.id) AS stock_rows,
        (SELECT COALESCE(SUM(ms.quantity), 0) FROM material_stock ms WHERE ms.material_id = m.id) AS stock_sum
      FROM materials m
      LEFT JOIN suppliers s ON s.id = m.supplier_id
      LEFT JOIN material_categories c ON c.id = m.category_id
      WHERE COALESCE(m.is_active, 1) = 1
    `);
    const places = await this.loadWarehouseLabels(db);
    return (rows || []).map((row) => ({
      id: Number(row.id),
      name: String(row.name || ''),
      unit: row.unit != null ? String(row.unit) : null,
      materialQuantity: Number(row.material_quantity) || 0,
      minQuantity: row.min_quantity == null ? null : Number(row.min_quantity),
      minStockLevel: row.min_stock_level == null ? null : Number(row.min_stock_level),
      supplierName: row.supplier_name || undefined,
      supplierContact: row.supplier_contact || undefined,
      categoryName: row.category_name || undefined,
      stockRows: Number(row.stock_rows) || 0,
      stockSum: Number(row.stock_sum) || 0,
      warehouseLabel: places.get(Number(row.id)) || '',
    }));
  }

  private static async loadWarehouseLabels(db: Awaited<ReturnType<typeof getDb>>): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    const rows = await db.all<any[]>(`
      SELECT ms.material_id, COALESCE(w.name, 'Склад') AS warehouse_name, COALESCE(ms.quantity, 0) AS quantity
      FROM material_stock ms
      LEFT JOIN warehouses w ON w.id = ms.warehouse_id
      ORDER BY ms.material_id, w.name
    `);
    const grouped = new Map<number, string[]>();
    for (const row of rows || []) {
      const id = Number(row.material_id);
      const parts = grouped.get(id) || [];
      parts.push(String(row.warehouse_name));
      grouped.set(id, parts);
    }
    for (const [id, parts] of grouped) map.set(id, parts.join(', '));
    return map;
  }

  private static async loadReserved(db: Awaited<ReturnType<typeof getDb>>): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    const table = await db.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'material_reservations'`,
    );
    if (!table) return map;
    const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info('material_reservations')`);
    const names = new Set(columns.map((column) => column.name));
    const qtyColumn = names.has('quantity_reserved') ? 'quantity_reserved' : names.has('quantity') ? 'quantity' : null;
    if (!qtyColumn) return map;
    const expiry = names.has('expires_at')
      ? `AND (expires_at IS NULL OR TRIM(expires_at) = '' OR datetime(expires_at) > datetime('now'))`
      : '';
    const rows = await db.all<any[]>(`
      SELECT material_id, COALESCE(SUM(${qtyColumn}), 0) AS reserved
      FROM material_reservations
      WHERE status IN ('reserved', 'active')
        ${expiry}
      GROUP BY material_id
    `);
    for (const row of rows || []) {
      map.set(Number(row.material_id), Number(row.reserved) || 0);
    }
    return map;
  }

  private static async upsertOpenAlert(
    db: Awaited<ReturnType<typeof getDb>>,
    alert: StockAlert,
    now: string,
  ): Promise<number> {
    const line = formatStockAlertLine(alert);
    const existing = await db.get<{ id: number }>(
      `SELECT id FROM stock_alerts WHERE material_id = ? ORDER BY id DESC LIMIT 1`,
      alert.materialId,
    );
    if (existing?.id) {
      await db.run(
        `UPDATE stock_alerts
         SET material_name = ?, current_quantity = ?, current_value = ?, min_stock_level = ?,
             min_quantity = ?, threshold_value = ?, supplier_name = ?, supplier_contact = ?,
             category_name = ?, alert_level = ?, alert_type = ?, unit = ?, warehouse_label = ?,
             message = ?, is_resolved = 0, resolved_at = NULL
         WHERE id = ?`,
        alert.materialName,
        alert.currentQuantity,
        alert.currentQuantity,
        alert.minQuantity,
        alert.minQuantity,
        alert.minQuantity,
        alert.supplierName || null,
        alert.supplierContact || null,
        alert.categoryName || null,
        alert.alertLevel,
        alert.alertLevel,
        alert.unit || null,
        alert.warehouseLabel || null,
        line,
        existing.id,
      );
      await db.run(
        `UPDATE stock_alerts
         SET is_resolved = 1, resolved_at = ?
         WHERE material_id = ? AND id != ? AND COALESCE(is_resolved, 0) = 0`,
        now,
        alert.materialId,
        existing.id,
      );
      return Number(existing.id);
    }

    const inserted = await db.run(
      `INSERT INTO stock_alerts (
        material_id, alert_type, threshold_value, current_value, message, is_resolved, created_at,
        material_name, current_quantity, min_stock_level, min_quantity,
        supplier_name, supplier_contact, category_name, alert_level, unit, warehouse_label
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      alert.materialId,
      alert.alertLevel,
      alert.minQuantity,
      alert.currentQuantity,
      line,
      now,
      alert.materialName,
      alert.currentQuantity,
      alert.minQuantity,
      alert.minQuantity,
      alert.supplierName || null,
      alert.supplierContact || null,
      alert.categoryName || null,
      alert.alertLevel,
      alert.unit || null,
      alert.warehouseLabel || null,
    );
    return Number(inserted.lastID);
  }

  private static async resolveRecovered(
    db: Awaited<ReturnType<typeof getDb>>,
    alertingIds: number[],
    now: string,
  ): Promise<void> {
    if (alertingIds.length === 0) {
      await db.run(
        `UPDATE stock_alerts SET is_resolved = 1, resolved_at = ?
         WHERE COALESCE(is_resolved, 0) = 0`,
        now,
      );
      return;
    }
    const placeholders = alertingIds.map(() => '?').join(',');
    await db.run(
      `UPDATE stock_alerts SET is_resolved = 1, resolved_at = ?
       WHERE COALESCE(is_resolved, 0) = 0 AND material_id NOT IN (${placeholders})`,
      now,
      ...alertingIds,
    );
  }

  static async listAlerts(): Promise<StockAlert[]> {
    const db = await getDb();
    const rows = await db.all<any[]>(`
      SELECT
        id, material_id as materialId, material_name as materialName,
        current_quantity as currentQuantity, min_quantity as minQuantity,
        supplier_name as supplierName, supplier_contact as supplierContact,
        category_name as categoryName, alert_level as alertLevel,
        unit, warehouse_label as warehouseLabel,
        created_at as createdAt, is_resolved as isResolved,
        resolved_at as resolvedAt
      FROM stock_alerts
      ORDER BY COALESCE(is_resolved, 0) ASC, datetime(created_at) DESC, id DESC
      LIMIT 200
    `);
    return (rows || []).map((row) => this.mapAlert(row));
  }

  static async getActiveAlerts(): Promise<StockAlert[]> {
    const alerts = await this.listAlerts();
    return alerts.filter((alert) => !alert.isResolved);
  }

  private static mapAlert(row: any): StockAlert {
    const level = row.alertLevel === 'out_of_stock' || row.alertLevel === 'low' || row.alertLevel === 'critical'
      ? row.alertLevel
      : 'critical';
    return {
      id: Number(row.id),
      materialId: Number(row.materialId),
      materialName: String(row.materialName || ''),
      currentQuantity: Number(row.currentQuantity) || 0,
      minQuantity: Number(row.minQuantity) || 0,
      supplierName: row.supplierName || undefined,
      supplierContact: row.supplierContact || undefined,
      categoryName: row.categoryName || undefined,
      unit: row.unit || undefined,
      warehouseLabel: row.warehouseLabel || undefined,
      alertLevel: level,
      createdAt: row.createdAt ? String(row.createdAt) : '',
      isResolved: Number(row.isResolved) === 1,
      resolvedAt: row.resolvedAt ? String(row.resolvedAt) : undefined,
    };
  }

  static async resolveAlert(alertId: number): Promise<void> {
    const db = await getDb();
    await db.run(
      `UPDATE stock_alerts SET is_resolved = 1, resolved_at = ? WHERE id = ?`,
      new Date().toISOString(),
      alertId,
    );
  }

  static getConfig(): StockMonitoringConfig {
    return { ...this.config };
  }

  static updateConfig(newConfig: Partial<StockMonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Stock monitoring config updated:', this.config);
    
    if (this.config.enabled) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  static async checkMaterialStock(materialId: number): Promise<StockAlert | null> {
    const db = await getDb();
    const snapshots = await this.loadSnapshots(db);
    const material = snapshots.find((row) => row.id === materialId);
    if (!material) return null;
    const reserved = (await this.loadReserved(db)).get(material.id) || 0;
    const minimum = configuredMinimum(material.minQuantity, material.minStockLevel);
    const onHand = material.stockRows > 0 ? material.stockSum : material.materialQuantity;
    const level = alertLevelFor(onHand - reserved, minimum);
    if (!level || minimum == null) return null;
    return {
      id: 0,
      materialId: material.id,
      materialName: material.name,
      currentQuantity: onHand - reserved,
      minQuantity: minimum,
      supplierName: material.supplierName,
      supplierContact: material.supplierContact,
      categoryName: material.categoryName,
      unit: material.unit || undefined,
      warehouseLabel: material.stockRows > 0 ? (material.warehouseLabel || 'склад') : 'без склада',
      alertLevel: level,
      createdAt: new Date().toISOString(),
      isResolved: false,
    };
  }
}
