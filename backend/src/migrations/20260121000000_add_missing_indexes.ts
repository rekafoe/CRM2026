import { Database } from 'sqlite'

/**
 * Миграция: Добавление недостающих индексов для оптимизации запросов
 * 
 * Добавляет индексы на часто используемые поля в WHERE, JOIN и ORDER BY:
 * - orders: customerPhone, customerEmail, paymentMethod, prepaymentAmount, created_at
 * - items: type
 * - order_item_earnings: earned_date
 * - product_operations_link: sequence, sort_order
 */
export const up = async (db: Database): Promise<void> => {
  // Индексы для таблицы orders (часто используются в поиске и фильтрации)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_customer_phone 
    ON orders(customerPhone)
  `)
  
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_customer_email 
    ON orders(customerEmail)
  `)
  
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_payment_method 
    ON orders(paymentMethod)
  `)
  
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_prepayment_amount 
    ON orders(prepaymentAmount)
  `)
  
  // Индекс на created_at для сортировки и фильтрации по дате
  // (может уже существовать, но проверяем)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_created_at 
    ON orders(created_at)
  `)
  
  // Индекс на userId для фильтрации заказов пользователя
  // (может уже существовать через FK, но явно создаём для производительности)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_user_id 
    ON orders(userId)
  `)
  
  // Индекс на status для фильтрации по статусу
  // (может уже существовать через FK, но явно создаём)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_status 
    ON orders(status)
  `)
  
  // Составной индекс для частого запроса: userId + status + created_at
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_user_status_created 
    ON orders(userId, status, created_at DESC)
  `)
  
  // Индекс для items.type (используется в фильтрации)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_type 
    ON items(type)
  `)
  
  // Составной индекс для items: orderId + type (часто используется вместе)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_order_type 
    ON items(orderId, type)
  `)
  
  // Индекс для order_item_earnings.earned_date (для группировки по дате)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_item_earnings_earned_date 
    ON order_item_earnings(earned_date)
  `)
  
  // Составной индекс для order_item_earnings: user_id + earned_date
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_item_earnings_user_date 
    ON order_item_earnings(user_id, earned_date)
  `)
  
  // Индексы для product_operations_link (для сортировки)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_operations_link_sequence 
    ON product_operations_link(product_id, sequence)
  `)
  
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_operations_link_sort_order 
    ON product_operations_link(product_id, sort_order)
  `)
  
  // Индекс для post_processing_services.is_active (часто используется в фильтрации)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_post_processing_services_is_active 
    ON post_processing_services(is_active)
  `)
  
  // Индекс для products.is_active
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_is_active 
    ON products(is_active)
  `)
  
  // Составной индекс для products: category_id + is_active
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_category_active 
    ON products(category_id, is_active)
  `)
}

export const down = async (db: Database): Promise<void> => {
  const indexes = [
    'idx_orders_customer_phone',
    'idx_orders_customer_email',
    'idx_orders_payment_method',
    'idx_orders_prepayment_amount',
    'idx_orders_created_at',
    'idx_orders_user_id',
    'idx_orders_status',
    'idx_orders_user_status_created',
    'idx_items_type',
    'idx_items_order_type',
    'idx_order_item_earnings_earned_date',
    'idx_order_item_earnings_user_date',
    'idx_product_operations_link_sequence',
    'idx_product_operations_link_sort_order',
    'idx_post_processing_services_is_active',
    'idx_products_is_active',
    'idx_products_category_active',
  ]
  
  for (const index of indexes) {
    await db.exec(`DROP INDEX IF EXISTS ${index}`)
  }
}
