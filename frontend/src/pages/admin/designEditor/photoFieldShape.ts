export type PhotoFieldShape = 'rect' | 'ellipse' | 'path'

export function readPhotoFieldShape(source: object | null | undefined): PhotoFieldShape {
  const shape = (source as { photoFieldShape?: unknown } | null | undefined)?.photoFieldShape
  if (shape === 'ellipse' || shape === 'circle') return 'ellipse'
  if (shape === 'path') return 'path'
  return 'rect'
}

export function photoFieldFrameRadii(
  shape: PhotoFieldShape,
  frameW: number,
  frameH: number,
): { rx: number; ry: number } {
  if (shape === 'ellipse') return { rx: frameW / 2, ry: frameH / 2 }
  return { rx: 6, ry: 6 }
}

export function readPhotoFieldClip(source: object | null | undefined): {
  d: string
  boxW: number
  boxH: number
} | null {
  const record = source as {
    photoFieldClipPath?: unknown
    photoFieldClipBoxW?: unknown
    photoFieldClipBoxH?: unknown
    photoFieldFw?: unknown
    photoFieldFh?: unknown
  } | null | undefined
  const d = typeof record?.photoFieldClipPath === 'string' ? record.photoFieldClipPath.trim() : ''
  if (!d) return null
  const boxW = Number(record?.photoFieldClipBoxW ?? record?.photoFieldFw)
  const boxH = Number(record?.photoFieldClipBoxH ?? record?.photoFieldFh)
  return {
    d,
    boxW: Number.isFinite(boxW) && boxW > 0 ? boxW : 1,
    boxH: Number.isFinite(boxH) && boxH > 0 ? boxH : 1,
  }
}
