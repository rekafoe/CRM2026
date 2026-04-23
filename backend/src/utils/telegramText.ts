/**
 * Текст для Telegram parse_mode: HTML. Имена/размеры с _, *, [] ломают старый Markdown.
 */
export function escapeHtml(s: string | number | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Шаблоны с парами *жирный* (как раньше в Markdown) → HTML, остальное экранируется.
 */
export function starMarkdownToHtml(text: string): string {
  if (text == null || text === '') return ''
  return text.split(/(\*[^*]+\*)/g).map((part) => {
    const m = /^\*([^*]+)\*$/.exec(part)
    if (m) {
      return `<b>${escapeHtml(m[1] ?? '')}</b>`
    }
    return escapeHtml(part)
  }).join('')
}
