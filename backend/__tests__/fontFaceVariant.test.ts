import {
  cssFontWeightToken,
  linkedFontPropsFromStored,
  readFontFaceVariant,
} from '../src/utils/fontFileMetadata'

function u16(n: number): Buffer {
  const buf = Buffer.alloc(2)
  buf.writeUInt16BE(n)
  return buf
}

function u32(n: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32BE(n >>> 0)
  return buf
}

function utf16be(text: string): Buffer {
  const buf = Buffer.alloc(text.length * 2)
  for (let i = 0; i < text.length; i += 1) buf.writeUInt16BE(text.charCodeAt(i), i * 2)
  return buf
}

function nameTable(records: Array<{ nameId: number; text: string }>): Buffer {
  const strings = records.map((record) => utf16be(record.text))
  let stringCursor = 0
  const recs = records.map((record, index) => {
    const bytes = strings[index]
    const rec = Buffer.concat([
      u16(3),
      u16(1),
      u16(0x0409),
      u16(record.nameId),
      u16(bytes.length),
      u16(stringCursor),
    ])
    stringCursor += bytes.length
    return rec
  })
  return Buffer.concat([
    u16(0),
    u16(records.length),
    u16(6 + records.length * 12),
    ...recs,
    ...strings,
  ])
}

function sfnt(tables: Array<{ tag: string; data: Buffer }>): Buffer {
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
  const header = Buffer.concat([
    u32(0x00010000),
    u16(sorted.length),
    u16(0),
    u16(0),
    u16(0),
  ])
  let offset = 12 + sorted.length * 16
  const directory = sorted.map((table) => {
    const rec = Buffer.concat([
      Buffer.from(table.tag, 'ascii'),
      u32(0),
      u32(offset),
      u32(table.data.length),
    ])
    offset += table.data.length
    return rec
  })
  return Buffer.concat([header, ...directory, ...sorted.map((table) => table.data)])
}

function os2(weight: number, italic: boolean): Buffer {
  const data = Buffer.alloc(64)
  data.writeUInt16BE(weight, 4)
  if (italic) data.writeUInt16BE(1, 62)
  return data
}

describe('readFontFaceVariant', () => {
  it('берёт вес из OS/2, даже если subfamily Regular', () => {
    const font = sfnt([
      { tag: 'OS/2', data: os2(700, false) },
      { tag: 'name', data: nameTable([{ nameId: 2, text: 'Regular' }]) },
    ])
    expect(readFontFaceVariant(font)).toEqual({ weight: '700', style: 'normal' })
  })

  it('без OS/2 читает Bold Italic из subfamily', () => {
    const font = sfnt([
      { tag: 'name', data: nameTable([{ nameId: 2, text: 'Bold Italic' }]) },
    ])
    expect(readFontFaceVariant(font)).toEqual({ weight: '700', style: 'italic' })
  })

  it('бит italic в OS/2 делает стиль курсивом', () => {
    const font = sfnt([
      { tag: 'OS/2', data: os2(400, true) },
      { tag: 'name', data: nameTable([{ nameId: 2, text: 'Regular' }]) },
    ])
    const variant = readFontFaceVariant(font)
    expect(variant).toEqual({ weight: '400', style: 'italic' })
    expect(linkedFontPropsFromStored(variant?.weight, variant?.style)).toEqual({
      fontWeight: '400',
      fontStyle: 'italic',
    })
  })

  it('regular не переписывает текст', () => {
    expect(linkedFontPropsFromStored('normal', 'normal')).toBeNull()
    expect(linkedFontPropsFromStored(400, 'normal')).toBeNull()
    expect(cssFontWeightToken('bold')).toBe('700')
  })
})
