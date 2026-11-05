/**
 * If one CRM PDF part throws, siblings must still be attempted.
 * Early «Готовится» registration (processing) otherwise leaves unattempted parts stuck.
 */

const updateExternalOrderFile = jest.fn<Promise<void>, [any]>(async () => undefined)
const registerExternalOrderFiles = jest.fn<
  Promise<Array<{ id: number; filename: string }>>,
  [{ files: Array<{ filename: string }> }]
>(async (input) => input.files.map((file, index) => ({ id: index + 1, filename: file.filename })))
const createPhotoSra3PdfBlobV2 = jest.fn<Promise<Blob>, [unknown, unknown]>()
const uploadOrderPdfToS3 = jest.fn<
  Promise<{ url: string; bucket: string; key: string; size: number; checksum: string }>,
  [{ filename: string }]
>(async (input) => ({
  url: `https://example.test/${input.filename}`,
  bucket: 'b',
  key: `k/${input.filename}`,
  size: 10,
  checksum: 'sha256:x',
}))
const fetchMockupRasterBlob = jest.fn<Promise<Blob>, [string]>(
  async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
)
const planCrmStandardPdfParts = jest.fn<
  Array<{ filename: string; orders: unknown[] }>,
  [unknown]
>()

jest.mock('../services/externalOrderFilesService', () => ({
  registerExternalOrderFiles: (input: { files: Array<{ filename: string }> }) =>
    registerExternalOrderFiles(input),
  updateExternalOrderFile: (input: any) => updateExternalOrderFile(input),
}))
jest.mock('../photoPrint/photoSra3PdfV2', () => ({
  createPhotoSra3PdfBlobV2: (orders: unknown, opts: unknown) => createPhotoSra3PdfBlobV2(orders, opts),
}))
jest.mock('../photoPrint/orderFileS3Put', () => ({
  uploadOrderPdfToS3: (input: { filename: string }) => uploadOrderPdfToS3(input),
  orderFileS3Key: (orderId: number, filename: string) => `orders/${orderId}/production/${filename}`,
}))
jest.mock('../photoPrint/fetchMockupRaster', () => ({
  fetchMockupRasterBlob: (id: string) => fetchMockupRasterBlob(id),
}))
jest.mock('../photoPrint/planCrmStandardPdf', () => ({
  planCrmStandardPdfParts: (orders: unknown) => planCrmStandardPdfParts(orders),
}))
jest.mock('../config/database', () => ({
  getDb: async () => ({
    get: async () => ({ id: 42, source: 'website' }),
    all: async () => [],
  }),
}))
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

import { startCrmPhotoPdf } from '../services/crmPhotoPdfService'

describe('CRM photo PDF build continues after part failure', () => {
  beforeEach(() => {
    registerExternalOrderFiles.mockClear()
    updateExternalOrderFile.mockClear()
    createPhotoSra3PdfBlobV2.mockReset()
    uploadOrderPdfToS3.mockClear()
    planCrmStandardPdfParts.mockReset()
  })

  it('marks the failed part and still uploads the next part', async () => {
    planCrmStandardPdfParts.mockReturnValue([
      { filename: 'a_crm.pdf', orders: [] },
      { filename: 'b_crm.pdf', orders: [] },
    ])
    createPhotoSra3PdfBlobV2
      .mockRejectedValueOnce(new Error('render boom'))
      .mockResolvedValueOnce(new Blob([new Uint8Array([9, 9])], { type: 'application/pdf' }))

    const started = await startCrmPhotoPdf(42, [{ orderId: 'x', orderType: 'photo', items: [] }])
    expect(started.started).toBe(true)
    expect(started.count).toBe(2)

    // Allow async buildOrder to finish.
    await new Promise((resolve) => setTimeout(resolve, 80))

    const statuses = updateExternalOrderFile.mock.calls.map((call) => call[0]?.data?.status)
    expect(statuses).toContain('failed')
    expect(statuses).toContain('ready')
    expect(uploadOrderPdfToS3).toHaveBeenCalledTimes(1)
    expect(uploadOrderPdfToS3.mock.calls[0][0].filename).toBe('b_crm.pdf')
  })
})
