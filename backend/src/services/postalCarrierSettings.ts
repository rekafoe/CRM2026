import type { Database } from 'sqlite'
import { getDb } from '../config/database'

type SettingsDb = Pick<Database, 'get' | 'run' | 'all'>

export type PostalCarrierSettings = {
  belpostJwt: string
  belpostBaseUrl: string
  europostApiUrl: string
  europostApiPort: string
  europostServiceNumber: string
  europostLogin: string
  europostPassword: string
  europostLoginTypeId: string
  europostGoodsId: string
  europostWarehouseId: string
  europostWeightTypeId: string
  europostDeliveryTypeId: string
}

export type PostalCarrierSettingsInput = Partial<PostalCarrierSettings>

const KEYS: Record<keyof PostalCarrierSettings, string> = {
  belpostJwt: 'belpost_jwt_token',
  belpostBaseUrl: 'belpost_base_url',
  europostApiUrl: 'europost_api_url',
  europostApiPort: 'europost_api_port',
  europostServiceNumber: 'europost_service_number',
  europostLogin: 'europost_login',
  europostPassword: 'europost_password',
  europostLoginTypeId: 'europost_login_type_id',
  europostGoodsId: 'europost_goods_id',
  europostWarehouseId: 'europost_warehouse_id',
  europostWeightTypeId: 'europost_weight_type_id',
  europostDeliveryTypeId: 'europost_delivery_type_id',
}

const ENV_KEYS: Record<keyof PostalCarrierSettings, string> = {
  belpostJwt: 'BELPOST_JWT_TOKEN',
  belpostBaseUrl: 'BELPOST_BASE_URL',
  europostApiUrl: 'EVROPOCHTA_API_URL',
  europostApiPort: 'EVROPOCHTA_API_PORT',
  europostServiceNumber: 'EVROPOCHTA_SERVICE_NUMBER',
  europostLogin: 'EVROPOCHTA_LOGIN',
  europostPassword: 'EVROPOCHTA_PASSWORD',
  europostLoginTypeId: 'EVROPOCHTA_LOGIN_TYPE_ID',
  europostGoodsId: 'EVROPOCHTA_GOODS_ID',
  europostWarehouseId: 'EVROPOCHTA_WAREHOUSE_ID',
  europostWeightTypeId: 'EVROPOCHTA_WEIGHT_TYPE_ID',
  europostDeliveryTypeId: 'EVROPOCHTA_DELIVERY_TYPE_ID',
}

function envValue(key: keyof PostalCarrierSettings): string {
  return String(process.env[ENV_KEYS[key]] || '').trim()
}

export function emptyPostalCarrierSettings(): PostalCarrierSettings {
  return {
    belpostJwt: '',
    belpostBaseUrl: 'https://api.belpost.by',
    europostApiUrl: '',
    europostApiPort: '',
    europostServiceNumber: '',
    europostLogin: '',
    europostPassword: '',
    europostLoginTypeId: '',
    europostGoodsId: '',
    europostWarehouseId: '',
    europostWeightTypeId: '',
    europostDeliveryTypeId: '',
  }
}

export async function getPostalCarrierSettings(db?: SettingsDb): Promise<PostalCarrierSettings> {
  const settings = emptyPostalCarrierSettings()
  ;(Object.keys(KEYS) as Array<keyof PostalCarrierSettings>).forEach((key) => {
    const fromEnv = envValue(key)
    if (fromEnv) settings[key] = fromEnv
  })
  const database = db ?? (await getDb())
  try {
    const rows = await database.all<Array<{ setting_key: string; setting_value: string | null }>>(
      `SELECT setting_key, setting_value FROM crm_settings WHERE setting_key IN (${Object.values(KEYS).map(() => '?').join(',')})`,
      Object.values(KEYS),
    )
    const byKey = new Map((rows || []).map((row) => [row.setting_key, String(row.setting_value || '').trim()]))
    ;(Object.keys(KEYS) as Array<keyof PostalCarrierSettings>).forEach((key) => {
      const stored = byKey.get(KEYS[key])
      if (stored) settings[key] = stored
    })
  } catch {
    return settings
  }
  if (!settings.belpostBaseUrl) settings.belpostBaseUrl = 'https://api.belpost.by'
  return settings
}

export async function savePostalCarrierSettings(db: SettingsDb, input: PostalCarrierSettingsInput): Promise<void> {
  const current = await getPostalCarrierSettings(db)
  const next: PostalCarrierSettings = { ...current }
  ;(Object.keys(KEYS) as Array<keyof PostalCarrierSettings>).forEach((key) => {
    if (input[key] === undefined) return
    next[key] = String(input[key] ?? '').trim()
  })
  if (!next.belpostBaseUrl) next.belpostBaseUrl = 'https://api.belpost.by'
  for (const key of Object.keys(KEYS) as Array<keyof PostalCarrierSettings>) {
    await db.run(
      `INSERT INTO crm_settings (setting_key, setting_value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(setting_key) DO UPDATE SET
         setting_value = excluded.setting_value,
         updated_at = datetime('now')`,
      [KEYS[key], next[key]],
    )
  }
}

export function belpostReady(settings: PostalCarrierSettings): boolean {
  return Boolean(settings.belpostJwt.trim())
}

export function europostReady(settings: PostalCarrierSettings): boolean {
  return Boolean(
    settings.europostApiUrl.trim()
    && settings.europostServiceNumber.trim()
    && settings.europostLogin.trim()
    && settings.europostPassword.trim()
    && settings.europostLoginTypeId.trim(),
  )
}

export function missingBelpostMessage(): string {
  return 'Нет JWT Белпочты. Администратор сохраняет его в настройках «Белпочта и Европочта». Без ключа CRM не печатает свой бланк.'
}

export function missingEuropostMessage(): string {
  return 'Нет доступа Европочты: нужны адрес API, номер услуги, логин, пароль и тип логина. Их сохраняет администратор. Без этого CRM не печатает свой бланк.'
}

export function maskSecret(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 4) return '••••'
  return `••••${trimmed.slice(-4)}`
}
