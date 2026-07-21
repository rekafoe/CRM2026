import {
  fontFamilyBaseCompactKey,
  fontFamilyLooseMatchName,
  fontFamilyNamesMatch,
  normalizeFontFamilyName,
} from '../src/utils/fontFamilyNormalize'

describe('fontFamilyLooseMatchName', () => {
  it('убирает (kerning) и суффикс S', () => {
    expect(fontFamilyLooseMatchName('Sign That S (kerning)')).toBe('Sign That')
  })

  it('не трогает Arial Black', () => {
    expect(fontFamilyLooseMatchName('Arial Black')).toBe('Arial Black')
  })

  it('снимает ofont.ru_ и стилевой хвост Bold', () => {
    expect(normalizeFontFamilyName('ofont.ru_Shampanskoe')).toBe('Shampanskoe')
    expect(fontFamilyLooseMatchName('ofont.ru_Shampanskoe Bold')).toBe('Shampanskoe')
    expect(fontFamilyLooseMatchName('CeremoniousOne-Bold')).toBe('CeremoniousOne')
  })
})

describe('fontFamilyNamesMatch', () => {
  it('сопоставляет Sign That с Sign That S (kerning)', () => {
    expect(fontFamilyNamesMatch('Sign That', 'Sign That S (kerning)')).toBe(true)
    expect(fontFamilyBaseCompactKey('Sign That')).toBe(fontFamilyBaseCompactKey('Sign That S (kerning)'))
  })

  it('сопоставляет SVG ofont.ru_ с family из CRM без префикса', () => {
    expect(fontFamilyNamesMatch('ofont.ru_Shampanskoe', 'Shampanskoe')).toBe(true)
    expect(fontFamilyNamesMatch('Shampanskoe Bold', 'Shampanskoe')).toBe(true)
  })
})
