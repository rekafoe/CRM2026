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
        {
          type: 'image',
          attrs: {
            src: 'kb-asset://7',
            alt: 'Схема станка',
            alignment: 'center',
            width: 75,
            wrap: 'none',
            caption: 'Панель управления',
          },
        },
        { type: 'image', attrs: { src: 'kb-asset://8/' } },
      ],
    })

    expect(result.plain).toBe('Резка\nОткройте инструкцию\nСхема станка Панель управления')
    expect(JSON.parse(result.json)).toMatchObject({ type: 'doc' })
  })

  it('accepts TipTap 3 default attrs and strips unknown nulls', () => {
    const result = normalizeTipTapContent({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { textAlign: null } },
        {
          type: 'heading',
          attrs: { level: 2, textAlign: null },
          content: [{ type: 'text', text: 'Заголовок' }],
        },
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'echo 1' }],
        },
        {
          type: 'image',
          attrs: {
            src: 'kb-asset://3',
            alt: 'схема',
            title: null,
            height: 240,
            width: 100,
            alignment: 'center',
            wrap: 'none',
            caption: '',
          },
        },
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'ссылка',
            marks: [{
              type: 'link',
              attrs: {
                href: 'https://example.test/docs',
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: null,
                title: null,
              },
            }],
          }],
        },
        {
          type: 'table',
          content: [{
            type: 'tableRow',
            content: [{
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
              content: [{ type: 'paragraph', attrs: { textAlign: null } }],
            }],
          }],
        },
      ],
    })

    const json = JSON.parse(result.json) as { content: Array<Record<string, unknown>> }
    expect(json.content[0]).toEqual({ type: 'paragraph' })
    expect(json.content[1]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    expect((json.content[1] as { attrs?: Record<string, unknown> }).attrs?.textAlign).toBeUndefined()
    expect(json.content[2]).toEqual({
      type: 'codeBlock',
      content: [{ type: 'text', text: 'echo 1' }],
    })
    expect(json.content[3]).toEqual({
      type: 'image',
      attrs: { src: 'kb-asset://3', alt: 'схема', alignment: 'center', width: 100, wrap: 'none' },
    })
    expect(json.content[4]).toMatchObject({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'ссылка',
        marks: [{
          type: 'link',
          attrs: { href: 'https://example.test/docs', target: '_blank', rel: 'noopener noreferrer nofollow' },
        }],
      }],
    })
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
    {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'kb-asset://7', width: 150, wrap: 'around' } }],
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
