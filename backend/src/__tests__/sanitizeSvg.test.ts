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

  it('вырезает style/@import, data: SVG use/image и animate/set', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>@import url("javascript:alert(1)");</style>
      <use href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9J2FsZXJ0KDEpJy8+"/>
      <image href="data:image/svg+xml,%3Csvg%20onload='alert(1)'%3E%3C/svg%3E"/>
      <set attributeName="onmouseover" to="alert(1)"/>
      <animate attributeName="href" values="javascript:alert(1)"/>
      <a href="&#106;avascript:alert(1)"><text>x</text></a>
      <circle cx="1" cy="1" r="1"/>
    </svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).toContain('<circle')
    expect(clean).not.toMatch(/<style/i)
    expect(clean).not.toMatch(/data:image\/svg\+xml/i)
    expect(clean).not.toMatch(/<set\b/i)
    expect(clean).not.toMatch(/<animate\b/i)
    expect(clean).not.toMatch(/javascript:/i)
    expect(clean).not.toMatch(/&#106;avascript/i)
  })

  it('читает размер из viewBox', () => {
    expect(parseSvgSize('<svg viewBox="0 0 120 80"></svg>')).toEqual({ width: 120, height: 80 })
  })
})
