/**
 * Подстановка плейсхолдеров {{key}} в шаблонах писем.
 */
export function renderEmailTemplate(
  template: string,
  vars: Record<string, string>
): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null) return '';
    return String(v);
  });
}
