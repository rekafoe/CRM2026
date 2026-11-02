import { getDb } from '../config/database'
import { planDraftFilesForOrderCopy } from '../utils/clientRenderedPageFile'

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
  partNumberOffset = 0,
): Promise<{ fileNameByDraftFileId: Map<number, string>; productionPageCount: number }> {
  const db = await getDb()
  const draftFiles = await db.all<DraftFileCopyRow[]>(
    'SELECT id, filename, originalName, mime, size FROM editor_draft_files WHERE draft_id = ? ORDER BY id ASC',
    [draftId],
  )
  const fileNameByDraftFileId = new Map<number, string>()
  const { planned, productionPageCount } = planDraftFilesForOrderCopy(draftFiles ?? [], partNumberOffset)
  for (const row of planned) {
    const file = row.file
    fileNameByDraftFileId.set(Number(file.id), file.filename)
    for (const aliasId of row.aliasFileIds) {
      fileNameByDraftFileId.set(aliasId, file.filename)
    }
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
        row.fields.artifactType,
        row.fields.partNumber,
        row.fields.metadata,
      ],
    )
  }
  return { fileNameByDraftFileId, productionPageCount }
}
