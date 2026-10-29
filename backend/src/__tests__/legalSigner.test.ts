import { legalSignerTemplateFields, parseLegacyAuthorizedPerson, resolveLegalSigner } from '../services/legalSigner'

describe('legal signer fields', () => {
  it('разбирает старую строку уполномоченного лица', () => {
    expect(parseLegacyAuthorizedPerson('Иванов Иван Иванович, действует на основании: Устава')).toEqual({
      name: 'Иванов Иван Иванович',
      basis: 'Устава',
    })
    expect(parseLegacyAuthorizedPerson('просто текст')).toEqual({ name: 'просто текст', basis: '' })
  })

  it('берёт отдельные поля и собирает строку для старого шаблона', () => {
    const resolved = resolveLegalSigner({
      authorized_person: 'старое значение',
      signer_position: ' Директор ',
      signer_position_genitive: 'директора',
      signer_name: 'Иванов Иван Иванович',
      signer_name_genitive: 'Иванова Ивана Ивановича',
      authority_basis: 'Устава',
    })
    expect(resolved).toMatchObject({
      signerPosition: 'Директор',
      signerPositionGenitive: 'директора',
      signerName: 'Иванов Иван Иванович',
      signerNameGenitive: 'Иванова Ивана Ивановича',
      authorityBasis: 'Устава',
      authorizedPerson: 'Иванов Иван Иванович, действует на основании: Устава',
    })
  })

  it('подставляет ФИО и основание из старой строки, если отдельных колонок нет', () => {
    const fields = legalSignerTemplateFields({
      authorized_person: 'Иванов Иван Иванович, действует на основании: доверенности № 5',
    })
    expect(fields.signerName).toBe('Иванов Иван Иванович')
    expect(fields.authorityBasis).toBe('доверенности № 5')
    expect(fields.signerPosition).toBe('—')
    expect(fields.signerNameGenitive).toBe('—')
    expect(fields.authorizedPerson).toBe('Иванов Иван Иванович, действует на основании: доверенности № 5')
  })
})
