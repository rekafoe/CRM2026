import fs from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import puppeteer, { type Browser } from 'puppeteer'
import { getDb } from '../config/database'
import {
  designTemplateAssetsDir,
  orderFilesDir,
  resolveSafeExistingPath,
  saveBufferToOrderFiles,
  uploadsDir,
} from '../config/upload'
import {
  buildRequiredFontsForDesignState,
  resolveFontFilesForDesignState,
} from './designFontService'
import { buildMixedFontTextInnerHtml } from '../utils/textStyleRuns'
import { extractUsedFontFamiliesFromDesignState } from '../utils/extractDesignStateFonts'
import { getDesignTemplate } from './designTemplateService'
import { logger } from '../utils/logger'

const MM_TO_PX = 96 / 25.4
const EXPORT_DPI = 300
const PX_PER_MM_AT_96 = MM_TO_PX
const EXPORT_PX_PER_MM = EXPORT_DPI / 25.4
const FABRIC_EXPORT_MULTIPLIER = EXPORT_DPI / 96
const FABRIC_BROWSER_BUNDLE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'node_modules',
  'fabric',
  'dist',
  'index.min.js',
)

type FabricObj = Record<string, unknown>

type ProductionPageDiagnostics = {
  objects: number
  groups: number
  filledPhotoFields: number
  clipPaths: number
  images: number
  dataImages: number
  fileImages: number
  existingFileImages: number
  missingFileImages: number
  unresolvedImages: string[]
}

type RenderedFabricPage = {
  png: Buffer
  widthMm: number
  heightMm: number
  pixelStats: ProductionPixelStats
}

type ProductionPixelStats = {
  width: number
  height: number
  sampledPixels: number
  nonWhiteRatio: number
  nonBlackRatio: number
  uniqueColorSamples: number
}

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise
    if (b.connected) return b
  }
  browserPromise = puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--allow-file-access-from-files',
    ],
  })
  const browser = await browserPromise
  browser.on('disconnected', () => {
    browserPromise = null
  })
  return browser
}

