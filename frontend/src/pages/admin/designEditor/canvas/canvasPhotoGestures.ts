import type { FabricObject } from 'fabric';
import {
  bakeEmptyPhotoFieldScaleInPlace,
  bakeFilledPhotoFieldScaleInPlace,
} from '../photoFieldFit';
import { isClientAddedPhotoField } from './canvasBasicMode';
import { resolvePhotoFieldTarget } from './canvasSelection';
import { asAny } from './canvasUtils';

export function bakeClientPhotoFieldIfNeeded(
  target: FabricObject | undefined,
  sizeOverride?: { fw: number; fh: number },
): boolean {
  const field = resolvePhotoFieldTarget(target) ?? (target && asAny(target).isPhotoField ? target : undefined);
  if (!field || !isClientAddedPhotoField(asAny(field))) return false;
  if (asAny(field).photoFieldFilled === true) {
    return bakeFilledPhotoFieldScaleInPlace(field, sizeOverride);
  }
  return bakeEmptyPhotoFieldScaleInPlace(field, sizeOverride);
}

export function resolveClientPhotoFieldId(field: FabricObject): string {
  return String(asAny(field).id ?? '').trim();
}
