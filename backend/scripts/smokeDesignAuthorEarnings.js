const { getDb } = require('../dist/config/database');
const { EarningsService } = require('../dist/services/earningsService');

(async () => {
  const db = await getDb();
  await db.run(
    'UPDATE design_templates SET author_user_id = 1, usage_fee = 3, author_percent = 10 WHERE id = 1',
  );
  const item = await db.get(
    "SELECT id, params FROM items WHERE params LIKE '%designTemplateId%' LIMIT 1",
  );
  console.log('item with designTemplateId:', item ? item.id : 'none');
  const today = new Date().toISOString().slice(0, 10);
  await EarningsService.recalculateForDate(today);
  const designAuthor = await db.all(
    "SELECT order_item_id, user_id, earning_type, amount, order_item_total, percent FROM order_item_earnings WHERE earned_date = ? AND earning_type = 'design_author'",
    [today],
  );
  console.log('design_author rows:', designAuthor);
  process.exit(designAuthor.length > 0 ? 0 : item ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
