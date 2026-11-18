import assert from 'node:assert/strict'
import {
  WRAP_BOARDS_PER_ITEM,
  applyReadyCover,
  applySheetBlock,
  coverPrintChoiceToSides,
  describeOperatorView,
  pickChannel,
  readyLidThicknessMm,
  applyPrintedCover,
  blockIsUnprinted,
  coverIsTwoPiece,
  sheetBlockError,
  springBlockPages,
  springTotalPages,
  templateServiceIds,
  usesBlockSheets,
} from '../src/utils/boundProductPreset.ts'
import { resolveCoverPageCount, resolveMultipageMinQty, resolveMultipagePageSplit } from '../src/utils/multipageProduct.ts'

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
assert.equal(usesBlockSheets(spring), true)
assert.equal(coverIsTwoPiece(spring), true)
assert.equal(sheetBlockError(50), null)
assert.equal(sheetBlockError(0), 'Укажите листы блока')
assert.equal(sheetBlockError(501), 'Не более 500 листов')

// Сохранённое «Страниц обложки» у блокнота не читается: два картона — всегда 2.
assert.equal(resolveCoverPageCount({ ...spring, cover: { ...spring.cover, page_count: 4 } }), 2)
assert.equal(resolveCoverPageCount({ cover: { mode: 'separate', wrap: true } }), 2)
assert.equal(resolveCoverPageCount({ cover: { mode: 'separate' } }), 4)
assert.deepEqual(
  resolveMultipagePageSplit({ pagesCount: springTotalPages(50), multiPageStructure: spring }),
  { totalPages: 102, coverPages: 2, innerPages: 100, coverMode: 'separate' },
)

// Блокнот по умолчанию без печати блока: оператор технологию печати не выбирает.
assert.equal(spring.innerBlock?.printed, false)
assert.equal(blockIsUnprinted(spring), true)
const springView = describeOperatorView(spring)
assert.equal(springView.showSheets, true)
assert.equal(springView.showCoverPrint, true)
assert.equal(springView.hidePages, true)
assert.equal(springView.hidePrint, true)
assert.equal(springView.hideLamination, false)
assert.deepEqual(springView.hiddenLabels, ['поле «Страницы»', 'печать блока'])

const printedBlock = applySheetBlock({ innerBlock: { printed: true } }, 50)
assert.equal(printedBlock.innerBlock?.printed, true)
assert.equal(describeOperatorView(printedBlock).hidePrint, false)
assert.deepEqual(describeOperatorView(printedBlock).hiddenLabels, ['поле «Страницы»'])
// Без листов блока флаг не действует: печать блока задаётся строками размера, как раньше.
assert.equal(blockIsUnprinted({ innerBlock: { printed: false } }), false)

assert.deepEqual(
  templateServiceIds({
    binding: { service_id: 28 },
    cover: { mode: 'separate', lamination: { service_id: 8 } },
  }),
  [28, 8],
)
assert.deepEqual(templateServiceIds({ binding: {}, cover: { mode: 'none', lamination: { service_id: 8 } } }), [])

assert.equal(WRAP_BOARDS_PER_ITEM, 2)

const ready = applyReadyCover({
  notebook: { use_sheets: true, sheets: 40 },
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
// Готовая крышка печатную обложку выключает, но не стирает.
assert.equal(ready.cover?.print?.technology_code, 'digital')
assert.equal(ready.cover?.lamination?.service_id, 9)
assert.equal(ready.cover?.board_material_id, 41)
assert.equal(coverIsTwoPiece(ready), false)
// Листы блока у готовой крышки не действуют, но галочка не сбрасывается.
assert.equal(usesBlockSheets(ready), false)
assert.equal(ready.notebook?.use_sheets, true)

const back = applyPrintedCover(ready)
assert.equal(back.coverChoice, 'printed')
assert.equal(back.cover?.mode, 'separate')
assert.equal(back.cover?.wrap, true)
assert.equal(back.cover?.page_count, 4)
assert.equal(back.cover?.lamination?.service_id, 9)
assert.deepEqual(back.cover?.board_material_ids, [41])
assert.equal(usesBlockSheets(back), true)
assert.equal(back.notebook?.sheets, 40)
assert.equal(applyPrintedCover({ coverChoice: 'ready', cover: { mode: 'none' } }).cover?.mode, 'none')
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

// A5 min 4 при первой строке печати от 1 и одном изделии на листе — не минимум заказа.
assert.equal(
  resolveMultipageMinQty(
    {
      min_qty: 4,
      print_prices: [
        { tiers: [{ min_qty: 1, unit_price: 0 }] },
        { tiers: [{ min_qty: 4, unit_price: 3 }] },
      ],
    },
    { multipageLike: true, itemsPerSheet: 1 },
  ),
  1,
)
assert.equal(
  resolveMultipageMinQty(
    { min_qty: 10, print_prices: [{ tiers: [{ min_qty: 10, unit_price: 2 }] }] },
    { multipageLike: true, itemsPerSheet: 1 },
  ),
  10,
)

console.log('boundProductPreset.check ok')
