import { Request, Response } from 'express'
import { getDb } from '../../../config/database'
import { AuthenticatedRequest } from '../../../middleware'
import { Item } from '../../../models'
import { itemRowSelect, mapItemRowToItem } from '../../../models/mappers/itemMapper'
import { EarningsService } from '../../../services/earningsService'
import { UnifiedWarehouseService } from '../../warehouse/services/unifiedWarehouseService'
import { MaterialTransactionService } from '../../warehouse/services/materialTransactionService'
import { computeClicks, ceilRequiredQuantity } from '../../../utils/printing'
import { logger } from '../../../utils/logger'

export class OrderItemController {
  static async addItem(req: Request, res: Response) {
    try {
      const orderId = Number(req.params.id)
      const { type, params, price, quantity = 1, printerId, sides = 1, sheets = 0, waste = 0, components } = req.body as {
        type: string
        params: { description: string }
        price: number
        quantity?: number
        printerId?: number
        sides?: number
        sheets?: number
        waste?: number
        components?: Array<{ materialId: number; qtyPerItem: number }>
      }
      const authUser = (req as AuthenticatedRequest).user as { id: number } | undefined
      
      // 🆕 Детальное логирование входящих данных для отладки
      logger.info('📥 [addItem] Входящие данные', {
        orderId,
        type,
        price,
        quantity,
        hasParams: !!params,
        paramsKeys: params ? Object.keys(params) : [],
        paramsType: typeof params,
        hasComponents: Array.isArray(components),
        componentsCount: Array.isArray(components) ? components.length : 0,
        bodyKeys: Object.keys(req.body || {})
      })

      const db = await getDb()
      // Узнаём материалы и остатки (либо из переданных components, либо по пресету)
      let needed = [] as Array<{ materialId: number; qtyPerItem: number; quantity: number; min_quantity: number | null }>
      if (Array.isArray(components) && components.length > 0) {
        const ids = components.map(c => Number(c.materialId)).filter(Boolean)
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',')
          const rows = await db.all<any>(`SELECT id as materialId, quantity, min_quantity FROM materials WHERE id IN (${placeholders})`, ...ids)
          const byId: Record<number, { quantity: number; min_quantity: number | null }> = {}
          for (const r of rows) byId[Number(r.materialId)] = { quantity: Number(r.quantity), min_quantity: r.min_quantity == null ? null : Number(r.min_quantity) }
          needed = components.map(c => ({ materialId: Number(c.materialId), qtyPerItem: Number(c.qtyPerItem), quantity: byId[Number(c.materialId)]?.quantity ?? 0, min_quantity: byId[Number(c.materialId)]?.min_quantity ?? null }))
        }
      } else if (params?.description && type) {
        needed = (await db.all<{
          materialId: number
          qtyPerItem: number
          quantity: number
          min_quantity: number | null
        }>(
          `SELECT pm.materialId, pm.qtyPerItem, m.quantity, m.min_quantity as min_quantity
             FROM product_materials pm
             JOIN materials m ON m.id = pm.materialId
             WHERE pm.presetCategory = ? AND pm.presetDescription = ?`,
          type,
          params.description
        )) as unknown as Array<{ materialId: number; qtyPerItem: number; quantity: number; min_quantity: number | null }>
      }

