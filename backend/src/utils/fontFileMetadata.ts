/** Минимальный парсер name table TTF/OTF (без WOFF/WOFF2). */

import { fontFamilyLooseMatchName, normalizeFontFamilyName, stripFontVendorPrefixes } from './fontFamilyNormalize'

export type FontFileMetadata = {
  family?: string
  preferredFamily?: string
  /** name ID 2 — Font Subfamily (Bold, Italic, Regular…). */
  subfamily?: string
  /** name ID 17 — Typographic Subfamily. */
  typographicSubfamily?: string
  fullName?: string
  postscript?: string
  allNames: string[]
}

export type FontFaceVariant = {
  /** CSS font-weight: 100…900. */
  weight: string
  style: 'normal' | 'italic'
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, false)
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false)
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

function decodeNameRecord(bytes: Uint8Array, offset: number, length: number, platformId: number): string {
  if (length <= 0) return ''
  const slice = bytes.subarray(offset, offset + length)
  if (platformId === 3) {
    let out = ''
    for (let i = 0; i + 1 < slice.length; i += 2) {
      const code = (slice[i] << 8) | slice[i + 1]
      if (code) out += String.fromCharCode(code)
    }
    return out.trim()
  }
  return new TextDecoder('latin1').decode(slice).replace(/\0/g, '').trim()
}

function isSfnt(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const scalar = readUint32(view, 0)
  if (scalar === 0x00010000) return true
  return readTag(view, 0) === 'OTTO'
}

function findTable(bytes: Uint8Array, tag: string): { offset: number; length: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const numTables = readUint16(view, 4)
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16
    if (rec + 16 > bytes.length) break
    if (readTag(view, rec) !== tag) continue
    return {
      offset: readUint32(view, rec + 8),
      length: readUint32(view, rec + 12),
    }
  }
  return null
}

export function readFontMetadataFromBuffer(input: Buffer | Uint8Array): FontFileMetadata | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (!isSfnt(bytes)) return null
  const nameTable = findTable(bytes, 'name')
  if (!nameTable || nameTable.offset + 6 > bytes.length) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const base = nameTable.offset
  const count = readUint16(view, base + 2)
  const stringOffset = readUint16(view, base + 4)
  const stringsBase = base + stringOffset

  const byId = new Map<number, string[]>()
  for (let i = 0; i < count; i += 1) {
    const rec = base + 6 + i * 12
    if (rec + 12 > bytes.length) break
    const platformId = readUint16(view, rec)
    const nameId = readUint16(view, rec + 6)
    const length = readUint16(view, rec + 8)
    const offset = readUint16(view, rec + 10)
    const abs = stringsBase + offset
    if (abs + length > bytes.length) continue
    const value = decodeNameRecord(bytes, abs, length, platformId)
    if (!value) continue
    const list = byId.get(nameId) ?? []
    list.push(value)
    byId.set(nameId, list)
  }

  const pick = (id: number): string | undefined => byId.get(id)?.find(Boolean)
  const allNames = [...new Set([...byId.values()].flat().filter(Boolean))]
  return {
    family: pick(1),
    preferredFamily: pick(16) ?? pick(1),
    subfamily: pick(2),
    typographicSubfamily: pick(17),
    fullName: pick(4),
    postscript: pick(6),
    allNames,
  }
}

export function collectFontNameAliases(meta: FontFileMetadata | null | undefined): string[] {
  if (!meta) return []
  const raw = [
    meta.preferredFamily,
    meta.family,
    meta.fullName,
    meta.postscript,
    ...meta.allNames,
  ]
  const out: string[] = []
  const seen = new Set<string>()
  for (const name of raw) {
    const trimmed = name?.trim()
    if (!trimmed) continue
    const variants = [
      trimmed,
      stripFontVendorPrefixes(trimmed),
      normalizeFontFamilyName(trimmed),
      trimmed.replace(/[-_](regular|normal|medium|bold|italic)$/i, ''),
      fontFamilyLooseMatchName(trimmed),
    ].filter(Boolean)
    for (const variant of variants) {
      const key = variant.toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(variant)
    }
  }
  return out
}

const SUBFAMILY_WEIGHTS: Array<[RegExp, string]> = [
  [/extra[\s-]?light|ultra[\s-]?light/i, '200'],
  [/semi[\s-]?bold|demi[\s-]?bold/i, '600'],
  [/extra[\s-]?bold|ultra[\s-]?bold/i, '800'],
  [/\bthin\b/i, '100'],
  [/\blight\b/i, '300'],
  [/\bmedium\b/i, '500'],
  [/\b(black|heavy)\b/i, '900'],
  [/\bbold\b/i, '700'],
  [/\b(regular|normal|roman|book)\b/i, '400'],
]

/** CSS font-weight для Fabric и @font-face. `normal` → 400, `bold` → 700. */
export function cssFontWeightToken(value: unknown): string {
  if (value === 'bold' || value === 'bolder') return '700'
  if (value === 'normal' || value === 'lighter' || value == null || value === '') return '400'
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return '400'
  const snapped = Math.round(n / 100) * 100
  return String(Math.min(900, Math.max(100, snapped)))
}

function variantFromSubfamily(subfamily: string | undefined): { weight?: string; italic: boolean } {
  if (!subfamily?.trim()) return { italic: false }
  const italic = /italic|oblique|itallic/i.test(subfamily)
  let weight: string | undefined
  for (const [re, token] of SUBFAMILY_WEIGHTS) {
    if (re.test(subfamily)) {
      weight = token
      break
    }
  }
  return { weight, italic }
}

function readOs2Selection(bytes: Uint8Array): { weight: number; italic: boolean } | null {
  const table = findTable(bytes, 'OS/2')
  if (!table || table.length < 64 || table.offset + 64 > bytes.length) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    weight: view.getUint16(table.offset + 4, false),
    italic: (view.getUint16(table.offset + 62, false) & 1) === 1,
  }
}

/**
 * Вес и стиль из файла. Браузер сверяет OS/2 usWeightClass с CSS font-weight:
 * Bold-файл, зарегистрированный как normal, для обычного текста не выбирается.
 */
export function readFontFaceVariant(input: ArrayBuffer | Uint8Array): FontFaceVariant | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (!isSfnt(bytes)) return null
  const meta = readFontMetadataFromBuffer(bytes)
  const os2 = readOs2Selection(bytes)
  const fromName = variantFromSubfamily(meta?.typographicSubfamily || meta?.subfamily || meta?.fullName)
  let weight = '400'
  if (os2 && os2.weight >= 1 && os2.weight <= 1000) weight = cssFontWeightToken(os2.weight)
  else if (fromName.weight) weight = fromName.weight
  const italic = Boolean(os2?.italic) || fromName.italic
  return { weight, style: italic ? 'italic' : 'normal' }
}

/** Начертание файла. Regular не трогаем — его можно сделать жирным синтетически. */
export function linkedFontPropsFromStored(
  weight: unknown,
  style: unknown,
): { fontWeight: string; fontStyle: string } | null {
  const cssWeight = cssFontWeightToken(weight)
  const cssStyle = style === 'italic' || style === 'oblique' ? 'italic' : 'normal'
  if (cssWeight === '400' && cssStyle === 'normal') return null
  return { fontWeight: cssWeight, fontStyle: cssStyle }
}
