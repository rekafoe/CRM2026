import { initDB } from '../src/db';
import { OrderRepository } from '../src/repositories/orderRepository';

async function benchmarkOld(loops: number): Promise<number> {
  const t0 = Date.now();
  for (let k = 0; k < loops; k += 1) {
    const orders = await OrderRepository.listAllOrders();
    for (const order of orders as any[]) {
      if (order.paymentMethod === 'telegram') {
        await OrderRepository.getPhotoOrderById(order.id);
      } else {
        await OrderRepository.getItemsByOrderId(order.id);
      }
    }
  }
  return Date.now() - t0;
}

async function benchmarkNew(loops: number): Promise<number> {
  const t0 = Date.now();
  for (let k = 0; k < loops; k += 1) {
    const orders = (await OrderRepository.listAllOrders()) as any[];
    const telegramIds = orders.filter((o) => o.paymentMethod === 'telegram').map((o) => Number(o.id));
    const websiteIds = orders.filter((o) => o.paymentMethod !== 'telegram').map((o) => Number(o.id));
    await Promise.all([
      OrderRepository.getItemsByOrderIds(websiteIds),
      OrderRepository.getPhotoOrdersByIds(telegramIds),
    ]);
  }
  return Date.now() - t0;
}

async function main() {
  await initDB();
  const loopsArg = Number(process.argv[2]);
  const loops = Number.isFinite(loopsArg) && loopsArg > 0 ? loopsArg : 10;

  const oldMs = await benchmarkOld(loops);
  const newMs = await benchmarkNew(loops);

  console.log(
    JSON.stringify(
      {
        loops,
        oldMs,
        newMs,
        improvementPercent: Number((((oldMs - newMs) / oldMs) * 100).toFixed(2)),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

