import path from 'path'
import { createDesignTemplate, getDesignTemplate, type DesignTemplateRow } from './designTemplateService'
import { addSubtypeDesign } from './subtypeDesignService'
import { saveBufferToUploads } from '../config/upload'

type SvgRect = {
  name: string
  x: number
  y: number
  width: number
  height: number
}

type SvgText = {
  name: string
  x: number
  y: number
  fontSize: number
  text: string
}

export interface ImportDesignTemplateInput {
  file: {
    buffer?: Buffer
    originalname?: string
    mimetype?: string
  }
  name: string
  description?: string
  category?: string
  productId?: number
  typeId?: number
  sizeId?: string
  sortOrder?: number
}

export interface ImportDesignTemplateResult {
  template: DesignTemplateRow
  warnings: string[]
  errors: string[]
}

const PX_TO_MM = 25.4 / 96

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRe = /([:\w-]+)\s*=\s*["']([^"']*)["']/g
  let match: RegExpExecArray | null
  while ((match = attrRe.exec(source))) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null
  const match = value.trim().match(/^-?\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

function parseLengthMm(value: string | undefined): number | null {
  const n = parseNumber(value)
  if (n == null) return null
  const unit = value?.trim().replace(/^-?\d+(?:\.\d+)?/, '').trim().toLowerCase()
  if (unit === 'mm') return n
  if (unit === 'cm') return n * 10
  if (unit === 'in') return n * 25.4
  if (unit === 'pt') return n * 25.4 / 72
  return n * PX_TO_MM
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s(?:href|xlink:href)\s*=\s*["']\s*javascript:[^"']*["']/gi, '')
}

function getLayerName(attrs: Record<string, string>): string | null {
  return attrs.id || attrs['inkscape:label'] || attrs['data-name'] || null
}

function parseSvg(svg: string): {
  widthMm: number
  heightMm: number
  photoRects: SvgRect[]
  textItems: SvgText[]
  warnings: string[]
} {
  const warnings: string[] = []
  const svgTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const svgAttrs = parseAttributes(svgTag)
  const viewBox = (svgAttrs.viewBox || '').split(/\s+/).map(Number).filter(Number.isFinite)
  const viewBoxWidth = viewBox.length === 4 ? viewBox[2] : null
  const viewBoxHeight = viewBox.length === 4 ? viewBox[3] : null
  const widthMm = parseLengthMm(svgAttrs.width) ?? (viewBoxWidth != null ? viewBoxWidth * PX_TO_MM : 100)
  const heightMm = parseLengthMm(svgAttrs.height) ?? (viewBoxHeight != null ? viewBoxHeight * PX_TO_MM : 100)

  if (!svgAttrs.width || !svgAttrs.height) {
    warnings.push('SVG не содержит явные width/height, размеры взяты из viewBox или fallback.')
  }

  const scaleX = viewBoxWidth && widthMm ? widthMm / viewBoxWidth : PX_TO_MM
  const scaleY = viewBoxHeight && heightMm ? heightMm / viewBoxHeight : PX_TO_MM
  const photoRects: SvgRect[] = []
  const textItems: SvgText[] = []

  const rectRe = /<rect\b([^>]*)\/?>/gi
  let rectMatch: RegExpExecArray | null
  while ((rectMatch = rectRe.exec(svg))) {
    const attrs = parseAttributes(rectMatch[1])
    const name = getLayerName(attrs)
    if (!name) continue
    if (name.startsWith('photo_')) {
      const x = parseNumber(attrs.x) ?? 0
      const y = parseNumber(attrs.y) ?? 0
      const width = parseNumber(attrs.width)
      const height = parseNumber(attrs.height)
      if (width == null || height == null || width <= 0 || height <= 0) {
        warnings.push(`Фото-поле ${name} пропущено: rect должен иметь width/height.`)
        continue
      }
      photoRects.push({ name, x: x * scaleX, y: y * scaleY, width: width * scaleX, height: height * scaleY })
    }
  }

  const textRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi
  let textMatch: RegExpExecArray | null
  while ((textMatch = textRe.exec(svg))) {
    const attrs = parseAttributes(textMatch[1])
    const name = getLayerName(attrs)
    if (!name || !name.startsWith('text_')) continue
    const x = parseNumber(attrs.x) ?? 0
    const y = parseNumber(attrs.y) ?? 0
    const fontSize = parseNumber(attrs['font-size']) ?? 18
    textItems.push({
      name,
      x: x * scaleX,
      y: y * scaleY,
      fontSize: fontSize * ((scaleX + scaleY) / 2),
      text: decodeXmlText(textMatch[2]) || name.replace(/^text_/, ''),
    })
  }

  if (photoRects.length === 0 && textItems.length === 0) {
    warnings.push('В SVG не найдено объектов photo_* или text_*; шаблон будет импортирован только как фон.')
  }

  return { widthMm, heightMm, photoRects, textItems, warnings }
}

