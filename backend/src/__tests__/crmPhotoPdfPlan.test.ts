import { crmMarkedPdfFilename } from '../photoPrint/crmPhotoPdfFilename'
import { planCrmStandardPdfParts, STANDARD_SRA3_PDF_MAX_SLOTS } from '../photoPrint/planCrmStandardPdf'
import type { SavedOrder } from '../photoPrint/photoPrintTypes'

function order(quantity: number): SavedOrder {
  return {
    orderId: 'o1',
    orderType: 'photo',
    printType: 'digital',
    photoType: 'photo',
    orderName: 'Стандарт',
    items: [{
      mockupId: 'm1',
      printSize: '10×15 см',
      paperType: 'глянцевая',
      quantity,
    }],
  }
}

describe('crm photo pdf plan', () => {
  it('adds the crm suffix before pdf', () => {
    expect(crmMarkedPdfFilename('fotopechat_10x15_cm_glossy_photo_sra3.pdf')).toBe(
      'fotopechat_10x15_cm_glossy_photo_sra3_crm.pdf'
    )
    expect(crmMarkedPdfFilename('fotopechat_10x15_cm_glossy_photo_sra3_part_02.pdf')).toBe(
      'fotopechat_10x15_cm_glossy_photo_sra3_part_02_crm.pdf'
    )
  })

  it('keeps 76 prints in one crm file', () => {
    const parts = planCrmStandardPdfParts([order(76)])
    expect(parts.map((part) => part.filename)).toEqual([
      'fotopechat_10x15_cm_glossy_photo_sra3_crm.pdf',
    ])
    expect(parts[0].partNumber).toBeUndefined()
  })

  it('keeps exactly one full sheet as a single file', () => {
    const parts = planCrmStandardPdfParts([order(STANDARD_SRA3_PDF_MAX_SLOTS)])
    expect(parts).toHaveLength(1)
    expect(parts[0].partNumber).toBeUndefined()
  })

  it('splits the overflow into crm-marked parts', () => {
    const parts = planCrmStandardPdfParts([order(STANDARD_SRA3_PDF_MAX_SLOTS * 2 + 5)])
    expect(parts.map((part) => part.filename)).toEqual([
      'fotopechat_10x15_cm_glossy_photo_sra3_crm.pdf',
      'fotopechat_10x15_cm_glossy_photo_sra3_part_02_crm.pdf',
      'fotopechat_10x15_cm_glossy_photo_sra3_part_03_crm.pdf',
    ])
    expect(parts.map((part) => part.partNumber)).toEqual([1, 2, 3])
    expect(parts.map((part) => part.orders[0].items[0].quantity)).toEqual([
      STANDARD_SRA3_PDF_MAX_SLOTS,
      STANDARD_SRA3_PDF_MAX_SLOTS,
      5,
    ])
  })
})
