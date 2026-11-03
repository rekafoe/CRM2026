declare module 'heic-convert' {
  function convert(options: {
    buffer: Buffer | Uint8Array | ArrayBuffer
    format: 'PNG' | 'JPEG'
    quality?: number
  }): Promise<Buffer>
  export default convert
}
