export type LegalSignerSource = {
  authorized_person?: string | null;
  signer_position?: string | null;
  signer_position_genitive?: string | null;
  signer_name?: string | null;
  signer_name_genitive?: string | null;
  authority_basis?: string | null;
};

export type CustomerLegalFormState = {
  bank_details: string;
  authorized_person: string;
  signer_position: string;
  signer_position_genitive: string;
  signer_name: string;
  signer_name_genitive: string;
  authority_basis: string;
  manager_user_id: number | null;
};

const LEGACY_AUTHORIZED_PERSON = /^(.+?),\s*действует на основании:\s*(.+)$/iu;

function clean(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseLegacyAuthorizedPerson(value?: string | null): { name: string; basis: string } {
  const text = clean(value);
  if (!text) return { name: '', basis: '' };
  const match = LEGACY_AUTHORIZED_PERSON.exec(text);
  if (!match) return { name: text, basis: '' };
  return { name: match[1].trim(), basis: match[2].trim() };
}

export function resolveLegalSigner(source: LegalSignerSource) {
  const legacy = parseLegacyAuthorizedPerson(source.authorized_person);
  const signerName = clean(source.signer_name) || legacy.name;
  const authorityBasis = clean(source.authority_basis) || legacy.basis;
  const authorizedPerson =
    signerName && authorityBasis
      ? `${signerName}, действует на основании: ${authorityBasis}`
      : clean(source.authorized_person) || signerName;

  return {
    authorizedPerson,
    signerPosition: clean(source.signer_position),
    signerPositionGenitive: clean(source.signer_position_genitive),
    signerName,
    signerNameGenitive: clean(source.signer_name_genitive),
    authorityBasis,
  };
}

export function legalSignerTemplateFields(source: LegalSignerSource, empty = '—') {
  const resolved = resolveLegalSigner(source);
  const fill = (value: string) => value || empty;
  return {
    authorizedPerson: fill(resolved.authorizedPerson),
    signerPosition: fill(resolved.signerPosition),
    signerPositionGenitive: fill(resolved.signerPositionGenitive),
    signerName: fill(resolved.signerName),
    signerNameGenitive: fill(resolved.signerNameGenitive),
    authorityBasis: fill(resolved.authorityBasis),
  };
}

export function emptyLegalForm(): CustomerLegalFormState {
  return {
    bank_details: '',
    authorized_person: '',
    signer_position: '',
    signer_position_genitive: '',
    signer_name: '',
    signer_name_genitive: '',
    authority_basis: '',
    manager_user_id: null,
  };
}

export function legalFormFromCustomer(
  customer: LegalSignerSource & { bank_details?: string | null; manager_user_id?: number | null },
): CustomerLegalFormState {
  const parsed = parseLegacyAuthorizedPerson(customer.authorized_person);
  return {
    bank_details: customer.bank_details || '',
    authorized_person: customer.authorized_person || '',
    signer_position: customer.signer_position || '',
    signer_position_genitive: customer.signer_position_genitive || '',
    signer_name: customer.signer_name || parsed.name,
    signer_name_genitive: customer.signer_name_genitive || '',
    authority_basis: customer.authority_basis || parsed.basis,
    manager_user_id: customer.manager_user_id && customer.manager_user_id > 0 ? customer.manager_user_id : null,
  };
}

/** Поля формы — источник истины. Строка для старых шаблонов собирается из ФИО и основания. */
export function persistableLegalDetails(form: CustomerLegalFormState) {
  const signerName = form.signer_name.trim();
  const authorityBasis = form.authority_basis.trim();
  return {
    bank_details: form.bank_details.trim(),
    authorized_person:
      signerName && authorityBasis
        ? `${signerName}, действует на основании: ${authorityBasis}`
        : signerName,
    signer_position: form.signer_position.trim(),
    signer_position_genitive: form.signer_position_genitive.trim(),
    signer_name: signerName,
    signer_name_genitive: form.signer_name_genitive.trim(),
    authority_basis: authorityBasis,
    manager_user_id: form.manager_user_id && form.manager_user_id > 0 ? form.manager_user_id : null,
  };
}

export function signerPreview(form: CustomerLegalFormState): string {
  const position = form.signer_position_genitive.trim() || '…';
  const name = form.signer_name_genitive.trim() || '…';
  const basis = form.authority_basis.trim() || '…';
  const signature = [form.signer_position.trim(), form.signer_name.trim()].filter(Boolean).join(' ') || '…';
  return `В договоре: в лице ${position} ${name}, на основании ${basis}. В подписи: ${signature}.`;
}
