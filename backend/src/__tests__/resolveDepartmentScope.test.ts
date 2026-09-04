import { parsePositiveDepartmentId } from '../utils/resolveDepartmentScope'

describe('parsePositiveDepartmentId', () => {
  it('принимает id точки', () => {
    expect(parsePositiveDepartmentId(3)).toBe(3)
    expect(parsePositiveDepartmentId('12')).toBe(12)
  })

  it('отсекает пустые и невалидные значения', () => {
    expect(parsePositiveDepartmentId(undefined)).toBeUndefined()
    expect(parsePositiveDepartmentId('')).toBeUndefined()
    expect(parsePositiveDepartmentId('null')).toBeUndefined()
    expect(parsePositiveDepartmentId(0)).toBeUndefined()
  })
})
