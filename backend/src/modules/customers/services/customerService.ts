import { randomBytes } from 'crypto'
import { getDb } from '../../../config/database'

// Интерфейс Customer определен локально, так как shared/types может быть недоступен в backend
export interface Customer {
  id: number;
  type: 'individual' | 'legal';
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  company_name?: string;
  legal_name?: string;
  tax_id?: string;
  bank_details?: string;
  authorized_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  /** 1 = согласен на маркетинг; учитывается вместе с email_unsubscribed_at */
  marketing_opt_in?: number;
  email_unsubscribed_at?: string | null;
  unsubscribe_token?: string;
  created_at: string;
  updated_at: string;
  /** Дата последнего заказа (по данным БД) */
  last_order_at?: string | null;
  /** Сумма последнего заказа с учётом скидки (как в CRM) */
  last_order_amount?: number | null;
}

export class CustomerService {
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private static allCustomersCache: { data: Customer[]; fetchedAt: number } | null = null;

  private static invalidateCustomersCache() {
    this.allCustomersCache = null;
  }

  private static async getAllCustomersCached(): Promise<Customer[]> {
    const now = Date.now();
    if (this.allCustomersCache && now - this.allCustomersCache.fetchedAt < this.CACHE_TTL_MS) {
      return this.allCustomersCache.data;
    }
    const db = await getDb();
    const rows = await db.all('SELECT * FROM customers ORDER BY created_at DESC');
    const data = rows.map(this.mapRowToCustomer);
    this.allCustomersCache = { data, fetchedAt: now };
    return data;
  }

  private static normalizeSearchValue(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .trim();
  }

  private static getTrigrams(text: string): Set<string> {
    const normalized = this.normalizeSearchValue(text);
    if (!normalized) return new Set();
    const padded = `  ${normalized}  `;
    const trigrams = new Set<string>();
    for (let i = 0; i <= padded.length - 3; i += 1) {
      trigrams.add(padded.slice(i, i + 3));
    }
    return trigrams;
  }

