import { getDb } from '../config/database'
import { buildOrderFileFieldsFromDraftFile } from '../utils/clientRenderedPageFile'

type DraftFileCopyRow = {
  id: number
  filename: string
  originalName: string | null
  mime: string | null
  size: number | null
}

export async function copyEditorDraftFilesToOrderItem(
  draftId: number,
  orderId: number,
  orderItemId: number | null,
): Promise<Map<number, string>> {
  const db = await getDb()
  const draftFiles = await db.all<DraftFileCopyRow[]>(
    'SELECT id, filename, originalName, mime, size FROM editor_draft_files WHERE draft_id = ? ORDER BY id ASC',
    [draftId],
  )
  const fileNameByDraftFileId = new Map<number, string>()
  const productionCount = (draftFiles ?? []).filter(
    (file) => buildOrderFileFieldsFromDraftFile(file, 0).partNumber != null,
  ).length
  for (const file of draftFiles ?? []) {
    fileNameByDraftFileId.set(Number(file.id), file.filename)
    const fields = buildOrderFileFieldsFromDraftFile(file, productionCount)
    await db.run(
      `INSERT INTO order_files (
        orderId, orderItemId, filename, originalName, mime, size, artifactType, partNumber, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        orderItemId,
        file.filename,
        file.originalName,
        file.mime,
        file.size,
        fields.artifactType,
        fields.partNumber,
        fields.metadata,
      ],
    )
  }
  return fileNameByDraftFileId
}
