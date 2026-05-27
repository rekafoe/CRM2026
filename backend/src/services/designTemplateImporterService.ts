import path from 'path'
import { createDesignTemplate, getDesignTemplate, type DesignTemplateRow } from './designTemplateService'
import { addSubtypeDesign } from './subtypeDesignService'
import { saveBufferToUploads } from '../config/upload'
import {
  buildImportedSvgTemplateDocument,
  isSupportedNormalizedTemplateExt,
  layerDebug,
} from './designTemplateSvgImportBuilder'

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
  authorUserId?: number
  usageFee?: number
  authorPercent?: number
}

export interface ImportDesignTemplateResult {
  template: DesignTemplateRow
  warnings: string[]
  errors: string[]
}

const MASTER_SOURCE_EXTENSIONS = new Set(['.ai', '.cdr', '.indd', '.indt', '.pdf', '.svg'])

export async function importDesignTemplateFromFile(
  input: ImportDesignTemplateInput,
): Promise<ImportDesignTemplateResult> {
  const ext = path.extname(input.file?.originalname || '').toLowerCase()
  const sourceExt = path.extname(input.sourceFile?.originalname || '').toLowerCase()
  const errors: string[] = []
  const warnings: string[] = []

  const hasNormalizedFile = Boolean(input.file?.buffer && input.file.buffer.length > 0)
  const hasSourceFile = Boolean(input.sourceFile?.buffer && input.sourceFile.buffer.length > 0)
  if (!hasNormalizedFile && !hasSourceFile) errors.push('Файл не загружен или пустой.')
  if (!input.name.trim()) {
    errors.push('Укажите название шаблона.')
  }
  if (hasNormalizedFile && ext === '.pdf') {
    errors.push('PDF importer будет добавлен вторым этапом. Сейчас загрузите SVG или ZIP с SVG-страницами.')
  }
  if (hasNormalizedFile && ext !== '.pdf' && !isSupportedNormalizedTemplateExt(ext)) {
    errors.push('Поддерживаются SVG или ZIP с SVG-страницами, позже PDF.')
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

  if (!hasNormalizedFile) {
    warnings.push('Исходник сохранён как draft-шаблон. Для редактора добавьте SVG с именованными слоями.')
    const sourceFileUrl = `/api/uploads/${storedSource!.filename}`
    const template = await createDesignTemplate({
      name: input.name.trim(),
      description: input.description,
      category: input.category,
      preview_url: undefined,
      is_active: false,
      sort_order: input.sortOrder ?? 0,
      author_user_id: input.authorUserId ?? null,
      usage_fee: input.usageFee,
      author_percent: input.authorPercent,
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

  const importedDocument = buildImportedSvgTemplateDocument(input.file!, input.name, warnings)
  const previewUrl = importedDocument.previewUrl
  const normalizedFileUrl = importedDocument.normalizedFileUrl
  const sourceFileUrl = storedSource ? `/api/uploads/${storedSource.filename}` : normalizedFileUrl
  const documentPrepress = importedDocument.pages.find((page) => page.prepress)?.prepress

  const designState: Record<string, unknown> = {
    templateId: null,
    pageWidth: importedDocument.pageWidthMm,
    pageHeight: importedDocument.pageHeightMm,
    pageCount: importedDocument.pageCount,
    sceneScale: 3,
    pages: importedDocument.pages.map((page) => page.designPage),
  }
  if (documentPrepress) designState.prepress = documentPrepress

  const template = await createDesignTemplate({
    name: input.name.trim(),
    description: input.description,
    category: input.category,
    preview_url: previewUrl,
    is_active: true,
    sort_order: input.sortOrder ?? 0,
    author_user_id: input.authorUserId ?? null,
    usage_fee: input.usageFee,
    author_percent: input.authorPercent,
    spec: {
      width_mm: importedDocument.pageWidthMm,
      height_mm: importedDocument.pageHeightMm,
      page_count: importedDocument.pageCount,
      productId: input.productId,
      typeId: input.typeId,
      sizeId: input.sizeId,
      source_format: storedSource ? sourceExt.replace(/^\./, '') : importedDocument.normalizedFormat,
      import: {
        importer: importedDocument.pageCount > 1 ? 'svg-named-layers-multipage' : 'svg-named-layers',
        importerVersion: 6,
        sourceFormat: storedSource ? sourceExt.replace(/^\./, '') : importedDocument.normalizedFormat,
        sourceFile: sourceFileUrl,
        sourceFileUrl,
        sourceOriginalName: storedSource?.originalName ?? importedDocument.normalizedOriginalName,
        sourceSize: storedSource?.size ?? importedDocument.normalizedSize,
        normalizedFormat: importedDocument.normalizedFormat,
        normalizedFile: normalizedFileUrl,
        normalizedFileUrl,
        normalizedFiles: importedDocument.pages.map((page, index) => ({
          page: index + 1,
          originalName: page.originalName,
          normalizedFileUrl: page.normalizedFileUrl,
          normalizedOriginalName: page.normalizedOriginalName,
          normalizedSize: page.normalizedSize,
        })),
        normalizedOriginalName: importedDocument.normalizedOriginalName,
        originalName: importedDocument.normalizedOriginalName,
        warnings,
        errors,
        geometry: importedDocument.pages[0]?.parsed.geometry,
        pages: importedDocument.pages.map((page, index) => ({
          page: index + 1,
          originalName: page.originalName,
          geometry: page.parsed.geometry,
          layers: layerDebug(page.parsed),
          parserSummary: page.parsed.summary,
          guideRectsMmParsed: page.parsed.guideRectsMm,
          lockedBgDetected: page.parsed.lockedBgDetected,
          strippedInteractiveLayers: page.parsed.removalRanges.length > 0,
        })),
        layerConvention:
          'id/inkscape:label: locked_bg (в фоне), photo_* rect, text_* text, группы <g>; trim/bleed/safe rect → prepress',
      },
      designState,
    },
  })

  if (input.productId && input.typeId) {
    if (!input.sizeId) {
      warnings.push('Укажите sizeId при импорте, чтобы привязать шаблон к размеру подтипа в продукте.')
    } else {
      try {
        await addSubtypeDesign(input.productId, input.typeId, template.id, input.sizeId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('UNIQUE constraint')) warnings.push(`Шаблон создан, но не привязан к размеру: ${msg}`)
      }
    }
  }

  const fresh = await getDesignTemplate(template.id)
  return { template: fresh ?? template, warnings, errors }
}
