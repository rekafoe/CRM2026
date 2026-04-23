import { ImageProcessingService } from '../services/imageProcessingService'
import { PhotoOrderService } from '../services/photoOrderService'
import { PhotoOrderSessionService } from '../services/photoOrderSessionService'

/** Режим по умолчанию — вписать с полями; кроп/ИИ — через оператора при необходимости */
export const PHOTO_ORDER_DEFAULT_MODE = 'fit' as const
export const PHOTO_ORDER_DEFAULT_QTY = 1

const MODE_LABEL: Record<string, string> = {
  crop: 'кроп (под размер)',
  fit: 'вписать с полями',
  smart: 'умный кроп',
}

/**
 * Сохраняет сессию с дефолтами и возвращает текст + цена/размеры для ответа в чат.
 */
export function savePhotoOrderSessionSimplified(
  chatId: string,
  sizeName: string
): { ok: true; text: string } | { ok: false; error: string } {
  const size = ImageProcessingService.getSizeByName(sizeName)
  if (!size) {
    return { ok: false, error: 'Неверный размер' }
  }

  const prices = PhotoOrderService.getAllPrices()
  const pricePer = prices[sizeName] ?? 0
  const priceRub = (pricePer / 100).toFixed(0)
  const totalRub = ((pricePer * PHOTO_ORDER_DEFAULT_QTY) / 100).toFixed(0)

  PhotoOrderSessionService.saveSession(
    chatId,
    sizeName,
    PHOTO_ORDER_DEFAULT_MODE,
    PHOTO_ORDER_DEFAULT_QTY
  )

  const text =
    `✅ Размер: ${sizeName} (${size.width}×${size.height} px)\n` +
    `🎨 Режим: ${MODE_LABEL[PHOTO_ORDER_DEFAULT_MODE] ?? PHOTO_ORDER_DEFAULT_MODE}\n` +
    `📦 Копий: ${PHOTO_ORDER_DEFAULT_QTY} · ~${totalRub} руб. (${priceRub} руб. за копию)\n\n` +
    `📸 Пришлите фото в этот чат — одним или несколькими сообщениями.\n` +
    `Чтобы выбрать другой размер, снова: /order_photo\n\n` +
    `Нужен другой режим или число копий — напишите менеджеру или в CRM.`

  return { ok: true, text }
}
