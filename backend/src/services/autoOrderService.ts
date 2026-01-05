import { getDb } from '../config/database';
import { logger } from '../utils/logger';
import { NotificationService } from './notificationService';

export interface AutoOrderRule {
  id: number;
  material_id: number;
  supplier_id: number;
  threshold_quantity: number;
  order_quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  material_name?: string;
  supplier_name?: string;
}

export interface AutoOrderRequest {
  id: number;
  material_id: number;
  supplier_id: number;
  quantity: number;
  reason: string;
  status: 'pending' | 'sent' | 'confirmed' | 'delivered' | 'cancelled';
  created_at: string;
  sent_at?: string;
  confirmed_at?: string;
  delivered_at?: string;
  notes?: string;
  material_name?: string;
  supplier_name?: string;
}

export interface AutoOrderTemplate {
  id: number;
  name: string;
  template: string;
  is_active: boolean;
  created_at: string;
}

export class AutoOrderService {
  private static initialized = false;
  private static config: any = {};

  static initialize(config: any) {
    this.config = config || {};
    this.initialized = true;
    try {
      logger.info('AutoOrderService initialized', {
        enabled: !!this.config?.enabled,
        frequency: this.config?.orderFrequency,
      });
    } catch {
      // logger optional in early boot
      // no-op
    }
  }

  /**
   * Получить все правила авто-заказа
   */
  static async getAutoOrderRules(): Promise<AutoOrderRule[]> {
    const db = await getDb();
    const rules = await db.all<AutoOrderRule[]>(`
      SELECT 
        aor.id, aor.material_id, aor.supplier_id, aor.threshold_quantity, 
        aor.order_quantity, aor.is_active, aor.created_at, aor.updated_at,
        m.name as material_name,
        s.name as supplier_name
      FROM auto_order_rules aor
      LEFT JOIN materials m ON aor.material_id = m.id
      LEFT JOIN suppliers s ON aor.supplier_id = s.id
      ORDER BY aor.created_at DESC
    `);
    return rules;
  }

  /**
   * Создать правило авто-заказа
   */
  static async createAutoOrderRule(rule: Omit<AutoOrderRule, 'id' | 'created_at' | 'updated_at'>): Promise<AutoOrderRule> {
    const db = await getDb();
    
    // Проверяем, что материал и поставщик существуют
    const material = await db.get('SELECT id FROM materials WHERE id = ?', rule.material_id);
    if (!material) {
      throw new Error('Материал не найден');
    }
    
    const supplier = await db.get('SELECT id FROM suppliers WHERE id = ?', rule.supplier_id);
    if (!supplier) {
      throw new Error('Поставщик не найден');
    }

    const result = await db.run(`
      INSERT INTO auto_order_rules (material_id, supplier_id, threshold_quantity, order_quantity, is_active)
      VALUES (?, ?, ?, ?, ?)
    `, rule.material_id, rule.supplier_id, rule.threshold_quantity, rule.order_quantity, rule.is_active ? 1 : 0);

    const newRule = await db.get<AutoOrderRule>(`
      SELECT 
        aor.id, aor.material_id, aor.supplier_id, aor.threshold_quantity, 
        aor.order_quantity, aor.is_active, aor.created_at, aor.updated_at,
        m.name as material_name,
        s.name as supplier_name
      FROM auto_order_rules aor
      LEFT JOIN materials m ON aor.material_id = m.id
      LEFT JOIN suppliers s ON aor.supplier_id = s.id
      WHERE aor.id = ?
    `, result.lastID);

    logger.info('Auto order rule created', { ruleId: result.lastID });
    return newRule!;
  }

  /**
   * Обновить правило авто-заказа
   */
  static async updateAutoOrderRule(id: number, updates: Partial<Omit<AutoOrderRule, 'id' | 'created_at' | 'updated_at'>>): Promise<AutoOrderRule> {
    const db = await getDb();
    
    const setClause = [];
    const values = [];
    
    if (updates.material_id !== undefined) {
      setClause.push('material_id = ?');
      values.push(updates.material_id);
    }
    if (updates.supplier_id !== undefined) {
      setClause.push('supplier_id = ?');
      values.push(updates.supplier_id);
    }
    if (updates.threshold_quantity !== undefined) {
      setClause.push('threshold_quantity = ?');
      values.push(updates.threshold_quantity);
    }
    if (updates.order_quantity !== undefined) {
      setClause.push('order_quantity = ?');
      values.push(updates.order_quantity);
    }
    if (updates.is_active !== undefined) {
      setClause.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }
    
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await db.run(`
      UPDATE auto_order_rules 
      SET ${setClause.join(', ')}
      WHERE id = ?
    `, ...values);

    const updatedRule = await db.get<AutoOrderRule>(`
      SELECT 
        aor.id, aor.material_id, aor.supplier_id, aor.threshold_quantity, 
        aor.order_quantity, aor.is_active, aor.created_at, aor.updated_at,
        m.name as material_name,
        s.name as supplier_name
      FROM auto_order_rules aor
      LEFT JOIN materials m ON aor.material_id = m.id
      LEFT JOIN suppliers s ON aor.supplier_id = s.id
      WHERE aor.id = ?
    `, id);

    if (!updatedRule) {
      throw new Error('Правило авто-заказа не найдено');
    }

    logger.info('Auto order rule updated', { ruleId: id });
    return updatedRule;
  }

