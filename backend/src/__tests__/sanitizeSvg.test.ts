import { parseSvgSize, sanitizeSvg } from '../utils/sanitizeSvg'

describe('sanitizeSvg', () => {
  it('вырезает script, обработчики и javascript: URL', () => {
    const dirty = `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
      <script>alert(1)</script>
      <circle cx="5" cy="5" r="4" onclick="alert(1)" href="javascript:alert(1)"/>
    </svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).toContain('<circle')
    expect(clean).not.toMatch(/script/i)
    expect(clean).not.toMatch(/onclick/i)
    expect(clean).not.toMatch(/javascript:/i)
  })

  it('читает размер из viewBox', () => {
    expect(parseSvgSize('<svg viewBox="0 0 120 80"></svg>')).toEqual({ width: 120, height: 80 })
  })
})
