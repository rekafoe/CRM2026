import { NormalizedContent } from './types'

export const MAX_ARTICLE_CONTENT_BYTES = 512 * 1024
export const MAX_DISCUSSION_CONTENT_BYTES = 64 * 1024

const allowedNodeTypes = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'image',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
])

const allowedMarkTypes = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
  'highlight',
])

const blockNodeTypes = new Set([
  'paragraph',
  'heading',
  'listItem',
  'taskItem',
  'blockquote',
  'codeBlock',
  'tableRow',
  'horizontalRule',
])

const safeLinkProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const safeImageProtocols = new Set(['http:', 'https:'])
const allowedTextAlign = new Set(['left', 'center', 'right', 'justify'])
const allowedAttrsByNode: Record<string, Set<string>> = {
  paragraph: new Set(['textAlign']),
  heading: new Set(['level', 'textAlign']),
  image: new Set(['src', 'alt', 'title', 'alignment', 'width', 'wrap', 'caption']),
  orderedList: new Set(['start', 'type']),
  taskItem: new Set(['checked']),
  tableHeader: new Set(['colspan', 'rowspan', 'colwidth']),
  tableCell: new Set(['colspan', 'rowspan', 'colwidth']),
}

export class KnowledgeContentValidationError extends Error {
  status = 400
  code = 'INVALID_KNOWLEDGE_CONTENT'

  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function fail(message: string): never {
  throw new KnowledgeContentValidationError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertSafeUrl(value: unknown, kind: 'link' | 'image'): void {
  if (typeof value !== 'string' || value.length > 2048) fail('Некорректный URL в содержимом')
  const trimmed = value.trim()
  if (!trimmed) fail('Пустой URL в содержимом')
  if (kind === 'image' && /^kb-asset:(?:\/\/)?\/?[1-9]\d*\/?$/i.test(trimmed)) return
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    fail('Некорректный URL в содержимом')
  }
  const protocols = kind === 'link' ? safeLinkProtocols : safeImageProtocols
  if (!protocols.has(parsed!.protocol.toLowerCase())) {
    fail(`Недопустимый протокол ${kind === 'link' ? 'ссылки' : 'изображения'}`)
  }
}

function validateAttrs(nodeType: string, attrs: unknown): void {
  if (attrs == null) return
  if (!isRecord(attrs)) fail('Атрибуты узла должны быть объектом')

  if (nodeType === 'heading' && attrs.level != null) {
    const level = Number(attrs.level)
    if (!Number.isInteger(level) || level < 1 || level > 6) fail('Некорректный уровень заголовка')
  }
  if (nodeType === 'image') assertSafeUrl(attrs.src, 'image')

  const allowedAttrs = allowedAttrsByNode[nodeType] ?? new Set<string>()
  for (const [key, value] of Object.entries(attrs)) {
    if (!allowedAttrs.has(key)) fail(`Недопустимый атрибут ${key} узла ${nodeType}`)
    if (key.toLowerCase().startsWith('on')) fail('Обработчики событий запрещены')
    if (typeof value === 'string' && value.length > 4096) fail('Слишком длинный атрибут узла')
    if (key === 'style' || key === 'innerHTML' || key === 'html') fail('HTML и произвольные стили запрещены')
    if (key === 'textAlign' && value != null && !allowedTextAlign.has(String(value))) {
      fail('Некорректное выравнивание текста')
    }
    if ((key === 'alt' || key === 'title') && value != null && typeof value !== 'string') {
      fail(`Атрибут ${key} изображения должен быть строкой`)
    }
    if (key === 'alignment' && value != null && !['left', 'center', 'right'].includes(String(value))) {
      fail('Некорректное выравнивание изображения')
    }
    if (key === 'wrap' && value != null && !['none', 'left', 'right'].includes(String(value))) {
      fail('Некорректное обтекание изображения')
    }
    if (key === 'width' && value != null) {
      const width = Number(value)
      if (!Number.isFinite(width) || width < 20 || width > 100) fail('Некорректная ширина изображения')
    }
    if (key === 'caption' && value != null) {
      if (typeof value !== 'string' || value.length > 500) fail('Некорректная подпись изображения')
    }
    if (key === 'checked' && typeof value !== 'boolean') fail('Некорректное состояние пункта задачи')
    if ((key === 'colspan' || key === 'rowspan' || key === 'start') && value != null) {
      const number = Number(value)
      if (!Number.isInteger(number) || number < 1 || number > 1000) fail(`Некорректный атрибут ${key}`)
    }
    if (key === 'colwidth' && value != null) {
      if (!Array.isArray(value)
        || value.length > 100
        || value.some((width) => !Number.isInteger(Number(width)) || Number(width) < 1 || Number(width) > 10000)) {
        fail('Некорректная ширина столбца')
      }
    }
  }
}

function validateMarks(marks: unknown): void {
  if (marks == null) return
  if (!Array.isArray(marks)) fail('Список форматирования должен быть массивом')
  if (marks.length > 20) fail('Слишком много отметок форматирования')
  for (const mark of marks) {
    if (!isRecord(mark) || typeof mark.type !== 'string' || !allowedMarkTypes.has(mark.type)) {
      fail('Недопустимый тип форматирования')
    }
    if (mark.type === 'link') {
      const attrs = mark.attrs
      if (!isRecord(attrs)) fail('У ссылки отсутствуют атрибуты')
      assertSafeUrl(attrs.href, 'link')
      const allowedLinkAttrs = new Set(['href', 'target', 'rel', 'class'])
      for (const [key, value] of Object.entries(attrs)) {
        if (!allowedLinkAttrs.has(key)) fail('Недопустимый атрибут ссылки')
        if (key.toLowerCase().startsWith('on') || key === 'style' || key === 'html') {
          fail('Недопустимый атрибут ссылки')
        }
        if (key === 'target' && value != null && value !== '_blank' && value !== '_self') {
          fail('Недопустимая цель ссылки')
        }
        if ((key === 'rel' || key === 'class') && value != null && typeof value !== 'string') {
          fail('Некорректный атрибут ссылки')
        }
      }
    }
  }
}

function validateNode(
  node: unknown,
  depth: number,
  counters: { nodes: number; textBytes: number },
): void {
  if (!isRecord(node)) fail('Узел содержимого должен быть объектом')
  if (depth > 64) fail('Содержимое имеет слишком большую глубину')
  if (++counters.nodes > 10_000) fail('Содержимое содержит слишком много узлов')

  const type = node.type
  if (typeof type !== 'string' || !allowedNodeTypes.has(type)) {
    fail(`Недопустимый тип узла: ${String(type || 'не указан')}`)
  }
  if (type === 'text') {
    if (typeof node.text !== 'string') fail('Текстовый узел не содержит текст')
    counters.textBytes += Buffer.byteLength(node.text, 'utf8')
  } else if (node.text != null) {
    fail('Поле text разрешено только текстовому узлу')
  }

  validateAttrs(type, node.attrs)
  validateMarks(node.marks)

  if (node.content != null) {
    if (!Array.isArray(node.content)) fail('Дочерние узлы должны быть массивом')
    for (const child of node.content) validateNode(child, depth + 1, counters)
  }
}

function extractPlainText(root: Record<string, unknown>): string {
  const parts: string[] = []
  const walk = (node: Record<string, unknown>) => {
    const type = String(node.type || '')
    if (type === 'text' && typeof node.text === 'string') parts.push(node.text)
    if (type === 'hardBreak') parts.push('\n')
    if (type === 'image' && isRecord(node.attrs) && typeof node.attrs.alt === 'string') {
      parts.push(node.attrs.alt)
    }
    if (type === 'image' && isRecord(node.attrs) && typeof node.attrs.caption === 'string') {
      parts.push(` ${node.attrs.caption}`)
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child as Record<string, unknown>)
    }
    if (blockNodeTypes.has(type)) parts.push('\n')
  }
  walk(root)
  return parts
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeTipTapContent(
  value: unknown,
  maxBytes = MAX_ARTICLE_CONTENT_BYTES,
): NormalizedContent {
  if (!isRecord(value)) fail('TipTap contentJson должен быть JSON-объектом')
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    fail('Содержимое не сериализуется в JSON')
  }
  if (Buffer.byteLength(json, 'utf8') > maxBytes) {
    fail(`Содержимое превышает лимит ${maxBytes} байт`)
  }
  if (value.type !== 'doc') fail('Корневой узел TipTap должен иметь тип doc')
  validateNode(value, 0, { nodes: 0, textBytes: 0 })
  return { value, json, plain: extractPlainText(value) }
}
