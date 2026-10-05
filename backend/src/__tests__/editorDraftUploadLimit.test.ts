import { editorDraftFileTooLargeMessage } from '../services/editorDraftUploadLimit'
import { EDITOR_DRAFT_MAX_FILE_BYTES } from '../config/upload'

describe('editor draft photo size', () => {
  it('names the file and the default 100 MB limit', () => {
    expect(EDITOR_DRAFT_MAX_FILE_BYTES).toBe(100 * 1024 * 1024)
    expect(editorDraftFileTooLargeMessage('sunset.tif', 140 * 1024 * 1024)).toBe(
      '«sunset.tif» весит 140 МБ. В редактор можно загрузить один файл до 100 МБ.',
    )
  })
})