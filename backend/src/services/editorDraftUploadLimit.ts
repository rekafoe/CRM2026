import { EDITOR_DRAFT_MAX_FILE_BYTES } from '../config/upload'

export class EditorDraftFileTooLargeError extends Error {
  readonly status = 413

  constructor(message: string) {
    super(message)
    this.name = 'EditorDraftFileTooLargeError'
  }
}

export function formatEditorDraftMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (!Number.isFinite(mb) || mb <= 0) return '0 МБ'
  const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10
  return `${rounded} МБ`
}

export function editorDraftFileTooLargeMessage(fileName: string, sizeBytes: number): string {
  const name = fileName.trim() || 'фото'
  const limit = formatEditorDraftMegabytes(EDITOR_DRAFT_MAX_FILE_BYTES)
  return `«${name}» весит ${formatEditorDraftMegabytes(sizeBytes)}. В редактор можно загрузить один файл до ${limit}.`
}
