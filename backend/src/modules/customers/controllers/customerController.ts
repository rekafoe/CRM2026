import { Request, Response } from 'express'
import { CustomerService } from '../services/customerService'
import { CustomerLegalDocumentService } from '../services/customerLegalDocumentService'
import { asyncHandler } from '../../../middleware'

export class CustomerController {
  /**
   * GET /api/customers/:customerId/legal-documents
   */
  static listLegalDocuments = asyncHandler(async (req: Request, res: Response) => {
    const customerId = parseInt(req.params.customerId, 10)
    if (isNaN(customerId)) {
      res.status(400).json({ error: 'Неверный ID клиента' })
      return
    }
    try {
      const list = await CustomerLegalDocumentService.listByCustomer(customerId)
      res.json(list)
    } catch (e: any) {
      const msg = e?.message || 'Ошибка'
      if (msg.includes('не найден')) {
        res.status(404).json({ error: msg })
        return
      }
      if (msg.includes('только для юридических')) {
        res.status(400).json({ error: msg })
        return
      }
      res.status(500).json({ error: msg })
    }
  })

  /**
   * POST /api/customers/:customerId/legal-documents
   */
  static createLegalDocument = asyncHandler(async (req: Request, res: Response) => {
    const customerId = parseInt(req.params.customerId, 10)
    if (isNaN(customerId)) {
      res.status(400).json({ error: 'Неверный ID клиента' })
      return
    }
    const { title, document_kind, issued_at, returned_at, notes, order_id } = req.body || {}
    try {
      const row = await CustomerLegalDocumentService.create(customerId, {
        title,
        document_kind,
        issued_at,
        returned_at,
        notes,
        order_id: order_id != null && order_id !== '' ? Number(order_id) : null,
      })
      res.status(201).json(row)
    } catch (e: any) {
      const msg = e?.message || 'Ошибка'
      if (msg.includes('не найден')) {
        res.status(404).json({ error: msg })
        return
      }
      if (msg.includes('только для юридических') || msg.includes('Укажите')) {
        res.status(400).json({ error: msg })
        return
      }
      res.status(500).json({ error: msg })
    }
  })

  /**
   * PUT /api/customers/:customerId/legal-documents/:documentId
   */
  static updateLegalDocument = asyncHandler(async (req: Request, res: Response) => {
    const customerId = parseInt(req.params.customerId, 10)
    const documentId = parseInt(req.params.documentId, 10)
    if (isNaN(customerId) || isNaN(documentId)) {
      res.status(400).json({ error: 'Неверный ID' })
      return
    }
    const { title, document_kind, issued_at, returned_at, notes, order_id } = req.body || {}
    try {
      const row = await CustomerLegalDocumentService.update(customerId, documentId, {
        title,
        document_kind,
        issued_at,
        returned_at,
        notes,
        order_id:
          order_id === undefined
            ? undefined
            : order_id == null || order_id === ''
              ? null
              : Number(order_id),
      })
      res.json(row)
    } catch (e: any) {
      const msg = e?.message || 'Ошибка'
      if (msg.includes('не найдена') || msg.includes('не найден')) {
        res.status(404).json({ error: msg })
        return
      }
      if (msg.includes('только для юридических') || msg.includes('Укажите')) {
        res.status(400).json({ error: msg })
        return
      }
      res.status(500).json({ error: msg })
    }
  })

  /**
   * DELETE /api/customers/:customerId/legal-documents/:documentId
   */
  static deleteLegalDocument = asyncHandler(async (req: Request, res: Response) => {
    const customerId = parseInt(req.params.customerId, 10)
    const documentId = parseInt(req.params.documentId, 10)
    if (isNaN(customerId) || isNaN(documentId)) {
      res.status(400).json({ error: 'Неверный ID' })
      return
    }
    try {
      await CustomerLegalDocumentService.delete(customerId, documentId)
      res.status(204).send()
    } catch (e: any) {
      const msg = e?.message || 'Ошибка'
      if (msg.includes('не найдена') || msg.includes('не найден')) {
        res.status(404).json({ error: msg })
        return
      }
      if (msg.includes('только для юридических')) {
        res.status(400).json({ error: msg })
        return
      }
      res.status(500).json({ error: msg })
    }
  })

  /**
   * GET /api/customers - Получить всех клиентов
   */
  static getAll = asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as 'individual' | 'legal' | undefined
    const search = req.query.search as string | undefined

    const customers = await CustomerService.getAllCustomers({ type, search })
    res.json(customers)
  })

  /**
   * GET /api/customers/:id - Получить клиента по ID
   */
  static getById = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Неверный ID клиента' })
      return
    }

    const customer = await CustomerService.getCustomerById(id)
    if (!customer) {
      res.status(404).json({ error: 'Клиент не найден' })
      return
    }

    res.json(customer)
  })

  /**
   * POST /api/customers - Создать нового клиента
   */
  static create = asyncHandler(async (req: Request, res: Response) => {
    const {
      type,
      first_name,
      last_name,
      middle_name,
      company_name,
      legal_name,
      tax_id,
      bank_details,
      authorized_person,
      phone,
      email,
      address,
      notes
    } = req.body

    if (!type || !['individual', 'legal'].includes(type)) {
      res.status(400).json({ error: 'Необходимо указать тип клиента (individual или legal)' })
      return
    }

    try {
      const customer = await CustomerService.createCustomer({
        type,
        first_name,
        last_name,
        middle_name,
        company_name,
        legal_name,
        tax_id,
        bank_details,
        authorized_person,
        phone,
        email,
        address,
        notes
      })

      res.status(201).json(customer)
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Ошибка создания клиента' })
    }
  })

  /**
   * PUT /api/customers/:id - Обновить клиента
   */
  static update = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Неверный ID клиента' })
      return
    }

    const {
      type,
      first_name,
      last_name,
      middle_name,
      company_name,
      legal_name,
      tax_id,
      bank_details,
      authorized_person,
      phone,
      email,
      address,
      notes,
      marketing_opt_in
    } = req.body

    const payload: Parameters<typeof CustomerService.updateCustomer>[1] = {
        type,
        first_name,
        last_name,
        middle_name,
        company_name,
        legal_name,
        tax_id,
        bank_details,
        authorized_person,
        phone,
        email,
        address,
        notes
    }
    if (marketing_opt_in === 0 || marketing_opt_in === 1) {
      payload.marketing_opt_in = marketing_opt_in
    }

    try {
      const customer = await CustomerService.updateCustomer(id, payload)

      res.json(customer)
    } catch (error: any) {
      if (error.message === 'Клиент не найден') {
        res.status(404).json({ error: error.message })
        return
      }
      res.status(400).json({ error: error.message || 'Ошибка обновления клиента' })
    }
  })

  /**
   * DELETE /api/customers/:id - Удалить клиента
   */
  static delete = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      res.status(400).json({ error: 'Неверный ID клиента' })
      return
    }

    try {
      await CustomerService.deleteCustomer(id)
      res.status(204).send()
    } catch (error: any) {
      if (error.message.includes('не найден')) {
        res.status(404).json({ error: error.message })
        return
      }
      res.status(400).json({ error: error.message || 'Ошибка удаления клиента' })
    }
  })
}
