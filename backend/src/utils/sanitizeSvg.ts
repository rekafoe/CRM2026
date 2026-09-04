const BLOCKED_TAGS =
  /<\s*(script|foreignObject|iframe|object|embed|link|meta|style|handler|set|animate|animateTransform|animateMotion)(\s[^>]*)?>[\s\S]*?<\s*\/\s*\1\s*>/gi
const BLOCKED_EMPTY_TAGS =
  /<\s*(script|foreignObject|iframe|object|embed|link|meta|style|handler|set|animate|animateTransform|animateMotion)[^>]*\/?\s*>/gi
const EVENT_ATTRS = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
/** javascript: in href/src — including HTML entity encodings like &#106;avascript: */
const JS_URL_ATTRS =
  /\s(href|xlink:href|src)\s*=\s*(['"])\s*(?:javascript:|&\s*#\s*0*106\s*;\s*avascript:|\\\s*6a\s*avascript:)(?:(?!\2).)*\2/gi
/** Nested SVG/HTML via data: on use/image — classic sanitizer bypass (value may contain quotes) */
const DATA_URL_ATTRS =
  /\s(href|xlink:href|src)\s*=\s*(['"])\s*data:(?:image\/svg\+xml|text\/html)(?:(?!\2).)*\2/gi

export function sanitizeSvg(svg: string): string {
  if (!svg || !/<svg[\s>]/i.test(svg)) {
    throw new Error('Файл не похож на SVG')
  }
  return svg
    .replace(BLOCKED_TAGS, '')
    .replace(BLOCKED_EMPTY_TAGS, '')
    .replace(EVENT_ATTRS, '')
    .replace(JS_URL_ATTRS, '')
    .replace(DATA_URL_ATTRS, '')
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
