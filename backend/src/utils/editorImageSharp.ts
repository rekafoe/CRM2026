import sharp from 'sharp'

/** Один декод за раз: параллельные sharp на Railway легко убивают процесс, и клиент видит обрыв без ответа. */
const MAX_INPUT_PIXELS = Number(process.env.EDITOR_IMAGE_MAX_PIXELS || 50_000_000)

sharp.concurrency(1)
sharp.cache(false)

let chain: Promise<void> = Promise.resolve()

export function openEditorImage(buffer: Buffer) {
  return sharp(buffer, {
    failOn: 'none',
    limitInputPixels: Number.isFinite(MAX_INPUT_PIXELS) && MAX_INPUT_PIXELS > 0
      ? MAX_INPUT_PIXELS
      : 50_000_000,
    sequentialRead: true,
  })
}

export function runEditorImageJob<T>(work: () => Promise<T>): Promise<T> {
  const job = chain.then(work, work)
  chain = job.then(() => undefined, () => undefined)
  return job
}
