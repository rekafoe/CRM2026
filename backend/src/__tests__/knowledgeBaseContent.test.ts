import {
  KnowledgeContentValidationError,
  normalizeTipTapContent,
} from '../modules/knowledge-base/content'

describe('knowledge base TipTap content', () => {
  it('validates supported nodes and extracts searchable plain text', () => {
    const result = normalizeTipTapContent({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Резка', marks: [{ type: 'bold' }] }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Откройте ', marks: [{ type: 'highlight' }] },
            {
              type: 'text',
              text: 'инструкцию',
              marks: [{ type: 'link', attrs: { href: 'https://example.test/manual' } }],
            },
          ],
        },
        { type: 'image', attrs: { src: 'kb-asset://7', alt: 'Схема станка' } },
      ],
    })

    expect(result.plain).toBe('Резка\nОткройте инструкцию\nСхема станка')
    expect(JSON.parse(result.json)).toMatchObject({ type: 'doc' })
  })

  it.each([
    { type: 'doc', content: [{ type: 'script', content: [] }] },
    {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'опасно',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        }],
      }],
    },
    { type: 'doc', content: [{ type: 'image', attrs: { src: 'data:image/png;base64,abc' } }] },
    {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { textAlign: 'left; position: fixed' },
        content: [{ type: 'text', text: 'опасный стиль' }],
      }],
    },
  ])('rejects unsafe or arbitrary content %#', (content) => {
    expect(() => normalizeTipTapContent(content)).toThrow(KnowledgeContentValidationError)
  })

  it('enforces the serialized byte limit', () => {
    expect(() => normalizeTipTapContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'я'.repeat(100) }] }],
    }, 40)).toThrow(/превышает лимит/)
  })
})
