export function executorSignerTemplateFields(source?: { name?: string | null; signing_basis?: string | null } | null) {
  const executorName = source?.name?.trim() || '';
  const executorAuthorityBasis = source?.signing_basis?.trim() || '';
  return {
    executorName,
    executorAuthorityBasis,
    executorAuthorizedPerson:
      executorName && executorAuthorityBasis
        ? `${executorName}, действует на основании: ${executorAuthorityBasis}`
        : executorName,
  };
}