      // Транзакция: резервирование материалов и вставка позиции
      await db.run('BEGIN')
      try {
        const reservationsPayload = needed.map(n => ({
          material_id: n.materialId,
          quantity: ceilRequiredQuantity(n.qtyPerItem, quantity),
          order_id: orderId,
          reason: 'reserve for order add item'
        }))

        // Если материалов не требуется (нет пресетов/компонентов) — пропускаем резервирование
        // Резервируем материалы внутри текущей транзакции
        let reservations: any[] = []
        if (reservationsPayload.length > 0) {
          // Резервируем материалы напрямую в БД, без отдельной транзакции
          for (const payload of reservationsPayload) {
            // Проверяем доступность
            const material = await db.get<{ quantity: number; name: string }>(
              'SELECT quantity, name FROM materials WHERE id = ?',
              [payload.material_id]
            )
            
            if (!material) {
              throw new Error(`Материал с ID ${payload.material_id} не найден`)
            }
            
            // Проверяем резервы
            const now = new Date().toISOString()
            const existing = await db.get<{ reserved: number }>(`
              SELECT COALESCE(SUM(quantity_reserved), 0) as reserved
              FROM material_reservations 
              WHERE material_id = ? AND status = 'active' 
                AND (expires_at IS NULL OR expires_at > ?)
            `, [payload.material_id, now])
            
            const reserved = existing?.reserved || 0
            const available = material.quantity - reserved
            
            if (available < payload.quantity) {
              const error = new Error(`Недостаточно материала "${material.name}". Доступно: ${available}, требуется: ${payload.quantity}`)
              ;(error as any).status = 400 // 🆕 Устанавливаем статус 400 (Bad Request) вместо 500
              ;(error as any).code = 'INSUFFICIENT_MATERIAL' // 🆕 Код ошибки для фронтенда
              throw error
            }
            
            // Создаем резерв
            const expiresAt = new Date()
            expiresAt.setHours(expiresAt.getHours() + 24)
            
            const result = await db.run(`
              INSERT INTO material_reservations 
              (material_id, order_id, quantity_reserved, status, notes, expires_at)
              VALUES (?, ?, ?, 'active', ?, ?)
            `, 
              payload.material_id,
              payload.order_id || null,
              payload.quantity,
              payload.reason || 'Резерв для заказа',
              expiresAt.toISOString()
            )
            
            reservations.push({
              id: result.lastID || 0,
              material_id: payload.material_id,
              order_id: payload.order_id,
              quantity: payload.quantity,
              status: 'reserved',
              created_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString(),
              reason: payload.reason
            })
          }
        }

        const clicks = computeClicks(sheets, sides)
        
        // 🆕 Безопасная сериализация params с обработкой циклических ссылок и несериализуемых данных
        let paramsJson: string
        try {
          // 🆕 Очищаем params от потенциально проблемных полей перед сериализацией
          const cleanParams: any = {}
          if (params) {
            for (const [key, value] of Object.entries(params)) {
              // Пропускаем функции и undefined
              if (typeof value === 'function' || value === undefined) {
                continue
              }
              // Пропускаем циклические ссылки (проверяем через try-catch при сериализации)
              try {
                JSON.stringify(value)
                cleanParams[key] = value
              } catch (e) {
                logger.warn(`⚠️ [addItem] Пропускаем поле ${key} из-за проблем с сериализацией`, {
                  key,
                  valueType: typeof value,
                  error: (e as Error).message
                })
              }
            }
          }
          
          const paramsToSave = {
            ...cleanParams,
            components: Array.isArray(components)
              ? components.map((c) => {
                  const r = reservations.find((rr) => rr.material_id === Number(c.materialId))
                  return { materialId: Number(c.materialId), qtyPerItem: Number(c.qtyPerItem), reservationId: r?.id }
                })
              : undefined
          }
          
          // Удаляем undefined значения и функции для безопасной сериализации
          const seen = new WeakSet()
          paramsJson = JSON.stringify(paramsToSave, (key, value) => {
            // Пропускаем функции и undefined
            if (typeof value === 'function' || value === undefined) {
              return null
            }
            // Обрабатываем циклические ссылки
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) {
                return '[Circular]'
              }
              seen.add(value)
            }
            return value
          })
          
