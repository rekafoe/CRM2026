import type { PhotoTrimMode } from './photoFormatDimensions'

/** Снимок фотозаказа, который сайт передаёт в очередь печати. */
export interface CartOrderItem {
  id?: string
  image?: string
  mockupId?: string
  bleedMockupId?: string
  printSize?: string
  trimWidthMm?: number
  trimHeightMm?: number
  paperType?: string
  paperKey?: string
  quantity?: number
  trimMode?: PhotoTrimMode
  artisticMarginMm?: number
  withWhiteBorders?: boolean
}

export interface SavedOrder {
  orderId: string
  orderName?: string
  printType?: 'digital' | 'premium'
  photoType?: string
  crmProductId?: number
  orderType?: string
  items: CartOrderItem[]
}
