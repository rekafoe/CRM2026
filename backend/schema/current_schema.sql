-- ============================================
-- CRM Print Production Database Schema
-- Текущая актуальная структура БД
-- ============================================

-- Включаем foreign keys
PRAGMA foreign_keys = ON;

-- ============================================
-- ПОЛЬЗОВАТЕЛИ И АВТОРИЗАЦИЯ
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  role TEXT,
  api_token TEXT UNIQUE,
  password_hash TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  assigned_at TEXT DEFAULT (datetime('now')),
  assigned_by INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(role_id) REFERENCES user_roles(id) ON DELETE CASCADE,
  UNIQUE(user_id, role_id)
);

-- ============================================
-- ЗАКАЗЫ
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE,
  status INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
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
  FOREIGN KEY(userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  type TEXT NOT NULL,
  params TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_snapshot TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE
);

-- ============================================
-- ПРИНТЕРЫ И СЧЁТЧИКИ
-- ============================================

CREATE TABLE IF NOT EXISTS printers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  technology_code TEXT,
  counter_unit TEXT CHECK (counter_unit IN ('sheets','meters')) DEFAULT 'sheets',
  max_width_mm REAL,
  color_mode TEXT CHECK (color_mode IN ('bw','color','both')) DEFAULT 'both',
  printer_class TEXT CHECK (printer_class IN ('office','pro')) DEFAULT 'office',
  price_single REAL,
  price_duplex REAL,
  price_per_meter REAL,
  price_bw_single REAL,
  price_bw_duplex REAL,
  price_color_single REAL,
  price_color_duplex REAL,
  price_bw_per_meter REAL,
  price_color_per_meter REAL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS printer_counters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id INTEGER NOT NULL,
  counter_date TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(printer_id) REFERENCES printers(id) ON DELETE CASCADE,
  UNIQUE(printer_id, counter_date)
);

CREATE TABLE IF NOT EXISTS order_files (
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
);

-- ============================================
-- ПРОДУКТЫ
-- ============================================

CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  is_active INTEGER DEFAULT 1,
  calculator_type TEXT CHECK (calculator_type IN ('product','operation')) DEFAULT 'product',
  product_type TEXT CHECK (product_type IN ('sheet_single','multi_page','universal','sheet_item','multi_page_item')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(category_id) REFERENCES product_categories(id) ON DELETE CASCADE
);

-- ============================================
-- ТИПЫ БУМАГИ
-- ============================================

CREATE TABLE IF NOT EXISTS paper_types (
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
);

-- ============================================
-- КОНФИГУРАЦИИ ПРОДУКТОВ
-- ============================================

CREATE TABLE IF NOT EXISTS product_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  config_data TEXT, -- JSON с параметрами конфигурации
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_parameters (
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
);

-- ============================================
-- ОПЕРАЦИИ ПЕЧАТИ (Гибкая система)
-- ============================================

CREATE TABLE IF NOT EXISTS post_processing_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  unit TEXT DEFAULT 'шт',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  -- Расширенные поля для гибкой системы
  operation_type TEXT CHECK(operation_type IN (
    'print', 'cut', 'fold', 'score', 'laminate', 'bind',
    'perforate', 'emboss', 'foil', 'varnish', 'package',
    'design', 'delivery', 'other'
  )) DEFAULT 'other',
  price_unit TEXT CHECK(price_unit IN (
    'per_sheet', 'per_item', 'per_m2', 'per_hour', 'fixed', 'per_order', 'per_cut'
  )) DEFAULT 'per_item',
  setup_cost REAL DEFAULT 0,
  min_quantity INTEGER DEFAULT 1,
  parameters TEXT
);

CREATE TABLE IF NOT EXISTS product_operations_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  operation_id INTEGER NOT NULL,
  is_required INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  default_params TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY(operation_id) REFERENCES post_processing_services(id) ON DELETE CASCADE,
  UNIQUE(product_id, operation_id)
);

CREATE TABLE IF NOT EXISTS operation_pricing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id INTEGER NOT NULL,
  param_combination TEXT,
  cost_formula TEXT NOT NULL,
  min_quantity INTEGER DEFAULT 1,
  max_quantity INTEGER,
  base_cost REAL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(operation_id) REFERENCES post_processing_services(id) ON DELETE CASCADE
);

