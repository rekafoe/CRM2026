import { normalizeFontFamilyName } from './fontFamilyNormalize'

export type TextStyleRun = {
  start: number
  end: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  fill?: string
  fontSize?: number
}

type FabricStyles = Record<string, Record<string, Record<string, unknown>>>

export function extractRunsFromFabricStyles(
  text: string,
  styles: FabricStyles,
): TextStyleRun[] {
  const lines = text.split('\n')
  const lineStartOffsets: number[] = []
  let offset = 0
  for (const line of lines) {
    lineStartOffsets.push(offset)
    offset += line.length + 1
  }
  const markers: Array<{ absIndex: number; patch: Record<string, unknown> }> = []
  for (const [lineKey, lineStyles] of Object.entries(styles)) {
    const lineIndex = Number(lineKey)
    if (!Number.isFinite(lineIndex) || !lineStyles) continue
    const lineStart = lineStartOffsets[lineIndex] ?? 0
    for (const [charKey, patch] of Object.entries(lineStyles)) {
      const charIndex = Number(charKey)
      if (!Number.isFinite(charIndex) || !patch) continue
      markers.push({ absIndex: lineStart + charIndex, patch })
    }
  }
  markers.sort((a, b) => a.absIndex - b.absIndex)
  if (!markers.length) return []

  const runs: TextStyleRun[] = []
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]!.absIndex
    const end = i + 1 < markers.length ? markers[i + 1]!.absIndex : text.length
    const patch = markers[i]!.patch
    const run: TextStyleRun = { start, end }
    if (typeof patch.fontFamily === 'string') run.fontFamily = patch.fontFamily
    if (typeof patch.fontWeight === 'string') run.fontWeight = patch.fontWeight
    if (typeof patch.fontStyle === 'string') run.fontStyle = patch.fontStyle
    if (typeof patch.fill === 'string') run.fill = patch.fill
    if (typeof patch.fontSize === 'number') run.fontSize = patch.fontSize
    runs.push(run)
  }
  return runs
}

export function resolveTextStyleRuns(obj: Record<string, unknown>): TextStyleRun[] {
  const text = String(obj.text ?? '')
  const runs = obj.textStyleRuns
  if (Array.isArray(runs) && runs.length > 0) {
    return runs as TextStyleRun[]
  }
  const styles = obj.styles
  if (styles && typeof styles === 'object' && !Array.isArray(styles)) {
    return extractRunsFromFabricStyles(text, styles as FabricStyles)
  }
  return []
}

export function collectFontFamiliesFromTextField(obj: Record<string, unknown>, families: Set<string>): void {
  const ff = normalizeFontFamilyName(String(obj.fontFamily ?? ''))
  if (ff) families.add(ff)
  for (const run of resolveTextStyleRuns(obj)) {
    const segFont = normalizeFontFamilyName(String(run.fontFamily ?? ''))
    if (segFont) families.add(segFont)
  }
  const styles = obj.styles
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return
  for (const line of Object.values(styles as Record<string, unknown>)) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) continue
    for (const style of Object.values(line as Record<string, unknown>)) {
      if (!style || typeof style !== 'object' || Array.isArray(style)) continue
      const segFont = normalizeFontFamilyName(String((style as Record<string, unknown>).fontFamily ?? ''))
      if (segFont) families.add(segFont)
    }
  }
}

function spanStyle(run: Partial<TextStyleRun>, base: {
  fontFamily: string
  fontSize: number
  fill: string
  fontWeight: string
}): string {
  const fontFamily = run.fontFamily ?? base.fontFamily
  const fontSize = run.fontSize ?? base.fontSize
  const fill = run.fill ?? base.fill
  const fontWeight = run.fontWeight ?? base.fontWeight
  const fontStyle = run.fontStyle ? `font-style:${run.fontStyle};` : ''
  return `font-family:${fontFamily};font-size:${fontSize}px;color:${fill};font-weight:${fontWeight};${fontStyle}`
}

export function buildMixedFontTextInnerHtml(
  text: string,
  obj: Record<string, unknown>,
  scale: number,
): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const runs = resolveTextStyleRuns(obj)
  const base = {
    fontFamily: String(obj.fontFamily ?? 'Arial, sans-serif'),
    fontSize: Number(obj.fontSize ?? 16) * scale,
    fill: String(obj.fill ?? '#000000'),
    fontWeight: String(obj.fontWeight ?? 'normal'),
  }
  if (!runs.length) {
    return escaped.replace(/\n/g, '<br/>')
  }
  const sorted = [...runs].sort((a, b) => a.start - b.start)
  let html = ''
  let pos = 0
  for (const run of sorted) {
    const start = Math.max(0, Math.min(run.start, text.length))
    const end = Math.max(start, Math.min(run.end, text.length))
    if (start > pos) {
      const chunk = escaped.slice(pos, start).replace(/\n/g, '<br/>')
      html += `<span style="${spanStyle({}, base)}">${chunk}</span>`
    }
    if (end > start) {
      const chunk = escaped.slice(start, end).replace(/\n/g, '<br/>')
      html += `<span style="${spanStyle(run, base)}">${chunk}</span>`
      pos = end
    }
  }
  if (pos < escaped.length) {
    html += `<span style="${spanStyle({}, base)}">${escaped.slice(pos).replace(/\n/g, '<br/>')}</span>`
  }
  return html
}
