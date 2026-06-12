import { execSync } from 'child_process'
import path from 'path'

describe('profileSvgImporter script', () => {
  it('prints p50/p95 and top slow files', () => {
    const cmd = 'node -r ts-node/register scripts/profileSvgImporter.ts --dir __tests__/fixtures/svg-golden --top 2'
    const out = execSync(cmd, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    })
    expect(out).toContain('p50:')
    expect(out).toContain('p95:')
    expect(out).toContain('Top-2 slowest:')
  })
})
