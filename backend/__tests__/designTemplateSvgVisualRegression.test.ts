import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { parseImportedSvgLayers } from '../src/services/designTemplateSvgParse'

type RawImage = {
  data: Buffer
  width: number
  height: number
  channels: number
}

function escapeXml(value: string): string {
  const sanitized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  return sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function appendInteractiveLayers(strippedSvg: string, parsed: ReturnType<typeof parseImportedSvgLayers>): string {
  const overlays: string[] = []
  for (const layer of parsed.interactiveLayers) {
    if (layer.kind === 'photo') {
      overlays.push(
        `<rect x="${layer.data.svg.x}" y="${layer.data.svg.y}" width="${layer.data.svg.width}" height="${layer.data.svg.height}" fill="#d1d5db" />`,
      )
      continue
    }
    const t = layer.data
    const textAnchor = t.textAnchor === 'middle' ? 'middle' : t.textAnchor === 'end' ? 'end' : 'start'
    const rotate = t.angle != null ? ` transform="rotate(${t.angle} ${t.svg.x} ${t.svg.y})"` : ''
    const lines = t.text.split('\n')
    const tspans = lines
      .map((line, index) => (
        index === 0
          ? `<tspan x="${t.svg.x}" y="${t.svg.y}">${escapeXml(line)}</tspan>`
          : `<tspan x="${t.svg.x}" dy="${t.svg.fontSize * 1.2}">${escapeXml(line)}</tspan>`
      ))
      .join('')
    overlays.push(
      `<text x="${t.svg.x}" y="${t.svg.y}" text-anchor="${textAnchor}" font-size="${t.svg.fontSize}" font-family="${escapeXml(t.fontFamily ?? 'Arial')}" fill="${escapeXml(t.fill ?? '#111827')}"${rotate}>${tspans}</text>`,
    )
  }
  return strippedSvg.replace(/<\/svg>\s*$/i, `${overlays.join('\n')}</svg>`)
}

async function rasterize(svg: string): Promise<RawImage> {
  const { data, info } = await sharp(Buffer.from(svg, 'utf8'), { density: 144 })
    .png()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

async function mismatchRatio(originalSvg: string, reconstructedSvg: string): Promise<number> {
  const a = await rasterize(originalSvg)
  const b = await rasterize(reconstructedSvg)
  const width = Math.min(a.width, b.width)
  const height = Math.min(a.height, b.height)
  const channels = Math.min(a.channels, b.channels)
  let mismatched = 0
  const total = width * height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idxA = (y * a.width + x) * a.channels
      const idxB = (y * b.width + x) * b.channels
      let pixelDiff = 0
      for (let c = 0; c < channels; c++) {
        pixelDiff += Math.abs(a.data[idxA + c] - b.data[idxB + c])
      }
      if (pixelDiff > 24) mismatched += 1
    }
  }
  return total > 0 ? mismatched / total : 1
}

describe('SVG visual regression fixtures', () => {
  it('keeps reconstructed scene within golden mismatch threshold', async () => {
    const fixturesDir = path.resolve(__dirname, 'fixtures/svg-golden')
    const fixtureFiles = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.svg')).sort()
    expect(fixtureFiles.length).toBeGreaterThan(0)

    for (const file of fixtureFiles) {
      const source = fs.readFileSync(path.join(fixturesDir, file), 'utf8')
      const parsed = parseImportedSvgLayers(source, { sceneScale: 3 })
      const reconstructed = appendInteractiveLayers(parsed.strippedSvg, parsed)
      const reconstructedRatio = await mismatchRatio(source, reconstructed)
      const threshold = 0.55
      expect(reconstructedRatio).toBeLessThan(threshold)
    }
  }, 30000)
})
