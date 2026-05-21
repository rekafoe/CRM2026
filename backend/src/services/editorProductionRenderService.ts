import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import puppeteer, { type Browser } from 'puppeteer'
import { getDb } from '../config/database'
import { orderFilesDir, resolveSafeExistingPath, saveBufferToOrderFiles } from '../config/upload'

const MM_TO_PX = 96 / 25.4
const EXPORT_DPI = 300
const PX_PER_MM_AT_96 = MM_TO_PX

type FabricObj = Record<string, unknown>

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise
    if (b.connected) return b
  }
  browserPromise = puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const browser = await browserPromise
  browser.on('disconnected', () => {
    browserPromise = null
  })
  return browser
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function walkFabric(value: unknown, visit: (obj: FabricObj) => void): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const obj = value as FabricObj
  visit(obj)
  for (const key of ['objects', '_objects']) {
    const children = obj[key]
    if (Array.isArray(children)) children.forEach((c) => walkFabric(c, visit))
  }
  walkFabric(obj.clipPath, visit)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function resolveImageSrc(
  src: string,
  orderId: number,
  fileNameByUrl: Map<string, string>,
): string | null {
  const trimmed = src.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return trimmed
  if (trimmed.startsWith('file://')) return trimmed

  const stored = fileNameByUrl.get(trimmed) ?? fileNameByUrl.get(trimmed.split('?')[0] ?? '')
  if (stored) {
    const filePath = resolveSafeExistingPath([orderFilesDir], stored)
    if (filePath) return `file://${filePath.replace(/\\/g, '/')}`
  }

  const baseName = path.basename(trimmed)
  const byName = resolveSafeExistingPath([orderFilesDir], baseName)
  if (byName) return `file://${byName.replace(/\\/g, '/')}`

  return null
}

function buildObjectHtml(
  obj: FabricObj,
  orderId: number,
  fileNameByUrl: Map<string, string>,
  canvasW: number,
  canvasH: number,
): string {
  const left = Number(obj.left ?? 0)
  const top = Number(obj.top ?? 0)
  const scaleX = Number(obj.scaleX ?? 1)
  const scaleY = Number(obj.scaleY ?? 1)
  const angle = Number(obj.angle ?? 0)
  const opacity = Number(obj.opacity ?? 1)
  const w = Number(obj.width ?? 0) * scaleX
  const h = Number(obj.height ?? 0) * scaleY
  const style = [
    'position:absolute',
    `left:${left}px`,
    `top:${top}px`,
    `width:${Math.max(1, w)}px`,
    `height:${Math.max(1, h)}px`,
    `transform:rotate(${angle}deg)`,
    `opacity:${opacity}`,
    'transform-origin:top left',
  ].join(';')

  const type = String(obj.type ?? '').toLowerCase()
  if (type === 'image' || obj.isPhotoField === true) {
    const src = typeof obj.src === 'string' ? resolveImageSrc(obj.src, orderId, fileNameByUrl) : null
    if (!src) return ''
    return `<img src="${escapeHtml(src)}" alt="" style="${style};object-fit:cover" />`
  }

  if (type === 'i-text' || type === 'textbox' || type === 'text') {
    const fill = String(obj.fill ?? '#000000')
    const fontSize = Number(obj.fontSize ?? 16) * Math.min(scaleX, scaleY)
    const fontFamily = String(obj.fontFamily ?? 'Arial, sans-serif')
    const fontWeight = String(obj.fontWeight ?? 'normal')
    const text = escapeHtml(String(obj.text ?? '').replace(/\n/g, '<br/>'))
    return `<div style="${style};color:${escapeHtml(fill)};font-size:${fontSize}px;font-family:${escapeHtml(fontFamily)};font-weight:${escapeHtml(fontWeight)};white-space:pre-wrap;overflow:hidden">${text}</div>`
  }

  if (type === 'rect' || type === 'circle') {
    const fill = String(obj.fill ?? 'transparent')
    const stroke = String(obj.stroke ?? 'transparent')
    const radius = type === 'circle' ? '50%' : `${Number(obj.rx ?? 0)}px`
    return `<div style="${style};background:${escapeHtml(fill)};border:1px solid ${escapeHtml(stroke)};border-radius:${radius}"></div>`
  }

  return ''
}

