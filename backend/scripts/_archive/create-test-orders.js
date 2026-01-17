#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Функция для генерации красивых номеров заказов
function generateOrderNumber(source, year = new Date().getFullYear()) {
  const sequence = Math.floor(Math.random() * 999) + 1;
  const paddedSequence = sequence.toString().padStart(3, '0');
  
  switch (source) {
    case 'website':
      return `SW-${year}-${paddedSequence}`;
    case 'telegram':
      return `TG-${year}-${paddedSequence}`;
    case 'manual':
      return `MN-${year}-${paddedSequence}`;
    default:
      return `ORD-${year}-${paddedSequence}`;
  }
}

// Путь к базе данных
const DB_FILE = path.resolve(__dirname, '../data.db');

// Тестовые данные для заказов
const testOrders = [
  {
    customerName: 'Иван Петров',
    customerPhone: '+7 (999) 123-45-67',
    customerEmail: 'ivan.petrov@email.com',
    source: 'website',
    prepaymentAmount: 1500,
    prepaymentStatus: 'pending',
    paymentMethod: 'online'
  },
  {
    customerName: 'Мария Сидорова',
    customerPhone: '+7 (999) 234-56-78',
    customerEmail: 'maria.sidorova@email.com',
    source: 'website',
    prepaymentAmount: 2300,
    prepaymentStatus: 'paid',
    paymentMethod: 'online'
  },
  {
    customerName: 'Алексей Козлов',
    customerPhone: '+7 (999) 345-67-89',
    customerEmail: 'alexey.kozlov@email.com',
    source: 'website',
    prepaymentAmount: 0,
    prepaymentStatus: null,
    paymentMethod: 'offline'
  },
  {
    customerName: 'Елена Волкова',
    customerPhone: '+7 (999) 456-78-90',
    customerEmail: 'elena.volkova@email.com',
    source: 'website',
    prepaymentAmount: 3200,
    prepaymentStatus: 'pending',
    paymentMethod: 'online'
  },
  {
    customerName: 'Дмитрий Морозов',
    customerPhone: '+7 (999) 567-89-01',
    customerEmail: 'dmitry.morozov@email.com',
    source: 'website',
    prepaymentAmount: 1800,
    prepaymentStatus: 'paid',
    paymentMethod: 'online'
  },
  {
    customerName: 'Анна Соколова',
    customerPhone: '+7 (999) 678-90-12',
    customerEmail: 'anna.sokolova@email.com',
    source: 'website',
    prepaymentAmount: 0,
    prepaymentStatus: null,
    paymentMethod: 'offline'
  },
  {
    customerName: 'Сергей Лебедев',
    customerPhone: '+7 (999) 789-01-23',
    customerEmail: 'sergey.lebedev@email.com',
    source: 'website',
    prepaymentAmount: 2500,
    prepaymentStatus: 'pending',
    paymentMethod: 'online'
  },
  {
    customerName: 'Ольга Новикова',
    customerPhone: '+7 (999) 890-12-34',
    customerEmail: 'olga.novikova@email.com',
    source: 'website',
    prepaymentAmount: 1900,
    prepaymentStatus: 'paid',
    paymentMethod: 'online'
  },
  {
    customerName: 'Павел Орлов',
    customerPhone: '+7 (999) 901-23-45',
    customerEmail: 'pavel.orlov@email.com',
    source: 'website',
    prepaymentAmount: 0,
    prepaymentStatus: null,
    paymentMethod: 'offline'
  },
  {
    customerName: 'Татьяна Медведева',
    customerPhone: '+7 (999) 012-34-56',
    customerEmail: 'tatyana.medvedeva@email.com',
    source: 'website',
    prepaymentAmount: 2800,
    prepaymentStatus: 'pending',
    paymentMethod: 'online'
  }
];

// Тестовые данные для заказов фото из Telegram
const testPhotoOrders = [
  {
    telegram_user_id: 123456789,
    chat_id: 123456789,
    username: 'ivan_photo',
    first_name: 'Иван',
    status: 'pending',
    selected_size: JSON.stringify({ name: '10x15', width: 10, height: 15 }),
    processing_options: JSON.stringify({ brightness: 0, contrast: 0, saturation: 0 }),
    quantity: 20,
    total_price: 40000, // 400 рублей в копейках
    notes: 'Печать для семейного альбома'
  },
  {
    telegram_user_id: 234567890,
    chat_id: 234567890,
    username: 'maria_photo',
    first_name: 'Мария',
    status: 'ready_for_approval',
    selected_size: JSON.stringify({ name: '13x18', width: 13, height: 18 }),
    processing_options: JSON.stringify({ brightness: 5, contrast: 3, saturation: 2 }),
    quantity: 15,
    total_price: 45000, // 450 рублей в копейках
    notes: 'Фотографии для портфолио'
  },
  {
    telegram_user_id: 345678901,
    chat_id: 345678901,
    username: 'alex_photo',
    first_name: 'Алексей',
    status: 'pending',
    selected_size: JSON.stringify({ name: '15x21', width: 15, height: 21 }),
    processing_options: JSON.stringify({ brightness: 0, contrast: 0, saturation: 0 }),
    quantity: 30,
    total_price: 120000, // 1200 рублей в копейках
    notes: 'Печать для выставки'
  },
  {
    telegram_user_id: 456789012,
    chat_id: 456789012,
    username: 'elena_photo',
    first_name: 'Елена',
    status: 'ready_for_approval',
    selected_size: JSON.stringify({ name: '18x24', width: 18, height: 24 }),
    processing_options: JSON.stringify({ brightness: -2, contrast: 5, saturation: 1 }),
    quantity: 10,
    total_price: 60000, // 600 рублей в копейках
    notes: 'Большие фотографии для дома'
  },
  {
    telegram_user_id: 567890123,
    chat_id: 567890123,
    username: 'dmitry_photo',
    first_name: 'Дмитрий',
    status: 'pending',
    selected_size: JSON.stringify({ name: '20x30', width: 20, height: 30 }),
    processing_options: JSON.stringify({ brightness: 0, contrast: 0, saturation: 0 }),
    quantity: 5,
    total_price: 40000, // 400 рублей в копейках
    notes: 'Печать для подарка'
  }
];

