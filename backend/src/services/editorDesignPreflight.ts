import {
  checkTextSceneBoxOverflow,
  designPageBoundsFromDesignState,
  estimateTextSceneBox,
} from './editorDesignTextBounds'
import { assertMultipagePagesConsistency } from '../utils/multipagePagesConsistency'
import { hasBlobUrl } from '../utils/fabricJsonValidation'

export type EditorPreflightIssueLevel = 'error' | 'warning'

export interface EditorPreflightIssue {
  id: string
  level: EditorPreflightIssueLevel
  message: string
  pageIndex: number
}

export interface EditorPreflightSummary {
  issues: EditorPreflightIssue[]
  hasBlockingIssues: boolean
  photoReady: number
  photoTotal: number
  textReady: number
  textTotal: number
}

type FabricJsonObject = Record<string, unknown>

const PLACEHOLDER_TEXTS = new Set([
  'текст',
  'ваш текст',
  'your text',
  'имя',
  'телефон',
  'email',
  'заголовок',
  'описание',
  'введите текст',
  'введите текст...',
])

function isRecord(value: unknown): value is FabricJsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function walkFabricObjects(value: unknown, visit: (obj: FabricJsonObject) => void): void {
  if (!isRecord(value)) return
  visit(value)
  for (const key of ['objects', '_objects']) {
    const children = value[key]
    if (Array.isArray(children)) children.forEach((child) => walkFabricObjects(child, visit))
  }
  walkFabricObjects(value.clipPath, visit)
}

function isTextObject(obj: FabricJsonObject): boolean {
  const type = String(obj.type ?? '').toLowerCase()
  return type === 'i-text' || type === 'itext' || type === 'textbox' || type === 'text'
}

function isPlaceholderText(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  return PLACEHOLDER_TEXTS.has(normalized) || normalized.includes('placeholder')
}

export type DesignStatePreflightContext = {
  editorDraftMode?: string | null;
  orderPages?: number | null;
};

export function analyzeDesignStatePreflight(
  designState: unknown,
  context?: DesignStatePreflightContext,
): EditorPreflightSummary {
  const state = isRecord(designState) ? designState : {}
  const pages = Array.isArray(state.pages) ? state.pages : []
  const pageBounds = designPageBoundsFromDesignState(state)
  const issues: EditorPreflightIssue[] = []
  let photoReady = 0
  let photoTotal = 0
  let textReady = 0
  let textTotal = 0

  pages.forEach((page, pageIndex) => {
    const fabricJSON = isRecord(page) ? page.fabricJSON ?? page : page
    walkFabricObjects(fabricJSON, (obj) => {
      if (obj.isPhotoField === true) {
        photoTotal += 1
        const filled = obj.photoFieldFilled === true
        const fieldWidth = Number(obj.photoFieldFw ?? obj.width ?? 0)
        const fieldHeight = Number(obj.photoFieldFh ?? obj.height ?? 0)
        const intrinsicWidth = Number(obj.photoFieldIntrinsicW ?? 0)
        const intrinsicHeight = Number(obj.photoFieldIntrinsicH ?? 0)
        const lowQuality = filled &&
          fieldWidth > 0 &&
          fieldHeight > 0 &&
          intrinsicWidth > 0 &&
          intrinsicHeight > 0 &&
          (intrinsicWidth < fieldWidth * 1.5 || intrinsicHeight < fieldHeight * 1.5)
        if (filled && !lowQuality) photoReady += 1
        if (!filled) {
          issues.push({
            id: `photo-${String(obj.id ?? pageIndex)}`,
            level: 'error',
            pageIndex,
            message: `Страница ${pageIndex + 1}: не заполнено фото-поле`,
          })
        } else if (lowQuality) {
          issues.push({
            id: `photo-quality-${String(obj.id ?? pageIndex)}`,
            level: 'warning',
            pageIndex,
            message: `Страница ${pageIndex + 1}: фото может быть низкого качества для печати`,
          })
        }
      }

      if (isTextObject(obj)) {
        textTotal += 1
        const text = String(obj.text ?? '').trim()
        const placeholder = isPlaceholderText(text)
        const empty = text.length === 0
        if (!empty && !placeholder) textReady += 1
        if (empty || placeholder) {
          issues.push({
            id: `text-${pageIndex}-${textTotal}`,
            level: 'error',
            pageIndex,
            message: `Страница ${pageIndex + 1}: ${
              empty ? 'есть пустой текст' : 'текст не изменён (осталась шаблонная надпись)'
            }`,
          })
        } else if (pageBounds) {
          const box = estimateTextSceneBox(obj)
          if (box) {
            const overflow = checkTextSceneBoxOverflow(box, pageBounds)
            const fieldId = String(obj.id ?? pageIndex)
            if (overflow.outsidePage) {
              issues.push({
                id: `text-overflow-page-${fieldId}`,
                level: 'warning',
                pageIndex,
                message: `Страница ${pageIndex + 1}: текст выходит за край макета`,
              })
            } else if (overflow.outsideSafeZone) {
              issues.push({
                id: `text-overflow-safe-${fieldId}`,
                level: 'warning',
                pageIndex,
                message: `Страница ${pageIndex + 1}: текст за пределами безопасной зоны`,
              })
            }
          }
        }
      }
    })

    if (hasBlobUrl(fabricJSON)) {
      issues.push({
        id: `blob-${pageIndex}`,
        level: 'error',
        pageIndex,
        message: `Страница ${pageIndex + 1}: временный blob URL — загрузите файл в draft`,
      })
    }
  })

  const pagesCheck = assertMultipagePagesConsistency({
    strict: false,
    editorDraftMode: context?.editorDraftMode ?? null,
    orderPages: context?.orderPages ?? null,
    designState,
  })
  if (!pagesCheck.ok && pagesCheck.message) {
    issues.push({
      id: 'multipage-pages-mismatch',
      level: 'warning',
      pageIndex: 0,
      message: pagesCheck.message,
    })
  }

  return {
    issues,
    hasBlockingIssues: issues.some((issue) => issue.level === 'error'),
    photoReady,
    photoTotal,
    textReady,
    textTotal,
  }
}

export function buildLayoutReviewPath(orderItemId: number): string {
  return `order-pool:item:${orderItemId}`
}
