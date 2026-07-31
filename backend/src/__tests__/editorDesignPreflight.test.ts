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

  it('treats zero-width-space text as empty (blocking)', () => {
    const summary = analyzeDesignStatePreflight({
      pages: [
        {
          fabricJSON: {
            objects: [
              { id: 'text_1', type: 'textbox', text: '\u200b' },
            ],
          },
        },
      ],
    })
    expect(summary.hasBlockingIssues).toBe(true)
    expect(summary.textTotal).toBe(1)
    expect(summary.textReady).toBe(0)
    expect(summary.issues.some((i) => i.id === 'text-0-1' && i.level === 'error')).toBe(true)
  })

  it('flags placeholder text as blocking', () => {
    const summary = analyzeDesignStatePreflight({
      pages: [
        {
          fabricJSON: {
            objects: [
              { id: 'text_1', type: 'textbox', text: 'Your text' },
            ],
          },
        },
      ],
    })
    expect(summary.hasBlockingIssues).toBe(true)
    expect(summary.textTotal).toBe(1)
    expect(summary.textReady).toBe(0)
    expect(summary.issues.some((i) => i.id === 'text-0-1' && i.level === 'error')).toBe(true)
  })

  it('adds warning when text overflows page bounds', () => {
    const summary = analyzeDesignStatePreflight({
      pageWidth: 100,
      pageHeight: 100,
      sceneScale: 1,
      prepress: { safeZoneMm: 5 },
      pages: [
        {
          fabricJSON: {
            objects: [
              {
                id: 'text_1',
                type: 'textbox',
                text: 'Ready text',
                left: 420,
                top: 10,
                width: 100,
                fontSize: 24,
              },
            ],
          },
        },
      ],
    })
    expect(summary.hasBlockingIssues).toBe(false)
    expect(summary.issues.some((i) => i.id.includes('text-overflow-page'))).toBe(true)
  })

  it('buildLayoutReviewPath includes order item id', () => {
    expect(buildLayoutReviewPath(42)).toBe('order-pool:item:42')
  })
})
