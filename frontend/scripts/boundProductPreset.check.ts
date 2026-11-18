import assert from 'node:assert/strict'
import {
  WRAP_BOARDS_PER_ITEM,
  applyReadyCover,
  applySheetBlock,
  applySheetNotebookState,
  coverPrintChoiceToSides,
  describeOperatorView,
  pickChannel,
  readyLidThicknessMm,
  springBlockPages,
  springPagesPreset,
  springTotalPages,
} from '../src/utils/boundProductPreset.ts'

assert.equal(springBlockPages(50), 100)
assert.equal(springTotalPages(50), 102)
assert.equal(coverPrintChoiceToSides('outside'), 'single')
assert.equal(coverPrintChoiceToSides('both'), 'duplex')

const spring = applySheetBlock(undefined, 50)
assert.equal(spring.coverChoice, 'printed')
assert.equal(spring.notebook?.use_sheets, true)
assert.equal(spring.cover?.mode, 'separate')
assert.equal(spring.cover?.page_count, 2)
assert.equal(spring.cover?.print?.sides_mode, 'single')
assert.equal(spring.innerBlock?.print?.sides_mode, 'duplex')
assert.deepEqual(springPagesPreset(50).options, [102])

const saved = applySheetNotebookState(
  {
    multiPageStructure: { coverChoice: 'printed' as const },
    pages: { options: [16], default: 16 },
    typeConfigs: { '7': { pages: { options: [16], default: 16 } } },
  },
  spring,
  7,
)
assert.equal(saved.multiPageStructure?.notebook?.use_sheets, true)
assert.equal(saved.typeConfigs?.['7']?.pages?.default, 102)
assert.deepEqual(saved.typeConfigs?.['7']?.pages?.options, [102])

const springView = describeOperatorView(spring)
assert.equal(springView.showSheets, true)
assert.equal(springView.showCoverPrint, true)
assert.equal(springView.hidePages, true)
assert.equal(springView.hidePrint, false)
assert.equal(springView.hideLamination, false)
assert.deepEqual(springView.hiddenLabels, ['поле «Страницы»'])

assert.equal(WRAP_BOARDS_PER_ITEM, 2)

const ready = applyReadyCover({
  cover: {
    mode: 'separate',
    page_count: 4,
    wrap: true,
    board_material_id: 41,
    board_material_ids: [41],
    print: { technology_code: 'digital', sides_mode: 'single' },
    lamination: { service_id: 9 },
  },
  binding: { service_id: 3, variant_id: 8 },
})
assert.equal(ready.coverChoice, 'ready')
assert.equal(ready.cover?.mode, 'none')
assert.equal(ready.cover?.print, undefined)
assert.equal(ready.cover?.lamination, undefined)
assert.equal(ready.cover?.wrap, undefined)
assert.equal(ready.cover?.board_material_id, undefined)
assert.equal(ready.cover?.board_material_ids, undefined)
assert.equal(ready.binding?.service_id, 3)
assert.equal(ready.innerBlock?.print?.sides_mode, 'duplex')

const readyView = describeOperatorView(ready)
assert.deepEqual(readyView.hiddenLabels, ['печать', 'страницы обложки', 'ламинация'])
assert.equal(readyView.hidePrint, true)
assert.equal(readyView.showReadyLid, true)
assert.equal(readyView.hidePages, false)

const printed = describeOperatorView({ coverChoice: 'printed', cover: { mode: 'separate', wrap: true } })
assert.equal(printed.hidePrint, false)
assert.equal(printed.hideLamination, false)
assert.deepEqual(printed.hiddenLabels, [])

assert.equal(readyLidThicknessMm(50, 0.1, 0.4), 5.8)
const channel = pickChannel(
  [
    { id: 1, channel_min_mm: 0, channel_max_mm: 20 },
    { id: 2, channel_min_mm: 5, channel_max_mm: 8 },
  ],
  5.8,
)
assert.equal(channel?.id, 2)

console.log('boundProductPreset.check ok')
