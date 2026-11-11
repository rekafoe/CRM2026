import type { Database } from 'sqlite';
import {
  WIDE_FORMAT_SOLVENT_CODE,
  isWideFormatCategoryName,
  patchWideFormatProductConfig,
  type WideFormatPatchReport,
} from '../modules/products/wideFormatProductFields';

/**
 * Продукты категории «Широкоформатная печать»:
 * пустые описание / характеристики / преимущества подтипа,
 * форматы А0–А2, без А4–А6, печать от материала,
 * материалы общие для подтипа, технология «Сольвентный» (sol_m).
 * Повторный запуск ничего не переписывает. Непустые тексты не трогает.
 * down не откатывает: иначе стёрлись бы тексты, которые оператор мог поправить после миграции.
 */

type ProductRow = { id: number; name: string; category_id: number | null };
type ConfigRow = { id: number; config_data: string | null; is_active: number | null };

function normalizeRussian(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

async function tableExists(db: Database, name: string): Promise<boolean> {
  const row = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [name],
  );
  return !!row;
}

async function columnNames(db: Database, table: string): Promise<Set<string>> {
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info('${table}')`);
  return new Set(rows.map((row) => row.name));
}

export async function resolveSolventTechnologyCode(db: Database): Promise<string> {
  if (!(await tableExists(db, 'print_technologies'))) return WIDE_FORMAT_SOLVENT_CODE;
  const rows = await db.all<Array<{ code: string; name: string }>>(
    `SELECT code, name FROM print_technologies`,
  );
  const byName = rows.find((row) => normalizeRussian(row.name) === 'сольвентный');
  if (byName?.code) return byName.code;
  const byCode = rows.find((row) => normalizeRussian(row.code) === WIDE_FORMAT_SOLVENT_CODE);
  if (byCode?.code) return byCode.code;
  return WIDE_FORMAT_SOLVENT_CODE;
}

export async function loadWideFormatProducts(db: Database): Promise<ProductRow[]> {
  if (!(await tableExists(db, 'products')) || !(await tableExists(db, 'product_categories'))) return [];
  const categories = await db.all<Array<{ id: number; name: string }>>(
    `SELECT id, name FROM product_categories`,
  );
  const categoryIds = new Set(
    categories.filter((category) => isWideFormatCategoryName(category.name)).map((category) => Number(category.id)),
  );
  if (categoryIds.size === 0) return [];
  const products = await db.all<ProductRow[]>(`SELECT id, name, category_id FROM products`);
  return products
    .filter((product) => categoryIds.has(Number(product.category_id)))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

function formatReport(report: WideFormatPatchReport): string {
  if (!report.changed) return 'без изменений';
  const parts = [
    report.textsFilled.length ? `тексты: ${report.textsFilled.join('; ')}` : '',
    report.sizesAdded.length ? `добавлены ${report.sizesAdded.join(', ')}` : '',
    report.sizesRemoved.length ? `убраны ${report.sizesRemoved.join(', ')}` : '',
    report.materialDrivenEnabled ? 'печать определяется материалом' : '',
    report.sharedMaterialsSet ? `общие материалы у ${report.sharedMaterialsSet} размеров` : '',
    report.technologySet ? `технология у ${report.technologySet} размеров` : '',
  ].filter(Boolean);
  return parts.join('; ');
}

export async function applyWideFormatProductFields(db: Database): Promise<WideFormatPatchReport[]> {
  if (!(await tableExists(db, 'product_template_configs'))) return [];
  const products = await loadWideFormatProducts(db);
  if (products.length === 0) return [];

  const technologyCode = await resolveSolventTechnologyCode(db);
  const columns = await columnNames(db, 'product_template_configs');
  const reports: WideFormatPatchReport[] = [];

  await db.exec('BEGIN IMMEDIATE');
  try {
    for (const product of products) {
      const row = await db.get<ConfigRow>(
        `SELECT id, config_data, is_active
         FROM product_template_configs
         WHERE product_id = ? AND name = 'template'
         ORDER BY is_active DESC, id DESC
         LIMIT 1`,
        [product.id],
      );
      let parsed: Record<string, any> | null = null;
      if (row?.config_data) {
        try {
          const value = JSON.parse(row.config_data);
          parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch {
          parsed = {};
        }
      }
      const { config, report } = patchWideFormatProductConfig(
        parsed,
        { id: Number(product.id), name: String(product.name || '') },
        technologyCode,
      );
      reports.push(report);
      console.log(`[wide-format] #${product.id} ${product.name}: ${formatReport(report)}`);
      if (!report.changed) continue;

      const payload = JSON.stringify(config);
      if (row) {
        const assignments = ['config_data = ?'];
        const params: unknown[] = [payload];
        if (Number(row.is_active) !== 1) {
          assignments.push('is_active = 1');
        }
        if (columns.has('updated_at')) assignments.push(`updated_at = datetime('now')`);
        await db.run(
          `UPDATE product_template_configs SET ${assignments.join(', ')} WHERE id = ?`,
          [...params, row.id],
        );
      } else {
        await db.run(
          `INSERT INTO product_template_configs
           (product_id, name, config_data, is_active, created_at, updated_at)
           VALUES (?, 'template', ?, 1, datetime('now'), datetime('now'))`,
          [product.id, payload],
        );
      }
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
  return reports;
}

export async function up(db: Database): Promise<void> {
  await applyWideFormatProductFields(db);
}

export async function down(_db: Database): Promise<void> {
  // Данные карточек после миграции может поправить оператор. Откат их не восстанавливает.
}
