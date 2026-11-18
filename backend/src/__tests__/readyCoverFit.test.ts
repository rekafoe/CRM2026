import {
  blockSheetCount,
  blockThicknessMm,
  pickChannel,
  readyLidThicknessMm,
  READY_LID_CHANNELS_PER_ITEM,
  READY_LID_COVERS_PER_ITEM,
} from '../modules/pricing/services/readyCoverFit'

describe('readyCoverFit', () => {
  it('толщина блока — листы на эталон плотности, плюс два корешка', () => {
    expect(blockSheetCount(100, 2)).toBe(50)
    expect(blockSheetCount(100, 1)).toBe(100)
    expect(blockThicknessMm(50, 0.1)).toBeCloseTo(5)
    expect(readyLidThicknessMm(50, 0.1, 0.4)).toBeCloseTo(5.8)
    expect(READY_LID_COVERS_PER_ITEM).toBe(2)
    expect(READY_LID_CHANNELS_PER_ITEM).toBe(1)
  })

  it('канал берётся по диапазону от–до, при нескольких — самый узкий', () => {
    const wide = { id: 1, channel_min_mm: 0, channel_max_mm: 20, name: 'широкий' }
    const fit = { id: 2, channel_min_mm: 5, channel_max_mm: 8, name: 'средний' }
    const other = { id: 3, channel_min_mm: 8, channel_max_mm: 12, name: 'толстый' }
    expect(pickChannel([wide, other, fit], 5.8)?.id).toBe(2)
    expect(pickChannel([wide, fit], 3)?.id).toBe(1)
    expect(pickChannel([other], 5.8)).toBeNull()
    expect(pickChannel([fit], 0)).toBeNull()
  })
})
