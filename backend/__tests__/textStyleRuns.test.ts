import {
  buildMixedFontTextInnerHtml,
  collectFontFamiliesFromTextField,
  resolveTextStyleRuns,
} from '../src/utils/textStyleRuns'

describe('textStyleRuns utils', () => {
  it('collectFontFamiliesFromTextField читает textStyleRuns', () => {
    const families = new Set<string>()
    collectFontFamiliesFromTextField({
      fontFamily: 'Voguella',
      textStyleRuns: [
        { start: 0, end: 12, fontFamily: 'Voguella' },
        { start: 12, end: 17, fontFamily: 'Ceremonious One' },
      ],
    }, families)
    expect([...families].sort()).toEqual(['Ceremonious One', 'Voguella'])
  })

  it('resolveTextStyleRuns мигрирует legacy styles', () => {
    const runs = resolveTextStyleRuns({
      text: 'Что я в тебе люблю',
      styles: {
        0: {
          12: { fontFamily: 'Ceremonious One' },
        },
      },
    })
    expect(runs[0]?.fontFamily).toBe('Ceremonious One')
    expect(runs[0]?.start).toBe(12)
  })

  it('buildMixedFontTextInnerHtml рендерит span по runs', () => {
    const html = buildMixedFontTextInnerHtml('ABCDE', {
      fontFamily: 'Voguella',
      fontSize: 24,
      fill: '#111',
      textStyleRuns: [
        { start: 0, end: 2, fontFamily: 'Voguella' },
        { start: 2, end: 5, fontFamily: 'Ceremonious One' },
      ],
    }, 1)
    expect(html).toContain('Ceremonious One')
    expect(html).toContain('CDE')
  })
})
