import { Database } from 'sqlite'

export async function up(db: Database): Promise<void> {
  await db.exec(`
    ALTER TABLE design_templates ADD COLUMN category_id INTEGER
      REFERENCES design_template_categories(id) ON DELETE SET NULL;
  `)

  await db.exec(`
    INSERT OR IGNORE INTO design_template_categories (name, sort_order)
    SELECT DISTINCT TRIM(category), 900
    FROM design_templates
    WHERE category IS NOT NULL AND TRIM(category) != ''
      AND TRIM(category) NOT IN (SELECT name FROM design_template_categories);
  `)

  await db.exec(`
    UPDATE design_templates
    SET category_id = (
      SELECT c.id FROM design_template_categories c
      WHERE c.name = TRIM(design_templates.category)
    )
    WHERE category IS NOT NULL AND TRIM(category) != '';
  `)

  await db.exec(`
    UPDATE design_templates
    SET category = (
      SELECT c.name FROM design_template_categories c WHERE c.id = design_templates.category_id
    )
    WHERE category_id IS NOT NULL;
  `)

  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_design_templates_category_id ON design_templates(category_id)',
  )
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_design_templates_category_id')
  // SQLite: cannot DROP COLUMN easily on older versions — leave category_id in place on rollback
}