  private static trigramSimilarity(a: string, b: string): number {
    const aGrams = this.getTrigrams(a);
    const bGrams = this.getTrigrams(b);
    if (aGrams.size === 0 || bGrams.size === 0) return 0;
    let intersection = 0;
    aGrams.forEach((gram) => {
      if (bGrams.has(gram)) intersection += 1;
    });
    const union = aGrams.size + bGrams.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private static buildCustomerSearchText(customer: Customer): string {
    return [
      customer.first_name,
      customer.last_name,
      customer.middle_name,
      customer.company_name,
      customer.legal_name,
      customer.tax_id,
      customer.phone,
      customer.email,
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * К последним заказам: дата и сумма (по позициям и скидке заказа).
   */
  private static async attachLastOrderStats(customers: Customer[]): Promise<Customer[]> {
    if (customers.length === 0) return customers;
    const db = await getDb();
    const ids = customers.map((c) => c.id);
    const ph = ids.map(() => '?').join(',');
    const sql = `
      SELECT customer_id, last_order_at, last_order_amount
      FROM (
        SELECT
          o.customer_id,
          COALESCE(o.created_at, o.createdAt) AS last_order_at,
          ROUND(
            COALESCE((SELECT SUM(i.price * i.quantity) FROM items i WHERE i.orderId = o.id), 0) *
            (1.0 - COALESCE(o.discount_percent, 0) / 100.0),
            2
          ) AS last_order_amount,
          ROW_NUMBER() OVER (
            PARTITION BY o.customer_id
            ORDER BY datetime(COALESCE(o.created_at, o.createdAt)) DESC, o.id DESC
          ) AS rn
        FROM orders o
        WHERE o.customer_id IN (${ph})
      ) t
      WHERE t.rn = 1
    `;
    const rows = (await db.all(sql, ids)) as Array<{
      customer_id: number;
      last_order_at: string;
      last_order_amount: number;
    }>;
    const map = new Map(rows.map((r) => [r.customer_id, r]));
    return customers.map((c) => {
      const s = map.get(c.id);
      if (!s) {
        return { ...c, last_order_at: null, last_order_amount: null };
      }
      return {
        ...c,
        last_order_at: s.last_order_at,
        last_order_amount: s.last_order_amount,
      };
    });
  }

  /**
   * Получить всех клиентов с возможностью фильтрации
   */
  static async getAllCustomers(filters?: {
    type?: 'individual' | 'legal'
    search?: string
  }): Promise<Customer[]> {
    const allCustomers = await this.getAllCustomersCached();
    const typeFiltered = filters?.type
      ? allCustomers.filter((customer) => customer.type === filters.type)
      : allCustomers;

    if (!filters?.search) {
      return this.attachLastOrderStats(typeFiltered);
    }

    const queryText = String(filters.search || '');
    const normalizedQuery = this.normalizeSearchValue(queryText);
    const directMatches = typeFiltered.filter((customer) => {
      const haystack = this.normalizeSearchValue(
        this.buildCustomerSearchText(customer)
      );
      return haystack.includes(normalizedQuery);
    });

    if (directMatches.length > 0) {
      return this.attachLastOrderStats(directMatches);
    }

    // Fallback: триграммный поиск по всем клиентам для защиты от опечаток
    const scored = typeFiltered
      .map((customer) => ({
        customer,
        score: this.trigramSimilarity(
          this.buildCustomerSearchText(customer),
          queryText
        ),
      }))
      .filter((item) => item.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((item) => item.customer);

    return this.attachLastOrderStats(scored);
  }

  /**
   * Получить клиента по ID
   */
  static async getCustomerById(id: number): Promise<Customer | null> {
    const db = await getDb()
    const row = await db.get('SELECT * FROM customers WHERE id = ?', [id])
    if (!row) return null
    const c = this.mapRowToCustomer(row)
    const withStats = await this.attachLastOrderStats([c])
    return withStats[0]
  }

  /**
   * Создать нового клиента
   */
  static async createCustomer(data: {
    type: 'individual' | 'legal'
    first_name?: string
    last_name?: string
    middle_name?: string
    company_name?: string
    legal_name?: string
    tax_id?: string
    bank_details?: string
    authorized_person?: string
    phone?: string
    email?: string
    address?: string
    notes?: string
  }): Promise<Customer> {
    const db = await getDb()
    const now = new Date().toISOString()

    // Валидация в зависимости от типа
    if (data.type === 'individual') {
      if (!data.first_name && !data.last_name) {
        throw new Error('Для физ. лица необходимо указать имя или фамилию')
      }
    } else if (data.type === 'legal') {
      if (!data.company_name) {
        throw new Error('Для юр. лица необходимо указать название компании')
      }
    }

    const unsubToken = randomBytes(24).toString('hex')
    const result = await db.run(
      `INSERT INTO customers (
        type, first_name, last_name, middle_name,
        company_name, legal_name, tax_id,
        bank_details, authorized_person,
        phone, email, address, notes,
        marketing_opt_in, unsubscribe_token,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.type,
        data.first_name || null,
        data.last_name || null,
        data.middle_name || null,
        data.company_name || null,
        data.legal_name || null,
        data.tax_id || null,
        data.bank_details || null,
        data.authorized_person || null,
        data.phone || null,
        data.email || null,
        data.address || null,
        data.notes || null,
        0,
        unsubToken,
        now,
        now
      ]
    )

    const id = (result as any).lastID
    const customer = await this.getCustomerById(id)
    if (!customer) {
      throw new Error('Не удалось создать клиента')
    }
    this.invalidateCustomersCache();
    return customer
  }

  /**
   * Обновить клиента
   */
  static async updateCustomer(
    id: number,
    data: {
      type?: 'individual' | 'legal'
      first_name?: string
      last_name?: string
      middle_name?: string
      company_name?: string
      legal_name?: string
      tax_id?: string
      bank_details?: string
      authorized_person?: string
      phone?: string
      email?: string
      address?: string
      notes?: string
      marketing_opt_in?: 0 | 1
    }
  ): Promise<Customer> {
    const db = await getDb()
    const now = new Date().toISOString()

    // Проверяем существование клиента
    const existing = await this.getCustomerById(id)
    if (!existing) {
      throw new Error('Клиент не найден')
    }

    // Валидация в зависимости от типа
    const finalType = data.type || existing.type
    if (finalType === 'individual') {
      const firstName = data.first_name !== undefined ? data.first_name : existing.first_name
      const lastName = data.last_name !== undefined ? data.last_name : existing.last_name
      if (!firstName && !lastName) {
        throw new Error('Для физ. лица необходимо указать имя или фамилию')
      }
    } else if (finalType === 'legal') {
      const companyName = data.company_name !== undefined ? data.company_name : existing.company_name
      if (!companyName) {
        throw new Error('Для юр. лица необходимо указать название компании')
      }
    }

    const mOptIn =
      data.marketing_opt_in !== undefined ? data.marketing_opt_in : (existing as Customer).marketing_opt_in ?? 0

    await db.run(
      `UPDATE customers SET
        type = ?,
        first_name = ?,
        last_name = ?,
        middle_name = ?,
        company_name = ?,
        legal_name = ?,
        tax_id = ?,
        bank_details = ?,
        authorized_person = ?,
        phone = ?,
        email = ?,
        address = ?,
        notes = ?,
        marketing_opt_in = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        finalType,
        data.first_name !== undefined ? data.first_name : existing.first_name,
        data.last_name !== undefined ? data.last_name : existing.last_name,
        data.middle_name !== undefined ? data.middle_name : existing.middle_name,
        data.company_name !== undefined ? data.company_name : existing.company_name,
        data.legal_name !== undefined ? data.legal_name : existing.legal_name,
        data.tax_id !== undefined ? data.tax_id : existing.tax_id,
        data.bank_details !== undefined ? data.bank_details : existing.bank_details,
        data.authorized_person !== undefined ? data.authorized_person : existing.authorized_person,
        data.phone !== undefined ? data.phone : existing.phone,
        data.email !== undefined ? data.email : existing.email,
        data.address !== undefined ? data.address : existing.address,
        data.notes !== undefined ? data.notes : existing.notes,
        mOptIn,
        now,
        id
      ]
    )

    const updated = await this.getCustomerById(id)
    if (!updated) {
      throw new Error('Не удалось обновить клиента')
    }
    this.invalidateCustomersCache();
    return updated
  }

  /**
   * Удалить клиента
   */
  static async deleteCustomer(id: number): Promise<void> {
    const db = await getDb()

    // Проверяем, используется ли клиент в заказах
    const ordersWithCustomer = await db.get(
      'SELECT COUNT(*) as count FROM orders WHERE customer_id = ?',
      [id]
    ) as { count: number }

    if (ordersWithCustomer.count > 0) {
      throw new Error('Нельзя удалить клиента, так как он привязан к заказам')
    }

    const result = await db.run('DELETE FROM customers WHERE id = ?', [id])
    if ((result as any).changes === 0) {
      throw new Error('Клиент не найден')
    }
    this.invalidateCustomersCache();
  }

  /**
   * Получить полное имя клиента (для отображения)
   */
  static getCustomerDisplayName(customer: Customer): string {
    if (customer.type === 'legal') {
      return customer.company_name || customer.legal_name || 'Без названия'
    } else {
      const parts = [
        customer.last_name,
        customer.first_name,
        customer.middle_name
      ].filter(Boolean)
      return parts.length > 0 ? parts.join(' ') : 'Без имени'
    }
  }

  /**
   * Маппинг строки БД в объект Customer
   */
  private static mapRowToCustomer(row: any): Customer {
    return {
      id: row.id,
      type: row.type,
      first_name: row.first_name || undefined,
      last_name: row.last_name || undefined,
      middle_name: row.middle_name || undefined,
      company_name: row.company_name || undefined,
      legal_name: row.legal_name || undefined,
      tax_id: row.tax_id || undefined,
      bank_details: row.bank_details || undefined,
      authorized_person: row.authorized_person || undefined,
      phone: row.phone || undefined,
      email: row.email || undefined,
      address: row.address || undefined,
      notes: row.notes || undefined,
      marketing_opt_in: row.marketing_opt_in == null ? 0 : Number(row.marketing_opt_in),
      email_unsubscribed_at: row.email_unsubscribed_at ?? null,
      unsubscribe_token: row.unsubscribe_token || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }
}