// Тестовые данные для позиций заказов
const testItems = [
  {
    type: 'Листовки',
    params: JSON.stringify({
      format: 'A6',
      paperType: '150г/м²',
      sides: 2,
      quantity: 1000,
      color: '4+4'
    }),
    price: 1500,
    quantity: 1
  },
  {
    type: 'Листовки',
    params: JSON.stringify({
      format: 'A5',
      paperType: '130г/м²',
      sides: 1,
      quantity: 500,
      color: '4+0'
    }),
    price: 800,
    quantity: 1
  },
  {
    type: 'Листовки',
    params: JSON.stringify({
      format: 'A4',
      paperType: '150г/м²',
      sides: 2,
      quantity: 2000,
      color: '4+4'
    }),
    price: 3200,
    quantity: 1
  },
  {
    type: 'Листовки',
    params: JSON.stringify({
      format: 'A6',
      paperType: '130г/м²',
      sides: 1,
      quantity: 3000,
      color: '4+0'
    }),
    price: 1800,
    quantity: 1
  },
  {
    type: 'Листовки',
    params: JSON.stringify({
      format: 'A5',
      paperType: '150г/м²',
      sides: 2,
      quantity: 1500,
      color: '4+4'
    }),
    price: 2300,
    quantity: 1
  }
];

async function createTestOrders() {
  const db = new sqlite3.Database(DB_FILE);
  
  try {
    console.log('🚀 Создание тестовых заказов...');
    
    // Создаем заказы с сайта
    for (let i = 0; i < testOrders.length; i++) {
      const order = testOrders[i];
      const orderNumber = generateOrderNumber('website');
      const createdAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = await new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO orders (
            number, status, created_at, userId, customerName, 
            customerPhone, customerEmail, prepaymentAmount, 
            prepaymentStatus, paymentMethod, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          orderNumber,
          0, // status = 0 (в пуле)
          createdAt,
          null, // userId = null (не назначен)
          order.customerName,
          order.customerPhone,
          order.customerEmail,
          order.prepaymentAmount,
          order.prepaymentStatus,
          order.paymentMethod,
          order.source
        ], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
      
      // Добавляем позиции к заказу
      const item = testItems[i % testItems.length];
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO items (orderId, type, params, price, quantity)
          VALUES (?, ?, ?, ?, ?)
        `, [
          result,
          item.type,
          item.params,
          item.price,
          item.quantity
        ], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
      
      console.log(`✅ Создан заказ: ${orderNumber} (${order.customerName})`);
    }
    
    // Создаем заказы фото из Telegram
    for (let i = 0; i < testPhotoOrders.length; i++) {
      const photoOrder = testPhotoOrders[i];
      const createdAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
      
      await new Promise((resolve, reject) => {
        db.run(`
          INSERT INTO photo_orders (
            telegram_user_id, chat_id, username, first_name, status, selected_size,
            processing_options, quantity, total_price, notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          photoOrder.telegram_user_id,
          photoOrder.chat_id,
          photoOrder.username,
          photoOrder.first_name,
          photoOrder.status,
          photoOrder.selected_size,
          photoOrder.processing_options,
          photoOrder.quantity,
          photoOrder.total_price,
          photoOrder.notes,
          createdAt,
          createdAt
        ], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
      
      const photoOrderNumber = generateOrderNumber('telegram');
      console.log(`✅ Создан заказ фото: ${photoOrderNumber} (${photoOrder.first_name})`);
    }
    
    console.log('🎉 Все тестовые заказы созданы успешно!');
    console.log(`📊 Создано заказов с сайта: ${testOrders.length}`);
    console.log(`📸 Создано заказов фото: ${testPhotoOrders.length}`);
    
  } catch (error) {
    console.error('❌ Ошибка при создании тестовых заказов:', error);
  } finally {
    db.close();
  }
}

// Запускаем скрипт
createTestOrders();
