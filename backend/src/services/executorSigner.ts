export type ExecutorSignerSource = {
  name?: string | null
  name_genitive?: string | null
  signing_basis?: string | null
}

function clean(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function positiveUserId(value: unknown): number | null {
  if (typeof value === 'boolean' || value == null) return null
  const raw = typeof value === 'string' ? value.trim() : value
  if (raw === '') return null
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

/**
 * Кто подписывает акт, счёт и договор.
 * Закреплённый за юрлицом менеджер важнее пользователя, который нажал «сформировать».
 */
export function documentExecutorUserId(managerUserId: unknown, requestUserId: unknown): number | null {
  return positiveUserId(managerUserId) ?? positiveUserId(requestUserId)
}

/**
 * Подписант со стороны исполнителя.
 * Основание необязательное: пустая доверенность не подставляется в шаблон.
 */
export function executorSignerTemplateFields(source?: ExecutorSignerSource | null) {
  const executorName = clean(source?.name)
  const executorNameGenitive = clean(source?.name_genitive)
  const executorAuthorityBasis = clean(source?.signing_basis)
  const executorAuthorizedPerson =
    executorName && executorAuthorityBasis
      ? `${executorName}, действует на основании: ${executorAuthorityBasis}`
      : executorName

  return {
    executorName,
    executorNameGenitive,
    executorAuthorityBasis,
    executorAuthorizedPerson,
  }
}
