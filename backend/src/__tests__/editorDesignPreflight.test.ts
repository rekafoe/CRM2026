import {
  analyzeDesignStatePreflight,
  buildLayoutReviewPath,
} from '../services/editorDesignPreflight'

describe('editorDesignPreflight', () => {
  it('flags empty photo field as blocking', () => {
    const summary = analyzeDesignStatePreflight({
      pages: [
        {
          fabricJSON: {
            objects: [
              { type: 'rect', isPhotoField: true, photoFieldFilled: false },
            ],
          },
        },
      ],
    })
    expect(summary.hasBlockingIssues).toBe(true)
    expect(summary.photoTotal).toBe(1)
    expect(summary.photoReady).toBe(0)
    expect(summary.issues.some((i) => i.level === 'error')).toBe(true)
  })

  it('passes when photo field is filled', () => {
    const summary = analyzeDesignStatePreflight({
      pages: [
        {
          fabricJSON: {
            objects: [
              {
                type: 'rect',
                isPhotoField: true,
                photoFieldFilled: true,
                photoFieldFw: 100,
                photoFieldFh: 100,
                photoFieldIntrinsicW: 200,
                photoFieldIntrinsicH: 200,
              },
            ],
          },
        },
      ],
    })
    expect(summary.hasBlockingIssues).toBe(false)
    expect(summary.photoReady).toBe(1)
  })

  it('buildLayoutReviewPath includes order item id', () => {
    expect(buildLayoutReviewPath(42)).toBe('order-pool:item:42')
  })
})