          logger.info('✅ [addItem] params успешно сериализованы', {
            paramsJsonLength: paramsJson.length,
            hasComponents: Array.isArray(paramsToSave.components),
            componentsCount: Array.isArray(paramsToSave.components) ? paramsToSave.components.length : 0
          })
        } catch (serializeError: any) {
          logger.error('❌ [addItem] Ошибка сериализации params', {
            error: serializeError,
            message: serializeError?.message,
            stack: serializeError?.stack,
            paramsKeys: params ? Object.keys(params) : [],
            paramsType: typeof params
          })
          // Fallback: сохраняем только базовые поля
          paramsJson = JSON.stringify({
            description: params?.description || type,
            components: Array.isArray(components)
              ? components.map((c) => {
                  const r = reservations.find((rr) => rr.material_id === Number(c.materialId))
                  return { materialId: Number(c.materialId), qtyPerItem: Number(c.qtyPerItem), reservationId: r?.id }
                })
              : undefined
          })
        }
        
        logger.info('💾 [addItem] Вставляем позицию в БД', {
          orderId,
          type,
          price,
          quantity: Math.max(1, Number(quantity) || 1),
          paramsJsonLength: paramsJson.length
        })
        
        const insertItem = await db.run(
          'INSERT INTO items (orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          orderId,
          type,
          paramsJson,
          price,
          Math.max(1, Number(quantity) || 1),
          printerId || null,
          Math.max(1, Number(sides) || 1),
          Math.max(0, Number(sheets) || 0),
          Math.max(0, Number(waste) || 0),
          clicks
        )
        const itemId = insertItem.lastID!

        // 🆕 По умолчанию считаем заказ оплаченным, если предоплата ещё не была задана
        const paymentRow = await db.get<{
          prepaymentAmount?: number | null
          prepaymentStatus?: string | null
          paymentMethod?: string | null
        }>('SELECT prepaymentAmount, prepaymentStatus, paymentMethod FROM orders WHERE id = ?', [orderId])
        const totalsRow = await db.get<{ total_amount: number }>(
          'SELECT COALESCE(SUM(price * quantity), 0) as total_amount FROM items WHERE orderId = ?',
          [orderId]
        )
        const totalAmount = Number(totalsRow?.total_amount || 0)
        const prepaymentAmount = Number(paymentRow?.prepaymentAmount || 0)
        const prepaymentStatus = paymentRow?.prepaymentStatus
        const paymentMethod = paymentRow?.paymentMethod
        const allowAutoPay = paymentMethod !== null && paymentMethod !== undefined
        const hasPrepayment = prepaymentAmount > 0 || (prepaymentStatus && prepaymentStatus.length > 0)
        if (allowAutoPay && !hasPrepayment && totalAmount > 0) {
          let hasPrepaymentUpdatedAt = false
          try {
            const columns = await db.all<{ name: string }>("PRAGMA table_info('orders')")
            hasPrepaymentUpdatedAt = Array.isArray(columns) && columns.some((col) => col.name === 'prepaymentUpdatedAt')
          } catch {
            hasPrepaymentUpdatedAt = false
          }
          const updateSql = hasPrepaymentUpdatedAt
            ? `UPDATE orders
               SET prepaymentAmount = ?, prepaymentStatus = 'paid', paymentMethod = 'offline', paymentUrl = NULL, paymentId = NULL, prepaymentUpdatedAt = datetime('now'), updated_at = datetime('now')
               WHERE id = ?`
            : `UPDATE orders
               SET prepaymentAmount = ?, prepaymentStatus = 'paid', paymentMethod = 'offline', paymentUrl = NULL, paymentId = NULL, updated_at = datetime('now')
               WHERE id = ?`
          await db.run(updateSql, [totalAmount, orderId])
        }
        
        logger.info('✅ [addItem] Позиция вставлена', { itemId })
        
        const rawItem = await db.get(
          `SELECT ${itemRowSelect} FROM items WHERE id = ?`,
          itemId
        )

        await db.run('COMMIT')
        
        logger.info('✅ [addItem] Транзакция завершена успешно', { itemId, orderId })

        const orderRow = await db.get<{ created_date?: string }>(
          'SELECT COALESCE(createdAt, created_at) as created_date FROM orders WHERE id = ?',
          [orderId]
        )
        if (orderRow?.created_date) {
          const date = String(orderRow.created_date).slice(0, 10)
          void EarningsService.recalculateForDate(date).catch((recalcError) => {
            logger.error('❌ [addItem] Ошибка перерасчета выручки', {
              date,
              error: recalcError,
              message: (recalcError as Error)?.message
            })
          })
        }

        const item = mapItemRowToItem(rawItem as any)
        res.status(201).json(item)
        return
      } catch (e) {
        await db.run('ROLLBACK')
        throw e
      }
    } catch (error: any) {
      // 🆕 Определяем статус ошибки: 400 для бизнес-ошибок (недостаток материалов), 500 для системных
      const isBusinessError = error?.code === 'INSUFFICIENT_MATERIAL' || 
                              error?.message?.includes('Недостаточно материала') ||
                              error?.message?.includes('не найден')
      const status = error.status || (isBusinessError ? 400 : 500)
      
      logger.error('❌ [addItem] Ошибка добавления позиции в заказ', {
        error,
        errorMessage: error?.message,
        errorStack: error?.stack,
        errorName: error?.name,
        errorCode: error?.code,
        status,
        isBusinessError,
        orderId: req.params.id,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        bodyType: req.body ? typeof req.body : 'undefined',
        hasParams: !!(req.body as any)?.params,
        paramsType: (req.body as any)?.params ? typeof (req.body as any).params : 'undefined',
        paramsKeys: (req.body as any)?.params ? Object.keys((req.body as any).params) : []
      })
      
      res.status(status).json({ 
        error: error.message || 'Ошибка при добавлении позиции в заказ',
        code: error?.code || (isBusinessError ? 'BUSINESS_ERROR' : 'INTERNAL_ERROR'),
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    }
  }

  static async deleteItem(req: Request, res: Response) {
    try {
      const orderId = Number(req.params.orderId)
      const itemId = Number(req.params.itemId)
      const authUser = (req as AuthenticatedRequest).user as { id: number } | undefined
      const db = await getDb()

      // Находим позицию и её состав материалов
      const it = await db.get<{
        id: number
        type: string
        params: string
        quantity: number
      }>(
        'SELECT id, type, params, quantity FROM items WHERE orderId = ? AND id = ?',
        orderId,
        itemId
      )

      if (!it) {
        // Нечего возвращать, просто 204
        await db.run('DELETE FROM items WHERE orderId = ? AND id = ?', orderId, itemId)
        const orderRow = await db.get<{ created_date?: string }>(
          'SELECT COALESCE(createdAt, created_at) as created_date FROM orders WHERE id = ?',
          [orderId]
        )
        if (orderRow?.created_date) {
          const date = String(orderRow.created_date).slice(0, 10)
          void EarningsService.recalculateForDate(date).catch((recalcError) => {
            logger.error('❌ [deleteItem] Ошибка перерасчета выручки', {
              date,
              error: recalcError,
              message: (recalcError as Error)?.message
            })
          })
        }
        res.status(204).end()
        return
      }

      let paramsObj: { description?: string; components?: Array<{ materialId: number; qtyPerItem: number; reservationId?: number }> }
      try {
        paramsObj = JSON.parse(it.params || '{}')
      } catch (parseError) {
        logger.warn('⚠️ [deleteItem] Не удалось распарсить params, пропускаем состав', {
          itemId,
          orderId,
          error: parseError,
        })
        paramsObj = {}
      }
      const components = Array.isArray(paramsObj.components) ? paramsObj.components : []

      await db.run('BEGIN')
      try {
        // Если у компонентов есть reservationId — отменяем резервы
        const reservationIds = components
          .map(c => c.reservationId)
          .filter((id): id is number => typeof id === 'number' && id > 0)
        if (reservationIds.length > 0) {
          await UnifiedWarehouseService.cancelReservations(reservationIds)
        } else if ((paramsObj as any).description) {
          // Старые записи без резервов — выполняем возврат на склад по составу из product_materials
          const composition = (await db.all<{
            materialId: number
            qtyPerItem: number
          }>(
            'SELECT materialId, qtyPerItem FROM product_materials WHERE presetCategory = ? AND presetDescription = ?',
            it.type,
            (paramsObj as any).description || ''
          )) as unknown as Array<{ materialId: number; qtyPerItem: number }>

          for (const c of composition) {
            const returnQty = Math.ceil((c.qtyPerItem || 0) * Math.max(1, Number(it.quantity) || 1))
            if (returnQty > 0) {
              await MaterialTransactionService.return({
                materialId: c.materialId,
                quantity: returnQty,
                reason: 'order delete item',
                orderId,
                userId: authUser?.id
              })
            }
          }
        }

        await db.run('DELETE FROM items WHERE orderId = ? AND id = ?', orderId, itemId)
        
        // 🆕 Пересчитываем предоплату после удаления позиции
        const paymentRow = await db.get<{
          prepaymentAmount?: number | null
          prepaymentStatus?: string | null
          paymentMethod?: string | null
        }>('SELECT prepaymentAmount, prepaymentStatus, paymentMethod FROM orders WHERE id = ?', [orderId])
        
        const totalsRow = await db.get<{ total_amount: number }>(
          'SELECT COALESCE(SUM(price * quantity), 0) as total_amount FROM items WHERE orderId = ?',
          [orderId]
        )
        const newTotalAmount = Number(totalsRow?.total_amount || 0)
        const currentPrepayment = Number(paymentRow?.prepaymentAmount || 0)
        const paymentMethod = paymentRow?.paymentMethod
        
        // Если оплата offline и предоплата была равна прежней сумме — обновляем на новую сумму
        if (paymentMethod === 'offline' && currentPrepayment > newTotalAmount) {
          let hasPrepaymentUpdatedAt = false
          try {
            const columns = await db.all<{ name: string }>("PRAGMA table_info('orders')")
            hasPrepaymentUpdatedAt = Array.isArray(columns) && columns.some((col) => col.name === 'prepaymentUpdatedAt')
          } catch {
            hasPrepaymentUpdatedAt = false
          }
          
          const updateSql = hasPrepaymentUpdatedAt
            ? `UPDATE orders SET prepaymentAmount = ?, prepaymentUpdatedAt = datetime('now'), updated_at = datetime('now') WHERE id = ?`
            : `UPDATE orders SET prepaymentAmount = ?, updated_at = datetime('now') WHERE id = ?`
          
          await db.run(updateSql, [newTotalAmount, orderId])
          logger.info('💰 [deleteItem] Предоплата пересчитана', {
            orderId,
            oldPrepayment: currentPrepayment,
            newPrepayment: newTotalAmount
          })
        }
        
        await db.run('COMMIT')
        const orderRow = await db.get<{ created_date?: string }>(
          'SELECT COALESCE(createdAt, created_at) as created_date FROM orders WHERE id = ?',
          [orderId]
        )
        if (orderRow?.created_date) {
          const date = String(orderRow.created_date).slice(0, 10)
          void EarningsService.recalculateForDate(date).catch((recalcError) => {
            logger.error('❌ [deleteItem] Ошибка перерасчета выручки', {
              date,
              error: recalcError,
              message: (recalcError as Error)?.message
            })
          })
        }
        res.status(204).end()
      } catch (e) {
        await db.run('ROLLBACK')
        throw e
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async updateItem(req: Request, res: Response) {
    try {
      const orderId = Number(req.params.orderId)
      const itemId = Number(req.params.itemId)
      const body = req.body as Partial<{
        price: number
        quantity: number
        printerId: number | null
        sides: number
        sheets: number
        waste: number
      }>
      const db = await getDb()

      const existing = await db.get<{
        id: number
        orderId: number
        type: string
        params: string
        price: number
        quantity: number
        printerId: number | null
        sides: number
        sheets: number
        waste: number
      }>('SELECT id, orderId, type, params, price, quantity, printerId, sides, sheets, waste FROM items WHERE id = ? AND orderId = ?', itemId, orderId)
      if (!existing) { res.status(404).json({ message: 'Позиция не найдена' }); return }

      const newQuantity = body.quantity != null ? Math.max(1, Number(body.quantity) || 1) : existing.quantity
      const deltaQty = newQuantity - (existing.quantity ?? 1)

      await db.run('BEGIN')
      try {
        if (deltaQty !== 0) {
          const paramsObj = JSON.parse(existing.params || '{}') as { description?: string; components?: Array<{ materialId: number; qtyPerItem: number; reservationId?: number }> }
          const components = Array.isArray(paramsObj.components) ? paramsObj.components : []

          if (components.length > 0) {
            if (deltaQty > 0) {
              // Дозарезервировать недостающий объём
              const reservationsPayload = components.map(c => ({
                material_id: Number(c.materialId),
                quantity: Math.ceil((Math.max(0, Number(c.qtyPerItem) || 0)) * deltaQty),
                order_id: orderId,
                reason: 'order update qty +'
              })).filter(r => r.quantity > 0)
              if (reservationsPayload.length > 0) {
                const newReservations = await UnifiedWarehouseService.reserveMaterials(reservationsPayload)
                // дописывать reservationId не требуется для существующей позиции; подтверждение произойдёт по id из components + новые вернутся отдельно при дальнейшем апдейте
                // опционально можно хранить массив reservationIds на уровне позиции в будущем
              }
            } else {
              // Снизили количество — отменяем часть резервов пропорционально
              const toCancel: number[] = []
              for (const c of components) {
                if (c.reservationId) toCancel.push(c.reservationId)
              }
              if (toCancel.length > 0) {
                await UnifiedWarehouseService.cancelReservations(toCancel)
              }
            }
          } else {
            // Старые записи без компонентов/резервов — fallback к прежней логике движений склада
            const composition = (await db.all<{
              materialId: number
              qtyPerItem: number
              quantity: number
            }>(
              `SELECT pm.materialId, pm.qtyPerItem, m.quantity
                 FROM product_materials pm
                 JOIN materials m ON m.id = pm.materialId
                WHERE pm.presetCategory = ? AND pm.presetDescription = ?`,
              existing.type,
              (paramsObj as any).description || ''
            )) as unknown as Array<{ materialId: number; qtyPerItem: number; quantity: number }>

            if (deltaQty > 0) {
              for (const c of composition) {
                const need = Math.ceil((Math.max(0, Number(c.qtyPerItem) || 0)) * deltaQty)
                if (need > 0) {
                  await MaterialTransactionService.spend({
                    materialId: c.materialId,
                    quantity: need,
                    reason: 'order update qty +',
                    orderId,
                    userId: (req as AuthenticatedRequest).user?.id
                  })
                }
              }
            } else {
              for (const c of composition) {
                const back = Math.ceil((Math.max(0, Number(c.qtyPerItem) || 0)) * Math.abs(deltaQty))
                if (back > 0) {
                  await MaterialTransactionService.return({
                    materialId: c.materialId,
                    quantity: back,
                    reason: 'order update qty -',
                    orderId,
                    userId: (req as AuthenticatedRequest).user?.id
                  })
                }
              }
            }
          }
        }

        const nextSides = body.sides != null ? Math.max(1, Number(body.sides) || 1) : existing.sides
        const nextSheets = body.sheets != null ? Math.max(0, Number(body.sheets) || 0) : existing.sheets
        const clicks = nextSheets * (nextSides * 2)

        await db.run(
          `UPDATE items SET 
              ${body.price != null ? 'price = ?,' : ''}
              ${body.quantity != null ? 'quantity = ?,' : ''}
              ${body.printerId !== undefined ? 'printerId = ?,' : ''}
              ${body.sides != null ? 'sides = ?,' : ''}
              ${body.sheets != null ? 'sheets = ?,' : ''}
              ${body.waste != null ? 'waste = ?,' : ''}
              clicks = ?
           WHERE id = ? AND orderId = ?`,
          ...([body.price != null ? Number(body.price) : []] as any),
          ...([body.quantity != null ? newQuantity : []] as any),
          ...([body.printerId !== undefined ? (body.printerId as any) : []] as any),
          ...([body.sides != null ? nextSides : []] as any),
          ...([body.sheets != null ? nextSheets : []] as any),
          ...([body.waste != null ? Math.max(0, Number(body.waste) || 0) : []] as any),
          clicks,
          itemId,
          orderId
        )

        await db.run('COMMIT')
        const orderRow = await db.get<{ created_date?: string }>(
          'SELECT COALESCE(createdAt, created_at) as created_date FROM orders WHERE id = ?',
          [orderId]
        )
        if (orderRow?.created_date) {
          const date = String(orderRow.created_date).slice(0, 10)
          await EarningsService.recalculateForDate(date)
        }
      } catch (e) {
        await db.run('ROLLBACK')
        throw e
      }

      const updated = await db.get<any>('SELECT id, orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks FROM items WHERE id = ? AND orderId = ?', itemId, orderId)
      res.json({
        id: updated.id,
        orderId: updated.orderId,
        type: updated.type,
        params: JSON.parse(updated.params || '{}'),
        price: updated.price,
        quantity: updated.quantity,
        printerId: updated.printerId ?? undefined,
        sides: updated.sides,
        sheets: updated.sheets,
        waste: updated.waste,
        clicks: updated.clicks
      })
    } catch (error: any) {
      const status = error.status || 500
      res.status(status).json({ error: error.message })
    }
  }
}
