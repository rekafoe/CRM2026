import type { Database } from 'sqlite';

const RESERVED = new Set([
  'new',
  'edit',
  'admin',
  'api',
  'by-route-key',
  'products',
  'setup',
  'duplicate',
]);

/** Нормализация: trim, lower; пустая строка → null */
export function normalizeProductRouteKey(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toLowerCase();
  return s.length === 0 ? null : s;
}

export function validateRouteKeySegment(key: string): { ok: true } | { ok: false; message: string } {
  if (key.length < 2 || key.length > 80) {
    return { ok: false, message: 'Длина ключа: 2–80 символов' };
  }
  if (/^\d+$/.test(key)) {
    return { ok: false, message: 'Ключ не может быть только цифрами (совпадает с ID в URL)' };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) {
    return { ok: false, message: 'Допустимы латиница в нижнем регистре, цифры и дефисы между сегментами' };
  }
  if (RESERVED.has(key)) {
    return { ok: false, message: 'Это зарезервированное имя маршрута' };
  }
  return { ok: true };
}

function parseConfigData(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Собирает нормализованные key из simplified.types[].key */
export function collectSubtypeKeysFromSimplified(simplified: unknown): string[] {
  const sim = simplified as { types?: unknown[] } | null;
  if (!sim || !Array.isArray(sim.types)) return [];
  const out: string[] = [];
  for (const t of sim.types) {
    const k = normalizeProductRouteKey((t as { key?: unknown })?.key);
    if (k) out.push(k);
  }
  return out;
}

/**
 * Проверка: ключ продукта не занят другим продуктом и не совпадает с любым key подтипа в системе.
 */
export async function assertProductRouteKeyAllowed(
  db: Database,
  key: string,
  excludeProductId: number,
): Promise<void> {
  const v = validateRouteKeySegment(key);
  if (v.ok === false) {
    const err = new Error(v.message);
    (err as any).statusCode = 400;
    throw err;
  }

  const dup = await db.get<{ id: number }>(
    `SELECT id FROM products WHERE lower(trim(route_key)) = ? AND id != ? LIMIT 1`,
    [key, excludeProductId],
  );
  if (dup) {
    const err = new Error(`Ключ «${key}» уже занят другим продуктом (id ${dup.id})`);
    (err as any).statusCode = 409;
    throw err;
  }

  const rows = (await db.all(
    `SELECT config_data FROM product_template_configs WHERE config_data IS NOT NULL AND trim(config_data) != ''`,
  )) as Array<{ config_data: string | null }>;
  for (const row of rows) {
    const cfg = parseConfigData(row.config_data);
    const simp = cfg?.simplified;
    const keys = collectSubtypeKeysFromSimplified(simp);
    if (keys.includes(key)) {
      const err = new Error(`Ключ «${key}» уже используется как key подтипа в шаблоне продукта`);
      (err as any).statusCode = 409;
      throw err;
    }
  }
}

/**
 * Уникальность key внутри списка подтипов + не пересечение с чужими route_key/key и своим route_key продукта.
 */
export async function assertSubtypeKeysAllowedForTemplate(
  db: Database,
  productId: number,
  simplified: unknown,
): Promise<void> {
  const sim = simplified as { types?: Array<{ key?: unknown }> } | null;
  if (!sim || !Array.isArray(sim.types) || sim.types.length === 0) return;

  const productRow = await db.get<{ route_key: string | null }>(
    `SELECT route_key FROM products WHERE id = ?`,
    [productId],
  );
  const ownRouteKey = normalizeProductRouteKey(productRow?.route_key ?? null);

  const seen = new Set<string>();
  for (let i = 0; i < sim.types.length; i++) {
    const raw = sim.types[i]?.key;
    const k = normalizeProductRouteKey(raw);
    if (!k) continue;
    const v = validateRouteKeySegment(k);
    if (v.ok === false) {
      const err = new Error(`Подтип #${i + 1}: ${v.message}`);
      (err as any).statusCode = 400;
      throw err;
    }
    if (seen.has(k)) {
      const err = new Error(`Ключ подтипа «${k}» повторяется в этом продукте`);
      (err as any).statusCode = 409;
      throw err;
    }
    seen.add(k);
    if (ownRouteKey && k === ownRouteKey) {
      const err = new Error(`Ключ подтипа «${k}» совпадает с route_key этого продукта — задайте разные значения`);
      (err as any).statusCode = 409;
      throw err;
    }

    const prodDup = await db.get<{ id: number }>(
      `SELECT id FROM products WHERE lower(trim(route_key)) = ? AND id != ? LIMIT 1`,
      [k, productId],
    );
    if (prodDup) {
      const err = new Error(`Ключ «${k}» уже занят продуктом id ${prodDup.id}`);
      (err as any).statusCode = 409;
      throw err;
    }
  }

  const otherProductsWithSameSubtypeKey = (await db.all(
    `SELECT product_id, config_data FROM product_template_configs WHERE product_id != ? AND config_data IS NOT NULL`,
    [productId],
  )) as Array<{ product_id: number; config_data: string | null }>;
  for (const row of otherProductsWithSameSubtypeKey) {
    const cfg = parseConfigData(row.config_data);
    const keys = collectSubtypeKeysFromSimplified(cfg?.simplified);
    for (const sk of seen) {
      if (keys.includes(sk)) {
        const err = new Error(`Ключ подтипа «${sk}» уже используется в продукте id ${row.product_id}`);
        (err as any).statusCode = 409;
        throw err;
      }
    }
  }
}