  /**
   * Удалить правило авто-заказа
   */
  static async deleteAutoOrderRule(id: number): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM auto_order_rules WHERE id = ?', id);
    logger.info('Auto order rule deleted', { ruleId: id });
  }

  /**
   * Проверить материалы на необходимость авто-заказа
   */
  static async checkMaterialsForAutoOrder(): Promise<AutoOrderRequest[]> {
    const db = await getDb();
    
    // Получаем активные правила и текущие остатки материалов
    const rules = await db.all<Array<AutoOrderRule & { current_quantity: number }>>(`
      SELECT 
        aor.id, aor.material_id, aor.supplier_id, aor.threshold_quantity, 
        aor.order_quantity, aor.is_active, aor.created_at, aor.updated_at,
        m.name as material_name,
        s.name as supplier_name,
        m.quantity as current_quantity
      FROM auto_order_rules aor
      LEFT JOIN materials m ON aor.material_id = m.id
      LEFT JOIN suppliers s ON aor.supplier_id = s.id
      WHERE aor.is_active = 1 AND m.quantity <= aor.threshold_quantity
    `);

    const requests: AutoOrderRequest[] = [];
    
    for (const rule of rules) {
      // Проверяем, нет ли уже активного заказа на этот материал
      const existingRequest = await db.get(`
        SELECT id FROM auto_order_requests 
        WHERE material_id = ? AND status IN ('pending', 'sent', 'confirmed')
      `, rule.material_id);
      
      if (!existingRequest) {
        const request: AutoOrderRequest = {
          id: 0,
          material_id: rule.material_id,
          supplier_id: rule.supplier_id,
          quantity: rule.order_quantity,
          reason: `Автоматический заказ: остаток ${rule.current_quantity} <= порог ${rule.threshold_quantity}`,
          status: 'pending',
          created_at: new Date().toISOString()
        };
        
        requests.push(request);
      }
    }
    
    return requests;
  }

  /**
   * Создать заявку на авто-заказ
   */
  static async createAutoOrderRequest(request: Omit<AutoOrderRequest, 'id' | 'created_at'>): Promise<AutoOrderRequest> {
    const db = await getDb();
    
    const result = await db.run(`
      INSERT INTO auto_order_requests (material_id, supplier_id, quantity, reason, status, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `, request.material_id, request.supplier_id, request.quantity, request.reason, request.status, request.notes || null);

    const newRequest = await db.get<AutoOrderRequest>(`
      SELECT * FROM auto_order_requests WHERE id = ?
    `, result.lastID);

    logger.info('Auto order request created', { requestId: result.lastID });

    // enqueue notification email
    try {
      const material = await db.get('SELECT name FROM materials WHERE id = ?', request.material_id);
      const supplier = await db.get('SELECT name, email FROM suppliers WHERE id = ?', request.supplier_id);
      const toEmail = supplier?.email || process.env.DEFAULT_ORDER_EMAIL || '';
      if (toEmail) {
        await NotificationService.enqueue({
          templateKey: 'auto_order.request',
          channel: 'email',
          to: toEmail,
          variables: {
            material_name: material?.name || String(request.material_id),
            quantity: request.quantity,
            supplier_name: supplier?.name || String(request.supplier_id),
            reason: request.reason,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString()
          }
        })
      }
    } catch (e) {
      logger.warn('Failed to enqueue auto order notification', e as any)
    }

    return newRequest!;
  }

  /**
   * Получить все заявки на авто-заказ
   */
  static async getAutoOrderRequests(): Promise<AutoOrderRequest[]> {
    const db = await getDb();
    const requests = await db.all<AutoOrderRequest[]>(`
      SELECT 
        aor.id, aor.material_id, aor.supplier_id, aor.quantity, aor.reason, 
        aor.status, aor.created_at, aor.sent_at, aor.confirmed_at, aor.delivered_at, aor.notes,
        m.name as material_name,
        s.name as supplier_name
      FROM auto_order_requests aor
      LEFT JOIN materials m ON aor.material_id = m.id
      LEFT JOIN suppliers s ON aor.supplier_id = s.id
      ORDER BY aor.created_at DESC
    `);
    return requests;
  }

  /**
   * Обновить статус заявки
   */
  static async updateRequestStatus(id: number, status: AutoOrderRequest['status']): Promise<void> {
    const db = await getDb();
    
    const timestampField = status === 'sent' ? 'sent_at' : 
                          status === 'confirmed' ? 'confirmed_at' : 
                          status === 'delivered' ? 'delivered_at' : null;
    
    if (timestampField) {
      await db.run(`
        UPDATE auto_order_requests 
        SET status = ?, ${timestampField} = CURRENT_TIMESTAMP
        WHERE id = ?
      `, status, id);
    } else {
      await db.run(`
        UPDATE auto_order_requests 
        SET status = ?
        WHERE id = ?
      `, status, id);
    }
    
    logger.info('Auto order request status updated', { requestId: id, status });
  }

  /**
   * Получить шаблоны сообщений
   */
  static async getTemplates(): Promise<AutoOrderTemplate[]> {
    const db = await getDb();
    const templates = await db.all<AutoOrderTemplate[]>(`
      SELECT id, name, template, is_active, created_at
      FROM auto_order_templates
      WHERE is_active = 1
      ORDER BY name
    `);
    return templates;
  }

  /**
   * Создать шаблон сообщения
   */
  static async createTemplate(template: Omit<AutoOrderTemplate, 'id' | 'created_at'>): Promise<AutoOrderTemplate> {
    const db = await getDb();
    
    const result = await db.run(`
      INSERT INTO auto_order_templates (name, template, is_active)
      VALUES (?, ?, ?)
    `, template.name, template.template, template.is_active ? 1 : 0);

    const newTemplate = await db.get<AutoOrderTemplate>(`
      SELECT * FROM auto_order_templates WHERE id = ?
    `, result.lastID);

    logger.info('Auto order template created', { templateId: result.lastID });
    return newTemplate!;
  }

  /**
   * Генерировать сообщение для заказа
   */
  static async generateOrderMessage(request: AutoOrderRequest, templateId?: number): Promise<string> {
    const db = await getDb();
    
    let template = 'Заказ материала: {material_name}\nКоличество: {quantity}\nПоставщик: {supplier_name}\nПричина: {reason}';
    
    if (templateId) {
      const customTemplate = await db.get<AutoOrderTemplate>('SELECT template FROM auto_order_templates WHERE id = ?', templateId);
      if (customTemplate) {
        template = customTemplate.template;
      }
    }
    
    // Получаем данные материала и поставщика
    const material = await db.get('SELECT name FROM materials WHERE id = ?', request.material_id);
    const supplier = await db.get('SELECT name FROM suppliers WHERE id = ?', request.supplier_id);
    
    // Заменяем плейсхолдеры
    return template
      .replace('{material_name}', material?.name || 'Неизвестный материал')
      .replace('{quantity}', request.quantity.toString())
      .replace('{supplier_name}', supplier?.name || 'Неизвестный поставщик')
      .replace('{reason}', request.reason)
      .replace('{date}', new Date().toLocaleDateString())
      .replace('{time}', new Date().toLocaleTimeString());
  }

  // --- Back-compat helpers (используются контроллерами уведомлений/админки) ---

  static getConfig(): any {
    return this.config || {}
  }

  static updateConfig(newConfig: any): void {
    this.config = { ...(this.config || {}), ...(newConfig || {}) }
  }

  static async getAutoOrders(status?: string): Promise<AutoOrderRequest[]> {
    const all = await this.getAutoOrderRequests()
    if (!status) return all
    return all.filter((o) => o.status === status)
  }

  static async createAutoOrder(materialIds?: number[]): Promise<AutoOrderRequest[] | null> {
    const candidates = await this.checkMaterialsForAutoOrder()
    const filtered =
      Array.isArray(materialIds) && materialIds.length > 0
        ? candidates.filter((r) => materialIds.includes(r.material_id))
        : candidates

    if (filtered.length === 0) return null

    const created: AutoOrderRequest[] = []
    for (const r of filtered) {
      const { material_id, supplier_id, quantity, reason, status, notes } = r
      const row = await this.createAutoOrderRequest({ material_id, supplier_id, quantity, reason, status, notes })
      created.push(row)
    }

    return created
  }

  static async approveOrder(orderId: number): Promise<void> {
    await this.updateRequestStatus(orderId, 'confirmed')
  }

  static async sendOrder(orderId: number): Promise<void> {
    await this.updateRequestStatus(orderId, 'sent')
  }

  static async markAsDelivered(orderId: number): Promise<void> {
    await this.updateRequestStatus(orderId, 'delivered')
  }
}