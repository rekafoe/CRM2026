import path from 'path'
import { createDesignTemplate, getDesignTemplate, type DesignTemplateRow } from './designTemplateService'
import { addSubtypeDesign } from './subtypeDesignService'
import { saveBufferToUploads } from '../config/upload'
import {
  parseImportedSvgLayers,
  type PrepressFromSvgGuides,
  type SvgRect,
  type SvgText,
} from './designTemplateSvgParse'

export interface ImportDesignTemplateInput {
  file?: {
    buffer?: Buffer
    originalname?: string
    mimetype?: string
  }
  sourceFile?: {
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

const MASTER_SOURCE_EXTENSIONS = new Set(['.ai', '.cdr', '.indd', '.indt', '.pdf', '.svg'])
const IMPORTED_TEMPLATE_SCENE_SCALE = 3

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s(?:href|xlink:href)\s*=\s*["']\s*javascript:[^"']*["']/gi, '')
}

function toFabricRect(rect: SvgRect) {
  return {
    type: 'rect',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    left: rect.scene.x,
    top: rect.scene.y,
    width: rect.scene.width,
    height: rect.scene.height,
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
  const fontSizePx = Math.max(6, item.scene.fontSize)
  const originX = item.textAnchor === 'middle' ? 'center' : item.textAnchor === 'end' ? 'right' : 'left'
  return {
    type: 'i-text',
    version: '6.0.0',
    originX,
    originY: 'top',
    left: item.scene.x,
    top: item.scene.y - fontSizePx * 0.8,
    text: item.text,
    fontSize: fontSizePx,
    fontFamily: 'Arial',
    fill: '#111827',
    textAlign: item.textAnchor === 'end' ? 'right' : item.textAnchor === 'middle' ? 'center' : 'left',
    id: item.name,
  }
}

function toFabricBackground(src: string, scene: { width: number; height: number }, sceneScale: number) {
  const safeScale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1
  return {
    type: 'image',
    version: '6.0.0',
    originX: 'left',
    originY: 'top',
    left: 0,
    top: 0,
    width: scene.width / safeScale,
    height: scene.height / safeScale,
    scaleX: safeScale,
    scaleY: safeScale,
    src,
    crossOrigin: 'anonymous',
    selectable: false,
    evented: false,
    id: 'locked_bg',
    isBackground: true,
    backgroundFit: 'page',
    backgroundSceneScale: safeScale,
  }
}

function layerDebug(parsed: ReturnType<typeof parseImportedSvgLayers>) {
  return {
    photo: parsed.photoRects.map((r) => ({ name: r.name, svg: r.svg, mm: { x: r.x, y: r.y, width: r.width, height: r.height }, scene: r.scene })),
    text: parsed.textItems.map((t) => ({ name: t.name, text: t.text, textAnchor: t.textAnchor, svg: t.svg, mm: { x: t.x, y: t.y, fontSize: t.fontSize }, scene: t.scene })),
    guides: parsed.guideRectsMm,
  }
}

/** designState.prepress если в SVG были rect trim/bleed/safe. */
function buildImportedPrepress(
  hints: PrepressFromSvgGuides,
  guideKeys: Partial<Record<'trim' | 'bleed' | 'safe', unknown>>,
): Record<string, unknown> | undefined {
  if (Object.keys(guideKeys).length === 0) return undefined
  return {
    bleedMm: hints.bleedMm,
    safeZoneMm: hints.safeZoneMm,
    showBleed: Boolean(guideKeys.bleed ?? guideKeys.trim),
    showTrim: Boolean(guideKeys.trim),
    showSafeZone: Boolean(guideKeys.safe),
    cutMarks: true,
  }
}

export async function importDesignTemplateFromFile(
  input: ImportDesignTemplateInput,
): Promise<ImportDesignTemplateResult> {
  const ext = path.extname(input.file?.originalname || '').toLowerCase()
  const sourceExt = path.extname(input.sourceFile?.originalname || '').toLowerCase()
  const errors: string[] = []
  const warnings: string[] = []

  const hasNormalizedSvg = Boolean(input.file?.buffer && input.file.buffer.length > 0)
  const hasSourceFile = Boolean(input.sourceFile?.buffer && input.sourceFile.buffer.length > 0)
  if (!hasNormalizedSvg && !hasSourceFile) errors.push('Файл не загружен или пустой.')
  if (!input.name.trim()) {
    errors.push('Укажите название шаблона.')
  }
  if (hasNormalizedSvg && ext === '.pdf') {
    errors.push('PDF importer будет добавлен вторым этапом. Сейчас загрузите SVG с именованными слоями.')
  }
  if (hasNormalizedSvg && ext !== '.svg' && ext !== '.pdf') {
    errors.push('Поддерживаются SVG, позже PDF.')
  }
  if (input.sourceFile?.buffer && sourceExt && !MASTER_SOURCE_EXTENSIONS.has(sourceExt)) {
    errors.push('Исходник шаблона должен быть AI, CDR, INDD, INDT, PDF или SVG.')
  }
  if (errors.length > 0) {
    throw Object.assign(new Error(errors.join(' ')), { importErrors: errors, importWarnings: warnings })
  }

  let storedSource: { filename: string; size: number; originalName: string } | null = null
  if (input.sourceFile?.buffer && input.sourceFile.buffer.length > 0) {
    storedSource = saveBufferToUploads(input.sourceFile.buffer, input.sourceFile.originalname, `${input.name}-source`)
    if (!storedSource) {
      throw Object.assign(new Error('Не удалось сохранить исходник шаблона.'), {
        importErrors: ['Не удалось сохранить исходник шаблона.'],
        importWarnings: warnings,
      })
    }
  }

  if (!hasNormalizedSvg) {
    warnings.push('Исходник сохранён как draft-шаблон. Для редактора добавьте SVG с именованными слоями.')
    const sourceFileUrl = `/api/uploads/${storedSource!.filename}`
    const template = await createDesignTemplate({
      name: input.name.trim(),
      description: input.description,
      category: input.category,
      preview_url: undefined,
      is_active: false,
      sort_order: input.sortOrder ?? 0,
      spec: {
        productId: input.productId,
        typeId: input.typeId,
        sizeId: input.sizeId,
        source_format: sourceExt.replace(/^\./, '') || 'source',
        import: {
          importer: 'source-only-draft',
          importerVersion: 5,
          status: 'draft',
          sourceFormat: sourceExt.replace(/^\./, '') || 'source',
          sourceFile: sourceFileUrl,
          sourceFileUrl,
          sourceOriginalName: storedSource!.originalName,
          sourceSize: storedSource!.size,
          normalizedFormat: null,
          normalizedFileUrl: null,
          warnings,
          errors,
        },
      },
    })
    const fresh = await getDesignTemplate(template.id)
    return { template: fresh ?? template, warnings, errors }
  }

  const svg = sanitizeSvg(input.file!.buffer!.toString('utf8'))
  const parsed = parseImportedSvgLayers(svg, { sceneScale: IMPORTED_TEMPLATE_SCENE_SCALE })
  warnings.push(...parsed.warnings)

  const strippedForBg = parsed.strippedSvg
  if (parsed.removalRanges.length > 0) {
    warnings.push(
      'Интерактивные и направляющие слои вырезаны из SVG-фона (без дубля с полями редактора и prepress overlay).',
    )
  }

  const stored = saveBufferToUploads(Buffer.from(strippedForBg, 'utf8'), input.file!.originalname, input.name)
  if (!stored) {
    throw Object.assign(new Error('Не удалось сохранить SVG.'), {
      importErrors: ['Не удалось сохранить SVG.'],
      importWarnings: warnings,
    })
  }

  const previewUrl = `/api/uploads/${stored.filename}`
  const normalizedFileUrl = previewUrl
  const sourceFileUrl = storedSource ? `/api/uploads/${storedSource.filename}` : normalizedFileUrl
  const prepress =
    parsed.prepressHints && Object.keys(parsed.guideRectsMm).length > 0
      ? buildImportedPrepress(parsed.prepressHints, parsed.guideRectsMm)
      : undefined

  const designState: Record<string, unknown> = {
    templateId: null,
    pageWidth: parsed.widthMm,
    pageHeight: parsed.heightMm,
    pageCount: 1,
    sceneScale: IMPORTED_TEMPLATE_SCENE_SCALE,
    pages: [
      {
        fabricJSON: {
          version: '6.0.0',
          objects: [
            toFabricBackground(previewUrl, parsed.geometry.scenePx, parsed.geometry.sceneScale),
            ...parsed.photoRects.map(toFabricRect),
            ...parsed.textItems.map(toFabricText),
          ],
          background: 'white',
        },
      },
    ],
  }
  if (prepress) designState.prepress = prepress

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
      source_format: storedSource ? sourceExt.replace(/^\./, '') : 'svg',
      import: {
        importer: 'svg-named-layers',
        importerVersion: 5,
        sourceFormat: storedSource ? sourceExt.replace(/^\./, '') : 'svg',
        sourceFile: sourceFileUrl,
        sourceFileUrl,
        sourceOriginalName: storedSource?.originalName ?? stored.originalName,
        sourceSize: storedSource?.size ?? stored.size,
        normalizedFormat: 'svg',
        normalizedFile: normalizedFileUrl,
        normalizedFileUrl,
        normalizedOriginalName: stored.originalName,
        originalName: stored.originalName,
        warnings,
        errors,
        geometry: parsed.geometry,
        layers: layerDebug(parsed),
        parserSummary: parsed.summary,
        layerConvention:
          'id/inkscape:label: locked_bg (в фоне), photo_* rect, text_* text, группы <g>; trim/bleed/safe rect → prepress',
        strippedInteractiveLayers: true,
        guideRectsMmParsed: parsed.guideRectsMm,
        lockedBgDetected: parsed.lockedBgDetected,
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
