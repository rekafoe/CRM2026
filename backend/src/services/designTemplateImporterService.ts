import path from 'path'
import { getDb } from '../config/database'
import {
  createDesignTemplate,
  getDesignTemplate,
  updateDesignTemplate,
  getDesignTemplatesByCode,
  isValidDesignCode,
  type DesignTemplateRow,
} from './designTemplateService'
import { allocateNextDesignCode } from './designCodeService'
import { addSubtypeDesign } from './subtypeDesignService'
import { saveBufferToUploads } from '../config/upload'
import {
  buildImportedSvgTemplateDocument,
  buildImportedMultiSizeSvgDocuments,
  isSupportedNormalizedTemplateExt,
  layerDebug,
  type ImportedSvgTemplateDocument,
  type ImportedSizeVariantDocument,
} from './designTemplateSvgImportBuilder'
import { enrichSpecWithRequiredFonts } from './designFontService'
import type { BundledTemplateFont } from '../utils/extractDesignStateFonts'

const IMPORTER_VERSION = 7
const MM_MATCH_TOLERANCE = 1.0

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
  /** Если пусто — будет design_code */
  name?: string
  /** Добавить размеры к существующей семье (без нового кода) */
  design_code?: string
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
  templates?: DesignTemplateRow[]
  design_code?: string
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

