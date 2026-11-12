import { effectiveEarningsUserId } from '../services/earningsEffectiveUserId'
import { roleEarnings } from '../services/earningsRoleSplit'

describe('effectiveEarningsUserId + roleEarnings', () => {
  it('website/pool claim without item executor still pays operator remainder to responsible', () => {
    const row = {
      userId: 10,
      executorUserId: null,
      responsibleUserId: 10,
      orderSource: 'website',
    }
    const executorUserId = effectiveEarningsUserId(row)
    expect(executorUserId).toBe(10)

    const shares = roleEarnings({
      base: 100,
      positionPercent: 20,
      contactPercent: 1,
      responsiblePercent: 5,
      contactUserId: null,
      responsibleUserId: 10,
      executorUserId,
    })
    expect(shares.map((share) => [share.role, share.userId, share.percent])).toEqual([
      ['responsible', 10, 5],
      ['operator', 10, 14],
    ])
  })

  it('untaken website order does not invent an operator', () => {
    expect(
      effectiveEarningsUserId({
        userId: null,
        executorUserId: null,
        responsibleUserId: 5,
        orderSource: 'website',
      }),
    ).toBeNull()
  })

  it('explicit item executor wins over responsible', () => {
    expect(
      effectiveEarningsUserId({
        userId: 1,
        executorUserId: 9,
        responsibleUserId: 2,
        orderSource: 'crm',
      }),
    ).toBe(9)
  })
})
