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
  const parsed = parseImportedSvgLayers(svg)
  warnings.push(...parsed.warnings)

  const strippedForBg = parsed.strippedSvg
  if (parsed.removalRanges.length > 0) {
    warnings.push(
      'Интерактивные и направляющие слои вырезаны из SVG-фона (без дубля с полями редактора и prepress overlay).',
    )
  }

  const stored = saveBufferToUploads(Buffer.from(strippedForBg, 'utf8'), input.file.originalname, input.name)
  if (!stored) {
    throw Object.assign(new Error('Не удалось сохранить SVG.'), {
      importErrors: ['Не удалось сохранить SVG.'],
      importWarnings: warnings,
    })
  }

  const previewUrl = `/api/uploads/${stored.filename}`
  const prepress =
    parsed.prepressHints && Object.keys(parsed.guideRectsMm).length > 0
      ? buildImportedPrepress(parsed.prepressHints, parsed.guideRectsMm)
      : undefined

  const designState: Record<string, unknown> = {
    templateId: null,
    pageWidth: parsed.widthMm,
    pageHeight: parsed.heightMm,
    pageCount: 1,
    pages: [
      {
        fabricJSON: {
          version: '6.0.0',
          objects: [...parsed.photoRects.map(toFabricRect), ...parsed.textItems.map(toFabricText)],
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
      source_format: 'svg',
      import: {
        importer: 'svg-named-layers',
        importerVersion: 3,
        sourceFile: previewUrl,
        originalName: stored.originalName,
        warnings,
        errors,
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
