import { buildFabricStylesFromRuns, resolveTextStyleRuns } from './textStyleRuns'

type FabricObj = Record<string, unknown>

function isTextObject(obj: FabricObj): boolean {
  const type = String(obj.type ?? '').toLowerCase()
  return type === 'i-text' || type === 'itext' || type === 'textbox' || type === 'text'
}

function walkFabricObjects(value: unknown, visit: (obj: FabricObj) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkFabricObjects(item, visit)
    return
  }
  if (!value || typeof value !== 'object') return
  const obj = value as FabricObj
  visit(obj)
  for (const key of ['objects', '_objects'] as const) {
    const children = obj[key]
    if (Array.isArray(children)) walkFabricObjects(children, visit)
  }
}

function hydrateTextObjectStylesInJson(obj: FabricObj): void {
  if (!isTextObject(obj)) return
  const text = String(obj.text ?? '')
  const baseFontSize = Math.max(6, Number(obj.fontSize) || 16)
  const runs = resolveTextStyleRuns(obj)
  if (runs.length === 0) return
  const styles = buildFabricStylesFromRuns(text, runs, baseFontSize)
  if (styles) obj.styles = styles
}

function expandSingleLineTextboxWidthInJson(obj: FabricObj): void {
  if (String(obj.type ?? '').toLowerCase() !== 'textbox') return
  if (obj.textFieldClientAdded === true) return
  const text = String(obj.text ?? '')
  if (!text || text.includes('\n')) return
  const fontSize = Math.max(6, Number(obj.fontSize) || 16)
  const hasMixedFonts = resolveTextStyleRuns(obj).some((run) => run.fontFamily)
  const widthFactor = hasMixedFonts ? 0.72 : 0.62
  const padding = hasMixedFonts ? fontSize * 1.4 : fontSize * 1.0
  const minWidth = Math.max(120, text.length * fontSize * widthFactor + padding)
  const width = Number(obj.width ?? 0)
  if (!Number.isFinite(width) || width + 2 < minWidth) {
    adjustTextboxWidthPreservingOriginInJson(obj, minWidth)
  }
}

function adjustTextboxWidthPreservingOriginInJson(obj: FabricObj, nextWidth: number): void {
  // For template text fields the original placement must stay visually stable.
  // textAlign center/right + originX left: glyphs anchor to box width — changing width
  // without shifting left moves the visual (same as frontend setTextboxWidthPreservingOrigin).
  const originX = String(obj.originX ?? 'left').toLowerCase()
  const originY = String(obj.originY ?? 'top').toLowerCase()
  const oldWidth = Number(obj.width ?? 0)
  const textAlign = String(obj.textAlign ?? 'left').toLowerCase()
  const preservedTop = obj.top
  let nextLeft = obj.left

  if (
    Number.isFinite(oldWidth)
    && oldWidth > 0
    && Number.isFinite(nextWidth)
    && Math.abs(oldWidth - nextWidth) > 0.5
    && originX === 'left'
  ) {
    const left = Number(obj.left ?? 0)
    if (Number.isFinite(left)) {
      if (textAlign === 'center') {
        nextLeft = left + (oldWidth - nextWidth) / 2
      } else if (textAlign === 'right') {
        nextLeft = left + (oldWidth - nextWidth)
      }
    }
  }

  obj.width = nextWidth
  obj.originX = originX
  obj.originY = originY
  if (nextLeft != null) obj.left = nextLeft
  if (preservedTop != null) obj.top = preservedTop
}

/** Подготовка Fabric JSON для production render: mixed-font styles + ширина однострочных textbox. */
export function prepareFabricJsonTextForProduction(fabricJSON: unknown): unknown {
  if (!fabricJSON || typeof fabricJSON !== 'object' || Array.isArray(fabricJSON)) return fabricJSON
  const root = fabricJSON as FabricObj
  walkFabricObjects(root.objects, (obj) => {
    hydrateTextObjectStylesInJson(obj)
    expandSingleLineTextboxWidthInJson(obj)
  })
  return root
}
