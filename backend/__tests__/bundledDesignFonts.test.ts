import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  readFontFaceVariant,
  readFontMetadataFromBuffer,
} from '../src/utils/fontFileMetadata'
import { resolveBundledManropePath } from '../src/services/bundledDesignFonts'

describe('bundled Manrope Regular', () => {
  it('лежит в репозитории и читается как Manrope 400/normal', () => {
    const fontPath = resolveBundledManropePath()
    expect(fontPath).toBeTruthy()
    const buffer = fs.readFileSync(fontPath as string)
    const meta = readFontMetadataFromBuffer(buffer)
    const variant = readFontFaceVariant(buffer)
    expect(meta?.family).toBe('Manrope')
    expect(meta?.subfamily).toBe('Regular')
    expect(variant).toEqual({ weight: '400', style: 'normal' })
  })
})

describe('ensureBundledDesignFonts', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bundled-manrope-'))
  const tmpDbPath = path.join(tmpRoot, 'data.db')
  const tmpUploads = path.join(tmpRoot, 'uploads')

  beforeAll(() => {
    process.env.DB_FILE = tmpDbPath
    process.env.UPLOADS_DIR = tmpUploads
    jest.resetModules()
  })

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('создаёт запись Manrope при initDB, повторно no-op, восстанавливает пропавший файл', async () => {
    const { initDB } = require('../src/db') as typeof import('../src/db')
    const { ensureBundledDesignFonts } = require('../src/services/bundledDesignFonts') as typeof import('../src/services/bundledDesignFonts')
    const { getDesignFontByFamily, resolveDesignFontFilePath } = require('../src/services/designFontService') as typeof import('../src/services/designFontService')

    await initDB()

    const font = await getDesignFontByFamily('Manrope')
    expect(font).toBeTruthy()
    expect(font?.family_name).toBe('Manrope')
    expect(font?.weight).toBe('400')
    expect(font?.style).toBe('normal')
    expect(font?.is_active).toBe(true)
    expect(font?.format).toBe('ttf')
    expect(font?.name_aliases).toEqual([])
    const storedPath = resolveDesignFontFilePath(font!.filename)
    expect(storedPath).toBeTruthy()
    expect(fs.existsSync(storedPath as string)).toBe(true)

    expect(await ensureBundledDesignFonts()).toBe('exists')

    fs.unlinkSync(storedPath as string)
    expect(resolveDesignFontFilePath(font!.filename)).toBeNull()

    expect(await ensureBundledDesignFonts()).toBe('restored')
    const afterRestore = await getDesignFontByFamily('Manrope')
    expect(afterRestore?.family_name).toBe('Manrope')
    expect(afterRestore?.weight).toBe('400')
    const restoredPath = resolveDesignFontFilePath(afterRestore!.filename)
    expect(restoredPath).toBeTruthy()
    expect(fs.existsSync(restoredPath as string)).toBe(true)
  })
})
