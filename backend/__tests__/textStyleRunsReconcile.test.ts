/**
 * Дублирует ключевые кейсы frontend textStyleRuns (логика reconcile/build совпадает по контракту).
 * Полный набор — в backend utils + import builder tests.
 */

describe('textStyleRuns reconcile contract', () => {
  function reconcileRunsAfterTextChange(
    oldText: string,
    newText: string,
    runs: Array<{ start: number; end: number; fontFamily?: string }> | undefined,
  ) {
    if (!runs?.length) return runs
    if (oldText === newText) return runs
    const baseFont = runs[0]?.fontFamily
    const secondaryRuns = runs.filter((run, index) => {
      if (index === 0 && run.start === 0) return false
      return run.fontFamily && run.fontFamily !== baseFont
    })
    if (!secondaryRuns.length) return undefined
    const lastRun = secondaryRuns[secondaryRuns.length - 1]!
    const oldSlice = oldText.slice(lastRun.start, lastRun.end)
    if (!oldSlice) return undefined
    const wasSuffix = lastRun.end >= oldText.trimEnd().length
    let newStart = newText.lastIndexOf(oldSlice)
    if (newStart < 0 && oldSlice.trim()) {
      newStart = newText.lastIndexOf(oldSlice.trim())
    }
    let newEnd = newStart >= 0 ? newStart + oldSlice.length : -1
    if (newStart < 0 && wasSuffix) {
      const lastSpace = newText.lastIndexOf(' ')
      newStart = lastSpace >= 0 ? lastSpace + 1 : 0
      newEnd = newText.length
    }
    if (newStart < 0 || newEnd < 0) return undefined
    const next = []
    const first = runs[0]
    if (first && first.start === 0) {
      next.push({ ...first, end: Math.min(first.end, newStart > 0 ? newStart : newEnd) })
    }
    next.push({ ...lastRun, start: newStart, end: newEnd })
    return next.length > 0 ? next : undefined
  }

  it('сохраняет альтернативный хвост при замене слова', () => {
    const newText = 'Что я в тебе обожаю'
    const runs = reconcileRunsAfterTextChange(
      'Что я в тебе люблю',
      newText,
      [
        { start: 0, end: 13, fontFamily: 'Voguella' },
        { start: 13, end: 18, fontFamily: 'Ceremonious One' },
      ],
    )
    const alt = runs?.find((r) => r.fontFamily === 'Ceremonious One')
    expect(alt?.start).toBe(newText.lastIndexOf('обожаю'))
    expect(alt?.end).toBe(newText.length)
  })
})
