import fs from 'fs'
import path from 'path'
import { designFontsDir } from '../config/upload'
import { fontFamilyNamesMatch, guessFontFamilyFromFilename } from './fontFamilyNormalize'
import { readFontMetadataFromBuffer } from './fontFileMetadata'

export type DesignFontTextMetrics = { width: number; ascent: number }

type FontTables = {
  unitsPerEm: number
  ascent: number
  advances: number[]
  cmap: (codePoint: number) => number | undefined
}

const fontCache = new Map<string, FontTables | null>()
const familyCache = new Map<string, FontTables | null>()

function u16(view: DataView, offset: number): number { return view.getUint16(offset, false) }
function i16(view: DataView, offset: number): number { return view.getInt16(offset, false) }
function u32(view: DataView, offset: number): number { return view.getUint32(offset, false) }
function tag(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
}

function tableMap(buffer: Buffer): Map<string, { offset: number; length: number }> | null {
  if (buffer.length < 12) return null
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const tables = new Map<string, { offset: number; length: number }>()
  const count = u16(view, 4)
  for (let i = 0; i < count; i += 1) {
    const pos = 12 + i * 16
    if (pos + 16 > buffer.length) return null
    const offset = u32(view, pos + 8)
    const length = u32(view, pos + 12)
    if (offset + length > buffer.length) return null
    tables.set(tag(view, pos), { offset, length })
  }
  return tables
}

function parseCmap(view: DataView, table: { offset: number; length: number }): ((codePoint: number) => number | undefined) | null {
  if (table.length < 4) return null
  const count = u16(view, table.offset + 2)
  let format4: number | undefined
  let format12: number | undefined
  for (let i = 0; i < count; i += 1) {
    const entry = table.offset + 4 + i * 8
    if (entry + 8 > table.offset + table.length) break
    const offset = table.offset + u32(view, entry + 4)
    if (offset + 2 > table.offset + table.length) continue
    const format = u16(view, offset)
    if (format === 12) format12 = offset
    else if (format === 4) format4 = offset
  }
  if (format12 != null) {
    const groups = u32(view, format12 + 12)
    return (codePoint) => {
      for (let i = 0; i < groups; i += 1) {
        const pos = format12 + 16 + i * 12
        const start = u32(view, pos)
        const end = u32(view, pos + 4)
        if (codePoint >= start && codePoint <= end) return u32(view, pos + 8) + codePoint - start
      }
      return undefined
    }
  }
  if (format4 == null) return null
  const segCount = u16(view, format4 + 6) / 2
  const endCodes = format4 + 14
  const startCodes = endCodes + segCount * 2 + 2
  const idDeltas = startCodes + segCount * 2
  const idRangeOffsets = idDeltas + segCount * 2
  return (codePoint) => {
    if (codePoint > 0xffff) return undefined
    for (let i = 0; i < segCount; i += 1) {
      const end = u16(view, endCodes + i * 2)
      if (codePoint > end) continue
      const start = u16(view, startCodes + i * 2)
      if (codePoint < start) return undefined
      const delta = i16(view, idDeltas + i * 2)
      const rangeOffset = u16(view, idRangeOffsets + i * 2)
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff
      const glyphPos = idRangeOffsets + i * 2 + rangeOffset + (codePoint - start) * 2
      const glyph = u16(view, glyphPos)
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff
    }
    return undefined
  }
}

function parseFont(buffer: Buffer): FontTables | null {
  const tables = tableMap(buffer)
  if (!tables) return null
  const head = tables.get('head')
  const hhea = tables.get('hhea')
  const hmtx = tables.get('hmtx')
  const maxp = tables.get('maxp')
  const cmapTable = tables.get('cmap')
  if (!head || !hhea || !hmtx || !maxp || !cmapTable) return null
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const unitsPerEm = u16(view, head.offset + 18)
  const ascent = i16(view, hhea.offset + 4)
  const numberOfHMetrics = u16(view, hhea.offset + 34)
  const glyphCount = u16(view, maxp.offset + 4)
  const cmap = parseCmap(view, cmapTable)
  if (!unitsPerEm || !cmap || numberOfHMetrics < 1) return null
  const advances: number[] = []
  for (let i = 0; i < glyphCount; i += 1) {
    const metric = Math.min(i, numberOfHMetrics - 1)
    advances.push(u16(view, hmtx.offset + metric * 4))
  }
  return { unitsPerEm, ascent, advances, cmap }
}

function fontForFamily(family: string | undefined): FontTables | null {
  const key = family?.trim().toLowerCase()
  if (!key) return null
  if (familyCache.has(key)) return familyCache.get(key) ?? null
  let found: FontTables | null = null
  try {
    for (const filename of fs.readdirSync(designFontsDir)) {
      if (!/\.(ttf|otf)$/i.test(filename)) continue
      const filePath = path.join(designFontsDir, filename)
      const metadata = readFontMetadataFromBuffer(fs.readFileSync(filePath))
      const matches = [metadata?.preferredFamily, metadata?.family, guessFontFamilyFromFilename(filename)]
        .some((candidate) => candidate && fontFamilyNamesMatch(candidate, family))
      if (!matches) continue
      if (!fontCache.has(filePath)) fontCache.set(filePath, parseFont(fs.readFileSync(filePath)))
      found = fontCache.get(filePath) ?? null
      break
    }
  } catch {
    found = null
  }
  familyCache.set(key, found)
  return found
}

export function measureDesignFontText(
  text: string,
  fontSizePx: number,
  fontFamily?: string,
): DesignFontTextMetrics | null {
  const font = fontForFamily(fontFamily)
  if (!font || !Number.isFinite(fontSizePx) || fontSizePx <= 0) return null
  let units = 0
  for (const char of text) {
    const glyph = font.cmap(char.codePointAt(0)!)
    units += glyph == null ? font.unitsPerEm * 0.55 : (font.advances[glyph] ?? font.advances[0] ?? 0)
  }
  return { width: units * fontSizePx / font.unitsPerEm, ascent: font.ascent * fontSizePx / font.unitsPerEm }
}
