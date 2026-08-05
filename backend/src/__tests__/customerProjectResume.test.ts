import {
  buildCustomerProjectResume,
  customerProjectDisplayId,
  toCustomerProjectListDto,
} from '../services/customerProjectService'

describe('customerProjectResume', () => {
  it('customerProjectDisplayId uses web{id}', () => {
    expect(customerProjectDisplayId(8819)).toBe('web8819')
  })

  it('buildCustomerProjectResume stores print params for clone', () => {
    const resume = buildCustomerProjectResume(
      {
        productId: 58,
        typeId: 2,
        sizeId: '90x50',
        priceType: 'online',
        poligrafySlug: 'vizitki',
        poligrafyTypeIdParam: 'standart',
        editorDraftMode: 'single',
        designTemplateId: 321,
        selectedEditorParams: { paper: 'coated', pages: 2 },
        crmCalculateConfiguration: { materialId: 10, sides: 2 },
        fieldValues: { Материал: 'меловка' },
        specifications: { quantity: 100, size_id: '90x50', priceType: 'online' },
      },
      250,
    )

    expect(resume.productId).toBe(58)
    expect(resume.typeId).toBe(2)
    expect(resume.sizeId).toBe('90x50')
    expect(resume.quantity).toBe(250)
    expect(resume.priceType).toBe('online')
    expect(resume.poligrafySlug).toBe('vizitki')
    expect(resume.selectedParams).toEqual({ paper: 'coated', pages: 2 })
    expect(resume.configuration).toEqual({ materialId: 10, sides: 2 })
    expect(resume.fieldValues).toEqual({ Материал: 'меловка' })
  })

  it('buildCustomerProjectResume falls back size from specifications', () => {
    const resume = buildCustomerProjectResume(
      {
        productId: 1,
        specifications: { size_id: 'A4', quantity: 50 },
      },
      0,
    )
    expect(resume.sizeId).toBe('A4')
    expect(resume.quantity).toBe(50)
  })

  it('toCustomerProjectListDto adds displayId', () => {
    const dto = toCustomerProjectListDto({
      id: 8819,
      customer_id: 1,
      title: 'Визитки',
      design_state_json: null,
      photo_batch_json: null,
      source_order_id: 100,
      source_order_item_id: 200,
      editor_draft_token: null,
      design_template_id: 5,
      editor_mode: 'single',
      editable: 0,
      expires_at: '2099-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      product_id: 58,
      type_id: 2,
      size_id: '90x50',
      resume_json: null,
      resume: { productId: 58, quantity: 100 },
    })
    expect(dto.displayId).toBe('web8819')
    expect(dto.resume?.displayId).toBe('web8819')
    expect(dto.resume?.quantity).toBe(100)
  })
})
