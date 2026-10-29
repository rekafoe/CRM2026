import { executorSignerTemplateFields } from '../services/executorSigner'

describe('executor signer', () => {
  it('оставляет основание пустым, если у менеджера его не заполнили', () => {
    expect(executorSignerTemplateFields({ name: 'Иванова Мария', signing_basis: '  ' })).toEqual({
      executorName: 'Иванова Мария',
      executorAuthorityBasis: '',
      executorAuthorizedPerson: 'Иванова Мария',
    })
  })

  it('собирает строку подписи из имени и доверенности', () => {
    expect(
      executorSignerTemplateFields({
        name: 'Иванова Мария',
        signing_basis: 'доверенности № 12 от 01.02.2026',
      }),
    ).toEqual({
      executorName: 'Иванова Мария',
      executorAuthorityBasis: 'доверенности № 12 от 01.02.2026',
      executorAuthorizedPerson: 'Иванова Мария, действует на основании: доверенности № 12 от 01.02.2026',
    })
  })

  it('не подставляет прочерк, если пользователя нет', () => {
    expect(executorSignerTemplateFields(null)).toEqual({
      executorName: '',
      executorAuthorityBasis: '',
      executorAuthorizedPerson: '',
    })
  })
})