function buildImportSpecFromDocument(
  importedDocument: ImportedSvgTemplateDocument,
  input: ImportDesignTemplateInput,
  warnings: string[],
  errors: string[],
  sourceFileUrl: string,
  storedSource: { filename: string; size: number; originalName: string } | null,
  sourceExt: string,
  sizeId?: string,
  folderLabel?: string,
): Record<string, unknown> {
  const previewUrl = importedDocument.previewUrl
  const normalizedFileUrl = importedDocument.normalizedFileUrl
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
  return {
    width_mm: importedDocument.pageWidthMm,
    height_mm: importedDocument.pageHeightMm,
    page_count: importedDocument.pageCount,
    productId: input.productId,
    typeId: input.typeId,
    sizeId: sizeId ?? input.sizeId,
    sizeFolder: folderLabel,
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
      previewUrl,
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
}

async function resolveProductSizeIdByMm(
  productId: number,
  typeId: number,
  widthMm: number,
  heightMm: number,
): Promise<string | null> {
  const db = await getDb()
  const row = await db.get<{ config_data?: string }>(
    `SELECT config_data FROM product_template_configs
     WHERE product_id = ? AND name = 'template' AND is_active = 1
     ORDER BY id DESC LIMIT 1`,
    [productId],
  )
  if (!row?.config_data) return null
  let config: Record<string, unknown>
  try {
    config = typeof row.config_data === 'string'
      ? JSON.parse(row.config_data) as Record<string, unknown>
      : (row.config_data as Record<string, unknown>)
  } catch {
    return null
  }
  const simplified = (config.simplified ?? config) as Record<string, unknown>
  const typeConfigs = simplified.typeConfigs as Record<string, { sizes?: unknown[] }> | undefined
  const typeKey = String(typeId)
  const sizesRaw = Array.isArray(typeConfigs?.[typeKey]?.sizes)
    ? typeConfigs![typeKey].sizes!
    : Array.isArray(simplified.sizes)
      ? (simplified.sizes as unknown[])
      : []

  for (const size of sizesRaw) {
    if (!size || typeof size !== 'object') continue
    const s = size as Record<string, unknown>
    const w = Number(s.width_mm ?? s.width ?? s.w)
    const h = Number(s.height_mm ?? s.height ?? s.h)
    if (!Number.isFinite(w) || !Number.isFinite(h)) continue
    if (Math.abs(w - widthMm) <= MM_MATCH_TOLERANCE && Math.abs(h - heightMm) <= MM_MATCH_TOLERANCE) {
      const id = s.id
      return id != null ? String(id) : null
    }
    // допускаем поворот
    if (Math.abs(w - heightMm) <= MM_MATCH_TOLERANCE && Math.abs(h - widthMm) <= MM_MATCH_TOLERANCE) {
      const id = s.id
      return id != null ? String(id) : null
    }
  }
  return null
}

async function tryLinkTemplateToProductSize(
  templateId: number,
  productId: number,
  typeId: number,
  widthMm: number,
  heightMm: number,
  explicitSizeId: string | undefined,
  warnings: string[],
): Promise<void> {
  let sizeId = explicitSizeId?.trim() || ''
  if (!sizeId) {
    const matched = await resolveProductSizeIdByMm(productId, typeId, widthMm, heightMm)
    if (matched) {
      sizeId = matched
      warnings.push(`Автопривязка к size_id=${sizeId} по мм ${widthMm}×${heightMm}.`)
    } else {
      warnings.push(
        `Не найден размер продукта для ${widthMm}×${heightMm} мм — привяжите шаблон #${templateId} вручную.`,
      )
      return
    }
  }
  try {
    await addSubtypeDesign(productId, typeId, templateId, sizeId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('UNIQUE constraint')) {
      warnings.push(`Шаблон #${templateId} создан, но не привязан к размеру: ${msg}`)
    }
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
  if (input.sourceFile?.buffer && input.sourceFile.buffer.length > 0) {
    storedSource = saveBufferToUploads(
      input.sourceFile.buffer,
      input.sourceFile.originalname,
      `${existing.design_code || existing.name}-source`,
    )
  }

  if (!hasNormalizedFile) {
    const sourceFileUrl = `/api/uploads/${storedSource!.filename}`
    const nextSpec = {
      ...existingSpec,
      import: {
        ...(typeof existingSpec.import === 'object' && existingSpec.import ? existingSpec.import : {}),
        sourceFile: sourceFileUrl,
        sourceFileUrl,
        sourceOriginalName: storedSource!.originalName,
        sourceSize: storedSource!.size,
        warnings,
        errors,
      },
    }
    await updateDesignTemplate(existing.id, { spec: nextSpec as never })
    const fresh = await getDesignTemplate(existing.id)
    return { template: fresh ?? existing, design_code: existing.design_code, warnings, errors }
  }

  // Reimport одного варианта — только flat/single document (не multi-size папки целиком).
  const multi = buildImportedMultiSizeSvgDocuments(input.file!, existing.design_code || existing.name, warnings, {
    trace: input.trace === true,
  })
  if (multi && multi.length > 1) {
    throw Object.assign(
      new Error('Reimport одного шаблона не принимает multi-size ZIP. Импортируйте размеры отдельно или через «добавить к коду».'),
      { importErrors: ['Multi-size ZIP не поддерживается в reimport одного варианта.'], importWarnings: warnings },
    )
  }

  const importedDocument = multi?.[0]?.document
    ?? buildImportedSvgTemplateDocument(input.file!, existing.design_code || existing.name, warnings, {
      trace: input.trace === true,
    })

  const sourceFileUrl = storedSource
    ? `/api/uploads/${storedSource.filename}`
    : importedDocument.normalizedFileUrl
  const importSpec = buildImportSpecFromDocument(
    importedDocument,
    {
      productId: Number(existingSpec.productId) || undefined,
      typeId: Number(existingSpec.typeId) || undefined,
      sizeId: existingSpec.sizeId != null ? String(existingSpec.sizeId) : undefined,
      trace: input.trace,
    },
    warnings,
    errors,
    sourceFileUrl,
    storedSource,
    sourceExt,
    existingSpec.sizeId != null ? String(existingSpec.sizeId) : undefined,
  )

  // Сохраняем site_preview_url / category / royalty; обновляем preview из SVG.
  await updateDesignTemplate(existing.id, {
    preview_url: importedDocument.previewUrl,
    spec: await finalizeImportedSpec({
      ...existingSpec,
      ...importSpec,
      productId: existingSpec.productId ?? importSpec.productId,
      typeId: existingSpec.typeId ?? importSpec.typeId,
      sizeId: existingSpec.sizeId ?? importSpec.sizeId,
    }),
  })

  const fresh = await getDesignTemplate(existing.id)
  return {
    template: fresh ?? existing,
    design_code: existing.design_code,
    warnings,
    errors,
  }
}

async function createTemplateFromVariant(
  input: ImportDesignTemplateInput,
  designCode: string,
  displayName: string,
  importedDocument: ImportedSvgTemplateDocument,
  warnings: string[],
  errors: string[],
  sourceFileUrl: string,
  storedSource: { filename: string; size: number; originalName: string } | null,
  sourceExt: string,
  folderLabel?: string,
  explicitSizeId?: string,
): Promise<DesignTemplateRow> {
  const importSpec = buildImportSpecFromDocument(
    importedDocument,
    input,
    warnings,
    errors,
    sourceFileUrl,
    storedSource,
    sourceExt,
    explicitSizeId ?? input.sizeId,
    folderLabel,
  )

  const family = await getDesignTemplatesByCode(designCode)
  for (const sibling of family) {
    try {
      const spec = sibling.spec ? JSON.parse(sibling.spec) as Record<string, unknown> : {}
      const w = Number(spec.width_mm)
      const h = Number(spec.height_mm)
      if (
        Number.isFinite(w) && Number.isFinite(h)
        && Math.abs(w - importedDocument.pageWidthMm) <= MM_MATCH_TOLERANCE
        && Math.abs(h - importedDocument.pageHeightMm) <= MM_MATCH_TOLERANCE
      ) {
        throw Object.assign(
          new Error(
            `В семье ${designCode} уже есть вариант ${w}×${h} мм (шаблон #${sibling.id}).`,
          ),
          { importErrors: [`Дубликат размера ${w}×${h} мм в семье ${designCode}`], importWarnings: warnings },
        )
      }
    } catch (err) {
      if ((err as { importErrors?: string[] }).importErrors) throw err
    }
  }

  const template = await createDesignTemplate({
    design_code: designCode,
    name: displayName,
    description: input.description,
    category_id: input.category_id,
    category: input.category,
    preview_url: importedDocument.previewUrl,
    is_active: true,
    sort_order: input.sortOrder ?? 0,
    author_user_id: input.authorUserId ?? null,
    usage_fee: input.usageFee,
    author_percent: input.authorPercent,
    spec: await finalizeImportedSpec(importSpec),
  })

  if (input.productId && input.typeId) {
    await tryLinkTemplateToProductSize(
      template.id,
      input.productId,
      input.typeId,
      importedDocument.pageWidthMm,
      importedDocument.pageHeightMm,
      explicitSizeId ?? input.sizeId,
      warnings,
    )
  }

  return (await getDesignTemplate(template.id)) ?? template
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
  if (hasNormalizedFile && ext === '.pdf') {
    errors.push('PDF importer будет добавлен вторым этапом. Сейчас загрузите SVG или ZIP с SVG-страницами.')
  }
  if (hasNormalizedFile && ext !== '.pdf' && !isSupportedNormalizedTemplateExt(ext)) {
    errors.push('Поддерживаются SVG или ZIP с SVG-страницами, позже PDF.')
  }
  if (input.sourceFile?.buffer && sourceExt && !MASTER_SOURCE_EXTENSIONS.has(sourceExt)) {
    errors.push('Исходник шаблона должен быть AI, CDR, INDD, INDT, PDF или SVG.')
  }

  let designCode = input.design_code?.trim() ?? ''
  if (designCode && !isValidDesignCode(designCode)) {
    errors.push('design_code должен быть 6-значным (000001–999999).')
  }
  if (designCode && isValidDesignCode(designCode)) {
    const existingFamily = await getDesignTemplatesByCode(designCode)
    if (existingFamily.length === 0) {
      errors.push(`Семья с кодом ${designCode} не найдена.`)
    }
  }

  if (errors.length > 0) {
    throw Object.assign(new Error(errors.join(' ')), { importErrors: errors, importWarnings: warnings })
  }

  if (!designCode) {
    designCode = await allocateNextDesignCode()
  }

  const displayName = (input.name?.trim() || designCode)

  let storedSource: { filename: string; size: number; originalName: string } | null = null
  if (input.sourceFile?.buffer && input.sourceFile.buffer.length > 0) {
    storedSource = saveBufferToUploads(input.sourceFile.buffer, input.sourceFile.originalname, `${designCode}-source`)
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
      design_code: designCode,
      name: displayName,
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
    return {
      template: fresh ?? template,
      templates: [fresh ?? template],
      design_code: designCode,
      warnings,
      errors,
    }
  }

  const multi = buildImportedMultiSizeSvgDocuments(input.file!, displayName, warnings, {
    trace: input.trace === true,
  })

  if (multi && multi.length > 0) {
    const created: DesignTemplateRow[] = []
    const sourceFileUrl = storedSource
      ? `/api/uploads/${storedSource.filename}`
      : multi[0].document.normalizedFileUrl

    // Для multi-size не используем один sizeId из формы на все папки — только автолинк по мм.
    const sharedSizeId = multi.length === 1 ? input.sizeId : undefined

    for (const variant of multi) {
      const row = await createTemplateFromVariant(
        input,
        designCode,
        designCode,
        variant.document,
        warnings,
        errors,
        sourceFileUrl,
        storedSource,
        sourceExt,
        variant.folderLabel,
        sharedSizeId,
      )
      created.push(row)
    }

    return {
      template: created[0],
      templates: created,
      design_code: designCode,
      warnings,
      errors,
    }
  }

  const importedDocument = buildImportedSvgTemplateDocument(input.file!, displayName, warnings, {
    trace: input.trace === true,
  })
  const sourceFileUrl = storedSource
    ? `/api/uploads/${storedSource.filename}`
    : importedDocument.normalizedFileUrl

  const template = await createTemplateFromVariant(
    input,
    designCode,
    displayName,
    importedDocument,
    warnings,
    errors,
    sourceFileUrl,
    storedSource,
    sourceExt,
  )

  return {
    template,
    templates: [template],
    design_code: designCode,
    warnings,
    errors,
  }
}
