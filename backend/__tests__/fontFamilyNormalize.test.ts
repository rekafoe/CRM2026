import {
  fontFamilyBaseCompactKey,
  fontFamilyLooseMatchName,
  fontFamilyNamesMatch,
} from '../src/utils/fontFamilyNormalize'

describe('fontFamilyLooseMatchName', () => {
  it('убирает (kerning) и суффикс S', () => {
    expect(fontFamilyLooseMatchName('Sign That S (kerning)')).toBe('Sign That')
  })

  it('не трогает Arial Black', () => {
    expect(fontFamilyLooseMatchName('Arial Black')).toBe('Arial Black')
  })
})

describe('fontFamilyNamesMatch', () => {
  it('сопоставляет Sign That с Sign That S (kerning)', () => {
    expect(fontFamilyNamesMatch('Sign That', 'Sign That S (kerning)')).toBe(true)
    expect(fontFamilyBaseCompactKey('Sign That')).toBe(fontFamilyBaseCompactKey('Sign That S (kerning)'))
  })
})
