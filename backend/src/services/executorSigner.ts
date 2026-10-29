export type ExecutorSignerSource = {
  name?: string | null
  signing_basis?: string | null
}

function clean(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Подписант со стороны исполнителя — пользователь CRM, который формирует документ.
 * Основание необязательное: пустая доверенность не подставляется в шаблон.
 */
export function executorSignerTemplateFields(source?: ExecutorSignerSource | null) {
  const executorName = clean(source?.name)
  const executorAuthorityBasis = clean(source?.signing_basis)
  const executorAuthorizedPerson =
    executorName && executorAuthorityBasis
      ? `${executorName}, действует на основании: ${executorAuthorityBasis}`
      : executorName

  return {
    executorName,
    executorAuthorityBasis,
    executorAuthorizedPerson,
  }
}