function buildPageHtml(
  fabricJSON: unknown,
  orderId: number,
  fileNameByUrl: Map<string, string>,
  pageWidthMm: number,
  pageHeightMm: number,
  bleedMm: number,
): { html: string; widthMm: number; heightMm: number } {
  const bleed = Math.max(0, bleedMm)
  const widthMm = pageWidthMm + bleed * 2
  const heightMm = pageHeightMm + bleed * 2
  const canvasW = Math.round(pageWidthMm * PX_PER_MM_AT_96)
  const canvasH = Math.round(pageHeightMm * PX_PER_MM_AT_96)
  const bleedPx = Math.round(bleed * PX_PER_MM_AT_96)

  let bg = '#ffffff'
  const parts: string[] = []
  walkFabric(fabricJSON, (obj) => {
    if (obj.isBackground === true && typeof obj.fill === 'string') bg = obj.fill
    parts.push(buildObjectHtml(obj, orderId, fileNameByUrl, canvasW, canvasH))
  })

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{margin:0;background:#fff}
    .sheet{position:relative;width:${widthMm}mm;height:${heightMm}mm;overflow:hidden;background:${bg}}
    .trim{position:absolute;left:${bleedPx}px;top:${bleedPx}px;width:${canvasW}px;height:${canvasH}px}
  </style></head><body><div class="sheet"><div class="trim">${parts.join('')}</div></div></body></html>`

  return { html, widthMm, heightMm }
}

async function renderHtmlToPdfBuffer(html: string, widthMm: number, heightMm: number): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120000 })
    const pdf = await page.pdf({
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })
    return Buffer.from(pdf)
  } finally {
    await page.close()
  }
}

async function loadOrderFileUrlMap(orderId: number, orderItemId: number): Promise<Map<string, string>> {
  const db = await getDb()
  const files = await db.all<Array<{ filename: string; originalName: string | null }>>(
    'SELECT filename, originalName FROM order_files WHERE orderId = ? AND (orderItemId = ? OR orderItemId IS NULL)',
    [orderId, orderItemId],
  )
  const map = new Map<string, string>()
  for (const file of files ?? []) {
    map.set(file.filename, file.filename)
    if (file.originalName) map.set(file.originalName, file.filename)
  }
  return map
}

export async function renderDesignStateProductionPdf(
  orderId: number,
  orderItemId: number,
  designState: unknown,
): Promise<{ filename: string; size: number; pageCount: number }> {
  const state = parseJsonObject(designState)
  const pageWidthMm = Number(state.pageWidth ?? 90)
  const pageHeightMm = Number(state.pageHeight ?? 50)
  const prepress = parseJsonObject(state.prepress)
  const bleedMm = Number(prepress.bleedMm ?? 0)
  const pages = Array.isArray(state.pages) ? state.pages : []
  if (pages.length === 0) throw new Error('В designState нет страниц')

  const fileNameByUrl = await loadOrderFileUrlMap(orderId, orderItemId)
  const merged = await PDFDocument.create()

  for (const page of pages) {
    const fabricJSON = parseJsonObject(page).fabricJSON ?? page
    const { html, widthMm, heightMm } = buildPageHtml(
      fabricJSON,
      orderId,
      fileNameByUrl,
      pageWidthMm,
      pageHeightMm,
      bleedMm,
    )
    const singlePdf = await renderHtmlToPdfBuffer(html, widthMm, heightMm)
    const doc = await PDFDocument.load(singlePdf)
    const copied = await merged.copyPages(doc, doc.getPageIndices())
    copied.forEach((p) => merged.addPage(p))
  }

  const bytes = await merged.save()
  const buffer = Buffer.from(bytes)
  const saved = saveBufferToOrderFiles(buffer, `production-${orderId}-${orderItemId}.pdf`)
  if (!saved) throw new Error('Не удалось сохранить production PDF')

  const db = await getDb()
  const versionRow = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM order_files
     WHERE orderId = ? AND orderItemId = ? AND artifactType = 'production_pdf'`,
    [orderId, orderItemId],
  )
  const version = Number(versionRow?.n ?? 0) + 1
  await db.run(
    `INSERT INTO order_files (orderId, orderItemId, filename, originalName, mime, size, artifactType, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      orderItemId,
      saved.filename,
      `production-v${version}-item-${orderItemId}.pdf`,
      'application/pdf',
      saved.size,
      'production_pdf',
      JSON.stringify({ version, dpi: EXPORT_DPI, pageCount: pages.length, colorSpace: 'rgb' }),
    ],
  )

  return { filename: saved.filename, size: saved.size, pageCount: pages.length }
}
