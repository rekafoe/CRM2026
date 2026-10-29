import { executorSignerTemplateFields } from '../services/executorSigner'

describe('executor signer', () => {
  it('оставляет основание пустым, если у менеджера его не заполнили', () => {
    expect(executorSignerTemplateFields({ name: 'Иванова Мария', name_genitive: '  ', signing_basis: '  ' })).toEqual({
      executorName: 'Иванова Мария',
      executorNameGenitive: '',
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
      executorNameGenitive: '',
      executorAuthorityBasis: 'доверенности № 12 от 01.02.2026',
      executorAuthorizedPerson: 'Иванова Мария, действует на основании: доверенности № 12 от 01.02.2026',
    })
  })

  it('не подставляет прочерк, если пользователя нет', () => {
    expect(executorSignerTemplateFields(null)).toEqual({
      executorName: '',
      executorNameGenitive: '',
      executorAuthorityBasis: '',
      executorAuthorizedPerson: '',
    })
  })

  it('кладёт родительный падеж отдельно от имени в подписи', () => {
    expect(
      executorSignerTemplateFields({
        name: 'Иванова Мария',
        name_genitive: 'Ивановой Марии',
        signing_basis: 'доверенности № 12 от 01.02.2026',
      }),
    ).toEqual({
      executorName: 'Иванова Мария',
      executorNameGenitive: 'Ивановой Марии',
      executorAuthorityBasis: 'доверенности № 12 от 01.02.2026',
      executorAuthorizedPerson: 'Иванова Мария, действует на основании: доверенности № 12 от 01.02.2026',
    })
  })
})
