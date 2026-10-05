import { earningsBase, roleEarnings, splitPositionPercents } from '../services/earningsRoleSplit'

describe('splitPositionPercents', () => {
  it('фонд 20% даёт контактёру 1, ответственному 5, исполнителю 14', () => {
    expect(splitPositionPercents({
      positionPercent: 20,
      contactPercent: 1,
      responsiblePercent: 5,
    })).toEqual({ contact: 1, responsible: 5, executor: 14 })
  })

  it('фонд 15% даёт исполнителю 9', () => {
    expect(splitPositionPercents({
      positionPercent: 15,
      contactPercent: 1,
      responsiblePercent: 5,
    }).executor).toBe(9)
  })

  it('фонд меньше 6% обнуляет только исполнителя', () => {
    expect(splitPositionPercents({
      positionPercent: 4,
      contactPercent: 1,
      responsiblePercent: 5,
    })).toEqual({ contact: 1, responsible: 5, executor: 0 })
  })
})

describe('roleEarnings', () => {
  it('считает деньги с базы после расходов', () => {
    expect(earningsBase(100, 0, 20)).toBe(80)
    const rows = roleEarnings({
      base: 80,
      positionPercent: 20,
      contactPercent: 1,
      responsiblePercent: 5,
      contactUserId: 1,
      responsibleUserId: 2,
      executorUserId: 3,
    })
    expect(rows.map((row) => [row.role, row.amount])).toEqual([
      ['contact', 0.8],
      ['responsible', 4],
      ['operator', 11.2],
    ])
  })

  it('позиция 50 при фонде 20% даёт 0,5 / 2,5 / 7', () => {
    const rows = roleEarnings({
      base: 50,
      positionPercent: 20,
      contactPercent: 1,
      responsiblePercent: 5,
      contactUserId: 1,
      responsibleUserId: 2,
      executorUserId: 3,
    })
    expect(rows.map((row) => row.amount)).toEqual([0.5, 2.5, 7])
  })

  it('без контактёра его доля не переходит исполнителю', () => {
    const rows = roleEarnings({
      base: 100,
      positionPercent: 20,
      contactPercent: 1,
      responsiblePercent: 5,
      contactUserId: null,
      responsibleUserId: 2,
      executorUserId: 3,
    })
    expect(rows.find((row) => row.role === 'operator')?.percent).toBe(14)
    expect(rows.find((row) => row.role === 'contact')).toBeUndefined()
  })

  it('один человек получает обе роли отдельными строками', () => {
    const rows = roleEarnings({
      base: 100,
      positionPercent: 20,
      contactPercent: 1,
      responsiblePercent: 5,
      contactUserId: 7,
      responsibleUserId: 7,
      executorUserId: 7,
    })
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.userId === 7)).toBe(true)
  })

  it('плата за макет не входит в базу', () => {
    expect(earningsBase(100, 15, 0)).toBe(85)
  })
})
