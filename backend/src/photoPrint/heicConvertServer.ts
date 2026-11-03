type HeicConvert = (options: {
  buffer: Buffer | Uint8Array | ArrayBuffer;
  format: 'PNG' | 'JPEG';
  quality?: number;
}) => Promise<Buffer | Uint8Array | ArrayBuffer>;

async function loadHeicConvert(): Promise<HeicConvert> {
  const module = (await import('heic-convert')) as unknown as { default?: HeicConvert } & HeicConvert;
  return module.default ?? module;
}

function toUint8Array(result: Buffer | Uint8Array | ArrayBuffer): Uint8Array {
  return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export async function convertHeicToPngBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const convert = await loadHeicConvert();
  const png = await convert({
    buffer: Buffer.from(bytes),
    format: 'PNG',
  });
  return toUint8Array(png);
}

/** JPEG для превью в браузере; quality 0–1, по умолчанию 0.92. */
export async function convertHeicToJpegBytes(bytes: Uint8Array, quality = 0.92): Promise<Uint8Array> {
  const convert = await loadHeicConvert();
  const jpeg = await convert({
    buffer: Buffer.from(bytes),
    format: 'JPEG',
    quality,
  });
  return toUint8Array(jpeg);
}
