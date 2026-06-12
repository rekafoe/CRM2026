import fs from 'fs'
import path from 'path'
import { performance } from 'perf_hooks'
import { parseImportedSvgLayers } from '../src/services/designTemplateSvgParse'

type Row = { file: string; ms: number; sizeKb: number; scanMs: number; textMs: number; totalMs: number }

function profileOne(svgPath: string): Row {
  const source = fs.readFileSync(svgPath, 'utf8')
  const start = performance.now()
  const parsed = parseImportedSvgLayers(source, { sceneScale: 3 })
  const end = performance.now()
  return {
    file: path.basename(svgPath),
    ms: Math.round((end - start) * 100) / 100,
    sizeKb: Math.round((Buffer.byteLength(source, 'utf8') / 1024) * 100) / 100,
    scanMs: parsed.parserReport.timings.scanMs,
    textMs: parsed.parserReport.timings.textMs,
    totalMs: parsed.parserReport.timings.totalMs,
  }
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]!
}

function parseArgs(): { dir: string; pattern: RegExp; top: number } {
  const args = process.argv.slice(2)
  const pick = (name: string): string | undefined => {
    const idx = args.findIndex((a) => a === name)
    return idx >= 0 ? args[idx + 1] : undefined
  }
  const dir = pick('--dir') || path.resolve(__dirname, '../__tests__/fixtures/svg-golden')
  const patternRaw = pick('--pattern') || '\\.svg$'
  const topRaw = Number(pick('--top') || '5')
  return {
    dir,
    pattern: new RegExp(patternRaw, 'i'),
    top: Number.isFinite(topRaw) && topRaw > 0 ? Math.floor(topRaw) : 5,
  }
}

function main(): void {
  const { dir, pattern, top } = parseArgs()
  const files = fs.readdirSync(dir)
    .filter((f) => pattern.test(f))
    .map((f) => path.join(dir, f))
  if (!files.length) {
    console.log('No SVG fixtures found.')
    return
  }
  const results = files.map(profileOne)
  const totalMs = results.reduce((sum, item) => sum + item.totalMs, 0)
  const maxMs = results.reduce((max, item) => Math.max(max, item.totalMs), 0)
  const all = results.map((r) => r.totalMs)
  const p50 = percentile(all, 50)
  const p95 = percentile(all, 95)
  const slowTop = [...results].sort((a, b) => b.totalMs - a.totalMs).slice(0, top)
  console.log('SVG importer profiling:')
  for (const row of results) {
    console.log(
      `- ${row.file}: total=${row.totalMs} ms scan=${row.scanMs} ms text=${row.textMs} ms (${row.sizeKb} KB)`,
    )
  }
  console.log(`Total: ${Math.round(totalMs * 100) / 100} ms`)
  console.log(`p50: ${Math.round(p50 * 100) / 100} ms`)
  console.log(`p95: ${Math.round(p95 * 100) / 100} ms`)
  console.log(`Max single file: ${Math.round(maxMs * 100) / 100} ms`)
  console.log(`Top-${slowTop.length} slowest:`)
  for (const row of slowTop) {
    console.log(`  * ${row.file}: ${row.totalMs} ms`)
  }
}

main()
