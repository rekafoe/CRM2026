import {
  collectUniqueEditorDraftTokens,
  type PreparedEditorDraftItem,
} from '../services/editorDraftWebsitePrepare'

describe('collectUniqueEditorDraftTokens', () => {
  it('dedupes tokens across layout slots and items', () => {
    const items: PreparedEditorDraftItem[] = [
      { index: 0, tokens: ['tok-a', 'tok-b'] },
      { index: 1, tokens: ['tok-b', 'tok-c'] },
      { index: 2, tokens: [''] },
    ]
    expect(collectUniqueEditorDraftTokens(items)).toEqual(['tok-a', 'tok-b', 'tok-c'])
  })

  it('returns empty for no drafts', () => {
    expect(collectUniqueEditorDraftTokens([])).toEqual([])
  })
})
