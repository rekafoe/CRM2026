import { spawn } from 'child_process'
import fs from 'fs'

export type HtmlToPdfMarginOptions = {
  top?: string
  right?: string
  bottom?: string
  left?: string
  headerTemplate?: string
  footerTemplate?: string
}

const WKHTMLTOPDF_CANDIDATES = [
  '/usr/bin/wkhtmltopdf',
  '/usr/local/bin/wkhtmltopdf',
  'wkhtmltopdf',
] as const

function isExistingFile(path: string | undefined): path is string {
  return Boolean(path && fs.existsSync(path))
}

export function resolveWkhtmltopdfExecutablePath(): string | undefined {
  const fromEnv = process.env.WKHTMLTOPDF_PATH?.trim()
  if (isExistingFile(fromEnv)) return fromEnv

  for (const candidate of WKHTMLTOPDF_CANDIDATES) {
    if (candidate === 'wkhtmltopdf') return candidate
    if (fs.existsSync(candidate)) return candidate
  }
  return undefined
}

function parseMargin(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

function runWkhtmltopdf(
  executablePath: string,
  args: string[],
  html: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout))
        return
      }
      reject(
        new Error(
          `wkhtmltopdf exited with code ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`,
        ),
      )
    })

    child.stdin.write(html, 'utf8')
    child.stdin.end()
  })
}

export async function convertHtmlToPdfWithWkhtmltopdf(
  html: string,
  options?: HtmlToPdfMarginOptions,
): Promise<Buffer> {
  const executablePath = resolveWkhtmltopdfExecutablePath()
  if (!executablePath) {
    throw new Error('wkhtmltopdf не найден в PATH')
  }

  const args = [
    '--quiet',
    '--encoding',
    'utf-8',
    '--page-size',
    'A4',
    '--margin-top',
    parseMargin(options?.top, '20mm'),
    '--margin-right',
    parseMargin(options?.right, '15mm'),
    '--margin-bottom',
    parseMargin(options?.bottom, '20mm'),
    '--margin-left',
    parseMargin(options?.left, '15mm'),
    '--print-media-type',
    '--enable-local-file-access',
  ]

  const header = options?.headerTemplate?.trim()
  const footer = options?.footerTemplate?.trim()
  if (header) {
    args.push('--header-html', header)
  }
  if (footer) {
    args.push('--footer-html', footer)
  } else if (!header) {
    args.push('--footer-center', `Страница [page] из [topage]`)
  }

  args.push('-', '-')
  return runWkhtmltopdf(executablePath, args, html)
}

export function isWkhtmltopdfAvailable(): boolean {
  return Boolean(resolveWkhtmltopdfExecutablePath())
}