-- ============================================
-- ЦЕНООБРАЗОВАНИЕ
-- ============================================

CREATE TABLE IF NOT EXISTS product_pricing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  parameter_combination TEXT NOT NULL,
  base_price REAL NOT NULL,
  min_quantity INTEGER DEFAULT 1,
  max_quantity INTEGER,
  discount_percent REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quantity_discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  min_quantity INTEGER NOT NULL,
  max_quantity INTEGER,
  discount_percent REAL NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS markup_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_name TEXT NOT NULL UNIQUE,
  setting_value REAL NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS print_technologies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pricing_mode TEXT CHECK (pricing_mode IN ('per_sheet', 'per_meter')) NOT NULL,
  supports_duplex INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS print_technology_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  technology_code TEXT NOT NULL,
  price_single REAL,
  price_duplex REAL,
  price_per_meter REAL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (technology_code) REFERENCES print_technologies(code) ON DELETE CASCADE,
  UNIQUE(technology_code)
);

CREATE TABLE IF NOT EXISTS print_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  format TEXT NOT NULL,
  print_type TEXT NOT NULL,
  price_per_sheet REAL NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_name TEXT NOT NULL UNIQUE,
  price_per_unit REAL NOT NULL,
  unit TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- МАТЕРИАЛЫ И СКЛАД
-- ============================================

CREATE TABLE IF NOT EXISTS material_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS materials (
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
);

CREATE TABLE IF NOT EXISTS suppliers (
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
);

CREATE TABLE IF NOT EXISTS material_moves (
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
  FOREIGN KEY(material_id) REFERENCES materials(id),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
);

CREATE INDEX IF NOT EXISTS idx_material_moves_material ON material_moves(material_id);
CREATE INDEX IF NOT EXISTS idx_material_moves_created ON material_moves(created_at);
CREATE INDEX IF NOT EXISTS idx_material_moves_order ON material_moves(order_id);

CREATE TABLE IF NOT EXISTS material_reservations (
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
);

CREATE TABLE IF NOT EXISTS stock_alerts (
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
);

-- ============================================
-- УВЕДОМЛЕНИЯ И TELEGRAM
-- ============================================

CREATE TABLE IF NOT EXISTS telegram_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT DEFAULT 'user',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS telegram_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  notification_type TEXT NOT NULL,
  title TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- ============================================
-- ИНДЕКСЫ для производительности
-- ============================================

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(userId);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_items_order ON items(orderId);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_product_parameters_product ON product_parameters(product_id);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category_id);
CREATE INDEX IF NOT EXISTS idx_material_moves_material ON material_moves(material_id);
CREATE INDEX IF NOT EXISTS idx_material_moves_created ON material_moves(created_at);
CREATE INDEX IF NOT EXISTS idx_material_moves_order ON material_moves(order_id);
CREATE INDEX IF NOT EXISTS idx_product_operations_product ON product_operations_link(product_id);
CREATE INDEX IF NOT EXISTS idx_product_operations_operation ON product_operations_link(operation_id);

-- ============================================
-- USER ORDER PAGE ORDERS (для управления заказами)
-- ============================================

CREATE TABLE IF NOT EXISTS user_order_page_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'regular',
  status TEXT NOT NULL DEFAULT 'assigned',
  assigned_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_order_page_orders_page ON user_order_page_orders (page_id);
CREATE INDEX IF NOT EXISTS idx_user_order_page_orders_order ON user_order_page_orders (order_id, order_type);

-- ============================================
-- PHOTO ORDERS (для Telegram заказов)
-- ============================================

CREATE TABLE IF NOT EXISTS photo_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id INTEGER NOT NULL,
  telegram_message_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  chat_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  format TEXT,
  print_type TEXT,
  quantity INTEGER DEFAULT 1,
  price REAL,
  total_price REAL,
  selected_size TEXT,
  processing_options TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_photo_orders_telegram_user ON photo_orders (telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_photo_orders_status ON photo_orders (status);

-- ============================================
-- USER ORDER PAGES (для управления страницами заказов)
-- ============================================

CREATE TABLE IF NOT EXISTS user_order_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  user_name TEXT,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  total_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_order_pages_user_date ON user_order_pages (user_id, date);

