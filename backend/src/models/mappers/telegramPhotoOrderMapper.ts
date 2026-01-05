import { Item } from '../../models/Item'
import { Order } from '../../models/Order'

export type PhotoOrderRow = {
  id: number
  status: number
  created_at: string
  first_name: string
  chat_id: string
  total_price: number // stored in minor units (cents)
  selected_size: string
  processing_options: string
  quantity: number
}

export function mapPhotoOrderToVirtualItem(row: PhotoOrderRow): Item {
  return {
    id: row.id * 1000,
    orderId: row.id,
    type: 'Фото печать',
    params: {
      description: `Фото ${row.selected_size} (${row.processing_options})`,
      components: [],
    },
    price: row.total_price / 100.0,
    quantity: row.quantity,
    sides: 1,
    sheets: 1,
    waste: 0,
    clicks: 0,
  }
}

export function mapPhotoOrderToOrder(row: PhotoOrderRow): Order {
  return {
    id: row.id,
    number: `tg-ord-${row.id}`,
    status: row.status,
    created_at: row.created_at,
    customerName: row.first_name,
    customerPhone: row.chat_id,
    prepaymentAmount: row.total_price / 100.0,
    prepaymentStatus: 'paid',
    paymentMethod: 'telegram',
    items: [],
  }
}


