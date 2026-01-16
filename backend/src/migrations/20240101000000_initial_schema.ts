import { Database } from 'sqlite'

const createStatements = [
  `PRAGMA foreign_keys = ON;`,

  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    role TEXT,
    api_token TEXT UNIQUE,
    password_hash TEXT,
    is_active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS role_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    assigned_at TEXT DEFAULT (datetime('now')),
    assigned_by INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(role_id) REFERENCES user_roles(id) ON DELETE CASCADE,
    UNIQUE(user_id, role_id)
  )`,

  `CREATE TABLE IF NOT EXISTS order_statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    status INTEGER NOT NULL,
    createdAt TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updatedAt TEXT,
    updated_at TEXT,
    userId INTEGER,
    customerName TEXT,
    customerPhone TEXT,
    customerEmail TEXT,
    prepaymentAmount REAL DEFAULT 0,
    prepaymentStatus TEXT,
    paymentUrl TEXT,
    paymentId TEXT,
    paymentMethod TEXT DEFAULT 'online',
    source TEXT,
    FOREIGN KEY(status) REFERENCES order_statuses(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId INTEGER NOT NULL,
    type TEXT NOT NULL,
    params TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_snapshot TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS order_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId INTEGER NOT NULL,
    filename TEXT NOT NULL,
    originalName TEXT,
    mime TEXT,
    size INTEGER,
    uploadedAt TEXT DEFAULT (datetime('now')),
    approved INTEGER NOT NULL DEFAULT 0,
    approvedAt TEXT,
    approvedBy INTEGER,
    FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date TEXT NOT NULL,
    orders_count INTEGER NOT NULL DEFAULT 0,
    total_revenue REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    user_id INTEGER,
    snapshot_json TEXT,
    cash_actual REAL
  )`,

  `CREATE TABLE IF NOT EXISTS order_item_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    order_item_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    order_item_total REAL NOT NULL DEFAULT 0,
    percent REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    earned_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    UNIQUE(order_item_id, earned_date),
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(order_item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS user_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    hours REAL NOT NULL DEFAULT 0,
    comment TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    UNIQUE(user_id, work_date),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    calculator_type TEXT DEFAULT 'product',
    product_type TEXT,
    operator_percent REAL DEFAULT 0,
    FOREIGN KEY(category_id) REFERENCES product_categories(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS paper_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    search_keywords TEXT,
    description TEXT,
    weight INTEGER,
    color TEXT,
    finish TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS product_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    config_data TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS product_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    options TEXT,
    min_value REAL,
    max_value REAL,
    step REAL,
    default_value TEXT,
    is_required INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS post_processing_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'шт',
    operation_type TEXT DEFAULT 'other',
    price_unit TEXT DEFAULT 'per_item',
    setup_cost REAL DEFAULT 0,
    min_quantity INTEGER DEFAULT 1,
    max_quantity INTEGER,
    parameters TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS product_operations_link (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    operation_id INTEGER NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 1,
    is_required INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 1,
    price_multiplier REAL NOT NULL DEFAULT 1,
    default_params TEXT,
    conditions TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(operation_id) REFERENCES post_processing_services(id) ON DELETE CASCADE,
    UNIQUE(product_id, operation_id, sequence)
  )`,

  `CREATE TABLE IF NOT EXISTS operation_pricing_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    conditions TEXT,
    pricing_data TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(operation_id) REFERENCES post_processing_services(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS markup_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_name TEXT NOT NULL UNIQUE,
    setting_value REAL NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS quantity_discounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    min_quantity INTEGER NOT NULL,
    max_quantity INTEGER,
    discount_percent REAL NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS service_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL UNIQUE,
    service_type TEXT DEFAULT 'generic',
    unit TEXT NOT NULL,
    price_per_unit REAL NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS service_volume_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    min_quantity INTEGER NOT NULL,
    price_per_unit REAL NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(service_id) REFERENCES service_prices(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS product_service_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    is_required INTEGER DEFAULT 0,
    default_quantity REAL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(service_id) REFERENCES service_prices(id) ON DELETE CASCADE,
    UNIQUE(product_id, service_id)
  )`,

  `CREATE TABLE IF NOT EXISTS product_post_processing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_required INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(service_id) REFERENCES post_processing_services(id) ON DELETE CASCADE,
    UNIQUE(product_id, service_id)
  )`,

  `CREATE TABLE IF NOT EXISTS material_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category_id INTEGER,
    unit TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    min_quantity REAL,
    max_stock_level REAL,
    sheet_price_single REAL,
    description TEXT,
    supplier_id INTEGER,
    paper_type_id INTEGER,
    density INTEGER,
    min_stock_level REAL DEFAULT 0,
    location TEXT,
    barcode TEXT,
    sku TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(category_id) REFERENCES material_categories(id),
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY(paper_type_id) REFERENCES paper_types(id)
  )`,

  `CREATE TABLE IF NOT EXISTS material_moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'legacy',
    quantity REAL NOT NULL DEFAULT 0,
    delta REAL NOT NULL DEFAULT 0,
    price REAL,
    reason TEXT,
    order_id INTEGER,
    user_id INTEGER,
    supplier_id INTEGER,
    delivery_number TEXT,
    invoice_number TEXT,
    delivery_date TEXT,
    delivery_notes TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
  )`,

  `CREATE TABLE IF NOT EXISTS material_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    order_id INTEGER,
    quantity_reserved REAL NOT NULL,
    status TEXT DEFAULT 'active',
    reserved_by INTEGER,
    reserved_at TEXT DEFAULT (datetime('now')),
    released_at TEXT,
    notes TEXT,
    FOREIGN KEY(material_id) REFERENCES materials(id),
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(reserved_by) REFERENCES users(id)
  )`,

  `CREATE TABLE IF NOT EXISTS stock_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    threshold_value REAL,
    current_value REAL,
    message TEXT,
    is_resolved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY(material_id) REFERENCES materials(id)
  )`,

  `CREATE TABLE IF NOT EXISTS preset_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS preset_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    UNIQUE(category_id, description),
    FOREIGN KEY(category_id) REFERENCES preset_categories(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS preset_extras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    type TEXT NOT NULL,
    unit TEXT,
    FOREIGN KEY(category_id) REFERENCES preset_categories(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS product_materials (
    presetCategory TEXT NOT NULL,
    presetDescription TEXT NOT NULL,
    materialId INTEGER NOT NULL,
    qtyPerItem REAL NOT NULL,
    FOREIGN KEY(materialId) REFERENCES materials(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS printers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS printer_counters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_id INTEGER NOT NULL,
    counter_date TEXT NOT NULL,
    value INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(printer_id) REFERENCES printers(id) ON DELETE CASCADE,
    UNIQUE(printer_id, counter_date)
  )`
]

const indexStatements = [
  `CREATE INDEX IF NOT EXISTS idx_material_moves_material ON material_moves(material_id)`,
  `CREATE INDEX IF NOT EXISTS idx_material_moves_created ON material_moves(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_material_moves_order ON material_moves(order_id)`
]

export const up = async (db: Database): Promise<void> => {
  for (const statement of createStatements) {
    await db.exec(statement)
  }
  for (const statement of indexStatements) {
    await db.exec(statement)
  }
}

export const down = async (db: Database): Promise<void> => {
  const dropOrder = [
    'printer_counters',
    'printers',
    'product_materials',
    'preset_extras',
    'preset_items',
    'preset_categories',
    'stock_alerts',
    'material_reservations',
    'material_moves',
    'materials',
    'suppliers',
    'material_categories',
    'product_post_processing',
    'product_service_links',
    'service_volume_prices',
    'service_prices',
    'quantity_discounts',
    'markup_settings',
    'operation_pricing_rules',
    'product_operations_link',
    'post_processing_services',
    'product_parameters',
    'product_configs',
    'paper_types',
    'products',
    'product_categories',
    'daily_reports',
    'order_files',
    'items',
    'orders',
    'order_statuses',
    'role_assignments',
    'user_roles',
    'users'
  ]

  for (const table of dropOrder) {
    await db.exec(`DROP TABLE IF EXISTS ${table}`)
  }
}

