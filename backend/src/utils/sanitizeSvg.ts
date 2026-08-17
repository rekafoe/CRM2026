const BLOCKED_TAGS = /<\s*(script|foreignObject|iframe|object|embed|link|meta)(\s[^>]*)?>[\s\S]*?<\s*\/\s*\1\s*>/gi
const BLOCKED_EMPTY_TAGS = /<\s*(script|foreignObject|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi
const EVENT_ATTRS = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_URL_ATTRS = /\s(href|xlink:href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi

export function sanitizeSvg(svg: string): string {
  if (!svg || !/<svg[\s>]/i.test(svg)) {
    throw new Error('Файл не похож на SVG')
  }
  return svg
    .replace(BLOCKED_TAGS, '')
    .replace(BLOCKED_EMPTY_TAGS, '')
    .replace(EVENT_ATTRS, '')
    .replace(JS_URL_ATTRS, '')
}

export function parseSvgSize(svg: string): { width: number | null; height: number | null } {
  const viewBox = svg.match(/viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i)
  if (viewBox) {
    const width = Number(viewBox[3])
    const height = Number(viewBox[4])
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width: Math.round(width), height: Math.round(height) }
    }
  }
  const widthMatch = svg.match(/\bwidth\s*=\s*["']?\s*([\d.]+)/i)
  const heightMatch = svg.match(/\bheight\s*=\s*["']?\s*([\d.]+)/i)
  const width = widthMatch ? Number(widthMatch[1]) : null
  const height = heightMatch ? Number(heightMatch[1]) : null
  return {
    width: width && Number.isFinite(width) ? Math.round(width) : null,
    height: height && Number.isFinite(height) ? Math.round(height) : null,
  }
}
