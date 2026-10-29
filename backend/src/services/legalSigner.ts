export type LegalSignerSource = {
  authorized_person?: string | null
  signer_position?: string | null
  signer_position_genitive?: string | null
  signer_name?: string | null
  signer_name_genitive?: string | null
  authority_basis?: string | null
}

export type ResolvedLegalSigner = {
  authorizedPerson: string
  signerPosition: string
  signerPositionGenitive: string
  signerName: string
  signerNameGenitive: string
  authorityBasis: string
}

const LEGACY_AUTHORIZED_PERSON = /^(.+?),\s*действует на основании:\s*(.+)$/iu

function clean(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Старые карточки хранят «ФИО, действует на основании: Устава» одной строкой. */
export function parseLegacyAuthorizedPerson(value?: string | null): { name: string; basis: string } {
  const text = clean(value)
  if (!text) return { name: '', basis: '' }
  const match = LEGACY_AUTHORIZED_PERSON.exec(text)
  if (!match) return { name: text, basis: '' }
  return { name: match[1].trim(), basis: match[2].trim() }
}

export function resolveLegalSigner(source: LegalSignerSource): ResolvedLegalSigner {
  const legacy = parseLegacyAuthorizedPerson(source.authorized_person)
  const signerName = clean(source.signer_name) || legacy.name
  const authorityBasis = clean(source.authority_basis) || legacy.basis
  const authorizedPerson =
    signerName && authorityBasis
      ? `${signerName}, действует на основании: ${authorityBasis}`
      : clean(source.authorized_person) || signerName

  return {
    authorizedPerson,
    signerPosition: clean(source.signer_position),
    signerPositionGenitive: clean(source.signer_position_genitive),
    signerName,
    signerNameGenitive: clean(source.signer_name_genitive),
    authorityBasis,
  }
}

export function legalSignerTemplateFields(source: LegalSignerSource, empty = '—') {
  const resolved = resolveLegalSigner(source)
  const fill = (value: string) => value || empty
  return {
    authorizedPerson: fill(resolved.authorizedPerson),
    signerPosition: fill(resolved.signerPosition),
    signerPositionGenitive: fill(resolved.signerPositionGenitive),
    signerName: fill(resolved.signerName),
    signerNameGenitive: fill(resolved.signerNameGenitive),
    authorityBasis: fill(resolved.authorityBasis),
  }
}
