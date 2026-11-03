/** Второй PDF CRM: то же имя, суффикс `_crm` перед `.pdf`. */
export function crmMarkedPdfFilename(filename: string): string {
  if (/\.pdf$/i.test(filename)) return filename.replace(/\.pdf$/i, '_crm.pdf')
  return `${filename}_crm`
}
