/**
 * Миграция: добавление категории материалов "Рулонная бумага"
 * Для материалов этой категории в расчёте цен не учитывается раскладка (учёт по количеству изделий).
 * Дата: 2026-01-30
 */

async function up(db) {
  const row = await db.get(
    "SELECT id FROM material_categories WHERE name = ?",
    ["Рулонная бумага"]
  );
  if (row) {
    console.log("ℹ️ Категория «Рулонная бумага» уже существует");
    return;
  }

  const columns = await db.all("PRAGMA table_info('material_categories')");
  const names = columns.map((c) => c.name);

  if (names.includes("sort_order")) {
    await db.run(
      `INSERT INTO material_categories (name, description, sort_order) VALUES (?, ?, ?)`,
      ["Рулонная бумага", "Рулонная бумага для рулонной печати (учёт в метрах, без раскладки)", 5]
    );
  } else {
    await db.run(
      `INSERT INTO material_categories (name, description) VALUES (?, ?)`,
      ["Рулонная бумага", "Рулонная бумага для рулонной печати (учёт в метрах, без раскладки)"]
    );
  }
  console.log("✅ Добавлена категория материалов «Рулонная бумага»");
}

async function down(db) {
  await db.run("DELETE FROM material_categories WHERE name = ?", ["Рулонная бумага"]);
  console.log("✅ Категория «Рулонная бумага» удалена");
}

module.exports = { up, down };
