export function executorSignerTemplateFields(source?: {
  name?: string | null;
  name_genitive?: string | null;
  signing_basis?: string | null;
} | null) {
  const executorName = source?.name?.trim() || '';
  const executorNameGenitive = source?.name_genitive?.trim() || '';
  const executorAuthorityBasis = source?.signing_basis?.trim() || '';
  return {
    executorName,
    executorNameGenitive,
    executorAuthorityBasis,
    executorAuthorizedPerson:
      executorName && executorAuthorityBasis
        ? `${executorName}, действует на основании: ${executorAuthorityBasis}`
        : executorName,
  };
}
