import { getDb } from '../../../config/database';
import { CustomerService } from './customerService';

export interface CustomerLegalDocumentRow {
  id: number;
  customer_id: number;
  order_id: number | null;
  title: string;
  document_kind: string | null;
  issued_at: string;
  returned_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export class CustomerLegalDocumentService {
  private static mapRow(row: Record<string, unknown>): CustomerLegalDocumentRow {
    return {
      id: Number(row.id),
      customer_id: Number(row.customer_id),
      order_id: row.order_id != null && row.order_id !== '' ? Number(row.order_id) : null,
      title: String(row.title ?? ''),
      document_kind: row.document_kind != null ? String(row.document_kind) : null,
      issued_at: String(row.issued_at ?? ''),
      returned_at: row.returned_at != null ? String(row.returned_at) : null,
      notes: row.notes != null ? String(row.notes) : null,
      created_at: String(row.created_at ?? ''),
      updated_at: String(row.updated_at ?? ''),
    };
  }

  private static async assertLegalCustomer(customerId: number): Promise<void> {
    const c = await CustomerService.getCustomerById(customerId);
    if (!c) throw new Error('Клиент не найден');
    if (c.type !== 'legal') throw new Error('Документы ведутся только для юридических лиц');
  }

  private static async assertOrderBelongsToCustomer(
    orderId: number,
    customerId: number,
  ): Promise<void> {
    const db = await getDb();
    const row = (await db.get('SELECT customer_id FROM orders WHERE id = ?', [orderId])) as
      | { customer_id: number | null }
      | undefined;
    if (!row) throw new Error('Заказ не найден');
    if (row.customer_id == null || Number(row.customer_id) !== customerId) {
      throw new Error('Заказ не относится к этому клиенту');
    }
  }

  static async listByCustomer(customerId: number): Promise<CustomerLegalDocumentRow[]> {
    await this.assertLegalCustomer(customerId);
    const db = await getDb();
    const rows = (await db.all(
      `SELECT * FROM customer_legal_documents WHERE customer_id = ? ORDER BY datetime(issued_at) DESC, id DESC`,
      [customerId],
    )) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  static async create(
    customerId: number,
    data: {
      title: string;
      document_kind?: string | null;
      issued_at: string;
      returned_at?: string | null;
      notes?: string | null;
      order_id?: number | null;
    },
  ): Promise<CustomerLegalDocumentRow> {
    await this.assertLegalCustomer(customerId);
    const title = (data.title || '').trim();
    if (!title) throw new Error('Укажите наименование документа');
    const issued = (data.issued_at || '').trim();
    if (!issued) throw new Error('Укажите дату формирования / выдачи');

    let orderId: number | null = null;
    if (data.order_id != null && data.order_id !== undefined) {
      const n = Number(data.order_id);
      if (!Number.isNaN(n) && n > 0) {
        await this.assertOrderBelongsToCustomer(n, customerId);
        orderId = n;
      }
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const result = await db.run(
      `INSERT INTO customer_legal_documents (
        customer_id, order_id, title, document_kind, issued_at, returned_at, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        orderId,
        title,
        data.document_kind?.trim() || null,
        issued,
        data.returned_at?.trim() || null,
        data.notes?.trim() || null,
        now,
        now,
      ],
    );
    const id = (result as { lastID?: number }).lastID;
    if (!id) throw new Error('Не удалось сохранить документ');
    const row = await db.get('SELECT * FROM customer_legal_documents WHERE id = ?', [id]);
    return this.mapRow(row as Record<string, unknown>);
  }

  static async update(
    customerId: number,
    documentId: number,
    data: {
      title?: string;
      document_kind?: string | null;
      issued_at?: string;
      returned_at?: string | null;
      notes?: string | null;
      order_id?: number | null;
    },
  ): Promise<CustomerLegalDocumentRow> {
    await this.assertLegalCustomer(customerId);
    const db = await getDb();
    const existing = await db.get(
      'SELECT * FROM customer_legal_documents WHERE id = ? AND customer_id = ?',
      [documentId, customerId],
    );
    if (!existing) throw new Error('Запись не найдена');

    const cur = this.mapRow(existing as Record<string, unknown>);
    const title = data.title !== undefined ? data.title.trim() : cur.title;
    if (!title) throw new Error('Укажите наименование документа');
    const issued = data.issued_at !== undefined ? data.issued_at.trim() : cur.issued_at;
    if (!issued) throw new Error('Укажите дату формирования / выдачи');

    let nextOrderId = cur.order_id;
    if (data.order_id !== undefined) {
      if (data.order_id == null) {
        nextOrderId = null;
      } else {
        const n = Number(data.order_id);
        if (Number.isNaN(n) || n < 1) {
          nextOrderId = null;
        } else {
          await this.assertOrderBelongsToCustomer(n, customerId);
          nextOrderId = n;
        }
      }
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE customer_legal_documents SET
        order_id = ?,
        title = ?,
        document_kind = ?,
        issued_at = ?,
        returned_at = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ? AND customer_id = ?`,
      [
        nextOrderId,
        title,
        data.document_kind !== undefined ? (data.document_kind?.trim() || null) : cur.document_kind,
        issued,
        data.returned_at !== undefined ? (data.returned_at?.trim() || null) : cur.returned_at,
        data.notes !== undefined ? (data.notes?.trim() || null) : cur.notes,
        now,
        documentId,
        customerId,
      ],
    );
    const row = await db.get('SELECT * FROM customer_legal_documents WHERE id = ?', [documentId]);
    return this.mapRow(row as Record<string, unknown>);
  }

  static async delete(customerId: number, documentId: number): Promise<void> {
    await this.assertLegalCustomer(customerId);
    const db = await getDb();
    const result = await db.run('DELETE FROM customer_legal_documents WHERE id = ? AND customer_id = ?', [
      documentId,
      customerId,
    ]);
    if ((result as { changes?: number }).changes === 0) {
      throw new Error('Запись не найдена');
    }
  }
}