export async function closeProductionRenderBrowser(): Promise<void> {
  const browser = browserPromise ? await browserPromise.catch(() => null) : null
  browserPromise = null
  if (browser?.connected) {
    const browserProcess = (browser as unknown as { process?: () => { kill?: () => void } | null }).process?.()
    let timeout: NodeJS.Timeout | null = null
    try {
      await Promise.race([
        browser.close(),
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            browserProcess?.kill?.()
            resolve()
          }, 5000)
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
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

function getFabricChildren(obj: FabricObj): FabricObj[] {
  const objects = Array.isArray(obj.objects)
    ? obj.objects
    : Array.isArray(obj._objects)
      ? obj._objects
      : []
  return objects.filter((child): child is FabricObj => (
    Boolean(child) && typeof child === 'object' && !Array.isArray(child)
  ))
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function resolveKnownUrlPath(src: string): { filename: string; dirs: string[] } | null {
  const raw = src.trim()
  if (!raw) return null
  let pathname = raw
  try {
    pathname = new URL(raw, 'https://assets.local').pathname
  } catch {
    pathname = raw.split('?')[0] ?? raw
  }
  const uploadMatch = pathname.match(/\/(?:api\/)?uploads\/([^/?#]+)$/i)
  if (uploadMatch?.[1]) {
    return { filename: decodeURIComponent(uploadMatch[1]), dirs: [uploadsDir] }
  }
  return null
}

function buildImageSrcLookupKeys(src: string): string[] {
  const raw = src.trim()
  if (!raw) return []
  const withoutQuery = raw.split('?')[0] ?? raw
  const keys = new Set<string>([raw, withoutQuery])
  try {
    const parsed = new URL(raw, 'https://assets.local')
    keys.add(parsed.pathname)
    keys.add(parsed.pathname + parsed.search)
  } catch {
    // Keep raw relative paths; they are already in the set above.
  }
  return [...keys].filter(Boolean)
}

function addEditorDraftFileUrlAliases(
  map: Map<string, string>,
  token: string,
  fileId: number,
  filename: string,
): void {
  const safeToken = encodeURIComponent(token)
  const safeFileId = encodeURIComponent(String(fileId))
  const suffix = `/drafts/${safeToken}/files/${safeFileId}/content`
  for (const prefix of ['/api/editor', '/api/public-editor', '/public-editor', '/services/poligrafy/api/editor']) {
    map.set(`${prefix}${suffix}`, filename)
  }
}

function resolveImageSrc(
  src: string,
  fileNameByUrl: Map<string, string>,
): string | null {
  const trimmed = src.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return trimmed
  if (trimmed.startsWith('file://')) return trimmed

  let stored: string | undefined
  for (const key of buildImageSrcLookupKeys(trimmed)) {
    stored = fileNameByUrl.get(key)
    if (stored) break
  }
  if (stored) {
    const filePath = resolveSafeExistingPath([orderFilesDir, uploadsDir, designTemplateAssetsDir], stored)
    if (filePath) return `file://${filePath.replace(/\\/g, '/')}`
  }

  const known = resolveKnownUrlPath(trimmed)
  if (known) {
    const filePath = resolveSafeExistingPath(known.dirs, known.filename)
    if (filePath) return `file://${filePath.replace(/\\/g, '/')}`
  }

  const baseName = path.basename(trimmed)
  const byName = resolveSafeExistingPath([orderFilesDir, uploadsDir, designTemplateAssetsDir], baseName)
  if (byName) return `file://${byName.replace(/\\/g, '/')}`

  return null
}

function remapFabricImageSources(value: unknown, fileNameByUrl: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapFabricImageSources(item, fileNameByUrl))
  if (!value || typeof value !== 'object') return value
  const obj: FabricObj = { ...(value as FabricObj) }
  if (typeof obj.src === 'string') {
    const resolved = resolveImageSrc(obj.src, fileNameByUrl)
    if (resolved) obj.src = resolved
  }
  if (Array.isArray(obj.objects)) obj.objects = obj.objects.map((item) => remapFabricImageSources(item, fileNameByUrl))
  if (Array.isArray(obj._objects)) obj._objects = obj._objects.map((item) => remapFabricImageSources(item, fileNameByUrl))
  if (obj.clipPath) obj.clipPath = remapFabricImageSources(obj.clipPath, fileNameByUrl)
  if (obj.backgroundImage) obj.backgroundImage = remapFabricImageSources(obj.backgroundImage, fileNameByUrl)
  if (obj.overlayImage) obj.overlayImage = remapFabricImageSources(obj.overlayImage, fileNameByUrl)
  return obj
}

function buildFabricRenderHtml(fontFaceCss = ''): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    ${fontFaceCss}
    *{box-sizing:border-box}
    body{margin:0;background:#fff}
    canvas{display:block}
  </style></head><body></body></html>`
}

function assertHealthyPixelStats(stats: ProductionPixelStats, pageLabel: string): void {
  if (stats.sampledPixels <= 0) {
    throw new Error(`${pageLabel}: production render did not produce pixels`)
  }
  if (stats.nonWhiteRatio < 0.0001) {
    throw new Error(`${pageLabel}: production render is almost fully white`)
  }
  if (stats.nonBlackRatio < 0.0001) {
    throw new Error(`${pageLabel}: production render is almost fully black`)
  }
}

function cssNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function originOffset(origin: unknown, size: number): number {
  if (origin === 'center') return size / 2
  if (origin === 'right' || origin === 'bottom') return size
  return 0
}

function buildBoxStyle(obj: FabricObj, opts?: {
  left?: number
  top?: number
  width?: number
  height?: number
  local?: boolean
  overflow?: string
}): string {
  const scaleX = cssNumber(obj.scaleX, 1)
  const scaleY = cssNumber(obj.scaleY, 1)
  const angle = cssNumber(obj.angle, 0)
  const opacity = cssNumber(obj.opacity, 1)
  const w = opts?.width ?? Math.abs(cssNumber(obj.width) * scaleX)
  const h = opts?.height ?? Math.abs(cssNumber(obj.height) * scaleY)
  const rawLeft = opts?.left ?? cssNumber(obj.left)
  const rawTop = opts?.top ?? cssNumber(obj.top)
  const left = rawLeft - (opts?.local ? 0 : originOffset(obj.originX, w))
  const top = rawTop - (opts?.local ? 0 : originOffset(obj.originY, h))
  const style = [
    'position:absolute',
    `left:${left}px`,
    `top:${top}px`,
    `width:${Math.max(1, w)}px`,
    `height:${Math.max(1, h)}px`,
    `transform:rotate(${angle}deg)`,
    `opacity:${opacity}`,
    'transform-origin:top left',
  ]
  if (opts?.overflow) style.push(`overflow:${opts.overflow}`)
  return style.join(';')
}

function childLocalLeft(parent: FabricObj, child: FabricObj, childW: number): number {
  const parentW = Math.max(1, cssNumber(parent.width, 1))
  return parentW / 2 + cssNumber(child.left) - originOffset(child.originX, childW)
}

function childLocalTop(parent: FabricObj, child: FabricObj, childH: number): number {
  const parentH = Math.max(1, cssNumber(parent.height, 1))
  return parentH / 2 + cssNumber(child.top) - originOffset(child.originY, childH)
}

function buildFilledPhotoFieldHtml(
  group: FabricObj,
  fileNameByUrl: Map<string, string>,
): string {
  const children = getFabricChildren(group)
  const image = children.find((child) => String(child.type ?? '').toLowerCase() === 'image')
  const src = typeof image?.src === 'string' ? resolveImageSrc(image.src, fileNameByUrl) : null
  if (!image || !src) return ''

  const frameW = Math.max(1, cssNumber(group.photoFieldFw, cssNumber(group.width, 1)))
  const frameH = Math.max(1, cssNumber(group.photoFieldFh, cssNumber(group.height, 1)))
  const outer = buildBoxStyle(group, { width: frameW, height: frameH, overflow: 'hidden' })
  const imageW = Math.max(1, cssNumber(image.width, 1) * cssNumber(image.scaleX, 1))
  const imageH = Math.max(1, cssNumber(image.height, 1) * cssNumber(image.scaleY, 1))
  const imageLeft = frameW / 2 + cssNumber(image.left) - originOffset(image.originX, imageW)
  const imageTop = frameH / 2 + cssNumber(image.top) - originOffset(image.originY, imageH)
  const imageStyle = [
    'position:absolute',
    `left:${imageLeft}px`,
    `top:${imageTop}px`,
    `width:${imageW}px`,
    `height:${imageH}px`,
    `transform:rotate(${cssNumber(image.angle, 0)}deg)`,
    'transform-origin:top left',
  ].join(';')
  return `<div style="${outer}"><img src="${escapeHtml(src)}" alt="" style="${imageStyle}" /></div>`
}

function buildObjectHtml(
  obj: FabricObj,
  fileNameByUrl: Map<string, string>,
  parent?: FabricObj,
): string {
  const type = String(obj.type ?? '').toLowerCase()
  const scaleX = cssNumber(obj.scaleX, 1)
  const scaleY = cssNumber(obj.scaleY, 1)
  const w = Math.abs(cssNumber(obj.width) * scaleX)
  const h = Math.abs(cssNumber(obj.height) * scaleY)
  const style = parent
    ? buildBoxStyle(obj, {
      left: childLocalLeft(parent, obj, w),
      top: childLocalTop(parent, obj, h),
      width: w,
      height: h,
      local: true,
    })
    : buildBoxStyle(obj)

  if (type === 'group') {
    if (obj.isPhotoField === true && obj.photoFieldFilled === true) {
      return buildFilledPhotoFieldHtml(obj, fileNameByUrl)
    }
    const children = getFabricChildren(obj)
      .map((child) => buildObjectHtml(child, fileNameByUrl, obj))
      .join('')
    return `<div style="${style};overflow:visible">${children}</div>`
  }

  if (type === 'image' || obj.isPhotoField === true) {
    const src = typeof obj.src === 'string' ? resolveImageSrc(obj.src, fileNameByUrl) : null
    if (!src) return ''
    const fit = obj.backgroundFit === 'page' ? 'fill' : 'cover'
    return `<img src="${escapeHtml(src)}" alt="" style="${style};object-fit:${fit}" />`
  }

  if (type === 'i-text' || type === 'textbox' || type === 'text') {
    const fill = String(obj.fill ?? '#000000')
    const fontSize = Number(obj.fontSize ?? 16) * Math.min(scaleX, scaleY)
    const fontFamily = String(obj.fontFamily ?? 'Arial, sans-serif')
    const fontWeight = String(obj.fontWeight ?? 'normal')
    const inner = buildMixedFontTextInnerHtml(String(obj.text ?? ''), obj, Math.min(scaleX, scaleY))
    return `<div style="${style};color:${escapeHtml(fill)};font-size:${fontSize}px;font-family:${escapeHtml(fontFamily)};font-weight:${escapeHtml(fontWeight)};white-space:pre-wrap;overflow:hidden;line-height:1.2">${inner}</div>`
  }

  if (type === 'rect' || type === 'circle') {
    const fill = String(obj.fill ?? 'transparent')
    const stroke = String(obj.stroke ?? 'transparent')
    const radius = type === 'circle' ? '50%' : `${Number(obj.rx ?? 0)}px`
    return `<div style="${style};background:${escapeHtml(fill)};border:1px solid ${escapeHtml(stroke)};border-radius:${radius}"></div>`
  }

  return ''
}

function collectProductionPageDiagnostics(
  fabricJSON: unknown,
  fileNameByUrl: Map<string, string>,
): ProductionPageDiagnostics {
  const diagnostics: ProductionPageDiagnostics = {
    objects: 0,
    groups: 0,
    filledPhotoFields: 0,
    clipPaths: 0,
    images: 0,
    dataImages: 0,
    fileImages: 0,
    existingFileImages: 0,
    missingFileImages: 0,
    unresolvedImages: [],
  }
  walkFabric(fabricJSON, (obj) => {
    diagnostics.objects += 1
    const type = String(obj.type ?? '').toLowerCase()
    if (type === 'group') diagnostics.groups += 1
    if (obj.photoFieldFilled === true) diagnostics.filledPhotoFields += 1
    if (obj.clipPath) diagnostics.clipPaths += 1
    if (type === 'image' || typeof obj.src === 'string') {
      diagnostics.images += 1
      const src = typeof obj.src === 'string' ? obj.src : ''
      const resolved = src ? resolveImageSrc(src, fileNameByUrl) : null
      if (!resolved) {
        if (src) diagnostics.unresolvedImages.push(src)
      } else if (resolved.startsWith('data:')) {
        diagnostics.dataImages += 1
      } else if (resolved.startsWith('file://')) {
        diagnostics.fileImages += 1
        const filePath = decodeURIComponent(resolved.replace(/^file:\/\//, ''))
        if (fs.existsSync(filePath)) diagnostics.existingFileImages += 1
        else diagnostics.missingFileImages += 1
      }
    }
  })
  return diagnostics
}

function cssFontFormat(format: string): string {
  switch (format) {
    case 'woff2': return 'woff2'
    case 'woff': return 'woff'
    case 'otf': return 'opentype'
    default: return 'truetype'
  }
}

function buildFontFaceCss(
  fonts: Array<{ family: string; filePath: string; format: string }>,
): string {
  return fonts.map((font) => {
    const fileUrl = `file://${font.filePath.replace(/\\/g, '/')}`
    const family = font.family.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    return `@font-face{font-family:'${family}';src:url('${fileUrl}') format('${cssFontFormat(font.format)}');font-weight:normal;font-style:normal;}`
  }).join('\n')
}

function buildPageHtml(
  fabricJSON: unknown,
  fileNameByUrl: Map<string, string>,
  pageWidthMm: number,
  pageHeightMm: number,
  bleedMm: number,
  fontFaceCss = '',
): { html: string; widthMm: number; heightMm: number } {
  const bleed = Math.max(0, bleedMm)
  const widthMm = pageWidthMm + bleed * 2
  const heightMm = pageHeightMm + bleed * 2
  const canvasW = Math.round(pageWidthMm * PX_PER_MM_AT_96)
  const canvasH = Math.round(pageHeightMm * PX_PER_MM_AT_96)
  const bleedPx = Math.round(bleed * PX_PER_MM_AT_96)

  let bg = '#ffffff'
  const root = parseJsonObject(fabricJSON)
  const rootObjects = Array.isArray(root.objects) ? root.objects : []
  const parts: string[] = []
  for (const raw of rootObjects) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const obj = raw as FabricObj
    if (obj.isBackground === true && typeof obj.fill === 'string') bg = obj.fill
    parts.push(buildObjectHtml(obj, fileNameByUrl))
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    ${fontFaceCss}
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
    await page.evaluate(() => document.fonts.ready)
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

function buildRasterPageHtml(png: Buffer, widthMm: number, heightMm: number): string {
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:${widthMm}mm;height:${heightMm}mm;margin:0;background:#fff;overflow:hidden}
    img{display:block;width:${widthMm}mm;height:${heightMm}mm;object-fit:fill}
  </style></head><body><img src="${dataUrl}" alt=""/></body></html>`
}

async function renderFabricPageToPng(
  fabricJSON: unknown,
  fileNameByUrl: Map<string, string>,
  pageWidthMm: number,
  pageHeightMm: number,
  bleedMm: number,
  fontFaceCss: string,
  pageIndex: number,
  sceneScale = 1,
): Promise<RenderedFabricPage> {
  if (!fs.existsSync(FABRIC_BROWSER_BUNDLE_PATH)) {
    throw new Error(`Fabric browser bundle not found: ${FABRIC_BROWSER_BUNDLE_PATH}`)
  }

  const browser = await getBrowser()
  const page = await browser.newPage()
  const normalizedFabricJSON = remapFabricImageSources(parseJsonObject(fabricJSON), fileNameByUrl)
  const bleed = Math.max(0, Number.isFinite(bleedMm) ? bleedMm : 0)
  const normalizedSceneScale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1
  const widthMm = pageWidthMm + bleed * 2
  const heightMm = pageHeightMm + bleed * 2
  const renderPayload = {
    fabricJSON: normalizedFabricJSON,
    pageWidthPx: Math.max(1, Math.round(pageWidthMm * PX_PER_MM_AT_96 * normalizedSceneScale)),
    pageHeightPx: Math.max(1, Math.round(pageHeightMm * PX_PER_MM_AT_96 * normalizedSceneScale)),
    bleedPx: Math.round(bleed * EXPORT_PX_PER_MM),
    sheetWidthPx: Math.max(1, Math.round(widthMm * EXPORT_PX_PER_MM)),
    sheetHeightPx: Math.max(1, Math.round(heightMm * EXPORT_PX_PER_MM)),
    multiplier: Math.max(0.01, FABRIC_EXPORT_MULTIPLIER / normalizedSceneScale),
    cutMarks: true,
  }
  const payloadDiagnostics = collectProductionPageDiagnostics(normalizedFabricJSON, fileNameByUrl)
  // #region agent log
  logger.info('[agent:pdf-mismatch] CRM production Fabric render payload summary', {
    runId: 'pdf-mismatch-prod',
    hypothesisId: 'H4,H5',
    page: pageIndex + 1,
    pageWidthMm,
    pageHeightMm,
    bleedMm,
    sceneScale: normalizedSceneScale,
    pageWidthPx: renderPayload.pageWidthPx,
    pageHeightPx: renderPayload.pageHeightPx,
    sheetWidthPx: renderPayload.sheetWidthPx,
    sheetHeightPx: renderPayload.sheetHeightPx,
    multiplier: renderPayload.multiplier,
    diagnostics: {
      objects: payloadDiagnostics.objects,
      groups: payloadDiagnostics.groups,
      clipPaths: payloadDiagnostics.clipPaths,
      images: payloadDiagnostics.images,
      dataImages: payloadDiagnostics.dataImages,
      fileImages: payloadDiagnostics.fileImages,
      existingFileImages: payloadDiagnostics.existingFileImages,
      missingFileImages: payloadDiagnostics.missingFileImages,
      filledPhotoFields: payloadDiagnostics.filledPhotoFields,
      unresolvedImageCount: payloadDiagnostics.unresolvedImages.length,
    },
  })
  // #endregion

  try {
    await page.setViewport({
      width: Math.max(1, Math.ceil(renderPayload.sheetWidthPx / 2)),
      height: Math.max(1, Math.ceil(renderPayload.sheetHeightPx / 2)),
      deviceScaleFactor: 1,
    })
    await page.setContent(buildFabricRenderHtml(fontFaceCss), { waitUntil: 'load', timeout: 120000 })
    await page.addScriptTag({ path: FABRIC_BROWSER_BUNDLE_PATH })
    await page.evaluate(() => document.fonts.ready)
    const result = await page.evaluate(async (payload) => {
      const fabricNamespace = (window as unknown as { fabric?: any }).fabric
      if (!fabricNamespace?.Canvas) throw new Error('Fabric browser bundle did not expose Canvas')

      const sourceElement = document.createElement('canvas')
      sourceElement.width = payload.pageWidthPx
      sourceElement.height = payload.pageHeightPx
      sourceElement.style.width = `${payload.pageWidthPx}px`
      sourceElement.style.height = `${payload.pageHeightPx}px`
      document.body.appendChild(sourceElement)

      const canvas = new fabricNamespace.Canvas(sourceElement, {
        width: payload.pageWidthPx,
        height: payload.pageHeightPx,
        backgroundColor: 'white',
        preserveObjectStacking: true,
        renderOnAddRemove: false,
        enableRetinaScaling: false,
      })

      try {
        const loadResult = canvas.loadFromJSON(payload.fabricJSON)
        if (loadResult && typeof loadResult.then === 'function') {
          await loadResult
        } else {
          await new Promise<void>((resolve) => {
            canvas.loadFromJSON(payload.fabricJSON, () => resolve())
          })
        }
        const summarizeFabricObject = (obj: any, depth = 0): any[] => {
          if (!obj || depth > 2) return []
          const safeNumber = (value: unknown): number | null => {
            const n = Number(value)
            return Number.isFinite(n) ? n : null
          }
          const bounds = (() => {
            try {
              if (typeof obj.setCoords === 'function') obj.setCoords()
              const rect = typeof obj.getBoundingRect === 'function' ? obj.getBoundingRect() : null
              if (!rect) return null
              return {
                left: safeNumber(rect.left),
                top: safeNumber(rect.top),
                width: safeNumber(rect.width),
                height: safeNumber(rect.height),
                offCanvas: (
                  Number(rect.left) + Number(rect.width) < 0 ||
                  Number(rect.top) + Number(rect.height) < 0 ||
                  Number(rect.left) > payload.pageWidthPx ||
                  Number(rect.top) > payload.pageHeightPx
                ),
              }
            } catch {
              return null
            }
          })()
          const element = typeof obj.getElement === 'function'
            ? obj.getElement()
            : obj._element ?? obj._originalElement ?? null
          const imageInfo = (obj.type === 'image' || element)
            ? {
              hasElement: Boolean(element),
              complete: typeof element?.complete === 'boolean' ? element.complete : null,
              naturalWidth: safeNumber(element?.naturalWidth ?? element?.videoWidth),
              naturalHeight: safeNumber(element?.naturalHeight ?? element?.videoHeight),
              displayWidth: safeNumber(obj.getScaledWidth?.() ?? (Number(obj.width) * Number(obj.scaleX ?? 1))),
              displayHeight: safeNumber(obj.getScaledHeight?.() ?? (Number(obj.height) * Number(obj.scaleY ?? 1))),
            }
            : null
          const children = typeof obj.getObjects === 'function'
            ? obj.getObjects()
            : Array.isArray(obj._objects)
              ? obj._objects
              : Array.isArray(obj.objects)
                ? obj.objects
                : []
          const current = {
            type: obj.type ?? null,
            depth,
            visible: obj.visible !== false,
            opacity: safeNumber(obj.opacity ?? 1),
            left: safeNumber(obj.left),
            top: safeNumber(obj.top),
            width: safeNumber(obj.width),
            height: safeNumber(obj.height),
            scaleX: safeNumber(obj.scaleX ?? 1),
            scaleY: safeNumber(obj.scaleY ?? 1),
            angle: safeNumber(obj.angle ?? 0),
            childCount: Array.isArray(children) ? children.length : 0,
            isPhotoField: obj.isPhotoField === true,
            photoFieldFilled: obj.photoFieldFilled === true,
            hasClipPath: Boolean(obj.clipPath),
            bounds,
            imageInfo,
          }
          const nested = Array.isArray(children)
            ? children.flatMap((child: any) => summarizeFabricObject(child, depth + 1))
            : []
          return [current, ...nested]
        }
        const objectSummaries = canvas.getObjects().flatMap((obj: any) => summarizeFabricObject(obj))
        const loadedDiagnostics = {
          topLevelObjects: canvas.getObjects().length,
          flattenedObjects: objectSummaries.length,
          images: objectSummaries.filter((obj: any) => obj.type === 'image' || obj.imageInfo).length,
          decodedImages: objectSummaries.filter((obj: any) => {
            const info = obj.imageInfo
            return info && Number(info.naturalWidth) > 0 && Number(info.naturalHeight) > 0
          }).length,
          zeroSizeImages: objectSummaries.filter((obj: any) => {
            const info = obj.imageInfo
            return info && (Number(info.naturalWidth) <= 0 || Number(info.naturalHeight) <= 0)
          }).length,
          offCanvasObjects: objectSummaries.filter((obj: any) => obj.bounds?.offCanvas === true).length,
          sampleObjects: objectSummaries.slice(0, 12),
        }
        canvas.getObjects().forEach((obj: any) => {
          if (obj && typeof obj.set === 'function') {
            obj.set({ selectable: false, evented: false })
            if (obj.type === 'image' || obj.photoFieldFilled === true) {
              obj.objectCaching = false
              obj.noScaleCache = true
            }
          }
        })
        canvas.renderAll()
        await new Promise((resolve) => requestAnimationFrame(resolve))
        await document.fonts.ready

        const trimDataUrl = canvas.toDataURL({ format: 'png', multiplier: payload.multiplier })
        const trimImage = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('Unable to decode Fabric trim PNG'))
          img.src = trimDataUrl
        })

        const sheet = document.createElement('canvas')
        sheet.width = payload.sheetWidthPx
        sheet.height = payload.sheetHeightPx
        const ctx = sheet.getContext('2d')
        if (!ctx) throw new Error('Unable to create production sheet canvas')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, sheet.width, sheet.height)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(trimImage, payload.bleedPx, payload.bleedPx)

        if (payload.cutMarks && payload.bleedPx > 0) {
          const trimW = trimImage.naturalWidth || Math.round(payload.pageWidthPx * payload.multiplier)
          const trimH = trimImage.naturalHeight || Math.round(payload.pageHeightPx * payload.multiplier)
          const left = payload.bleedPx
          const top = payload.bleedPx
          const right = left + trimW
          const bottom = top + trimH
          const mark = Math.max(18, Math.round(payload.bleedPx * 0.75))
          const gap = Math.max(6, Math.round(payload.bleedPx * 0.18))
          ctx.save()
          ctx.strokeStyle = '#000000'
          ctx.lineWidth = Math.max(1, Math.round(payload.multiplier))
          ctx.beginPath()
          ctx.moveTo(left - gap - mark, top); ctx.lineTo(left - gap, top)
          ctx.moveTo(left, top - gap - mark); ctx.lineTo(left, top - gap)
          ctx.moveTo(right + gap, top); ctx.lineTo(right + gap + mark, top)
          ctx.moveTo(right, top - gap - mark); ctx.lineTo(right, top - gap)
          ctx.moveTo(left - gap - mark, bottom); ctx.lineTo(left - gap, bottom)
          ctx.moveTo(left, bottom + gap); ctx.lineTo(left, bottom + gap + mark)
          ctx.moveTo(right + gap, bottom); ctx.lineTo(right + gap + mark, bottom)
          ctx.moveTo(right, bottom + gap); ctx.lineTo(right, bottom + gap + mark)
          ctx.stroke()
          ctx.restore()
        }

        const sampleCanvas = document.createElement('canvas')
        sampleCanvas.width = Math.min(180, sheet.width)
        sampleCanvas.height = Math.min(180, sheet.height)
        const sampleCtx = sampleCanvas.getContext('2d')
        if (!sampleCtx) throw new Error('Unable to create production sample canvas')
        sampleCtx.imageSmoothingEnabled = true
        sampleCtx.imageSmoothingQuality = 'high'
        sampleCtx.drawImage(sheet, 0, 0, sampleCanvas.width, sampleCanvas.height)
        const sample = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data
        let sampledPixels = 0
        let nonWhite = 0
        let nonBlack = 0
        const unique = new Set<string>()
        for (let i = 0; i < sample.length; i += 4) {
          const r = sample[i]
          const g = sample[i + 1]
          const b = sample[i + 2]
          const a = sample[i + 3]
          if (a === 0) continue
          sampledPixels += 1
          if (!(r > 248 && g > 248 && b > 248)) nonWhite += 1
          if (!(r < 7 && g < 7 && b < 7)) nonBlack += 1
          unique.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`)
        }

        return {
          dataUrl: sheet.toDataURL('image/png'),
          loadedDiagnostics,
          pixelStats: {
            width: sheet.width,
            height: sheet.height,
            sampledPixels,
            nonWhiteRatio: sampledPixels > 0 ? nonWhite / sampledPixels : 0,
            nonBlackRatio: sampledPixels > 0 ? nonBlack / sampledPixels : 0,
            uniqueColorSamples: unique.size,
          },
        }
      } finally {
        canvas.dispose()
        sourceElement.remove()
      }
    }, renderPayload)

    assertHealthyPixelStats(result.pixelStats, `Page ${pageIndex + 1}`)
    // #region agent log
    logger.info('[agent:pdf-mismatch] CRM production Fabric loaded object summary', {
      runId: 'pdf-mismatch-prod',
      hypothesisId: 'H6,H7,H8',
      page: pageIndex + 1,
      loadedDiagnostics: result.loadedDiagnostics,
    })
    logger.info('[agent:pdf-mismatch] CRM production Fabric render result pixel summary', {
      runId: 'pdf-mismatch-prod',
      hypothesisId: 'H4,H5',
      page: pageIndex + 1,
      pixelStats: result.pixelStats,
    })
    // #endregion
    const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, '')
    return {
      png: Buffer.from(base64, 'base64'),
      widthMm,
      heightMm,
      pixelStats: result.pixelStats,
    }
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
  await addEditorDraftFileUrlMap(map, orderId, orderItemId)
  return map
}

