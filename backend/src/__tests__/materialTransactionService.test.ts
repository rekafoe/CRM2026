import { MaterialTransactionService } from '../modules/warehouse/services/materialTransactionService';
import { getDb } from '../config/database';

describe('MaterialTransactionService', () => {
  let testMaterialId: number;
  let testOrderId: number;

  beforeAll(async () => {
    const db = await getDb();
    
    // Создаём тестовый материал
    const testMaterialName = `Тестовая бумага A4 ${Date.now()}`;
    const material = await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity) VALUES (?, ?, ?, ?)',
      testMaterialName,
      'лист',
      1000,
      100
    );
    testMaterialId = material.lastID!;

    // Создаём тестовый заказ
    const orderNumber = `TEST-${Date.now()}`;
    const order = await db.run(
      'INSERT INTO orders (number, status, createdAt) VALUES (?, ?, ?)',
      orderNumber,
      1,
      new Date().toISOString()
    );
    testOrderId = order.lastID!;
  });

  afterAll(async () => {
    const db = await getDb();
    // Очистка тестовых данных
    await db.run('DELETE FROM material_moves WHERE material_id = ?', testMaterialId);
    await db.run('DELETE FROM materials WHERE id = ?', testMaterialId);
    await db.run('DELETE FROM items WHERE orderId = ?', testOrderId);
    await db.run('DELETE FROM orders WHERE id = ?', testOrderId);
  });

  describe('spend()', () => {
    it('должен списать материал со склада', async () => {
      const result = await MaterialTransactionService.spend({
        materialId: testMaterialId,
        quantity: 50,
        reason: 'Тестовое списание',
        orderId: testOrderId,
        userId: 1
      });

      expect(result.oldQuantity).toBe(1000);
      expect(result.newQuantity).toBe(950);

      // Проверяем, что запись движения создана
      const db = await getDb();
      const move = await db.get(
        'SELECT * FROM material_moves WHERE material_id = ? AND reason = ? ORDER BY id DESC LIMIT 1',
        testMaterialId,
        'Тестовое списание'
      );
      expect(move).toBeDefined();
      expect(move.delta).toBe(-50);
    });

    it('должен выдать ошибку при недостатке материала', async () => {
      await expect(
        MaterialTransactionService.spend({
          materialId: testMaterialId,
          quantity: 10000,
          reason: 'Попытка списать слишком много',
          orderId: testOrderId
        })
      ).rejects.toThrow('Недостаточно материала');
    });

    it('должен округлять количество вверх', async () => {
      const result = await MaterialTransactionService.spend({
        materialId: testMaterialId,
        quantity: 10.3,
        reason: 'Тест округления',
        orderId: testOrderId
      });

      const db = await getDb();
      const move = await db.get(
        'SELECT delta FROM material_moves WHERE material_id = ? AND reason = ? ORDER BY id DESC LIMIT 1',
        testMaterialId,
        'Тест округления'
      );
      expect(move.delta).toBe(-11); // Округлено вверх
    });
  });

  describe('add()', () => {
    it('должен добавить материал на склад', async () => {
      const db = await getDb();
      const before = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterialId);
      
      const result = await MaterialTransactionService.add({
        materialId: testMaterialId,
        quantity: 200,
        reason: 'Поступление от поставщика',
        userId: 1
      });

      expect(result.newQuantity).toBe(before.quantity + 200);

      const move = await db.get(
        'SELECT * FROM material_moves WHERE material_id = ? AND reason = ? ORDER BY id DESC LIMIT 1',
        testMaterialId,
        'Поступление от поставщика'
      );
      expect(move.delta).toBe(200);
    });

    it('должен сохранять информацию о поставке', async () => {
      await MaterialTransactionService.add({
        materialId: testMaterialId,
        quantity: 100,
        reason: 'Поставка от ООО Тест',
        supplierId: 1,
        deliveryNumber: 'DEL-12345',
        invoiceNumber: 'INV-67890',
        deliveryDate: '2025-10-22',
        deliveryNotes: 'Срочная поставка'
      });

      const db = await getDb();
      const move = await db.get(
        'SELECT * FROM material_moves WHERE material_id = ? AND delivery_number = ?',
        testMaterialId,
        'DEL-12345'
      );
      expect(move).toBeDefined();
      expect(move.invoice_number).toBe('INV-67890');
      expect(move.delivery_notes).toBe('Срочная поставка');
    });
  });

  describe('return()', () => {
    it('должен вернуть материал на склад', async () => {
      const db = await getDb();
      const before = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterialId);
      
      const result = await MaterialTransactionService.return({
        materialId: testMaterialId,
        quantity: 25,
        reason: 'Возврат из заказа',
        orderId: testOrderId
      });

      expect(result.newQuantity).toBe(before.quantity + 25);
    });
  });

  describe('adjust()', () => {
    it('должен установить точное количество материала', async () => {
      const result = await MaterialTransactionService.adjust({
        materialId: testMaterialId,
        newQuantity: 1500,
        reason: 'Инвентаризация',
        userId: 1
      });

      expect(result.newQuantity).toBe(1500);
      expect(result.delta).toBeDefined();

      const db = await getDb();
      const material = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterialId);
      expect(material.quantity).toBe(1500);
    });
  });

  describe('checkAvailability()', () => {
    it('должен проверить доступность материала без резервов', async () => {
      const result = await MaterialTransactionService.checkAvailability(testMaterialId, 100);

      expect(result.available).toBe(true);
      expect(result.currentQuantity).toBeGreaterThan(100);
      expect(result.reservedQuantity).toBeGreaterThanOrEqual(0);
      expect(result.availableQuantity).toBeGreaterThan(100);
    });

    it('должен учитывать резервы при проверке доступности', async () => {
      const db = await getDb();
      
      // Создаём резерв
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      
      await db.run(
        `INSERT INTO material_reservations (material_id, order_id, quantity_reserved, status, notes, expires_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
        testMaterialId,
        testOrderId,
        300,
        'Тестовый резерв',
        expiresAt.toISOString()
      );

      const result = await MaterialTransactionService.checkAvailability(testMaterialId, 200);

      expect(result.reservedQuantity).toBeGreaterThanOrEqual(300);
      expect(result.availableQuantity).toBe(result.currentQuantity - result.reservedQuantity);

      // Очистка резерва
      await db.run(
        'DELETE FROM material_reservations WHERE material_id = ? AND notes = ?',
        testMaterialId,
        'Тестовый резерв'
      );
    });
  });

  describe('bulkSpend()', () => {
    let testMaterial2Id: number;

    beforeAll(async () => {
      const db = await getDb();
      const material = await db.run(
        'INSERT INTO materials (name, unit, quantity) VALUES (?, ?, ?)',
        `Тестовый материал 2 ${Date.now()}`,
        'шт',
        500
      );
      testMaterial2Id = material.lastID!;
    });

    afterAll(async () => {
      const db = await getDb();
    await db.run('DELETE FROM material_moves WHERE material_id = ?', testMaterial2Id);
      await db.run('DELETE FROM materials WHERE id = ?', testMaterial2Id);
    });

    it('должен списать несколько материалов в одной транзакции', async () => {
      const results = await MaterialTransactionService.bulkSpend([
        { materialId: testMaterialId, quantity: 10, reason: 'Bulk test 1' },
        { materialId: testMaterial2Id, quantity: 20, reason: 'Bulk test 2' }
      ], testOrderId, 1);

      expect(results).toHaveLength(2);
      expect(results[0].materialId).toBe(testMaterialId);
      expect(results[1].materialId).toBe(testMaterial2Id);
    });

    it('должен откатить транзакцию при ошибке в одном из материалов', async () => {
      const db = await getDb();
      const beforeMat1 = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterialId);
      const beforeMat2 = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterial2Id);

      await expect(
        MaterialTransactionService.bulkSpend([
          { materialId: testMaterialId, quantity: 10, reason: 'Valid' },
          { materialId: testMaterial2Id, quantity: 99999, reason: 'Invalid - too much' }
        ], testOrderId, 1)
      ).rejects.toThrow();

      // Проверяем, что количество не изменилось ни у одного материала
      const afterMat1 = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterialId);
      const afterMat2 = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterial2Id);

      expect(afterMat1.quantity).toBe(beforeMat1.quantity);
      expect(afterMat2.quantity).toBe(beforeMat2.quantity);
    });
  });

  describe('Integration with reservation system', () => {
    it('должен правильно работать со всем циклом резерв-подтверждение', async () => {
      const db = await getDb();
      
      // 1. Проверяем начальное состояние
      const initial = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterialId);
      const initialQty = initial.quantity;

      // 2. Создаём резерв (имитация addItem)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      const reservation = await db.run(
        `INSERT INTO material_reservations (material_id, order_id, quantity_reserved, status, notes, expires_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
        testMaterialId,
        testOrderId,
        100,
        'Integration test reservation',
        expiresAt.toISOString()
      );
      const reservationId = reservation.lastID!;

      // 3. Количество на складе не должно измениться
      const afterReserve = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterialId);
      expect(afterReserve.quantity).toBe(initialQty);

      // 4. Подтверждаем резерв (имитация перевода в производство)
      await MaterialTransactionService.spend({
        materialId: testMaterialId,
        quantity: 100,
        reason: 'Confirmation of reservation',
        orderId: testOrderId
      });

      // 5. Количество должно уменьшиться
      const afterConfirm = await db.get('SELECT quantity FROM materials WHERE id = ?', testMaterialId);
      expect(afterConfirm.quantity).toBe(initialQty - 100);

      // Очистка
      await db.run('DELETE FROM material_reservations WHERE id = ?', reservationId);
    });
  });
});

