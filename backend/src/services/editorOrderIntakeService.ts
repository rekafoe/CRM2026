import { getDb } from '../config/database'
import { snapshotCustomerProjectsForOrder } from './customerProjectService'
import { enqueueEditorProductionJobsForOrder } from './editorProductionJobService'
import type { PreparedEditorDraftItem } from './editorDraftWebsitePrepare'

export async function completeEditorOrderIntake(input: {
  orderId: number
  customerId?: number | null
  itemIds: number[]
  editorDraftItems: PreparedEditorDraftItem[]
}): Promise<void> {
  if (input.editorDraftItems.length > 0 && input.customerId) {
    await snapshotCustomerProjectsForOrder(input.orderId, input.customerId, input.itemIds)
  } else if (input.editorDraftItems.length > 0) {
    const db = await getDb()
    const order = await db.get<{ customer_id: number | null }>(
      'SELECT customer_id FROM orders WHERE id = ?',
      [input.orderId],
    )
    if (order?.customer_id) {
      await snapshotCustomerProjectsForOrder(input.orderId, order.customer_id, input.itemIds)
    }
  }

  await enqueueEditorProductionJobsForOrder(input.orderId)
}