function collectEditorDraftTokensFromParams(params: unknown): string[] {
  const parsed = parseJsonObject(params)
  const tokens = new Set<string>()
  const addToken = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) tokens.add(value.trim())
  }
  addToken(parsed.editorDraftToken)
  if (Array.isArray(parsed.editorDraftTokens)) {
    for (const token of parsed.editorDraftTokens) addToken(token)
  }
  const group = parseJsonObject(parsed.editorLayoutGroup)
  if (Array.isArray(group.slots)) {
    for (const slot of group.slots) addToken(parseJsonObject(slot).editorDraftToken)
  }
  return [...tokens]
}

async function addEditorDraftFileUrlMap(
  map: Map<string, string>,
  orderId: number,
  orderItemId: number,
): Promise<void> {
  const db = await getDb()
  const item = await db.get<{ params: string | null }>(
    'SELECT params FROM items WHERE id = ? AND orderId = ?',
    [orderItemId, orderId],
  )
  const tokens = collectEditorDraftTokensFromParams(item?.params)
  if (tokens.length === 0) return

  for (const token of tokens) {
    const rows = await db.all<Array<{ id: number; filename: string }>>(
      `SELECT edf.id, edf.filename
       FROM editor_drafts ed
       JOIN editor_draft_files edf ON edf.draft_id = ed.id
       WHERE ed.token = ?`,
      [token],
    )
    for (const row of rows ?? []) {
      addEditorDraftFileUrlAliases(map, token, Number(row.id), row.filename)
    }
  }
}

