import { getDb } from '../config/database'

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

function summarizeDesignState(designState: unknown): Record<string, unknown> | null {
  const state = parseJsonObject(designState)
  if (Object.keys(state).length === 0) return null
  const pages = Array.isArray(state.pages) ? state.pages : []
  return {
    templateId: state.templateId ?? null,
    pageWidth: state.pageWidth ?? null,
    pageHeight: state.pageHeight ?? null,
    pageCount: state.pageCount ?? pages.length,
    prepress: state.prepress ?? null,
    pages: pages.map((page, index) => ({ index, hasFabricJSON: Boolean(parseJsonObject(page).fabricJSON) })),
  }
}

function summarizePhotoBatch(photoBatch: unknown): Record<string, unknown> | null {
  const batch = parseJsonObject(photoBatch)
  if (Object.keys(batch).length === 0) return null
  const groups = Array.isArray(batch.groups) ? batch.groups : []
  return {
    totalFiles: batch.totalFiles ?? null,
    totalQuantity: batch.totalQuantity ?? null,
    groups: groups.map((group) => {
      const row = parseJsonObject(group)
      return {
        groupSizeId: row.groupSizeId ?? null,
        groupLabel: row.groupLabel ?? null,
        targetSizeMm: row.targetSizeMm ?? null,
        quantity: row.quantity ?? null,
        itemCount: Array.isArray(row.items) ? row.items.length : 0,
      }
    }),
  }
}

export async function buildEditorProductionManifest(orderId: number, orderItemId: number): Promise<Record<string, unknown>> {
  const db = await getDb()
  const item = await db.get<{ id: number; orderId: number; type: string; params: string | null; quantity: number }>(
    'SELECT id, orderId, type, params, quantity FROM items WHERE id = ? AND orderId = ?',
    [orderItemId, orderId],
  )
  if (!item) throw new Error('Позиция заказа не найдена')
  const params = parseJsonObject(item.params)
  const designState = params.designState
  const photoBatch = params.photoBatch
  if (!designState && !photoBatch) throw new Error('В позиции нет данных редактора для production export')

  const files = await db.all<Array<{
    id: number
    orderItemId: number | null
    filename: string
    originalName: string | null
    mime: string | null
    size: number | null
    artifactType?: string | null
    checksum?: string | null
  }>>(
    `SELECT id, orderItemId, filename, originalName, mime, size, artifactType, checksum
     FROM order_files
     WHERE orderId = ? AND (orderItemId = ? OR orderItemId IS NULL)
     ORDER BY (orderItemId IS NULL), id ASC`,
    [orderId, orderItemId],
  )

  return {
    manifestVersion: 1,
    artifactType: designState ? 'design_state_manifest' : 'photo_batch_manifest',
    generatedAt: new Date().toISOString(),
    orderId,
    orderItemId,
    itemType: item.type,
    quantity: item.quantity,
    mode: params.editorDraftMode ?? (photoBatch ? 'photo_batch' : 'single'),
    editorDraftToken: params.editorDraftToken ?? null,
    designTemplateId: params.designTemplateId ?? null,
    selectedEditorParams: params.selectedEditorParams ?? null,
    designState: summarizeDesignState(designState),
    photoBatch: summarizePhotoBatch(photoBatch),
    files: (files ?? []).map((file) => ({
      id: file.id,
      orderItemId: file.orderItemId,
      filename: file.filename,
      originalName: file.originalName,
      mime: file.mime,
      size: file.size,
      artifactType: file.artifactType ?? 'source',
      checksum: file.checksum ?? null,
    })),
  }
}
