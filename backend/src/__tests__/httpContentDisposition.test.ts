import { OutgoingMessage } from 'http'
import { buildAttachmentContentDisposition } from '../utils/httpContentDisposition'

describe('buildAttachmentContentDisposition', () => {
  it('keeps an ASCII name in filename=', () => {
    expect(buildAttachmentContentDisposition('layout.pdf')).toBe(
      `attachment; filename="layout.pdf"; filename*=UTF-8''layout.pdf`,
    )
  })

  it('puts Cyrillic only in filename* so Node setHeader does not throw', () => {
    const header = buildAttachmentContentDisposition('Макет клиента.pdf')
    expect(header).toMatch(/^attachment; filename="[ -~]+"; filename\*=UTF-8''/)
    expect(decodeURIComponent(header.split("filename*=UTF-8''")[1] || '')).toBe('Макет клиента.pdf')
    expect(/[^\t\x20-\x7E]/.test(header)).toBe(false)
    const res = new OutgoingMessage()
    expect(() => res.setHeader('Content-Disposition', header)).not.toThrow()
  })
})
