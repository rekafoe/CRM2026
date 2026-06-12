import path from 'path'
import {
  createDesignTemplate,
  getDesignTemplate,
  updateDesignTemplate,
  type DesignTemplateRow,
} from './designTemplateService'
import { addSubtypeDesign } from './subtypeDesignService'
import { saveBufferToUploads } from '../config/upload'
import {
  buildImportedSvgTemplateDocument,
  isSupportedNormalizedTemplateExt,
  layerDebug,
} from './designTemplateSvgImportBuilder'
import { enrichSpecWithRequiredFonts } from './designFontService'
import type { BundledTemplateFont } from '../utils/extractDesignStateFonts'

const IMPORTER_VERSION = 7

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
  category_id?: number | null
  category?: string
  productId?: number
  typeId?: number
  sizeId?: string
  sortOrder?: number
  authorUserId?: number
  usageFee?: number
  authorPercent?: number
  trace?: boolean
}

export interface ImportDesignTemplateResult {
  template: DesignTemplateRow
  warnings: string[]
  errors: string[]
}

const MASTER_SOURCE_EXTENSIONS = new Set(['.ai', '.cdr', '.indd', '.indt', '.pdf', '.svg'])

async function finalizeImportedSpec(spec: Record<string, unknown>): Promise<Record<string, unknown>> {
  return enrichSpecWithRequiredFonts(spec)
}

function parseTemplateSpec(row: DesignTemplateRow): Record<string, unknown> {
  if (!row.spec) return {}
  try {
    return typeof row.spec === 'string' ? JSON.parse(row.spec) as Record<string, unknown> : { ...(row.spec as object) }
  } catch {
    return {}
  }
}

export interface ReimportDesignTemplateInput {
  templateId: number
  file?: ImportDesignTemplateInput['file']
  sourceFile?: ImportDesignTemplateInput['sourceFile']
  trace?: boolean
}

