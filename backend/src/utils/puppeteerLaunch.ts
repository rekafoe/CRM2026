import fs from 'fs'
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer'

const CONTAINER_CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--hide-scrollbars',
  '--mute-audio',
  '--font-render-hinting=none',
  '--disable-breakpad',
  '--disable-crash-reporter',
] as const

const SYSTEM_CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
] as const

function isExistingFile(path: string | undefined): path is string {
  return Boolean(path && fs.existsSync(path))
}

function resolveBundledChromiumPath(): string | undefined {
  try {
    const bundled = puppeteer.executablePath()
    return isExistingFile(bundled) ? bundled : undefined
  } catch {
    return undefined
  }
}

function resolveChromiumExecutablePath(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
    || process.env.CHROME_BIN?.trim()
  if (isExistingFile(fromEnv)) return fromEnv

  const bundled = resolveBundledChromiumPath()
  if (bundled) return bundled

  for (const candidate of SYSTEM_CHROMIUM_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }

  return fromEnv || undefined
}

function sanitizeDbusEnvironment(): void {
  const dbusAddress = process.env.DBUS_SESSION_BUS_ADDRESS?.trim()
  // Невалидный адрес (/dev/null) ломает Chromium: "Address does not contain a colon".
  if (!dbusAddress || dbusAddress === '/dev/null') {
    delete process.env.DBUS_SESSION_BUS_ADDRESS
  }
}

export function buildPuppeteerLaunchOptions(extraArgs: string[] = []): LaunchOptions {
  const executablePath = resolveChromiumExecutablePath()
  if (!executablePath) {
    throw new Error(
      'Chromium не найден. В Docker выполните npm ci без PUPPETEER_SKIP_DOWNLOAD или задайте PUPPETEER_EXECUTABLE_PATH.',
    )
  }
  return {
    headless: true,
    executablePath,
    args: [...CONTAINER_CHROME_ARGS, ...extraArgs],
  }
}

export async function launchPuppeteerBrowser(extraArgs: string[] = []): Promise<Browser> {
  sanitizeDbusEnvironment()
  return puppeteer.launch(buildPuppeteerLaunchOptions(extraArgs))
}
