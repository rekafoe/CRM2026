const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

async function main() {
  const db = await open({
    filename: path.resolve(process.cwd(), 'data.db'),
    driver: sqlite3.Database,
  });

  const user = await db.get('SELECT id FROM users ORDER BY id LIMIT 1');
  if (!user) {
    console.log('NO_USERS');
    await db.close();
    return;
  }

  const userId = Number(user.id);
  const whereClause =
    "(o.userId = ? OR EXISTS (SELECT 1 FROM user_order_page_orders uopo JOIN user_order_pages uop ON uopo.page_id = uop.id WHERE uopo.order_id = o.id AND uopo.order_type = 'website' AND uop.user_id = ?))";

  const oldQuery = `
    SELECT o.*,
      (SELECT COALESCE(SUM(i.price * i.quantity), 0) FROM items i WHERE i.orderId = o.id) AS totalAmount
    FROM orders o
    WHERE ${whereClause}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const newQuery = `
    WITH paged_orders AS (
      SELECT o.*
      FROM orders o
      WHERE ${whereClause}
      ORDER BY COALESCE(o.created_at, o.createdAt) DESC
      LIMIT ? OFFSET ?
    ),
    order_totals AS (
      SELECT i.orderId, SUM(i.price * i.quantity) AS totalAmount
      FROM items i
      WHERE i.orderId IN (SELECT id FROM paged_orders)
      GROUP BY i.orderId
    )
    SELECT p.*, COALESCE(t.totalAmount, 0) AS totalAmount
    FROM paged_orders p
    LEFT JOIN order_totals t ON t.orderId = p.id
    ORDER BY COALESCE(p.created_at, p.createdAt) DESC
  `;

  const loopsArg = Number(process.argv[2]);
  const loops = Number.isFinite(loopsArg) && loopsArg > 0 ? loopsArg : 25;
  const params = [userId, userId, 100, 0];

  const runMany = async (sql) => {
    const t0 = Date.now();
    for (let i = 0; i < loops; i += 1) {
      await db.all(sql, ...params);
    }
    return Date.now() - t0;
  };

  const oldMs = await runMany(oldQuery);
  const newMs = await runMany(newQuery);

  console.log(
    JSON.stringify(
      {
        userId,
        loops,
        oldMs,
        newMs,
        improvementPercent: Number((((oldMs - newMs) / oldMs) * 100).toFixed(2)),
      },
      null,
      2
    )
  );

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