export async function reimportDesignTemplateFromFile(
  input: ReimportDesignTemplateInput,
): Promise<ImportDesignTemplateResult> {
  const existing = await getDesignTemplate(input.templateId)
  if (!existing) {
    throw Object.assign(new Error('Шаблон не найден'), { importErrors: ['Шаблон не найден'], importWarnings: [] })
  }

  const existingSpec = parseTemplateSpec(existing)
  const errors: string[] = []
  const warnings: string[] = []

  const hasNormalizedFile = Boolean(input.file?.buffer && input.file.buffer.length > 0)
  const hasSourceFile = Boolean(input.sourceFile?.buffer && input.sourceFile.buffer.length > 0)
  if (!hasNormalizedFile && !hasSourceFile) {
    errors.push('Загрузите SVG/ZIP или исходник.')
  }

  const ext = path.extname(input.file?.originalname || '').toLowerCase()
  const sourceExt = path.extname(input.sourceFile?.originalname || '').toLowerCase()

  if (hasNormalizedFile && ext === '.pdf') {
    errors.push('PDF importer будет добавлен вторым этапом. Сейчас загрузите SVG или ZIP с SVG-страницами.')
  }
  if (hasNormalizedFile && ext !== '.pdf' && !isSupportedNormalizedTemplateExt(ext)) {
    errors.push('Поддерживаются SVG или ZIP с SVG-страницами.')
  }
  if (input.sourceFile?.buffer && sourceExt && !MASTER_SOURCE_EXTENSIONS.has(sourceExt)) {
    errors.push('Исходник шаблона должен быть AI, CDR, INDD, INDT, PDF или SVG.')
  }
  if (errors.length > 0) {
    throw Object.assign(new Error(errors.join(' ')), { importErrors: errors, importWarnings: warnings })
  }

  let storedSource: { filename: string; size: number; originalName: string } | null = null
  if (hasSourceFile && input.sourceFile?.buffer) {
    storedSource = saveBufferToUploads(
      input.sourceFile.buffer,
      input.sourceFile.originalname,
      `${existing.name}-source`,
    )
    if (!storedSource) {
      throw Object.assign(new Error('Не удалось сохранить исходник.'), {
        importErrors: ['Не удалось сохранить исходник.'],
        importWarnings: warnings,
      })
    }
  }

  if (!hasNormalizedFile) {
    warnings.push('Исходник обновлён. Для редактора загрузите SVG с именованными слоями.')
    const prevImport = (existingSpec.import as Record<string, unknown> | undefined) ?? {}
    const sourceFileUrl = `/api/uploads/${storedSource!.filename}`
    const mergedSpec = {
      ...existingSpec,
      import: {
        ...prevImport,
        importer: 'source-only-draft',
        importerVersion: 5,
        status: 'draft',
        sourceFormat: sourceExt.replace(/^\./, '') || 'source',
        sourceFile: sourceFileUrl,
        sourceFileUrl,
        sourceOriginalName: storedSource!.originalName,
        sourceSize: storedSource!.size,
        warnings,
        errors,
      },
    }
    const template = await updateDesignTemplate(input.templateId, {
      spec: mergedSpec,
      is_active: false,
    })
    if (!template) throw new Error('Не удалось обновить шаблон')
    return { template, warnings, errors }
  }

  const importedDocument = buildImportedSvgTemplateDocument(input.file!, existing.name, warnings, {
    trace: input.trace === true,
  })
  const previewUrl = importedDocument.previewUrl
  const normalizedFileUrl = importedDocument.normalizedFileUrl
  const sourceFileUrl = storedSource ? `/api/uploads/${storedSource.filename}` : normalizedFileUrl
  const documentPrepress = importedDocument.pages.find((page) => page.prepress)?.prepress
  const prevImport = (existingSpec.import as Record<string, unknown> | undefined) ?? {}

  const designState: Record<string, unknown> = {
    templateId: null,
    pageWidth: importedDocument.pageWidthMm,
    pageHeight: importedDocument.pageHeightMm,
    pageCount: importedDocument.pageCount,
    sceneScale: (existingSpec.designState as Record<string, unknown> | undefined)?.sceneScale ?? 3,
    pages: importedDocument.pages.map((page) => page.designPage),
  }
  if (documentPrepress) designState.prepress = documentPrepress

  const bundledFonts: BundledTemplateFont[] = importedDocument.bundledFonts ?? []
  const mergedSpec: Record<string, unknown> = {
    ...existingSpec,
    width_mm: importedDocument.pageWidthMm,
    height_mm: importedDocument.pageHeightMm,
    page_count: importedDocument.pageCount,
    fonts: bundledFonts.length > 0 ? bundledFonts : existingSpec.fonts,
    source_format: storedSource ? sourceExt.replace(/^\./, '') : importedDocument.normalizedFormat,
    import: {
      ...prevImport,
      importer: importedDocument.pageCount > 1 ? 'svg-named-layers-multipage' : 'svg-named-layers',
      importerVersion: IMPORTER_VERSION,
      reimportedAt: new Date().toISOString(),
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
        parserReport: page.parsed.parserReport,
        guideRectsMmParsed: page.parsed.guideRectsMm,
        lockedBgDetected: page.parsed.lockedBgDetected,
        strippedInteractiveLayers: page.parsed.removalRanges.length > 0,
        ...(input.trace === true && page.parsed.trace ? { trace: page.parsed.trace } : {}),
      })),
      layerConvention:
        'id/inkscape:label: locked_bg (в фоне), photo_* rect, text_* text, группы <g>; trim/bleed/safe rect → prepress',
    },
    designState,
  }

  const template = await updateDesignTemplate(input.templateId, {
    preview_url: previewUrl,
    spec: await finalizeImportedSpec(mergedSpec),
    is_active: existing.is_active === 1,
  })
  if (!template) throw new Error('Не удалось обновить шаблон')

  const fresh = await getDesignTemplate(input.templateId)
  return { template: fresh ?? template, warnings, errors }
}

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
      category_id: input.category_id,
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

  const importedDocument = buildImportedSvgTemplateDocument(input.file!, input.name, warnings, {
    trace: input.trace === true,
  })
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

  const bundledFonts: BundledTemplateFont[] = importedDocument.bundledFonts ?? []
  const importSpec: Record<string, unknown> = {
      width_mm: importedDocument.pageWidthMm,
      height_mm: importedDocument.pageHeightMm,
      page_count: importedDocument.pageCount,
      productId: input.productId,
      typeId: input.typeId,
      sizeId: input.sizeId,
      fonts: bundledFonts,
      source_format: storedSource ? sourceExt.replace(/^\./, '') : importedDocument.normalizedFormat,
      import: {
        importer: importedDocument.pageCount > 1 ? 'svg-named-layers-multipage' : 'svg-named-layers',
        importerVersion: IMPORTER_VERSION,
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
          parserReport: page.parsed.parserReport,
          guideRectsMmParsed: page.parsed.guideRectsMm,
          lockedBgDetected: page.parsed.lockedBgDetected,
          strippedInteractiveLayers: page.parsed.removalRanges.length > 0,
          ...(input.trace === true && page.parsed.trace ? { trace: page.parsed.trace } : {}),
        })),
        layerConvention:
          'id/inkscape:label: locked_bg (в фоне), photo_* rect, text_* text, группы <g>; trim/bleed/safe rect → prepress',
      },
      designState,
  }

  const template = await createDesignTemplate({
    name: input.name.trim(),
    description: input.description,
    category_id: input.category_id,
    category: input.category,
    preview_url: previewUrl,
    is_active: true,
    sort_order: input.sortOrder ?? 0,
    author_user_id: input.authorUserId ?? null,
    usage_fee: input.usageFee,
    author_percent: input.authorPercent,
    spec: await finalizeImportedSpec(importSpec),
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
