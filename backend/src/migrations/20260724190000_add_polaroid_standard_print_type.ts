import { Database } from 'sqlite'

const POLAROID_PRODUCT_ID = 52
const STANDARD_TYPE_KEY = 'polaroid-standard-digital'

function parseConfigData(value: unknown): any | null {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isDigitalType(type: any): boolean {
  const name = String(type?.name ?? '').toLowerCase()
  return type?.key === STANDARD_TYPE_KEY || name.includes('цифр')
}

/**
 * Добавляет продукту «Печать фото в стиле полароид» вариант «Стандарт».
 * Его калькулятор наследует форматы и цены существующего Premium, после чего
 * администратор может менять их независимо в CRM.
 */
export async function up(db: Database) {
  const table = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_template_configs'`
  )
  if (!table) return

  const row = await db.get<{ id: number; config_data: unknown }>(
    `SELECT id, config_data
     FROM product_template_configs
     WHERE product_id = ? AND name = 'template' AND is_active = 1
     ORDER BY id DESC
     LIMIT 1`,
    [POLAROID_PRODUCT_ID]
  )
  const config = parseConfigData(row?.config_data)
  const simplified = config?.simplified
  if (!row || !simplified || !Array.isArray(simplified.types)) return
  if (simplified.types.some(isDigitalType)) return

  const premiumType =
    simplified.types.find((type: any) => /премиум/i.test(String(type?.name ?? ''))) ??
    simplified.types[0]
  if (!premiumType?.id) return

  const usedIds = simplified.types
    .map((type: any) => Number(type?.id))
    .filter((id: number) => Number.isSafeInteger(id) && id > 0)
  const standardTypeId = Math.max(0, ...usedIds) + 1
  const premiumConfig = simplified.typeConfigs?.[String(premiumType.id)]
  if (!premiumConfig) return

  simplified.types.push({
    ...premiumType,
    id: standardTypeId,
    key: STANDARD_TYPE_KEY,
    name: 'Цифровая печать',
    default: false,
    description: 'Стандартная автоматическая печать с раскладкой макетов на SRA3',
  })
  simplified.typeConfigs = {
    ...(simplified.typeConfigs ?? {}),
    [String(standardTypeId)]: structuredClone(premiumConfig),
  }

  await db.run(
    `UPDATE product_template_configs
     SET config_data = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [JSON.stringify(config), row.id]
  )
}

export async function down(db: Database) {
  const row = await db.get<{ id: number; config_data: unknown }>(
    `SELECT id, config_data
     FROM product_template_configs
     WHERE product_id = ? AND name = 'template' AND is_active = 1
     ORDER BY id DESC
     LIMIT 1`,
    [POLAROID_PRODUCT_ID]
  )
  const config = parseConfigData(row?.config_data)
  const simplified = config?.simplified
  if (!row || !simplified || !Array.isArray(simplified.types)) return

  const addedType = simplified.types.find((type: any) => type?.key === STANDARD_TYPE_KEY)
  if (!addedType) return
  simplified.types = simplified.types.filter((type: any) => type?.key !== STANDARD_TYPE_KEY)
  if (simplified.typeConfigs && typeof simplified.typeConfigs === 'object') {
    delete simplified.typeConfigs[String(addedType.id)]
  }

  await db.run(
    `UPDATE product_template_configs
     SET config_data = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [JSON.stringify(config), row.id]
  )
}
