import { pullBelpostBlank, submitBelpost, type CarrierDispatchResult } from './belpostGateway'
import { pullEuropostBlank, submitEuropost } from './europostGateway'
import type { PostalCarrier } from './postalShipmentBlank'
import {
  belpostReady,
  europostReady,
  missingBelpostMessage,
  missingEuropostMessage,
  type PostalCarrierSettings,
} from './postalCarrierSettings'
import { PostalCarrierError } from './postalCarrierParse'
import type { CarrierRequest } from './postalCarrierHttp'

export type PostalDispatchInput = {
  carrier: PostalCarrier
  orderNumber: string
  externalRef: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  weightKg: number
  codAmount: number | null
  declaredValue: number | null
  notes: string
}

function assertReady(carrier: PostalCarrier, settings: PostalCarrierSettings): void {
  if (carrier === 'belpost' && !belpostReady(settings)) {
    throw new PostalCarrierError(missingBelpostMessage(), 409)
  }
  if (carrier === 'europost' && !europostReady(settings)) {
    throw new PostalCarrierError(missingEuropostMessage(), 409)
  }
}

export async function dispatchPostalShipment(
  input: PostalDispatchInput,
  settings: PostalCarrierSettings,
  request?: CarrierRequest,
): Promise<CarrierDispatchResult> {
  assertReady(input.carrier, settings)
  if (input.carrier === 'europost') {
    return submitEuropost({
      orderNumber: input.orderNumber,
      externalRef: input.externalRef,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      recipientAddress: input.recipientAddress,
      weightKg: input.weightKg,
      notes: input.notes,
    }, settings, request)
  }
  return submitBelpost({
    orderNumber: input.orderNumber,
    recipientName: input.recipientName,
    recipientPhone: input.recipientPhone,
    recipientAddress: input.recipientAddress,
    weightKg: input.weightKg,
    codAmount: input.codAmount,
    declaredValue: input.declaredValue,
  }, settings, request)
}

export async function pullPostalBlank(
  carrier: PostalCarrier,
  ids: { documentId: string | null; externalId: string | null; trackingNumber: string | null },
  settings: PostalCarrierSettings,
  request?: CarrierRequest,
): Promise<CarrierDispatchResult> {
  assertReady(carrier, settings)
  if (carrier === 'belpost') {
    if (!ids.documentId) {
      throw new PostalCarrierError('У Белпочты ещё нет номера бланка. Повторите позже.', 409)
    }
    return pullBelpostBlank(ids.documentId, settings, request)
  }
  return pullEuropostBlank(ids.trackingNumber, ids.externalId || ids.documentId, settings, request)
}