function toFabricRect(rect: SvgRect) {
  return {
    type: 'rect',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    fill: 'rgba(248, 250, 252, 0.25)',
    stroke: '#2563eb',
    strokeWidth: 0.8,
    strokeDashArray: [4, 3],
    rx: 2,
    ry: 2,
    id: rect.name,
    isPhotoField: true,
  }
}

function toFabricText(item: SvgText) {
  return {
    type: 'i-text',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    left: item.x,
    top: item.y - item.fontSize,
    text: item.text,
    fontSize: Math.max(6, item.fontSize),
    fontFamily: 'Arial',
    fill: '#111827',
    id: item.name,
  }
}

export async function importDesignTemplateFromFile(
  input: ImportDesignTemplateInput,
): Promise<ImportDesignTemplateResult> {
  const ext = path.extname(input.file.originalname || '').toLowerCase()
  const errors: string[] = []
  const warnings: string[] = []

  if (!input.file.buffer || input.file.buffer.length === 0) {
    errors.push('Файл не загружен или пустой.')
  }
  if (!input.name.trim()) {
    errors.push('Укажите название шаблона.')
  }
  if (ext === '.pdf') {
    errors.push('PDF importer будет добавлен вторым этапом. Сейчас загрузите SVG с именованными слоями.')
  }
  if (ext !== '.svg' && ext !== '.pdf') {
    errors.push('Поддерживаются SVG, позже PDF.')
  }
  if (errors.length > 0) {
    throw Object.assign(new Error(errors.join(' ')), { importErrors: errors, importWarnings: warnings })
  }

  const svg = sanitizeSvg(input.file.buffer!.toString('utf8'))
  const parsed = parseSvg(svg)
  warnings.push(...parsed.warnings)

  const stored = saveBufferToUploads(Buffer.from(svg, 'utf8'), input.file.originalname, input.name)
  if (!stored) {
    throw Object.assign(new Error('Не удалось сохранить SVG.'), {
      importErrors: ['Не удалось сохранить SVG.'],
      importWarnings: warnings,
    })
  }

  const previewUrl = `/api/uploads/${stored.filename}`
  const designState = {
    templateId: null,
    pageWidth: parsed.widthMm,
    pageHeight: parsed.heightMm,
    pageCount: 1,
    pages: [
      {
        fabricJSON: {
          version: '6.0.0',
          objects: [
            ...parsed.photoRects.map(toFabricRect),
            ...parsed.textItems.map(toFabricText),
          ],
          background: 'white',
        },
      },
    ],
  }

  const template = await createDesignTemplate({
    name: input.name.trim(),
    description: input.description,
    category: input.category,
    preview_url: previewUrl,
    is_active: true,
    sort_order: input.sortOrder ?? 0,
    spec: {
      width_mm: parsed.widthMm,
      height_mm: parsed.heightMm,
      page_count: 1,
      productId: input.productId,
      typeId: input.typeId,
      sizeId: input.sizeId,
      source_format: 'svg',
      import: {
        importer: 'svg-named-layers',
        sourceFile: previewUrl,
        originalName: stored.originalName,
        warnings,
        errors,
        layerConvention: 'locked_bg, photo_*, text_*, trim, bleed, safe',
      },
      designState,
    },
  })

  if (input.productId && input.typeId) {
    try {
      await addSubtypeDesign(input.productId, input.typeId, template.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('UNIQUE constraint')) warnings.push(`Шаблон создан, но не привязан к подтипу: ${msg}`)
    }
  }

  const fresh = await getDesignTemplate(template.id)
  return { template: fresh ?? template, warnings, errors }
}
