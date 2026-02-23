import path from 'path';
import { initDB, getDb } from '../src/db';
import { OrderService } from '../src/modules/orders/services/orderService';

async function main() {
  const dbFile = process.env.DB_FILE || path.resolve(process.cwd(), 'data.db');
  await initDB();
  const db = await getDb();

  const material = await db.get<{ id: number; name: string; quantity: number }>(
    `SELECT id, name, quantity
     FROM materials
     WHERE quantity >= 5
     ORDER BY quantity DESC, id ASC
     LIMIT 1`
  );

  if (!material) {
    console.log(JSON.stringify({ ok: false, reason: 'NO_MATERIAL_WITH_STOCK' }, null, 2));
    return;
  }

  const beforeQty = Number(material.quantity || 0);
  const deductQtyPerItem = 1;
  const orderItemQty = 2;
  const expectedDeduct = deductQtyPerItem * orderItemQty;

  const result = await OrderService.createOrderWithAutoDeduction({
    customerName: 'E2E Auto Deduction Check',
    customerPhone: '+000000000',
    customerEmail: 'e2e@example.com',
    source: 'crm',
    items: [
      {
        type: 'E2E_TEST_PRODUCT',
        params: {
          description: 'E2E auto deduction check',
        },
        price: 1,
        quantity: orderItemQty,
        components: [
          {
            materialId: material.id,
            qtyPerItem: deductQtyPerItem,
          },
        ],
      },
    ],
  });

  const after = await db.get<{ quantity: number }>('SELECT quantity FROM materials WHERE id = ?', [material.id]);
  const afterQty = Number(after?.quantity || 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dbFile,
        materialId: material.id,
        materialName: material.name,
        beforeQty,
        afterQty,
        expectedAfterQty: beforeQty - expectedDeduct,
        actualDeducted: beforeQty - afterQty,
        orderId: (result.order as any)?.id ?? null,
        deductionResult: result.deductionResult,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});