async function addTemplateAssetUrlMap(map: Map<string, string>, templateId: number | null): Promise<void> {
  if (!templateId) return
  const db = await getDb()
  const rows = await db.all<Array<{ id: number; filename: string; thumb_filename: string | null }>>(
    'SELECT id, filename, thumb_filename FROM design_template_assets WHERE template_id = ?',
    [templateId],
  )
  for (const row of rows ?? []) {
    map.set(`/api/design-templates/public/${templateId}/assets/${row.id}/content`, row.filename)
    map.set(`/api/design-templates/${templateId}/assets/${row.id}/content`, row.filename)
    if (row.thumb_filename) {
      map.set(`/api/design-templates/public/${templateId}/assets/${row.id}/thumb`, row.thumb_filename)
      map.set(`/api/design-templates/${templateId}/assets/${row.id}/thumb`, row.thumb_filename)
    }
  }
}

async function loadTemplateSpecForOrderItem(orderItemId: number): Promise<Record<string, unknown> | null> {
  const db = await getDb()
  const item = await db.get<{ params: string | null }>('SELECT params FROM items WHERE id = ?', [orderItemId])
  if (!item?.params) return null
  try {
    const params = JSON.parse(item.params) as Record<string, unknown>
    const templateId = Number(params.designTemplateId)
    if (!Number.isFinite(templateId) || templateId <= 0) return null
    const template = await getDesignTemplate(templateId)
    if (!template?.spec) return null
    return JSON.parse(template.spec) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function renderDesignStateProductionPdf(
  orderId: number,
  orderItemId: number,
  designState: unknown,
): Promise<{ filename: string; size: number; pageCount: number }> {
  const state = parseJsonObject(designState)
  const templateSpec = await loadTemplateSpecForOrderItem(orderItemId)
  const bundledFonts = templateSpec && Array.isArray(templateSpec.fonts)
    ? templateSpec.fonts
    : []
  const requiredFonts = await buildRequiredFontsForDesignState(designState, bundledFonts)
  const usedFontFamilies = extractUsedFontFamiliesFromDesignState(designState)
  const missingFonts = requiredFonts
    .filter((entry) => entry.source === 'missing')
    .map((entry) => entry.family)
  const resolvedFonts = await resolveFontFilesForDesignState(designState, templateSpec)
  const fontFaceCss = buildFontFaceCss(resolvedFonts)
  if (missingFonts.length > 0) {
    logger.warn('Editor production missing fonts fallback', {
      orderId,
      orderItemId,
      missingFonts,
      resolvedFonts: resolvedFonts.map((font) => font.family),
    })
  }
  const pageWidthMm = Number(state.pageWidth ?? 90)
  const pageHeightMm = Number(state.pageHeight ?? 50)
  const prepress = parseJsonObject(state.prepress)
  const bleedMm = Number(prepress.bleedMm ?? 0)
  const sceneScale = Number(state.sceneScale)
  const pages = Array.isArray(state.pages) ? state.pages : []
  if (pages.length === 0) throw new Error('В designState нет страниц')

  const templateId = Number(state.templateId)
  const fileNameByUrl = await loadOrderFileUrlMap(orderId, orderItemId)
  await addTemplateAssetUrlMap(fileNameByUrl, Number.isFinite(templateId) && templateId > 0 ? templateId : null)
  // #region agent log
  logger.info('[agent:pdf-mismatch] CRM production PDF render document summary', {
    runId: 'pdf-mismatch-prod',
    hypothesisId: 'H4,H5',
    orderId,
    orderItemId,
    pageCount: pages.length,
    statePageCount: state.pageCount,
    pageWidthMm,
    pageHeightMm,
    bleedMm,
    sceneScale,
    templateId: Number.isFinite(templateId) ? templateId : null,
    fileUrlMapSize: fileNameByUrl.size,
    usedFontFamilies,
    requiredFonts: requiredFonts.map((font) => ({
      family: font.family,
      source: font.source,
      format: font.format ?? null,
      hasUrl: Boolean(font.url),
    })),
    missingFonts,
    resolvedFonts: resolvedFonts.map((font) => font.family),
  })
  // #endregion
  const merged = await PDFDocument.create()

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const fabricJSON = parseJsonObject(page).fabricJSON ?? page
    const diagnostics = collectProductionPageDiagnostics(fabricJSON, fileNameByUrl)
    if (diagnostics.unresolvedImages.length > 0 || diagnostics.groups > 0 || diagnostics.clipPaths > 0) {
      logger.info('Editor production page diagnostics', {
        orderId,
        orderItemId,
        page: index + 1,
        ...diagnostics,
        unresolvedImages: diagnostics.unresolvedImages.slice(0, 10),
      })
    }
    if (diagnostics.unresolvedImages.length > 0) {
      throw new Error(
        `Production PDF page ${index + 1}: unresolved images: ${diagnostics.unresolvedImages.slice(0, 5).join(', ')}`,
      )
    }
    const rendered = await renderFabricPageToPng(
      fabricJSON,
      fileNameByUrl,
      pageWidthMm,
      pageHeightMm,
      bleedMm,
      fontFaceCss,
      index,
      sceneScale,
    )
    logger.info('Editor production Fabric page rendered', {
      orderId,
      orderItemId,
      page: index + 1,
      widthMm: rendered.widthMm,
      heightMm: rendered.heightMm,
      pixelStats: rendered.pixelStats,
    })
    const singlePdf = await renderHtmlToPdfBuffer(
      buildRasterPageHtml(rendered.png, rendered.widthMm, rendered.heightMm),
      rendered.widthMm,
      rendered.heightMm,
    )
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
      JSON.stringify({
        version,
        dpi: EXPORT_DPI,
        pageCount: pages.length,
        colorSpace: 'rgb',
        resolvedFonts: resolvedFonts.map((font) => font.family),
        missingFonts,
      }),
    ],
  )

  return { filename: saved.filename, size: saved.size, pageCount: pages.length }
}

/** @internal exported for regression tests */
export const __editorProductionRenderInternals = {
  addEditorDraftFileUrlAliases,
  assertHealthyPixelStats,
  buildPageHtml,
  buildRasterPageHtml,
  buildImageSrcLookupKeys,
  closeProductionRenderBrowser,
  collectProductionPageDiagnostics,
  remapFabricImageSources,
  renderFabricPageToPng,
  resolveImageSrc,
}
